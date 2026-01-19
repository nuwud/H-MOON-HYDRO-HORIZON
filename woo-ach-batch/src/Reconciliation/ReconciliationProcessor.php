<?php
/**
 * Reconciliation Processor
 *
 * Handles processing of return files from the bank.
 *
 * @package Nuwud\WooAchBatch\Reconciliation
 */

namespace Nuwud\WooAchBatch\Reconciliation;

/**
 * Processes ACH return files and updates order statuses
 *
 * TODO: Implement actual return file parsing when Dan provides processor specs
 * This is a stub implementation that provides the structure.
 */
class ReconciliationProcessor {

    /**
     * ACH Return Reason Codes
     *
     * @var array<string, string>
     */
    public const RETURN_CODES = [
        'R01' => 'Insufficient Funds',
        'R02' => 'Account Closed',
        'R03' => 'No Account/Unable to Locate Account',
        'R04' => 'Invalid Account Number',
        'R05' => 'Unauthorized Debit to Consumer Account Using Corporate SEC Code',
        'R06' => 'Returned per ODFI\'s Request',
        'R07' => 'Authorization Revoked by Customer',
        'R08' => 'Payment Stopped',
        'R09' => 'Uncollected Funds',
        'R10' => 'Customer Advises Not Authorized',
        'R11' => 'Check Truncation Entry Return',
        'R12' => 'Account Sold to Another DFI',
        'R13' => 'Invalid ACH Routing Number',
        'R14' => 'Representative Payee Deceased or Unable to Continue',
        'R15' => 'Beneficiary or Account Holder Deceased',
        'R16' => 'Account Frozen',
        'R17' => 'File Record Edit Criteria',
        'R20' => 'Non-Transaction Account',
        'R21' => 'Invalid Company Identification',
        'R22' => 'Invalid Individual ID Number',
        'R23' => 'Credit Entry Refused by Receiver',
        'R24' => 'Duplicate Entry',
        'R29' => 'Corporate Customer Advises Not Authorized',
        'R31' => 'Permissible Return Entry',
        'R33' => 'Return of XCK Entry',
    ];

    /**
     * Initialize processor
     */
    public function init(): void {
        // Register cron hook
        add_action( 'woo_ach_batch_check_returns', [ $this, 'check_for_returns' ] );

        // Admin action for manual import
        add_action( 'admin_post_woo_ach_import_returns', [ $this, 'handle_manual_import' ] );
    }

    /**
     * Check for return files via SFTP
     */
    public function check_for_returns(): void {
        try {
            $sftp = \Nuwud\WooAchBatch\service( 'sftp_client' );
            $settings = \Nuwud\WooAchBatch\service( 'settings' );

            $sftp->connect();

            // Get return file path from settings
            // TODO: Get actual path from Dan's spec
            $remote_path = $settings->get_option( 'sftp_returns_path', '/returns' );

            // List files in returns directory
            $files = $sftp->listDirectory( $remote_path );

            foreach ( $files as $file ) {
                // Check if it's a return file (based on naming convention)
                // TODO: Determine actual naming convention from Dan
                if ( $this->isReturnFile( $file ) ) {
                    $this->processReturnFile( $sftp, $remote_path . '/' . $file );
                }
            }

            $sftp->disconnect();

        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                'Return file check failed: ' . $e->getMessage(),
                'error'
            );
        }
    }

    /**
     * Check if a file is a return file
     *
     * @param string $filename Filename
     * @return bool
     */
    private function isReturnFile( string $filename ): bool {
        // TODO: Implement actual pattern matching based on processor spec
        // Common patterns: *.ret, *_return.*, *ACH_RETURN*, etc.
        return str_contains( strtolower( $filename ), 'return' ) ||
               str_ends_with( strtolower( $filename ), '.ret' );
    }

    /**
     * Process a return file
     *
     * @param object $sftp        SFTP client
     * @param string $remote_path Remote file path
     */
    private function processReturnFile( object $sftp, string $remote_path ): void {
        $upload_dir = wp_upload_dir();
        $local_dir = $upload_dir['basedir'] . '/woo-ach-batch/returns';
        $local_path = $local_dir . '/' . basename( $remote_path );

        // Ensure directory exists
        if ( ! file_exists( $local_dir ) ) {
            wp_mkdir_p( $local_dir );
        }

        // Download the file
        $sftp->download( $remote_path, $local_path );

        // Process the file
        $returns = $this->parseReturnFile( $local_path );

        foreach ( $returns as $return ) {
            $this->processReturn( $return );
        }

        // Mark file as processed (move or rename)
        // TODO: Implement based on processor requirements
        // Some processors want files moved to /processed, others renamed with .done extension

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'Processed return file: %s (%d returns)', basename( $remote_path ), count( $returns ) ),
            'info'
        );
    }

    /**
     * Parse a return file
     *
     * @param string $file_path Local file path
     * @return array Array of return records
     */
    public function parseReturnFile( string $file_path ): array {
        $returns = [];

        // TODO: Implement actual NACHA return file parsing
        // Return files follow NACHA format with type 6 entries containing return info

        $content = file_get_contents( $file_path );
        $lines = explode( "\n", $content );

        foreach ( $lines as $line ) {
            // Pad to 94 characters if needed
            $line = str_pad( $line, 94 );

            // Type 6 = Entry Detail
            if ( substr( $line, 0, 1 ) !== '6' ) {
                continue;
            }

            // Type 7 = Addenda (contains return code)
            // For returns, look for type 7 records following type 6

            // TODO: Parse actual fields based on NACHA spec
            // This is a simplified stub

            $return = [
                'trace_number' => trim( substr( $line, 79, 15 ) ),
                'amount' => (int) substr( $line, 29, 10 ),
                'account_number' => trim( substr( $line, 12, 17 ) ),
                'routing_number' => trim( substr( $line, 3, 9 ) ),
                'return_code' => '', // From addenda record
                'return_reason' => '',
            ];

            // Look for addenda record
            // TODO: Implement addenda parsing

            $returns[] = $return;
        }

        return $returns;
    }

    /**
     * Process a single return
     *
     * @param array $return Return data
     */
    public function processReturn( array $return ): void {
        global $wpdb;

        // Find the order by trace number
        $batch_items_table = $wpdb->prefix . 'woo_ach_batch_items';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $item = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$batch_items_table} WHERE trace_number = %s",
            $return['trace_number']
        ) );

        if ( ! $item ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Return for unknown trace number: %s', $return['trace_number'] ),
                'warning'
            );
            return;
        }

        $order = wc_get_order( $item->order_id );
        if ( ! $order ) {
            return;
        }

        // Store return record
        $returns_table = $wpdb->prefix . 'woo_ach_returns';
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $wpdb->insert( $returns_table, [
            'order_id' => $item->order_id,
            'batch_id' => $item->batch_id,
            'trace_number' => $return['trace_number'],
            'return_code' => $return['return_code'],
            'return_reason' => self::RETURN_CODES[ $return['return_code'] ] ?? $return['return_reason'],
            'amount' => $return['amount'],
            'received_date' => current_time( 'mysql' ),
        ] );

        // Update order status
        $order->update_status(
            'wc-ach-returned',
            sprintf(
                __( 'ACH payment returned: %s - %s', 'woo-ach-batch' ),
                $return['return_code'],
                self::RETURN_CODES[ $return['return_code'] ] ?? 'Unknown'
            )
        );

        // Store return info on order
        $order->update_meta_data( '_ach_return_code', $return['return_code'] );
        $order->update_meta_data( '_ach_return_reason', self::RETURN_CODES[ $return['return_code'] ] ?? '' );
        $order->update_meta_data( '_ach_return_date', current_time( 'mysql' ) );
        $order->save();

        // Trigger action for other integrations
        do_action( 'woo_ach_batch_return_processed', $order, $return );

        // Audit log
        \Nuwud\WooAchBatch\service( 'audit_log' )->log(
            'ach_return',
            sprintf( 'ACH return processed for order #%d', $item->order_id ),
            [
                'order_id' => $item->order_id,
                'return_code' => $return['return_code'],
                'return_reason' => self::RETURN_CODES[ $return['return_code'] ] ?? '',
                'amount' => $return['amount'],
            ]
        );

        \Nuwud\WooAchBatch\log_message(
            sprintf(
                'ACH return for order #%d: %s',
                $item->order_id,
                $return['return_code']
            ),
            'info'
        );
    }

    /**
     * Handle manual return file import
     */
    public function handle_manual_import(): void {
        if ( ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'woo_ach_import_returns' ) ) {
            wp_die( 'Security check failed' );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Permission denied' );
        }

        if ( ! isset( $_FILES['return_file'] ) ) {
            wp_die( 'No file uploaded' );
        }

        $file = $_FILES['return_file'];

        if ( $file['error'] !== UPLOAD_ERR_OK ) {
            wp_die( 'Upload error' );
        }

        // Parse and process
        $returns = $this->parseReturnFile( $file['tmp_name'] );

        foreach ( $returns as $return ) {
            $this->processReturn( $return );
        }

        wp_redirect( add_query_arg( [
            'page' => 'woo-ach-returns',
            'imported' => count( $returns ),
        ], admin_url( 'admin.php' ) ) );
        exit;
    }

    /**
     * Get return statistics
     *
     * @param string $period Period (day, week, month, year)
     * @return array
     */
    public function getStatistics( string $period = 'month' ): array {
        global $wpdb;
        $table = $wpdb->prefix . 'woo_ach_returns';

        $date_clause = match ( $period ) {
            'day' => 'DATE(received_date) = CURDATE()',
            'week' => 'received_date >= DATE_SUB(NOW(), INTERVAL 1 WEEK)',
            'year' => 'received_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)',
            default => 'received_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)',
        };

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $stats = $wpdb->get_row(
            "SELECT 
                COUNT(*) as total_returns,
                SUM(amount) as total_amount,
                COUNT(DISTINCT order_id) as unique_orders
            FROM {$table}
            WHERE {$date_clause}"
        );

        // Get return codes breakdown
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $by_code = $wpdb->get_results(
            "SELECT return_code, COUNT(*) as count, SUM(amount) as amount
            FROM {$table}
            WHERE {$date_clause}
            GROUP BY return_code
            ORDER BY count DESC"
        );

        return [
            'total_returns' => (int) ( $stats->total_returns ?? 0 ),
            'total_amount' => (int) ( $stats->total_amount ?? 0 ),
            'unique_orders' => (int) ( $stats->unique_orders ?? 0 ),
            'by_code' => $by_code,
        ];
    }
}
