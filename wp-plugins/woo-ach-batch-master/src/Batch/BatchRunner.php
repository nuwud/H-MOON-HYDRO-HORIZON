<?php
/**
 * Batch Runner
 *
 * Orchestrates the batch export process: select orders -> generate NACHA -> upload SFTP.
 *
 * @package Nuwud\WooAchBatch\Batch
 */

namespace Nuwud\WooAchBatch\Batch;

use Nuwud\WooAchBatch\Admin\Settings;
use Nuwud\WooAchBatch\Nacha\NachaBuilder;
use Nuwud\WooAchBatch\Sftp\SftpClientInterface;
use Nuwud\WooAchBatch\Security\AuditLog;
use Nuwud\WooAchBatch\Security\PrivateStorage;

/**
 * Batch runner orchestrator
 */
class BatchRunner {

    /**
     * Services
     */
    private BatchRepository $repository;
    private NachaBuilder $nacha_builder;
    private SftpClientInterface $sftp_client;
    private AuditLog $audit_log;
    private Settings $settings;
    private PrivateStorage $storage;

    /**
     * Lock transient name prefix
     */
    private const LOCK_PREFIX = 'woo_ach_batch_lock_';

    /**
     * Maximum lock age in seconds (prevents stuck locks)
     */
    private const LOCK_MAX_AGE = 1800; // 30 minutes

    /**
     * Constructor
     */
    public function __construct(
        BatchRepository $repository,
        NachaBuilder $nacha_builder,
        SftpClientInterface $sftp_client,
        AuditLog $audit_log,
        Settings $settings,
        PrivateStorage $storage
    ) {
        $this->repository = $repository;
        $this->nacha_builder = $nacha_builder;
        $this->sftp_client = $sftp_client;
        $this->audit_log = $audit_log;
        $this->settings = $settings;
        $this->storage = $storage;
    }

    /**
     * Run the batch export process
     *
     * @param bool $upload_immediately Whether to upload via SFTP after generation
     * @return array{success: bool, batch_id: string|null, orders: int, errors: array}
     */
    public function run( bool $upload_immediately = true ): array {
        $result = [
            'success' => false,
            'batch_id' => null,
            'orders' => 0,
            'errors' => [],
        ];

        // Acquire lock to prevent concurrent runs
        if ( ! $this->acquire_lock() ) {
            $result['errors'][] = 'Another batch export is currently running.';
            \Nuwud\WooAchBatch\log_message( 'Batch export skipped: lock held', 'warning' );
            return $result;
        }

        try {
            // Set correlation ID for audit trail
            $correlation_id = $this->audit_log->set_correlation_id();

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Starting batch export [%s]', $correlation_id ),
                'info'
            );

            // 1. Get eligible orders
            $orders = $this->get_eligible_orders();

            if ( empty( $orders ) ) {
                \Nuwud\WooAchBatch\log_message( 'No eligible orders for batch export', 'info' );
                $result['success'] = true;
                $result['errors'][] = 'No eligible orders found.';
                return $result;
            }

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Found %d eligible orders', count( $orders ) ),
                'info'
            );

            // 2. Lock orders to prevent double processing
            $locked_orders = $this->lock_orders( $orders );

            if ( empty( $locked_orders ) ) {
                $result['errors'][] = 'Failed to lock orders for processing.';
                return $result;
            }

            // 3. Generate batch ID and filename
            $batch_id = \Nuwud\WooAchBatch\generate_batch_id();
            $filename = $this->generate_filename( $batch_id );

            // 4. Create batch record
            $this->repository->create_batch([
                'batch_id' => $batch_id,
                'file_name' => $filename,
                'status' => 'processing',
                'order_count' => count( $locked_orders ),
            ]);

            $this->audit_log->log_batch_action( 'batch_created', $batch_id, [
                'order_count' => count( $locked_orders ),
            ]);

            // 5. Build NACHA file
            $nacha_result = $this->build_nacha_file( $batch_id, $locked_orders );

            if ( ! $nacha_result['success'] ) {
                $this->repository->update_batch_status( $batch_id, 'failed', [
                    'last_error' => implode( '; ', $nacha_result['errors'] ),
                ]);
                $this->unlock_orders( $locked_orders );

                $result['errors'] = array_merge( $result['errors'], $nacha_result['errors'] );
                return $result;
            }

            // 6. Save NACHA file
            $filepath = $this->nacha_builder->save( $filename );

            // 7. Update batch with file info and totals
            $this->repository->update_batch_status( $batch_id, 'exported', [
                'file_path' => $filepath,
                'total_debit' => $nacha_result['total_debit'],
                'total_credit' => $nacha_result['total_credit'],
                'entry_hash' => $nacha_result['entry_hash'],
                'exported_at' => current_time( 'mysql' ),
            ]);

            // 8. Update order statuses and add batch items
            foreach ( $nacha_result['entries'] as $entry ) {
                // Add to batch items table
                $this->repository->add_batch_item([
                    'batch_id' => $batch_id,
                    'order_id' => $entry['order_id'],
                    'trace_number' => $entry['trace_number'],
                    'amount' => $entry['amount'],
                    'transaction_code' => $entry['transaction_code'],
                    'account_last4' => $entry['account_last4'],
                ]);

                // Update order
                $order = wc_get_order( $entry['order_id'] );
                if ( $order ) {
                    $order_meta = \Nuwud\WooAchBatch\service( 'order_meta' );
                    $order_meta->save_batch_details( $order, $batch_id, $entry['trace_number'] );

                    $order->set_status( 'ach-exported', sprintf(
                        /* translators: 1: batch ID, 2: trace number */
                        __( 'Included in ACH batch %1$s (Trace: %2$s)', 'woo-ach-batch' ),
                        $batch_id,
                        $entry['trace_number']
                    ));
                    $order->save();
                }
            }

            $this->audit_log->log_batch_action( 'batch_exported', $batch_id, [
                'total_debit' => $nacha_result['total_debit'],
                'total_credit' => $nacha_result['total_credit'],
                'entry_count' => count( $nacha_result['entries'] ),
            ]);

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'NACHA file generated: %s (%d entries, $%.2f debit)',
                    $filename,
                    count( $nacha_result['entries'] ),
                    $nacha_result['total_debit']
                ),
                'info'
            );

            // 9. Upload via SFTP if enabled
            if ( $upload_immediately && $this->settings->is_sftp_enabled() ) {
                $upload_result = $this->upload_batch( $batch_id, $filepath, $filename );

                if ( ! $upload_result['success'] ) {
                    $result['errors'][] = 'File generated but SFTP upload failed: ' . $upload_result['error'];
                    // Don't fail the whole batch - file is generated and can be manually uploaded
                }
            }

            // 10. Generate manifest CSV (optional)
            $this->generate_manifest( $batch_id, $nacha_result['entries'] );

            $result['success'] = true;
            $result['batch_id'] = $batch_id;
            $result['orders'] = count( $nacha_result['entries'] );

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Batch export completed: %s', $batch_id ),
                'info'
            );

        } catch ( \Exception $e ) {
            $result['errors'][] = $e->getMessage();

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Batch export failed: %s', $e->getMessage() ),
                'error'
            );

            $this->audit_log->log( 'batch_failed', 'batch', $batch_id ?? 'unknown', [
                'error' => $e->getMessage(),
            ]);

        } finally {
            $this->release_lock();
            $this->audit_log->clear_correlation_id();
        }

        return $result;
    }

    /**
     * Get orders eligible for batch export
     *
     * @return array WC_Order objects
     */
    private function get_eligible_orders(): array {
        $args = [
            'status' => 'ach-verified',
            'payment_method' => 'ach_batch',
            'limit' => 1000, // Safety limit per batch
            'meta_query' => [
                'relation' => 'AND',
                [
                    'key' => '_ach_batch_id',
                    'compare' => 'NOT EXISTS',
                ],
                [
                    'key' => '_ach_verification_status',
                    'value' => 'verified',
                ],
            ],
        ];

        return wc_get_orders( $args );
    }

    /**
     * Lock orders to prevent double processing
     *
     * @param array $orders WC_Order objects
     * @return array Successfully locked orders
     */
    private function lock_orders( array $orders ): array {
        $locked = [];

        foreach ( $orders as $order ) {
            $lock_key = 'woo_ach_order_lock_' . $order->get_id();

            // Try to acquire per-order lock
            if ( false === get_transient( $lock_key ) ) {
                set_transient( $lock_key, time(), 3600 ); // 1 hour lock
                $order->update_meta_data( '_ach_processing_lock', time() );
                $order->save();
                $locked[] = $order;
            }
        }

        return $locked;
    }

    /**
     * Unlock orders after processing
     *
     * @param array $orders WC_Order objects
     */
    private function unlock_orders( array $orders ): void {
        foreach ( $orders as $order ) {
            $lock_key = 'woo_ach_order_lock_' . $order->get_id();
            delete_transient( $lock_key );
            $order->delete_meta_data( '_ach_processing_lock' );
            $order->save();
        }
    }

    /**
     * Build NACHA file content
     *
     * @param string $batch_id Batch ID
     * @param array  $orders   WC_Order objects
     * @return array{success: bool, entries: array, total_debit: float, total_credit: float, entry_hash: string, errors: array}
     */
    private function build_nacha_file( string $batch_id, array $orders ): array {
        $result = [
            'success' => false,
            'entries' => [],
            'total_debit' => 0.00,
            'total_credit' => 0.00,
            'entry_hash' => '',
            'errors' => [],
        ];

        try {
            // Create file
            $this->nacha_builder->create_file();

            // Start batch
            $this->nacha_builder->start_batch( $batch_id );

            $entry_hash_sum = 0;
            $order_meta = \Nuwud\WooAchBatch\service( 'order_meta' );

            foreach ( $orders as $order ) {
                // Get bank details
                $bank_details = $order_meta->get_bank_details( $order );

                if ( ! $bank_details ) {
                    $result['errors'][] = sprintf( 'Order #%d: Missing bank details', $order->get_id() );
                    continue;
                }

                // Get account holder name
                $holder_name = $order->get_meta( '_ach_account_holder_name' )
                    ?: $order->get_billing_first_name() . ' ' . $order->get_billing_last_name();

                // Add entry
                $amount = (float) $order->get_total();
                $trace_number = $this->nacha_builder->add_entry([
                    'routing_number' => $bank_details['routing'],
                    'account_number' => $bank_details['account'],
                    'account_type' => $bank_details['type'],
                    'amount' => $amount,
                    'name' => $holder_name,
                    'order_id' => $order->get_id(),
                    'is_credit' => false, // Debit from customer
                ]);

                // Track entry
                $result['entries'][] = [
                    'order_id' => $order->get_id(),
                    'trace_number' => $trace_number,
                    'amount' => $amount,
                    'transaction_code' => $this->settings->get_transaction_code( $bank_details['type'], false ),
                    'account_last4' => $bank_details['last4'],
                ];

                $result['total_debit'] += $amount;

                // Entry hash (sum of first 8 digits of routing numbers)
                $entry_hash_sum += (int) substr( $bank_details['routing'], 0, 8 );
            }

            // Finish batch
            $this->nacha_builder->finish_batch();

            // Calculate entry hash (last 10 digits of sum)
            $result['entry_hash'] = substr( (string) $entry_hash_sum, -10 );

            $result['success'] = count( $result['entries'] ) > 0;

        } catch ( \Exception $e ) {
            $result['errors'][] = 'NACHA generation error: ' . $e->getMessage();
        }

        return $result;
    }

    /**
     * Upload batch file via SFTP
     *
     * @param string $batch_id Batch ID
     * @param string $filepath Local file path
     * @param string $filename Remote filename
     * @return array{success: bool, error: string|null}
     */
    private function upload_batch( string $batch_id, string $filepath, string $filename ): array {
        $result = [ 'success' => false, 'error' => null ];

        try {
            $sftp_config = $this->settings->get_sftp_config();
            $remote_path = rtrim( $sftp_config['remote_path'], '/' ) . '/' . $filename;

            // Connect and upload
            $this->sftp_client->connect();
            $this->sftp_client->upload( $filepath, $remote_path );
            $this->sftp_client->disconnect();

            // Mark as uploaded
            $this->repository->mark_uploaded( $batch_id );

            $this->audit_log->log_batch_action( 'batch_uploaded', $batch_id, [
                'remote_path' => $remote_path,
            ]);

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'SFTP upload successful: %s -> %s', $filename, $remote_path ),
                'info'
            );

            $result['success'] = true;

        } catch ( \Exception $e ) {
            $this->repository->record_upload_failure( $batch_id, $e->getMessage() );

            $this->audit_log->log_batch_action( 'batch_upload_failed', $batch_id, [
                'error' => $e->getMessage(),
            ]);

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'SFTP upload failed: %s', $e->getMessage() ),
                'error'
            );

            $result['error'] = $e->getMessage();
        }

        return $result;
    }

    /**
     * Generate filename for batch
     *
     * @param string $batch_id Batch ID
     * @return string
     */
    private function generate_filename( string $batch_id ): string {
        // TODO: Dan to confirm naming convention required by processor
        // Common formats:
        // - ACH_YYYYMMDD_HHMM.txt
        // - COMPANY_YYYYMMDD_SEQ.ach
        // - NACHA_batchid.txt

        $config = $this->settings->get_nacha_config();
        $company_short = preg_replace( '/[^A-Z0-9]/', '', strtoupper( substr( $config['company_name'], 0, 4 ) ) );

        return sprintf(
            '%s_%s_%s.ach',
            $company_short,
            date( 'Ymd_Hi' ),
            substr( $batch_id, -8 )
        );
    }

    /**
     * Generate manifest CSV for batch using secure private storage
     *
     * SECURITY: Manifest files contain order IDs and account last4 digits.
     * While not highly sensitive, they are stored in protected directory
     * alongside NACHA files for consistency.
     *
     * @param string $batch_id Batch ID
     * @param array  $entries  Entry data
     */
    private function generate_manifest( string $batch_id, array $entries ): void {
        // Build CSV content in memory first
        $output = fopen( 'php://temp', 'r+' );

        // Header row - NOTE: Does NOT include full account numbers
        fputcsv( $output, [
            'Order ID',
            'Trace Number',
            'Amount',
            'Transaction Code',
            'Account Last 4',
        ]);

        // Data rows
        foreach ( $entries as $entry ) {
            fputcsv( $output, [
                $entry['order_id'],
                $entry['trace_number'],
                number_format( $entry['amount'], 2, '.', '' ),
                $entry['transaction_code'],
                $entry['account_last4'],
            ]);
        }

        // Get content and close
        rewind( $output );
        $content = stream_get_contents( $output );
        fclose( $output );

        // Write to protected storage
        $filename = $batch_id . '_manifest.csv';
        $filepath = $this->storage->write( PrivateStorage::STORAGE_MANIFEST, $filename, $content );

        if ( false === $filepath ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Failed to write manifest for batch %s', $batch_id ),
                'error'
            );
        }
    }

    /**
     * Acquire batch processing lock with stuck lock protection
     *
     * SECURITY: Prevents concurrent batch runs which could cause
     * duplicate ACH entries. Also handles stuck locks from crashed runs.
     *
     * @return bool
     */
    private function acquire_lock(): bool {
        $lock_key = self::LOCK_PREFIX . 'runner';
        $existing_lock = get_transient( $lock_key );

        // Check for stuck lock (older than max age)
        if ( false !== $existing_lock ) {
            $lock_time = (int) $existing_lock;
            $lock_age = time() - $lock_time;

            if ( $lock_age > self::LOCK_MAX_AGE ) {
                // Lock is stuck - force release and log
                \Nuwud\WooAchBatch\log_message(
                    sprintf( 'Releasing stuck batch lock (age: %d seconds)', $lock_age ),
                    'warning'
                );
                $this->audit_log->log( 'stuck_lock_released', 'batch', null, [
                    'lock_age_seconds' => $lock_age,
                ]);
                delete_transient( $lock_key );
            } else {
                // Lock is valid, cannot acquire
                return false;
            }
        }

        // Set new lock with current timestamp
        set_transient( $lock_key, time(), self::LOCK_MAX_AGE );
        return true;
    }

    /**
     * Release batch processing lock
     */
    private function release_lock(): void {
        delete_transient( self::LOCK_PREFIX . 'runner' );
    }

    /**
     * Retry failed uploads
     *
     * @return array Results
     */
    public function retry_failed_uploads(): array {
        $results = [];
        $pending = $this->repository->get_pending_upload_batches();

        foreach ( $pending as $batch ) {
            $filepath = $batch['file_path'];
            $filename = $batch['file_name'];

            if ( ! file_exists( $filepath ) ) {
                $this->repository->update_batch_status( $batch['batch_id'], 'failed', [
                    'last_error' => 'File not found for retry',
                ]);
                $results[ $batch['batch_id'] ] = 'File not found';
                continue;
            }

            $upload_result = $this->upload_batch( $batch['batch_id'], $filepath, $filename );
            $results[ $batch['batch_id'] ] = $upload_result['success'] ? 'Success' : $upload_result['error'];
        }

        return $results;
    }
}
