<?php
/**
 * Audit Log Service
 *
 * Records all significant actions for compliance and debugging.
 *
 * @package Nuwud\WooAchBatch\Security
 */

namespace Nuwud\WooAchBatch\Security;

/**
 * Audit logging service
 */
class AuditLog {

    /**
     * Database table name
     *
     * @var string
     */
    private string $table;

    /**
     * Current correlation ID for grouping related actions
     *
     * @var string|null
     */
    private ?string $correlation_id = null;

    /**
     * Constructor
     */
    public function __construct() {
        global $wpdb;
        $this->table = $wpdb->prefix . 'woo_ach_audit_log';
    }

    /**
     * Set correlation ID for grouping related log entries
     *
     * @param string|null $id Correlation ID (null to generate new)
     * @return string The correlation ID being used
     */
    public function set_correlation_id( ?string $id = null ): string {
        $this->correlation_id = $id ?? $this->generate_correlation_id();
        return $this->correlation_id;
    }

    /**
     * Get current correlation ID
     *
     * @return string|null
     */
    public function get_correlation_id(): ?string {
        return $this->correlation_id;
    }

    /**
     * Clear correlation ID
     */
    public function clear_correlation_id(): void {
        $this->correlation_id = null;
    }

    /**
     * Log an action
     *
     * @param string      $action      Action name (e.g., 'payment_initiated', 'batch_exported')
     * @param string|null $entity_type Entity type (e.g., 'order', 'batch')
     * @param string|null $entity_id   Entity ID
     * @param array       $details     Additional details (will be JSON encoded)
     * @return int|false Inserted row ID or false on failure
     */
    public function log(
        string $action,
        ?string $entity_type = null,
        ?string $entity_id = null,
        array $details = []
    ): int|false {
        global $wpdb;

        // Sanitize details - remove any sensitive data
        $details = $this->sanitize_details( $details );

        $data = [
            'correlation_id' => $this->correlation_id,
            'action' => sanitize_text_field( $action ),
            'entity_type' => $entity_type ? sanitize_text_field( $entity_type ) : null,
            'entity_id' => $entity_id ? sanitize_text_field( $entity_id ) : null,
            'user_id' => get_current_user_id() ?: null,
            'ip_address' => $this->get_client_ip(),
            'details' => ! empty( $details ) ? wp_json_encode( $details ) : null,
            'created_at' => current_time( 'mysql' ),
        ];

        $result = $wpdb->insert( $this->table, $data );

        if ( false === $result ) {
            // Fallback to WC logger if database insert fails
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Audit log insert failed: %s', $wpdb->last_error ),
                'error'
            );
            return false;
        }

        return $wpdb->insert_id;
    }

    /**
     * Log batch-related action with automatic correlation
     *
     * @param string $action    Action name
     * @param string $batch_id  Batch ID
     * @param array  $details   Additional details
     * @return int|false
     */
    public function log_batch_action( string $action, string $batch_id, array $details = [] ): int|false {
        // Use batch ID as correlation ID for batch operations
        $previous_correlation = $this->correlation_id;
        $this->correlation_id = 'BATCH:' . $batch_id;

        $result = $this->log( $action, 'batch', $batch_id, $details );

        $this->correlation_id = $previous_correlation;

        return $result;
    }

    /**
     * Get logs for a specific entity
     *
     * @param string $entity_type Entity type
     * @param string $entity_id   Entity ID
     * @param int    $limit       Max results
     * @return array
     */
    public function get_logs_for_entity( string $entity_type, string $entity_id, int $limit = 50 ): array {
        global $wpdb;

        $results = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$this->table}
                WHERE entity_type = %s AND entity_id = %s
                ORDER BY created_at DESC
                LIMIT %d",
                $entity_type,
                $entity_id,
                $limit
            ),
            ARRAY_A
        );

        return array_map( [ $this, 'format_log_entry' ], $results );
    }

    /**
     * Get logs by correlation ID
     *
     * @param string $correlation_id Correlation ID
     * @return array
     */
    public function get_logs_by_correlation( string $correlation_id ): array {
        global $wpdb;

        $results = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$this->table}
                WHERE correlation_id = %s
                ORDER BY created_at ASC",
                $correlation_id
            ),
            ARRAY_A
        );

        return array_map( [ $this, 'format_log_entry' ], $results );
    }

    /**
     * Get recent logs
     *
     * @param int         $limit   Max results
     * @param string|null $action  Filter by action
     * @param string|null $user_id Filter by user ID
     * @return array
     */
    public function get_recent_logs( int $limit = 100, ?string $action = null, ?string $user_id = null ): array {
        global $wpdb;

        $where = [];
        $params = [];

        if ( $action ) {
            $where[] = 'action = %s';
            $params[] = $action;
        }

        if ( $user_id ) {
            $where[] = 'user_id = %d';
            $params[] = (int) $user_id;
        }

        $where_clause = ! empty( $where ) ? 'WHERE ' . implode( ' AND ', $where ) : '';
        $params[] = $limit;

        $query = "SELECT * FROM {$this->table} {$where_clause} ORDER BY created_at DESC LIMIT %d";

        $results = $wpdb->get_results(
            $wpdb->prepare( $query, $params ),
            ARRAY_A
        );

        return array_map( [ $this, 'format_log_entry' ], $results );
    }

    /**
     * Get export history
     *
     * @param int $limit Max results
     * @return array
     */
    public function get_export_history( int $limit = 50 ): array {
        global $wpdb;

        $export_actions = [ 'batch_created', 'batch_exported', 'batch_uploaded', 'batch_failed' ];
        $placeholders = implode( ',', array_fill( 0, count( $export_actions ), '%s' ) );

        $results = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$this->table}
                WHERE action IN ({$placeholders})
                ORDER BY created_at DESC
                LIMIT %d",
                array_merge( $export_actions, [ $limit ] )
            ),
            ARRAY_A
        );

        return array_map( [ $this, 'format_log_entry' ], $results );
    }

    /**
     * Purge old logs
     *
     * @param int $days_to_keep Days of logs to keep (default 90)
     * @return int Number of deleted rows
     */
    public function purge_old_logs( int $days_to_keep = 90 ): int {
        global $wpdb;

        $cutoff_date = date( 'Y-m-d H:i:s', strtotime( "-{$days_to_keep} days" ) );

        $deleted = $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$this->table} WHERE created_at < %s",
                $cutoff_date
            )
        );

        if ( $deleted > 0 ) {
            $this->log( 'audit_logs_purged', null, null, [
                'deleted_count' => $deleted,
                'cutoff_date' => $cutoff_date,
            ]);
        }

        return $deleted;
    }

    /**
     * Export logs to CSV
     *
     * @param array $filters Filters to apply
     * @return string CSV content
     */
    public function export_to_csv( array $filters = [] ): string {
        global $wpdb;

        $where = [];
        $params = [];

        if ( ! empty( $filters['start_date'] ) ) {
            $where[] = 'created_at >= %s';
            $params[] = $filters['start_date'];
        }

        if ( ! empty( $filters['end_date'] ) ) {
            $where[] = 'created_at <= %s';
            $params[] = $filters['end_date'];
        }

        if ( ! empty( $filters['action'] ) ) {
            $where[] = 'action = %s';
            $params[] = $filters['action'];
        }

        $where_clause = ! empty( $where ) ? 'WHERE ' . implode( ' AND ', $where ) : '';

        $query = "SELECT * FROM {$this->table} {$where_clause} ORDER BY created_at ASC";

        if ( ! empty( $params ) ) {
            $query = $wpdb->prepare( $query, $params );
        }

        $results = $wpdb->get_results( $query, ARRAY_A );

        // Build CSV
        $output = fopen( 'php://temp', 'r+' );

        // Header row
        fputcsv( $output, [
            'ID',
            'Correlation ID',
            'Action',
            'Entity Type',
            'Entity ID',
            'User ID',
            'IP Address',
            'Details',
            'Created At',
        ]);

        foreach ( $results as $row ) {
            fputcsv( $output, [
                $row['id'],
                $row['correlation_id'],
                $row['action'],
                $row['entity_type'],
                $row['entity_id'],
                $row['user_id'],
                $row['ip_address'],
                $row['details'],
                $row['created_at'],
            ]);
        }

        rewind( $output );
        $csv = stream_get_contents( $output );
        fclose( $output );

        return $csv;
    }

    /**
     * Format a log entry for display
     *
     * @param array $entry Raw database row
     * @return array Formatted entry
     */
    private function format_log_entry( array $entry ): array {
        // Decode JSON details
        if ( ! empty( $entry['details'] ) ) {
            $entry['details'] = json_decode( $entry['details'], true );
        }

        // Get username if user_id exists
        if ( ! empty( $entry['user_id'] ) ) {
            $user = get_user_by( 'id', $entry['user_id'] );
            $entry['user_name'] = $user ? $user->display_name : __( 'Unknown', 'woo-ach-batch' );
        }

        // Format timestamps
        $entry['created_at_formatted'] = wp_date(
            get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
            strtotime( $entry['created_at'] )
        );

        return $entry;
    }

    /**
     * Sanitize details array - remove sensitive data
     *
     * @param array $details Details to sanitize
     * @return array
     */
    private function sanitize_details( array $details ): array {
        $sensitive_keys = [
            'account_number',
            'routing_number',
            'password',
            'token',
            'key',
            'secret',
            'private_key',
        ];

        foreach ( $details as $key => $value ) {
            if ( is_array( $value ) ) {
                $details[ $key ] = $this->sanitize_details( $value );
            } elseif ( in_array( strtolower( $key ), $sensitive_keys, true ) ) {
                $details[ $key ] = '[REDACTED]';
            }
        }

        return $details;
    }

    /**
     * Get client IP address
     *
     * @return string
     */
    private function get_client_ip(): string {
        $ip = '';

        if ( ! empty( $_SERVER['HTTP_CLIENT_IP'] ) ) {
            $ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_CLIENT_IP'] ) );
        } elseif ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
            $ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) );
            $ip = explode( ',', $ip )[0];
        } elseif ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
            $ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
        }

        return trim( $ip );
    }

    /**
     * Generate a unique correlation ID
     *
     * @return string
     */
    private function generate_correlation_id(): string {
        return strtoupper( substr( md5( uniqid( '', true ) ), 0, 12 ) );
    }
}
