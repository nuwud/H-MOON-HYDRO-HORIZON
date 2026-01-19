<?php
/**
 * Batch Repository
 *
 * Data access layer for ACH batches.
 *
 * @package Nuwud\WooAchBatch\Batch
 */

namespace Nuwud\WooAchBatch\Batch;

/**
 * Handles batch data storage and retrieval
 */
class BatchRepository {

    /**
     * Database table names
     */
    private string $batches_table;
    private string $items_table;

    /**
     * Constructor
     */
    public function __construct() {
        global $wpdb;
        $this->batches_table = $wpdb->prefix . 'woo_ach_batches';
        $this->items_table = $wpdb->prefix . 'woo_ach_batch_items';
    }

    /**
     * Create a new batch record
     *
     * @param array $data Batch data
     * @return string|false Batch ID on success, false on failure
     */
    public function create_batch( array $data ): string|false {
        global $wpdb;

        $batch_id = $data['batch_id'] ?? \Nuwud\WooAchBatch\generate_batch_id();

        $result = $wpdb->insert(
            $this->batches_table,
            [
                'batch_id' => $batch_id,
                'file_name' => $data['file_name'] ?? '',
                'file_path' => $data['file_path'] ?? null,
                'status' => $data['status'] ?? 'pending',
                'order_count' => $data['order_count'] ?? 0,
                'total_debit' => $data['total_debit'] ?? 0.00,
                'total_credit' => $data['total_credit'] ?? 0.00,
                'entry_hash' => $data['entry_hash'] ?? null,
                'batch_number' => $data['batch_number'] ?? null,
                'created_at' => current_time( 'mysql' ),
                'metadata' => isset( $data['metadata'] ) ? wp_json_encode( $data['metadata'] ) : null,
            ],
            [ '%s', '%s', '%s', '%s', '%d', '%f', '%f', '%s', '%d', '%s', '%s' ]
        );

        return $result ? $batch_id : false;
    }

    /**
     * Get a batch by ID
     *
     * @param string $batch_id Batch ID
     * @return array|null
     */
    public function get_batch( string $batch_id ): ?array {
        global $wpdb;

        $batch = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$this->batches_table} WHERE batch_id = %s",
                $batch_id
            ),
            ARRAY_A
        );

        if ( $batch && ! empty( $batch['metadata'] ) ) {
            $batch['metadata'] = json_decode( $batch['metadata'], true );
        }

        return $batch;
    }

    /**
     * Update batch status
     *
     * @param string $batch_id Batch ID
     * @param string $status   New status
     * @param array  $updates  Additional fields to update
     * @return bool
     */
    public function update_batch_status( string $batch_id, string $status, array $updates = [] ): bool {
        global $wpdb;

        $data = array_merge( $updates, [ 'status' => $status ] );
        $format = [];

        foreach ( $data as $key => $value ) {
            if ( is_int( $value ) ) {
                $format[] = '%d';
            } elseif ( is_float( $value ) ) {
                $format[] = '%f';
            } else {
                $format[] = '%s';
            }
        }

        return (bool) $wpdb->update(
            $this->batches_table,
            $data,
            [ 'batch_id' => $batch_id ],
            $format,
            [ '%s' ]
        );
    }

    /**
     * Mark batch as exported
     *
     * @param string $batch_id Batch ID
     * @return bool
     */
    public function mark_exported( string $batch_id ): bool {
        return $this->update_batch_status( $batch_id, 'exported', [
            'exported_at' => current_time( 'mysql' ),
        ]);
    }

    /**
     * Mark batch as uploaded
     *
     * @param string $batch_id Batch ID
     * @return bool
     */
    public function mark_uploaded( string $batch_id ): bool {
        global $wpdb;

        return (bool) $wpdb->update(
            $this->batches_table,
            [
                'status' => 'uploaded',
                'uploaded_at' => current_time( 'mysql' ),
            ],
            [ 'batch_id' => $batch_id ]
        );
    }

    /**
     * Record upload failure
     *
     * @param string $batch_id Batch ID
     * @param string $error    Error message
     * @return bool
     */
    public function record_upload_failure( string $batch_id, string $error ): bool {
        global $wpdb;

        return (bool) $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$this->batches_table}
                SET status = 'upload_failed',
                    last_error = %s,
                    upload_attempts = upload_attempts + 1
                WHERE batch_id = %s",
                $error,
                $batch_id
            )
        );
    }

    /**
     * Add item (order) to batch
     *
     * @param array $data Item data
     * @return int|false Insert ID or false
     */
    public function add_batch_item( array $data ): int|false {
        global $wpdb;

        $result = $wpdb->insert(
            $this->items_table,
            [
                'batch_id' => $data['batch_id'],
                'order_id' => $data['order_id'],
                'trace_number' => $data['trace_number'],
                'amount' => $data['amount'],
                'transaction_code' => $data['transaction_code'],
                'account_last4' => $data['account_last4'] ?? null,
                'status' => $data['status'] ?? 'pending',
                'created_at' => current_time( 'mysql' ),
            ]
        );

        return $result ? $wpdb->insert_id : false;
    }

    /**
     * Get items in a batch
     *
     * @param string $batch_id Batch ID
     * @return array
     */
    public function get_batch_items( string $batch_id ): array {
        global $wpdb;

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT bi.*, o.billing_first_name, o.billing_last_name
                FROM {$this->items_table} bi
                LEFT JOIN {$wpdb->prefix}wc_orders o ON bi.order_id = o.id
                WHERE bi.batch_id = %s
                ORDER BY bi.id ASC",
                $batch_id
            ),
            ARRAY_A
        );
    }

    /**
     * Get recent batches
     *
     * @param int         $limit  Max results
     * @param string|null $status Filter by status
     * @return array
     */
    public function get_recent_batches( int $limit = 50, ?string $status = null ): array {
        global $wpdb;

        $where = '';
        $params = [];

        if ( $status ) {
            $where = 'WHERE status = %s';
            $params[] = $status;
        }

        $params[] = $limit;

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$this->batches_table}
                {$where}
                ORDER BY created_at DESC
                LIMIT %d",
                $params
            ),
            ARRAY_A
        );
    }

    /**
     * Get batches pending upload (retry failed uploads)
     *
     * @param int $max_attempts Max upload attempts before giving up
     * @return array
     */
    public function get_pending_upload_batches( int $max_attempts = 3 ): array {
        global $wpdb;

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$this->batches_table}
                WHERE status IN ('exported', 'upload_failed')
                AND upload_attempts < %d
                ORDER BY created_at ASC",
                $max_attempts
            ),
            ARRAY_A
        );
    }

    /**
     * Get batch statistics
     *
     * @param string|null $start_date Start date (Y-m-d)
     * @param string|null $end_date   End date (Y-m-d)
     * @return array
     */
    public function get_statistics( ?string $start_date = null, ?string $end_date = null ): array {
        global $wpdb;

        $where = [];
        $params = [];

        if ( $start_date ) {
            $where[] = 'created_at >= %s';
            $params[] = $start_date . ' 00:00:00';
        }

        if ( $end_date ) {
            $where[] = 'created_at <= %s';
            $params[] = $end_date . ' 23:59:59';
        }

        $where_clause = ! empty( $where ) ? 'WHERE ' . implode( ' AND ', $where ) : '';

        $query = "SELECT
            COUNT(*) as total_batches,
            SUM(order_count) as total_orders,
            SUM(total_debit) as total_debit_amount,
            SUM(total_credit) as total_credit_amount,
            COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as uploaded_batches,
            COUNT(CASE WHEN status = 'upload_failed' THEN 1 END) as failed_batches
        FROM {$this->batches_table} {$where_clause}";

        if ( ! empty( $params ) ) {
            $query = $wpdb->prepare( $query, $params );
        }

        return $wpdb->get_row( $query, ARRAY_A );
    }

    /**
     * Find batch item by trace number
     *
     * @param string $trace_number Trace number
     * @return array|null
     */
    public function find_by_trace_number( string $trace_number ): ?array {
        global $wpdb;

        return $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$this->items_table} WHERE trace_number = %s",
                $trace_number
            ),
            ARRAY_A
        );
    }

    /**
     * Update batch item status
     *
     * @param int    $item_id     Item ID
     * @param string $status      New status
     * @param array  $extra_data  Additional data (return_code, return_reason)
     * @return bool
     */
    public function update_item_status( int $item_id, string $status, array $extra_data = [] ): bool {
        global $wpdb;

        $data = array_merge( $extra_data, [
            'status' => $status,
            'updated_at' => current_time( 'mysql' ),
        ]);

        return (bool) $wpdb->update(
            $this->items_table,
            $data,
            [ 'id' => $item_id ]
        );
    }

    /**
     * Get batch file path for download
     *
     * @param string $batch_id Batch ID
     * @return string|null
     */
    public function get_batch_file_path( string $batch_id ): ?string {
        global $wpdb;

        return $wpdb->get_var(
            $wpdb->prepare(
                "SELECT file_path FROM {$this->batches_table} WHERE batch_id = %s",
                $batch_id
            )
        );
    }

    /**
     * Delete old batches (cleanup)
     *
     * @param int $days_to_keep Days to retain batches
     * @return int Number of deleted batches
     */
    public function cleanup_old_batches( int $days_to_keep = 365 ): int {
        global $wpdb;

        $cutoff = date( 'Y-m-d H:i:s', strtotime( "-{$days_to_keep} days" ) );

        // Get batch IDs to delete
        $batch_ids = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT batch_id FROM {$this->batches_table}
                WHERE created_at < %s AND status = 'uploaded'",
                $cutoff
            )
        );

        if ( empty( $batch_ids ) ) {
            return 0;
        }

        // Delete items first
        $placeholders = implode( ',', array_fill( 0, count( $batch_ids ), '%s' ) );
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$this->items_table} WHERE batch_id IN ({$placeholders})",
                $batch_ids
            )
        );

        // Delete batches
        $deleted = $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$this->batches_table} WHERE batch_id IN ({$placeholders})",
                $batch_ids
            )
        );

        return $deleted;
    }
}
