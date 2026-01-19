<?php
/**
 * Admin Controller
 *
 * Main admin interface controller.
 *
 * @package Nuwud\WooAchBatch\Admin
 */

namespace Nuwud\WooAchBatch\Admin;

/**
 * Handles admin menu and page routing
 */
class Admin {

    /**
     * Initialize admin interface
     */
    public function init(): void {
        add_action( 'admin_menu', [ $this, 'add_menu' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
        add_action( 'admin_init', [ $this, 'handle_actions' ] );

        // AJAX handlers
        add_action( 'wp_ajax_woo_ach_test_sftp', [ $this, 'ajax_test_sftp' ] );
        add_action( 'wp_ajax_woo_ach_manual_batch', [ $this, 'ajax_manual_batch' ] );
        add_action( 'wp_ajax_woo_ach_approve_verification', [ $this, 'ajax_approve_verification' ] );
        add_action( 'wp_ajax_woo_ach_reject_verification', [ $this, 'ajax_reject_verification' ] );
    }

    /**
     * Add admin menu pages
     */
    public function add_menu(): void {
        // Main menu
        add_menu_page(
            __( 'ACH Batches', 'woo-ach-batch' ),
            __( 'ACH Batches', 'woo-ach-batch' ),
            'manage_woocommerce',
            'woo-ach-batch',
            [ $this, 'render_batches_page' ],
            'dashicons-money-alt',
            56 // After WooCommerce
        );

        // Batches list (same as main)
        add_submenu_page(
            'woo-ach-batch',
            __( 'Batch History', 'woo-ach-batch' ),
            __( 'Batch History', 'woo-ach-batch' ),
            'manage_woocommerce',
            'woo-ach-batch',
            [ $this, 'render_batches_page' ]
        );

        // Pending Verification
        add_submenu_page(
            'woo-ach-batch',
            __( 'Pending Verification', 'woo-ach-batch' ),
            __( 'Pending Verification', 'woo-ach-batch' ),
            'manage_woocommerce',
            'woo-ach-pending',
            [ $this, 'render_pending_page' ]
        );

        // Returns
        add_submenu_page(
            'woo-ach-batch',
            __( 'ACH Returns', 'woo-ach-batch' ),
            __( 'Returns', 'woo-ach-batch' ),
            'manage_woocommerce',
            'woo-ach-returns',
            [ $this, 'render_returns_page' ]
        );

        // Settings
        add_submenu_page(
            'woo-ach-batch',
            __( 'ACH Settings', 'woo-ach-batch' ),
            __( 'Settings', 'woo-ach-batch' ),
            'manage_woocommerce',
            'woo-ach-settings',
            [ $this, 'render_settings_page' ]
        );

        // Audit Log
        add_submenu_page(
            'woo-ach-batch',
            __( 'Audit Log', 'woo-ach-batch' ),
            __( 'Audit Log', 'woo-ach-batch' ),
            'manage_woocommerce',
            'woo-ach-audit',
            [ $this, 'render_audit_page' ]
        );
    }

    /**
     * Enqueue admin assets
     *
     * @param string $hook Current admin page
     */
    public function enqueue_assets( string $hook ): void {
        // Only on our pages
        if ( ! str_starts_with( $hook, 'toplevel_page_woo-ach' ) && ! str_starts_with( $hook, 'ach-batches_page_woo-ach' ) ) {
            return;
        }

        wp_enqueue_style(
            'woo-ach-batch-admin',
            WOO_ACH_BATCH_URL . 'assets/css/admin.css',
            [],
            WOO_ACH_BATCH_VERSION
        );

        wp_enqueue_script(
            'woo-ach-batch-admin',
            WOO_ACH_BATCH_URL . 'assets/js/admin.js',
            [ 'jquery', 'wp-util' ],
            WOO_ACH_BATCH_VERSION,
            true
        );

        wp_localize_script( 'woo-ach-batch-admin', 'wooAchBatch', [
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce' => wp_create_nonce( 'woo_ach_batch_admin' ),
            'i18n' => [
                'confirmManualBatch' => __( 'Are you sure you want to run a manual batch export now?', 'woo-ach-batch' ),
                'confirmApprove' => __( 'Approve this verification?', 'woo-ach-batch' ),
                'confirmReject' => __( 'Reject this verification?', 'woo-ach-batch' ),
                'testing' => __( 'Testing...', 'woo-ach-batch' ),
                'processing' => __( 'Processing...', 'woo-ach-batch' ),
            ],
        ] );
    }

    /**
     * Handle admin actions
     */
    public function handle_actions(): void {
        // Handle manual batch trigger
        if ( isset( $_POST['woo_ach_manual_batch'] ) ) {
            $this->handle_manual_batch();
        }

        // Handle settings save
        if ( isset( $_POST['woo_ach_save_settings'] ) ) {
            $this->handle_save_settings();
        }
    }

    /**
     * Render batches list page
     */
    public function render_batches_page(): void {
        $repository = \Nuwud\WooAchBatch\service( 'batch_repository' );

        // Handle view single batch
        if ( isset( $_GET['batch_id'] ) ) {
            $batch_id = (int) $_GET['batch_id'];
            $batch = $repository->get( $batch_id );

            if ( $batch ) {
                $this->render_batch_detail( $batch );
                return;
            }
        }

        // List batches
        $page = max( 1, (int) ( $_GET['paged'] ?? 1 ) );
        $per_page = 20;
        $batches = $repository->get_recent( $per_page, ( $page - 1 ) * $per_page );
        $stats = $repository->get_statistics();

        include WOO_ACH_BATCH_PATH . 'templates/admin/batches-list.php';
    }

    /**
     * Render single batch detail
     *
     * @param object $batch Batch object
     */
    private function render_batch_detail( object $batch ): void {
        $repository = \Nuwud\WooAchBatch\service( 'batch_repository' );
        $items = $repository->get_batch_items( $batch->id );

        include WOO_ACH_BATCH_PATH . 'templates/admin/batch-detail.php';
    }

    /**
     * Render pending verification page
     */
    public function render_pending_page(): void {
        // Get orders pending ACH verification
        $orders = wc_get_orders( [
            'status' => 'wc-pending-ach',
            'limit' => 50,
            'orderby' => 'date',
            'order' => 'DESC',
        ] );

        include WOO_ACH_BATCH_PATH . 'templates/admin/pending-verification.php';
    }

    /**
     * Render returns page
     */
    public function render_returns_page(): void {
        global $wpdb;
        $table = $wpdb->prefix . 'woo_ach_returns';

        $page = max( 1, (int) ( $_GET['paged'] ?? 1 ) );
        $per_page = 20;
        $offset = ( $page - 1 ) * $per_page;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $returns = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table} ORDER BY received_date DESC LIMIT %d OFFSET %d",
            $per_page,
            $offset
        ) );

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );

        include WOO_ACH_BATCH_PATH . 'templates/admin/returns-list.php';
    }

    /**
     * Render settings page
     */
    public function render_settings_page(): void {
        $settings = \Nuwud\WooAchBatch\service( 'settings' );
        $sftp_implementations = \Nuwud\WooAchBatch\Sftp\SftpClientFactory::getAvailableImplementations();
        $verification_manager = \Nuwud\WooAchBatch\service( 'verification_manager' );

        $tabs = [
            'general' => __( 'General', 'woo-ach-batch' ),
            'nacha' => __( 'NACHA', 'woo-ach-batch' ),
            'sftp' => __( 'SFTP', 'woo-ach-batch' ),
            'verification' => __( 'Verification', 'woo-ach-batch' ),
            'schedule' => __( 'Schedule', 'woo-ach-batch' ),
        ];

        $current_tab = sanitize_key( $_GET['tab'] ?? 'general' );

        include WOO_ACH_BATCH_PATH . 'templates/admin/settings.php';
    }

    /**
     * Render audit log page
     */
    public function render_audit_page(): void {
        global $wpdb;
        $table = $wpdb->prefix . 'woo_ach_audit_log';

        $page = max( 1, (int) ( $_GET['paged'] ?? 1 ) );
        $per_page = 50;
        $offset = ( $page - 1 ) * $per_page;

        $event_type = sanitize_key( $_GET['event_type'] ?? '' );

        $where = '';
        if ( $event_type ) {
            $where = $wpdb->prepare( 'WHERE event_type = %s', $event_type );
        }

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $logs = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table} {$where} ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $per_page,
            $offset
        ) );

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where}" );

        // Get distinct event types for filter
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $event_types = $wpdb->get_col( "SELECT DISTINCT event_type FROM {$table} ORDER BY event_type" );

        include WOO_ACH_BATCH_PATH . 'templates/admin/audit-log.php';
    }

    /**
     * Handle manual batch trigger
     */
    private function handle_manual_batch(): void {
        if ( ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'woo_ach_manual_batch' ) ) {
            wp_die( 'Security check failed' );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Permission denied' );
        }

        try {
            $runner = \Nuwud\WooAchBatch\service( 'batch_runner' );
            $result = $runner->run();

            if ( $result['success'] ) {
                add_settings_error(
                    'woo_ach_batch',
                    'batch_success',
                    sprintf(
                        __( 'Batch created successfully. %d orders processed.', 'woo-ach-batch' ),
                        $result['count'] ?? 0
                    ),
                    'success'
                );
            } else {
                add_settings_error(
                    'woo_ach_batch',
                    'batch_error',
                    $result['message'] ?? __( 'Batch processing failed.', 'woo-ach-batch' ),
                    'error'
                );
            }

        } catch ( \Exception $e ) {
            add_settings_error(
                'woo_ach_batch',
                'batch_exception',
                $e->getMessage(),
                'error'
            );
        }
    }

    /**
     * Handle settings save
     *
     * SECURITY: Sensitive fields (sftp_password, plaid_secret) route through
     * SecureSettings for proper encryption with audit logging.
     */
    private function handle_save_settings(): void {
        if ( ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'woo_ach_settings' ) ) {
            wp_die( 'Security check failed' );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Permission denied' );
        }

        $settings = \Nuwud\WooAchBatch\service( 'settings' );
        $secure_settings = \Nuwud\WooAchBatch\service( 'secure_settings' );

        // Sensitive fields handled by SecureSettings (never log these values)
        $sensitive_fields = [
            'sftp_password' => 'save_sftp_password',
            'sftp_passphrase' => 'save_sftp_passphrase',
            'plaid_secret' => 'save_plaid_secret',
        ];

        foreach ( $sensitive_fields as $field => $method ) {
            if ( isset( $_POST[ $field ] ) && ! empty( $_POST[ $field ] ) ) {
                $secure_settings->$method( sanitize_text_field( $_POST[ $field ] ) );
            }
        }

        // Map non-sensitive POST fields to settings
        $fields = [
            // General
            'enabled' => [ 'type' => 'bool' ],
            'test_mode' => [ 'type' => 'bool' ],

            // NACHA
            'originator_id' => [ 'type' => 'string' ],
            'originator_name' => [ 'type' => 'string' ],
            'originator_dfi' => [ 'type' => 'string' ],
            'company_id' => [ 'type' => 'string' ],
            'company_name' => [ 'type' => 'string' ],
            'company_entry_description' => [ 'type' => 'string' ],
            'odfi_routing' => [ 'type' => 'string' ],
            'odfi_name' => [ 'type' => 'string' ],

            // SFTP (non-sensitive)
            'sftp_host' => [ 'type' => 'string' ],
            'sftp_port' => [ 'type' => 'int' ],
            'sftp_username' => [ 'type' => 'string' ],
            'sftp_auth_type' => [ 'type' => 'string' ],
            'sftp_private_key_path' => [ 'type' => 'string' ],
            'sftp_remote_path' => [ 'type' => 'string' ],

            // Verification (non-sensitive)
            'verification_method' => [ 'type' => 'string' ],
            'plaid_client_id' => [ 'type' => 'string' ],
            'plaid_environment' => [ 'type' => 'string' ],
            'enable_micro_deposits' => [ 'type' => 'bool' ],

            // Schedule
            'export_times' => [ 'type' => 'array' ],
            'timezone' => [ 'type' => 'string' ],
        ];

        foreach ( $fields as $key => $config ) {
            if ( ! isset( $_POST[ $key ] ) ) {
                continue;
            }

            $value = $_POST[ $key ];

            switch ( $config['type'] ) {
                case 'bool':
                    $value = $value === 'yes' || $value === '1' || $value === 'on' ? 'yes' : 'no';
                    break;
                case 'int':
                    $value = (int) $value;
                    break;
                case 'array':
                    $value = array_map( 'sanitize_text_field', (array) $value );
                    break;
                default:
                    $value = sanitize_text_field( $value );
            }

            $settings->update_option( $key, $value );
        }

        // Reschedule cron if times changed
        $scheduler = \Nuwud\WooAchBatch\service( 'scheduler' );
        $scheduler->reschedule();

        add_settings_error(
            'woo_ach_batch',
            'settings_saved',
            __( 'Settings saved successfully.', 'woo-ach-batch' ),
            'success'
        );
    }

    /**
     * AJAX: Test SFTP connection
     */
    public function ajax_test_sftp(): void {
        if ( ! wp_verify_nonce( $_POST['nonce'] ?? '', 'woo_ach_batch_admin' ) ) {
            wp_send_json_error( [ 'message' => 'Security check failed' ] );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( [ 'message' => 'Permission denied' ] );
        }

        try {
            $sftp = \Nuwud\WooAchBatch\service( 'sftp_client' );
            $result = $sftp->testConnection();

            if ( $result['success'] ) {
                wp_send_json_success( $result );
            } else {
                wp_send_json_error( $result );
            }

        } catch ( \Exception $e ) {
            wp_send_json_error( [ 'message' => $e->getMessage() ] );
        }
    }

    /**
     * AJAX: Manual batch run
     */
    public function ajax_manual_batch(): void {
        if ( ! wp_verify_nonce( $_POST['nonce'] ?? '', 'woo_ach_batch_admin' ) ) {
            wp_send_json_error( [ 'message' => 'Security check failed' ] );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( [ 'message' => 'Permission denied' ] );
        }

        try {
            $runner = \Nuwud\WooAchBatch\service( 'batch_runner' );
            $result = $runner->run();

            if ( $result['success'] ) {
                wp_send_json_success( $result );
            } else {
                wp_send_json_error( $result );
            }

        } catch ( \Exception $e ) {
            wp_send_json_error( [ 'message' => $e->getMessage() ] );
        }
    }

    /**
     * AJAX: Approve verification
     */
    public function ajax_approve_verification(): void {
        if ( ! wp_verify_nonce( $_POST['nonce'] ?? '', 'woo_ach_batch_admin' ) ) {
            wp_send_json_error( [ 'message' => 'Security check failed' ] );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( [ 'message' => 'Permission denied' ] );
        }

        $order_id = (int) ( $_POST['order_id'] ?? 0 );

        if ( ! $order_id ) {
            wp_send_json_error( [ 'message' => 'Invalid order' ] );
        }

        $manager = \Nuwud\WooAchBatch\service( 'verification_manager' );
        $result = $manager->completeVerification( $order_id, [ 'action' => 'approve' ] );

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * AJAX: Reject verification
     */
    public function ajax_reject_verification(): void {
        if ( ! wp_verify_nonce( $_POST['nonce'] ?? '', 'woo_ach_batch_admin' ) ) {
            wp_send_json_error( [ 'message' => 'Security check failed' ] );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( [ 'message' => 'Permission denied' ] );
        }

        $order_id = (int) ( $_POST['order_id'] ?? 0 );
        $reason = sanitize_textarea_field( $_POST['reason'] ?? '' );

        if ( ! $order_id ) {
            wp_send_json_error( [ 'message' => 'Invalid order' ] );
        }

        $manager = \Nuwud\WooAchBatch\service( 'verification_manager' );
        $result = $manager->completeVerification( $order_id, [
            'action' => 'reject',
            'reason' => $reason,
        ] );

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }
}
