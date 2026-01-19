<?php
/**
 * Plugin Activator
 *
 * Handles activation tasks like creating database tables and setting default options.
 *
 * @package Nuwud\WooAchBatch\Install
 */

namespace Nuwud\WooAchBatch\Install;

/**
 * Activator class
 */
class Activator {

    /**
     * Database version for migrations
     */
    const DB_VERSION = '1.0.0';

    /**
     * Activate the plugin
     */
    public static function activate(): void {
        self::create_tables();
        self::create_directories();
        self::set_default_options();
        self::add_capabilities();
        self::schedule_cron_events();

        // Store plugin version
        update_option( 'woo_ach_batch_version', WOO_ACH_BATCH_VERSION );
        update_option( 'woo_ach_batch_db_version', self::DB_VERSION );

        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Create custom database tables
     */
    private static function create_tables(): void {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        // Batches table
        $batches_table = $wpdb->prefix . 'woo_ach_batches';
        $sql_batches = "CREATE TABLE {$batches_table} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            batch_id varchar(50) NOT NULL,
            file_name varchar(255) NOT NULL,
            file_path varchar(500) DEFAULT NULL,
            status varchar(30) NOT NULL DEFAULT 'pending',
            order_count int(11) NOT NULL DEFAULT 0,
            total_debit decimal(15,2) NOT NULL DEFAULT 0.00,
            total_credit decimal(15,2) NOT NULL DEFAULT 0.00,
            entry_hash varchar(50) DEFAULT NULL,
            batch_number int(11) DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            exported_at datetime DEFAULT NULL,
            uploaded_at datetime DEFAULT NULL,
            upload_attempts int(11) NOT NULL DEFAULT 0,
            last_error text DEFAULT NULL,
            metadata longtext DEFAULT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY batch_id (batch_id),
            KEY status (status),
            KEY created_at (created_at)
        ) {$charset_collate};";

        dbDelta( $sql_batches );

        // Batch items table (orders in batch)
        $items_table = $wpdb->prefix . 'woo_ach_batch_items';
        $sql_items = "CREATE TABLE {$items_table} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            batch_id varchar(50) NOT NULL,
            order_id bigint(20) UNSIGNED NOT NULL,
            trace_number varchar(20) NOT NULL,
            amount decimal(15,2) NOT NULL,
            transaction_code varchar(5) NOT NULL,
            account_last4 varchar(4) DEFAULT NULL,
            status varchar(30) NOT NULL DEFAULT 'pending',
            return_code varchar(10) DEFAULT NULL,
            return_reason text DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY batch_id (batch_id),
            KEY order_id (order_id),
            KEY trace_number (trace_number),
            KEY status (status)
        ) {$charset_collate};";

        dbDelta( $sql_items );

        // Returns/reconciliation table
        $returns_table = $wpdb->prefix . 'woo_ach_returns';
        $sql_returns = "CREATE TABLE {$returns_table} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            file_name varchar(255) NOT NULL,
            file_path varchar(500) DEFAULT NULL,
            trace_number varchar(20) DEFAULT NULL,
            original_batch_id varchar(50) DEFAULT NULL,
            order_id bigint(20) UNSIGNED DEFAULT NULL,
            return_code varchar(10) NOT NULL,
            return_reason text DEFAULT NULL,
            amount decimal(15,2) DEFAULT NULL,
            processed_at datetime DEFAULT NULL,
            status varchar(30) NOT NULL DEFAULT 'pending',
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY trace_number (trace_number),
            KEY order_id (order_id),
            KEY return_code (return_code),
            KEY status (status)
        ) {$charset_collate};";

        dbDelta( $sql_returns );

        // Audit log table
        $audit_table = $wpdb->prefix . 'woo_ach_audit_log';
        $sql_audit = "CREATE TABLE {$audit_table} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            correlation_id varchar(50) DEFAULT NULL,
            action varchar(100) NOT NULL,
            entity_type varchar(50) DEFAULT NULL,
            entity_id varchar(100) DEFAULT NULL,
            user_id bigint(20) UNSIGNED DEFAULT NULL,
            ip_address varchar(45) DEFAULT NULL,
            details longtext DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY correlation_id (correlation_id),
            KEY action (action),
            KEY entity_type (entity_type),
            KEY entity_id (entity_id),
            KEY user_id (user_id),
            KEY created_at (created_at)
        ) {$charset_collate};";

        dbDelta( $sql_audit );
    }

    /**
     * Create required directories with security
     */
    private static function create_directories(): void {
        $upload_dir = wp_upload_dir();
        $base_dir = $upload_dir['basedir'];

        $directories = [
            $base_dir . '/woo-ach-batch-kyc',
            $base_dir . '/woo-ach-batch-nacha',
            $base_dir . '/woo-ach-batch-returns',
        ];

        foreach ( $directories as $dir ) {
            if ( ! file_exists( $dir ) ) {
                wp_mkdir_p( $dir );
            }

            // Create .htaccess to deny direct access
            $htaccess = $dir . '/.htaccess';
            if ( ! file_exists( $htaccess ) ) {
                file_put_contents( $htaccess, "Order deny,allow\nDeny from all\n" );
            }

            // Create index.php to prevent directory listing
            $index = $dir . '/index.php';
            if ( ! file_exists( $index ) ) {
                file_put_contents( $index, "<?php // Silence is golden.\n" );
            }
        }
    }

    /**
     * Set default plugin options
     */
    private static function set_default_options(): void {
        $defaults = [
            'woo_ach_batch_settings' => [
                'enabled' => 'no',
                'title' => 'ACH Bank Transfer',
                'description' => 'Pay directly from your bank account. Your order will be processed once the payment is verified.',
                'instructions' => '',
                'logging_level' => 'error',
            ],
            'woo_ach_batch_nacha_settings' => [
                // TODO: Dan to provide these values on Monday
                'immediate_destination' => '',          // Receiving bank routing number
                'immediate_destination_name' => '',     // Receiving bank name
                'immediate_origin' => '',               // Originating bank routing number / Company Fed ID
                'immediate_origin_name' => '',          // Company name
                'company_id' => '',                     // 10-digit company ID (usually EIN with leading 1)
                'company_name' => 'H MOON HYDRO',       // 16-char max
                'company_entry_description' => 'PURCHASE',  // 10-char max
                'originating_dfi_id' => '',             // 8-digit ODFI routing
                'sec_code' => 'PPD',                    // PPD for consumer, CCD for business
                'service_class_code' => '200',          // 200=mixed, 220=credits only, 225=debits only
                'entry_class_code' => 'PPD',
            ],
            'woo_ach_batch_sftp_settings' => [
                'host' => '',
                'port' => '22',
                'username' => '',
                'auth_type' => 'password',              // 'password' or 'key'
                'remote_path' => '/incoming/',
                'return_path' => '/returns/',
            ],
            'woo_ach_batch_schedule_settings' => [
                'enabled' => 'yes',
                'morning_time' => '13:00',              // 1:00 PM PT
                'midnight_time' => '00:00',             // 12:00 AM PT
                'timezone' => 'America/Los_Angeles',
            ],
            'woo_ach_batch_kyc_settings' => [
                'require_id_front' => 'no',
                'require_id_back' => 'no',
                'require_voided_check' => 'no',
                'storage_method' => 'private',          // 'private' or 'uploads'
            ],
        ];

        foreach ( $defaults as $option => $value ) {
            if ( false === get_option( $option ) ) {
                add_option( $option, $value );
            }
        }
    }

    /**
     * Add custom capabilities to roles
     */
    private static function add_capabilities(): void {
        $capabilities = [
            'manage_woo_ach_batches',
            'export_woo_ach_batches',
            'view_woo_ach_batches',
            'verify_woo_ach_payments',
        ];

        // Add to administrator
        $admin = get_role( 'administrator' );
        if ( $admin ) {
            foreach ( $capabilities as $cap ) {
                $admin->add_cap( $cap );
            }
        }

        // Add to shop manager
        $shop_manager = get_role( 'shop_manager' );
        if ( $shop_manager ) {
            foreach ( $capabilities as $cap ) {
                $shop_manager->add_cap( $cap );
            }
        }
    }

    /**
     * Schedule cron events
     */
    private static function schedule_cron_events(): void {
        // Morning export at 1:00 PM PT
        if ( ! wp_next_scheduled( 'woo_ach_batch_morning_export' ) ) {
            $morning_time = self::get_next_scheduled_time( 13, 0 );
            wp_schedule_event( $morning_time, 'daily', 'woo_ach_batch_morning_export' );
        }

        // Midnight export at 12:00 AM PT
        if ( ! wp_next_scheduled( 'woo_ach_batch_midnight_export' ) ) {
            $midnight_time = self::get_next_scheduled_time( 0, 0 );
            wp_schedule_event( $midnight_time, 'daily', 'woo_ach_batch_midnight_export' );
        }

        // Reconciliation check (hourly)
        if ( ! wp_next_scheduled( 'woo_ach_batch_reconciliation_check' ) ) {
            wp_schedule_event( time(), 'hourly', 'woo_ach_batch_reconciliation_check' );
        }
    }

    /**
     * Get next scheduled time for a specific hour/minute in PT
     *
     * @param int $hour   Hour (0-23)
     * @param int $minute Minute (0-59)
     * @return int Unix timestamp
     */
    private static function get_next_scheduled_time( int $hour, int $minute ): int {
        $tz = new \DateTimeZone( 'America/Los_Angeles' );
        $now = new \DateTime( 'now', $tz );
        $scheduled = new \DateTime( 'now', $tz );
        $scheduled->setTime( $hour, $minute, 0 );

        // If the time has already passed today, schedule for tomorrow
        if ( $scheduled <= $now ) {
            $scheduled->modify( '+1 day' );
        }

        return $scheduled->getTimestamp();
    }
}
