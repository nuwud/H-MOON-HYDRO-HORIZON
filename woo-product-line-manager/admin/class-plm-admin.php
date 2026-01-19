<?php
/**
 * Admin functionality
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Admin class
 */
class PLM_Admin {

    /**
     * Plugin name
     *
     * @var string
     */
    private $plugin_name;

    /**
     * Version
     *
     * @var string
     */
    private $version;

    /**
     * Constructor
     *
     * @param string $plugin_name Plugin name.
     * @param string $version     Version.
     */
    public function __construct( $plugin_name, $version ) {
        $this->plugin_name = $plugin_name;
        $this->version     = $version;
    }

    /**
     * Register the stylesheets for the admin area.
     */
    public function enqueue_styles() {
        $screen = get_current_screen();
        
        if ( strpos( $screen->id, 'product-line-manager' ) !== false || $screen->post_type === 'product' ) {
            wp_enqueue_style(
                $this->plugin_name,
                PLM_PLUGIN_URL . 'assets/css/admin.css',
                array(),
                $this->version,
                'all'
            );
        }
    }

    /**
     * Register the JavaScript for the admin area.
     */
    public function enqueue_scripts() {
        $screen = get_current_screen();
        
        if ( strpos( $screen->id, 'product-line-manager' ) !== false ) {
            wp_enqueue_script(
                $this->plugin_name,
                PLM_PLUGIN_URL . 'assets/js/admin.js',
                array( 'jquery', 'wp-util' ),
                $this->version,
                true
            );

            wp_localize_script(
                $this->plugin_name,
                'plmAdmin',
                array(
                    'ajaxUrl' => admin_url( 'admin-ajax.php' ),
                    'nonce'   => wp_create_nonce( 'plm_admin_nonce' ),
                    'strings' => array(
                        'runAudit'     => __( 'Run Audit', 'woo-product-line-manager' ),
                        'running'      => __( 'Running...', 'woo-product-line-manager' ),
                        'auditComplete' => __( 'Audit complete!', 'woo-product-line-manager' ),
                        'error'        => __( 'An error occurred.', 'woo-product-line-manager' ),
                    ),
                )
            );
        }
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_submenu_page(
            'woocommerce',
            __( 'Product Lines', 'woo-product-line-manager' ),
            __( 'Product Lines', 'woo-product-line-manager' ),
            'manage_woocommerce',
            'product-line-manager',
            array( $this, 'render_dashboard' )
        );

        add_submenu_page(
            'product-line-manager',
            __( 'Data Sources', 'woo-product-line-manager' ),
            __( 'Data Sources', 'woo-product-line-manager' ),
            'manage_woocommerce',
            'plm-data-sources',
            array( $this, 'render_data_sources' )
        );
    }

    /**
     * Render dashboard page
     */
    public function render_dashboard() {
        $tab = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'overview';
        $summary = PLM_Audit::get_summary();
        $manufacturers = PLM_Data_Manager::get_manufacturers();
        
        include PLM_PLUGIN_PATH . 'admin/partials/dashboard-display.php';
    }

    /**
     * Render data sources page
     */
    public function render_data_sources() {
        $data_sources = PLM_Data_Manager::get_data_sources();
        include PLM_PLUGIN_PATH . 'admin/partials/data-sources-display.php';
    }

    /**
     * Add product meta box
     */
    public function add_product_meta_box() {
        add_meta_box(
            'plm_product_line_info',
            __( 'Product Line Info', 'woo-product-line-manager' ),
            array( $this, 'render_product_meta_box' ),
            'product',
            'side',
            'default'
        );
    }

    /**
     * Render product meta box
     *
     * @param WP_Post $post Post object.
     */
    public function render_product_meta_box( $post ) {
        $manufacturer = get_post_meta( $post->ID, '_plm_manufacturer', true );
        $product_line = get_post_meta( $post->ID, '_plm_product_line', true );
        $normalized_size = get_post_meta( $post->ID, '_plm_normalized_size', true );
        $audit_status = get_post_meta( $post->ID, '_plm_audit_status', true );

        wp_nonce_field( 'plm_product_meta', 'plm_product_meta_nonce' );
        ?>
        <div class="plm-product-meta">
            <p>
                <label><?php esc_html_e( 'Manufacturer:', 'woo-product-line-manager' ); ?></label>
                <input type="text" name="plm_manufacturer" value="<?php echo esc_attr( $manufacturer ); ?>" class="widefat" />
            </p>
            <p>
                <label><?php esc_html_e( 'Product Line:', 'woo-product-line-manager' ); ?></label>
                <input type="text" name="plm_product_line" value="<?php echo esc_attr( $product_line ); ?>" class="widefat" />
            </p>
            <p>
                <label><?php esc_html_e( 'Normalized Size:', 'woo-product-line-manager' ); ?></label>
                <input type="text" name="plm_normalized_size" value="<?php echo esc_attr( $normalized_size ); ?>" class="widefat" />
            </p>
            <p>
                <label><?php esc_html_e( 'Status:', 'woo-product-line-manager' ); ?></label>
                <select name="plm_audit_status" class="widefat">
                    <option value=""><?php esc_html_e( '-- Select --', 'woo-product-line-manager' ); ?></option>
                    <option value="in_stock" <?php selected( $audit_status, 'in_stock' ); ?>><?php esc_html_e( 'In Stock', 'woo-product-line-manager' ); ?></option>
                    <option value="special_order" <?php selected( $audit_status, 'special_order' ); ?>><?php esc_html_e( 'Special Order', 'woo-product-line-manager' ); ?></option>
                    <option value="discontinued" <?php selected( $audit_status, 'discontinued' ); ?>><?php esc_html_e( 'Discontinued', 'woo-product-line-manager' ); ?></option>
                </select>
            </p>
        </div>
        <?php
    }

    /**
     * Save product meta
     *
     * @param int $post_id Post ID.
     */
    public function save_product_meta( $post_id ) {
        if ( ! isset( $_POST['plm_product_meta_nonce'] ) || 
             ! wp_verify_nonce( $_POST['plm_product_meta_nonce'], 'plm_product_meta' ) ) {
            return;
        }

        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
            return;
        }

        if ( ! current_user_can( 'edit_post', $post_id ) ) {
            return;
        }

        $fields = array(
            'plm_manufacturer'    => '_plm_manufacturer',
            'plm_product_line'    => '_plm_product_line',
            'plm_normalized_size' => '_plm_normalized_size',
            'plm_audit_status'    => '_plm_audit_status',
        );

        foreach ( $fields as $field => $meta_key ) {
            if ( isset( $_POST[ $field ] ) ) {
                update_post_meta( $post_id, $meta_key, sanitize_text_field( $_POST[ $field ] ) );
            }
        }
    }

    /**
     * Add product list columns
     *
     * @param array $columns Existing columns.
     * @return array
     */
    public function add_product_columns( $columns ) {
        $new_columns = array();
        
        foreach ( $columns as $key => $value ) {
            $new_columns[ $key ] = $value;
            
            if ( 'name' === $key ) {
                $new_columns['plm_manufacturer'] = __( 'Manufacturer', 'woo-product-line-manager' );
                $new_columns['plm_line'] = __( 'Product Line', 'woo-product-line-manager' );
            }
        }

        return $new_columns;
    }

    /**
     * Render product list columns
     *
     * @param string $column  Column name.
     * @param int    $post_id Post ID.
     */
    public function render_product_columns( $column, $post_id ) {
        switch ( $column ) {
            case 'plm_manufacturer':
                echo esc_html( get_post_meta( $post_id, '_plm_manufacturer', true ) ?: '—' );
                break;
            case 'plm_line':
                echo esc_html( get_post_meta( $post_id, '_plm_product_line', true ) ?: '—' );
                break;
        }
    }

    /**
     * AJAX: Run audit
     */
    public function ajax_run_audit() {
        check_ajax_referer( 'plm_admin_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Unauthorized' );
        }

        $results = PLM_Audit::run_full_audit();
        wp_send_json_success( $results );
    }

    /**
     * AJAX: Get data sources
     */
    public function ajax_get_data_sources() {
        check_ajax_referer( 'plm_admin_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Unauthorized' );
        }

        $sources = PLM_Data_Manager::get_data_sources();
        wp_send_json_success( $sources );
    }
}
