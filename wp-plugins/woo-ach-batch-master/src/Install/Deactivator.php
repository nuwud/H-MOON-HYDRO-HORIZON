<?php
/**
 * Plugin Deactivator
 *
 * Handles deactivation tasks like clearing cron schedules.
 *
 * @package Nuwud\WooAchBatch\Install
 */

namespace Nuwud\WooAchBatch\Install;

/**
 * Deactivator class
 */
class Deactivator {

    /**
     * Deactivate the plugin
     */
    public static function deactivate(): void {
        self::clear_cron_events();
        self::clear_transients();

        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Clear all scheduled cron events
     */
    private static function clear_cron_events(): void {
        $cron_hooks = [
            'woo_ach_batch_morning_export',
            'woo_ach_batch_midnight_export',
            'woo_ach_batch_reconciliation_check',
        ];

        foreach ( $cron_hooks as $hook ) {
            $timestamp = wp_next_scheduled( $hook );
            if ( $timestamp ) {
                wp_unschedule_event( $timestamp, $hook );
            }
            // Clear all instances
            wp_clear_scheduled_hook( $hook );
        }
    }

    /**
     * Clear plugin transients
     */
    private static function clear_transients(): void {
        global $wpdb;

        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_woo_ach_batch_%'"
        );
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_woo_ach_batch_%'"
        );
    }
}
