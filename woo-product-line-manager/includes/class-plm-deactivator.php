<?php
/**
 * Plugin deactivation
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Deactivator class
 */
class PLM_Deactivator {

    /**
     * Deactivate the plugin
     */
    public static function deactivate() {
        self::clear_scheduled_events();
        self::clear_transients();
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Clear scheduled events
     */
    private static function clear_scheduled_events() {
        $timestamp = wp_next_scheduled( 'plm_weekly_audit' );
        if ( $timestamp ) {
            wp_unschedule_event( $timestamp, 'plm_weekly_audit' );
        }
    }

    /**
     * Clear plugin transients
     */
    private static function clear_transients() {
        global $wpdb;

        // Delete all PLM transients
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_plm_%'"
        );
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_plm_%'"
        );
    }
}
