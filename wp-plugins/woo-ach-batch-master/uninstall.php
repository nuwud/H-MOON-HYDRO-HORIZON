<?php
/**
 * Uninstall script for WooCommerce ACH Batch
 *
 * This file runs when the plugin is deleted from WordPress admin.
 * It cleans up all plugin data from the database.
 *
 * @package Nuwud\WooAchBatch
 */

// Exit if uninstall not called from WordPress
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

// Check user capability
if ( ! current_user_can( 'activate_plugins' ) ) {
    return;
}

// Verify this is a legitimate uninstall
if ( WP_UNINSTALL_PLUGIN !== 'woo-ach-batch/woo-ach-batch.php' ) {
    return;
}

global $wpdb;

// Get option to check if we should remove all data
$remove_data = get_option( 'woo_ach_batch_remove_data_on_uninstall', false );

if ( $remove_data ) {
    // Remove all plugin options
    $options_to_delete = [
        'woo_ach_batch_settings',
        'woo_ach_batch_nacha_settings',
        'woo_ach_batch_sftp_settings',
        'woo_ach_batch_kyc_settings',
        'woo_ach_batch_schedule_settings',
        'woo_ach_batch_encryption_key_hash',
        'woo_ach_batch_remove_data_on_uninstall',
        'woo_ach_batch_version',
        'woo_ach_batch_db_version',
    ];

    foreach ( $options_to_delete as $option ) {
        delete_option( $option );
    }

    // Remove transients
    $wpdb->query(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_woo_ach_batch_%'"
    );
    $wpdb->query(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_woo_ach_batch_%'"
    );

    // Remove custom tables
    $tables_to_drop = [
        $wpdb->prefix . 'woo_ach_batches',
        $wpdb->prefix . 'woo_ach_batch_items',
        $wpdb->prefix . 'woo_ach_returns',
        $wpdb->prefix . 'woo_ach_audit_log',
    ];

    foreach ( $tables_to_drop as $table ) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange
        $wpdb->query( "DROP TABLE IF EXISTS {$table}" );
    }

    // Remove order meta related to ACH
    $meta_keys_to_delete = [
        '_ach_bank_token',
        '_ach_routing_encrypted',
        '_ach_account_encrypted',
        '_ach_account_last4',
        '_ach_account_type',
        '_ach_verification_status',
        '_ach_verification_timestamp',
        '_ach_authorization_timestamp',
        '_ach_authorization_ip',
        '_ach_authorization_version',
        '_ach_batch_id',
        '_ach_trace_number',
        '_ach_exported_at',
        '_ach_kyc_doc_id_front',
        '_ach_kyc_doc_id_back',
        '_ach_kyc_doc_voided_check',
    ];

    foreach ( $meta_keys_to_delete as $meta_key ) {
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->postmeta} WHERE meta_key = %s",
                $meta_key
            )
        );

        // Also delete from HPOS orders meta if available
        if ( $wpdb->get_var( "SHOW TABLES LIKE '{$wpdb->prefix}wc_orders_meta'" ) === $wpdb->prefix . 'wc_orders_meta' ) {
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->prefix}wc_orders_meta WHERE meta_key = %s",
                    $meta_key
                )
            );
        }
    }

    // Remove KYC document files (stored outside public uploads)
    $upload_dir = wp_upload_dir();
    $kyc_dir = $upload_dir['basedir'] . '/woo-ach-batch-kyc/';
    if ( is_dir( $kyc_dir ) ) {
        // Recursively delete directory
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator( $kyc_dir, RecursiveDirectoryIterator::SKIP_DOTS ),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ( $files as $fileinfo ) {
            $action = $fileinfo->isDir() ? 'rmdir' : 'unlink';
            $action( $fileinfo->getRealPath() );
        }
        rmdir( $kyc_dir );
    }

    // Remove NACHA files directory
    $nacha_dir = $upload_dir['basedir'] . '/woo-ach-batch-nacha/';
    if ( is_dir( $nacha_dir ) ) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator( $nacha_dir, RecursiveDirectoryIterator::SKIP_DOTS ),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ( $files as $fileinfo ) {
            $action = $fileinfo->isDir() ? 'rmdir' : 'unlink';
            $action( $fileinfo->getRealPath() );
        }
        rmdir( $nacha_dir );
    }

    // Remove log files
    $log_dir = WP_CONTENT_DIR . '/uploads/wc-logs/';
    if ( is_dir( $log_dir ) ) {
        $log_files = glob( $log_dir . 'woo-ach-batch-*.log' );
        foreach ( $log_files as $log_file ) {
            unlink( $log_file );
        }
    }

    // Clear scheduled cron events
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
        wp_clear_scheduled_hook( $hook );
    }

    // Remove user capabilities
    $roles = [ 'administrator', 'shop_manager' ];
    $capabilities = [
        'manage_woo_ach_batches',
        'export_woo_ach_batches',
        'view_woo_ach_batches',
        'verify_woo_ach_payments',
    ];

    foreach ( $roles as $role_name ) {
        $role = get_role( $role_name );
        if ( $role ) {
            foreach ( $capabilities as $cap ) {
                $role->remove_cap( $cap );
            }
        }
    }
}

// Always clear object cache
wp_cache_flush();
