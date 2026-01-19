<?php
/**
 * Cron Scheduler
 *
 * Manages scheduled batch exports at 13:00 and 00:00 PT.
 *
 * @package Nuwud\WooAchBatch\Cron
 */

namespace Nuwud\WooAchBatch\Cron;

use Nuwud\WooAchBatch\Batch\BatchRunner;
use Nuwud\WooAchBatch\Admin\Settings;

/**
 * Cron scheduler for batch exports
 */
class Scheduler {

    /**
     * Services
     */
    private BatchRunner $batch_runner;
    private Settings $settings;

    /**
     * Cron hook names
     */
    public const HOOK_MORNING = 'woo_ach_batch_morning_export';
    public const HOOK_MIDNIGHT = 'woo_ach_batch_midnight_export';
    public const HOOK_RECONCILIATION = 'woo_ach_batch_reconciliation_check';

    /**
     * Constructor
     */
    public function __construct( BatchRunner $batch_runner, Settings $settings ) {
        $this->batch_runner = $batch_runner;
        $this->settings = $settings;
    }

    /**
     * Initialize scheduler hooks
     */
    public function init(): void {
        // Register cron handlers
        add_action( self::HOOK_MORNING, [ $this, 'run_morning_export' ] );
        add_action( self::HOOK_MIDNIGHT, [ $this, 'run_midnight_export' ] );
        add_action( self::HOOK_RECONCILIATION, [ $this, 'run_reconciliation_check' ] );

        // Reschedule if times have changed
        add_action( 'update_option_woo_ach_batch_schedule_settings', [ $this, 'reschedule_events' ] );

        // Add custom cron intervals if needed
        add_filter( 'cron_schedules', [ $this, 'add_cron_intervals' ] );
    }

    /**
     * Add custom cron intervals
     *
     * @param array $schedules Existing schedules
     * @return array
     */
    public function add_cron_intervals( array $schedules ): array {
        $schedules['twice_daily_pt'] = [
            'interval' => 43200, // 12 hours
            'display' => __( 'Twice Daily (PT schedule)', 'woo-ach-batch' ),
        ];

        return $schedules;
    }

    /**
     * Run morning batch export (1:00 PM PT)
     */
    public function run_morning_export(): void {
        if ( ! $this->is_enabled() ) {
            \Nuwud\WooAchBatch\log_message( 'Morning export skipped: scheduling disabled', 'info' );
            return;
        }

        \Nuwud\WooAchBatch\log_message( 'Starting scheduled morning batch export (1:00 PM PT)', 'info' );

        $result = $this->batch_runner->run( true );

        if ( $result['success'] ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Morning export completed: Batch %s, %d orders', $result['batch_id'] ?? 'none', $result['orders'] ),
                'info'
            );
        } else {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Morning export issues: %s', implode( '; ', $result['errors'] ) ),
                'warning'
            );
        }

        // Send notification email
        $this->send_export_notification( 'morning', $result );
    }

    /**
     * Run midnight batch export (12:00 AM PT)
     */
    public function run_midnight_export(): void {
        if ( ! $this->is_enabled() ) {
            \Nuwud\WooAchBatch\log_message( 'Midnight export skipped: scheduling disabled', 'info' );
            return;
        }

        \Nuwud\WooAchBatch\log_message( 'Starting scheduled midnight batch export (12:00 AM PT)', 'info' );

        $result = $this->batch_runner->run( true );

        if ( $result['success'] ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Midnight export completed: Batch %s, %d orders', $result['batch_id'] ?? 'none', $result['orders'] ),
                'info'
            );
        } else {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Midnight export issues: %s', implode( '; ', $result['errors'] ) ),
                'warning'
            );
        }

        // Send notification email
        $this->send_export_notification( 'midnight', $result );

        // Also retry any failed uploads from earlier
        $retry_results = $this->batch_runner->retry_failed_uploads();
        if ( ! empty( $retry_results ) ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Upload retry results: %s', wp_json_encode( $retry_results ) ),
                'info'
            );
        }
    }

    /**
     * Run reconciliation check
     */
    public function run_reconciliation_check(): void {
        // TODO: Implement SFTP pull for return files
        // This is a placeholder for the reconciliation module

        \Nuwud\WooAchBatch\log_message( 'Reconciliation check running (stub)', 'debug' );

        // Check for return files on SFTP server
        // Download and process them
        // Update order statuses for returned payments
    }

    /**
     * Check if scheduling is enabled
     *
     * @return bool
     */
    private function is_enabled(): bool {
        return $this->settings->is_schedule_enabled();
    }

    /**
     * Reschedule events when settings change
     */
    public function reschedule_events(): void {
        // Clear existing schedules
        $this->unschedule_all();

        // Reschedule with new times
        $this->schedule_events();

        \Nuwud\WooAchBatch\log_message( 'Batch export schedule updated', 'info' );
    }

    /**
     * Schedule all cron events
     */
    public function schedule_events(): void {
        $config = $this->settings->get_schedule_config();

        if ( $config['enabled'] !== 'yes' ) {
            return;
        }

        $tz = new \DateTimeZone( $config['timezone'] ?? 'America/Los_Angeles' );

        // Schedule morning export
        if ( ! wp_next_scheduled( self::HOOK_MORNING ) ) {
            list( $hour, $minute ) = explode( ':', $config['morning_time'] ?? '13:00' );
            $morning_time = $this->get_next_scheduled_time( (int) $hour, (int) $minute, $tz );
            wp_schedule_event( $morning_time, 'daily', self::HOOK_MORNING );
        }

        // Schedule midnight export
        if ( ! wp_next_scheduled( self::HOOK_MIDNIGHT ) ) {
            list( $hour, $minute ) = explode( ':', $config['midnight_time'] ?? '00:00' );
            $midnight_time = $this->get_next_scheduled_time( (int) $hour, (int) $minute, $tz );
            wp_schedule_event( $midnight_time, 'daily', self::HOOK_MIDNIGHT );
        }

        // Schedule reconciliation check
        if ( ! wp_next_scheduled( self::HOOK_RECONCILIATION ) ) {
            wp_schedule_event( time(), 'hourly', self::HOOK_RECONCILIATION );
        }
    }

    /**
     * Unschedule all cron events
     */
    public function unschedule_all(): void {
        $hooks = [ self::HOOK_MORNING, self::HOOK_MIDNIGHT, self::HOOK_RECONCILIATION ];

        foreach ( $hooks as $hook ) {
            $timestamp = wp_next_scheduled( $hook );
            if ( $timestamp ) {
                wp_unschedule_event( $timestamp, $hook );
            }
            wp_clear_scheduled_hook( $hook );
        }
    }

    /**
     * Get next scheduled time for a specific hour/minute in timezone
     *
     * @param int           $hour   Hour (0-23)
     * @param int           $minute Minute (0-59)
     * @param \DateTimeZone $tz     Timezone
     * @return int Unix timestamp
     */
    private function get_next_scheduled_time( int $hour, int $minute, \DateTimeZone $tz ): int {
        $now = new \DateTime( 'now', $tz );
        $scheduled = new \DateTime( 'now', $tz );
        $scheduled->setTime( $hour, $minute, 0 );

        // If the time has already passed today, schedule for tomorrow
        if ( $scheduled <= $now ) {
            $scheduled->modify( '+1 day' );
        }

        return $scheduled->getTimestamp();
    }

    /**
     * Send export notification email
     *
     * @param string $type   Export type (morning/midnight)
     * @param array  $result Export result
     */
    private function send_export_notification( string $type, array $result ): void {
        $admin_email = get_option( 'admin_email' );

        if ( ! $admin_email ) {
            return;
        }

        // Only send on errors or if orders were processed
        if ( $result['orders'] === 0 && empty( $result['errors'] ) ) {
            return;
        }

        $subject = sprintf(
            '[%s] ACH Batch Export %s - %s',
            get_bloginfo( 'name' ),
            ucfirst( $type ),
            $result['success'] ? 'Completed' : 'Issues'
        );

        $message = sprintf(
            "ACH Batch Export Report\n" .
            "========================\n\n" .
            "Time: %s\n" .
            "Type: %s export\n" .
            "Status: %s\n" .
            "Batch ID: %s\n" .
            "Orders Processed: %d\n",
            current_time( 'mysql' ),
            ucfirst( $type ),
            $result['success'] ? 'Success' : 'Completed with issues',
            $result['batch_id'] ?? 'N/A',
            $result['orders']
        );

        if ( ! empty( $result['errors'] ) ) {
            $message .= "\nIssues:\n" . implode( "\n- ", $result['errors'] );
        }

        $message .= sprintf(
            "\n\nView batches: %s",
            admin_url( 'admin.php?page=woo-ach-batch-batches' )
        );

        wp_mail( $admin_email, $subject, $message );
    }

    /**
     * Get schedule status for admin display
     *
     * @return array
     */
    public function get_schedule_status(): array {
        $config = $this->settings->get_schedule_config();
        $tz = new \DateTimeZone( $config['timezone'] ?? 'America/Los_Angeles' );

        $morning_timestamp = wp_next_scheduled( self::HOOK_MORNING );
        $midnight_timestamp = wp_next_scheduled( self::HOOK_MIDNIGHT );
        $reconciliation_timestamp = wp_next_scheduled( self::HOOK_RECONCILIATION );

        return [
            'enabled' => $config['enabled'] === 'yes',
            'timezone' => $config['timezone'] ?? 'America/Los_Angeles',
            'morning' => [
                'time' => $config['morning_time'] ?? '13:00',
                'next_run' => $morning_timestamp ? $this->format_timestamp( $morning_timestamp, $tz ) : null,
                'scheduled' => (bool) $morning_timestamp,
            ],
            'midnight' => [
                'time' => $config['midnight_time'] ?? '00:00',
                'next_run' => $midnight_timestamp ? $this->format_timestamp( $midnight_timestamp, $tz ) : null,
                'scheduled' => (bool) $midnight_timestamp,
            ],
            'reconciliation' => [
                'next_run' => $reconciliation_timestamp ? $this->format_timestamp( $reconciliation_timestamp, $tz ) : null,
                'scheduled' => (bool) $reconciliation_timestamp,
            ],
        ];
    }

    /**
     * Format timestamp for display
     *
     * @param int           $timestamp Unix timestamp
     * @param \DateTimeZone $tz        Timezone
     * @return string
     */
    private function format_timestamp( int $timestamp, \DateTimeZone $tz ): string {
        $dt = new \DateTime( '@' . $timestamp );
        $dt->setTimezone( $tz );
        return $dt->format( 'Y-m-d H:i:s T' );
    }
}
