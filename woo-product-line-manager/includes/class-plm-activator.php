<?php
/**
 * Plugin activation
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Activator class
 */
class PLM_Activator {

    /**
     * Activate the plugin
     */
    public static function activate() {
        self::create_tables();
        self::create_options();
        self::schedule_events();
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Create database tables
     */
    private static function create_tables() {
        global $wpdb;

        $charset_collate = $wpdb->get_charset_collate();

        // Audit history table
        $table_name = $wpdb->prefix . 'plm_audit_history';
        $sql = "CREATE TABLE $table_name (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            audit_date datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            total_products int(11) DEFAULT 0,
            total_manufacturers int(11) DEFAULT 0,
            coverage_percent decimal(5,2) DEFAULT 0,
            gaps_identified int(11) DEFAULT 0,
            special_order_items int(11) DEFAULT 0,
            audit_data longtext,
            PRIMARY KEY  (id),
            KEY audit_date (audit_date)
        ) $charset_collate;";

        // Product line associations table
        $table_name2 = $wpdb->prefix . 'plm_product_lines';
        $sql2 = "CREATE TABLE $table_name2 (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            product_id bigint(20) NOT NULL,
            manufacturer varchar(255) NOT NULL,
            product_line varchar(255) NOT NULL,
            size_normalized varchar(100),
            is_essential tinyint(1) DEFAULT 0,
            priority int(11) DEFAULT 3,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY product_line_unique (product_id, manufacturer, product_line),
            KEY manufacturer (manufacturer),
            KEY product_line (product_line),
            KEY is_essential (is_essential)
        ) $charset_collate;";

        // Special orders table
        $table_name3 = $wpdb->prefix . 'plm_special_orders';
        $sql3 = "CREATE TABLE $table_name3 (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            manufacturer varchar(255) NOT NULL,
            product_line varchar(255) NOT NULL,
            size varchar(100) NOT NULL,
            status varchar(50) DEFAULT 'available',
            base_price decimal(10,2),
            special_order_price decimal(10,2),
            distributor varchar(255),
            notes text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY special_order_unique (manufacturer, product_line, size),
            KEY manufacturer (manufacturer),
            KEY status (status)
        ) $charset_collate;";

        require_once( ABSPATH . 'wp-admin/includes/upgrade.php' );
        dbDelta( $sql );
        dbDelta( $sql2 );
        dbDelta( $sql3 );

        // Store database version
        update_option( 'plm_db_version', PLM_VERSION );
    }

    /**
     * Create default options
     */
    private static function create_options() {
        $defaults = array(
            'plm_audit_frequency'    => 'weekly',
            'plm_email_notifications' => 'yes',
            'plm_admin_email'        => get_option( 'admin_email' ),
            'plm_special_order_page' => 0,
            'plm_display_other_sizes' => 'yes',
            'plm_essential_threshold' => 2,
            'plm_last_audit'         => '',
        );

        foreach ( $defaults as $key => $value ) {
            if ( get_option( $key ) === false ) {
                add_option( $key, $value );
            }
        }
    }

    /**
     * Schedule cron events
     */
    private static function schedule_events() {
        if ( ! wp_next_scheduled( 'plm_weekly_audit' ) ) {
            wp_schedule_event( time(), 'weekly', 'plm_weekly_audit' );
        }
    }
}
