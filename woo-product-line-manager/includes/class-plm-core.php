<?php
/**
 * Core plugin class
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Main plugin class
 */
class PLM_Core {

    /**
     * The loader that's responsible for maintaining and registering all hooks.
     *
     * @var PLM_Loader
     */
    protected $loader;

    /**
     * The unique identifier of this plugin.
     *
     * @var string
     */
    protected $plugin_name;

    /**
     * The current version of the plugin.
     *
     * @var string
     */
    protected $version;

    /**
     * Initialize the class and set its properties.
     */
    public function __construct() {
        $this->version = PLM_VERSION;
        $this->plugin_name = 'woo-product-line-manager';

        $this->load_dependencies();
        $this->set_locale();
        $this->define_admin_hooks();
        $this->define_public_hooks();
        $this->define_api_hooks();
    }

    /**
     * Load the required dependencies.
     */
    private function load_dependencies() {
        // Loader class
        require_once PLM_PLUGIN_PATH . 'includes/class-plm-loader.php';

        // i18n
        require_once PLM_PLUGIN_PATH . 'includes/class-plm-i18n.php';

        // Data manager
        require_once PLM_PLUGIN_PATH . 'includes/class-plm-data-manager.php';

        // Audit engine
        require_once PLM_PLUGIN_PATH . 'includes/class-plm-audit.php';

        // Admin
        require_once PLM_PLUGIN_PATH . 'admin/class-plm-admin.php';

        // Public
        require_once PLM_PLUGIN_PATH . 'public/class-plm-public.php';

        // REST API
        require_once PLM_PLUGIN_PATH . 'api/class-plm-rest-api.php';

        $this->loader = new PLM_Loader();
    }

    /**
     * Set the locale for internationalization.
     */
    private function set_locale() {
        $plugin_i18n = new PLM_i18n();
        $this->loader->add_action( 'plugins_loaded', $plugin_i18n, 'load_plugin_textdomain' );
    }

    /**
     * Register admin hooks.
     */
    private function define_admin_hooks() {
        $plugin_admin = new PLM_Admin( $this->get_plugin_name(), $this->get_version() );

        // Admin menu
        $this->loader->add_action( 'admin_menu', $plugin_admin, 'add_admin_menu' );

        // Admin scripts and styles
        $this->loader->add_action( 'admin_enqueue_scripts', $plugin_admin, 'enqueue_styles' );
        $this->loader->add_action( 'admin_enqueue_scripts', $plugin_admin, 'enqueue_scripts' );

        // Product meta box
        $this->loader->add_action( 'add_meta_boxes', $plugin_admin, 'add_product_meta_box' );
        $this->loader->add_action( 'woocommerce_process_product_meta', $plugin_admin, 'save_product_meta' );

        // Product list columns
        $this->loader->add_filter( 'manage_product_posts_columns', $plugin_admin, 'add_product_columns' );
        $this->loader->add_action( 'manage_product_posts_custom_column', $plugin_admin, 'render_product_columns', 10, 2 );

        // Admin AJAX handlers
        $this->loader->add_action( 'wp_ajax_plm_run_audit', $plugin_admin, 'ajax_run_audit' );
        $this->loader->add_action( 'wp_ajax_plm_get_data_sources', $plugin_admin, 'ajax_get_data_sources' );
    }

    /**
     * Register public hooks.
     */
    private function define_public_hooks() {
        $plugin_public = new PLM_Public( $this->get_plugin_name(), $this->get_version() );

        // Public scripts and styles
        $this->loader->add_action( 'wp_enqueue_scripts', $plugin_public, 'enqueue_styles' );
        $this->loader->add_action( 'wp_enqueue_scripts', $plugin_public, 'enqueue_scripts' );

        // Shortcodes
        $this->loader->add_action( 'init', $plugin_public, 'register_shortcodes' );

        // Product page - other sizes available
        $this->loader->add_action( 'woocommerce_single_product_summary', $plugin_public, 'display_other_sizes', 25 );

        // Shop filter widget
        $this->loader->add_action( 'widgets_init', $plugin_public, 'register_widgets' );
    }

    /**
     * Register REST API hooks.
     */
    private function define_api_hooks() {
        $plugin_api = new PLM_REST_API( $this->get_plugin_name(), $this->get_version() );
        $this->loader->add_action( 'rest_api_init', $plugin_api, 'register_routes' );
    }

    /**
     * Run the loader to execute all of the hooks.
     */
    public function run() {
        $this->loader->run();
    }

    /**
     * The name of the plugin.
     *
     * @return string
     */
    public function get_plugin_name() {
        return $this->plugin_name;
    }

    /**
     * The version of the plugin.
     *
     * @return string
     */
    public function get_version() {
        return $this->version;
    }

    /**
     * Reference to the loader.
     *
     * @return PLM_Loader
     */
    public function get_loader() {
        return $this->loader;
    }
}
