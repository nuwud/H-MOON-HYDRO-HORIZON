<?php
/**
 * Plugin Name: WooCommerce ACH Batch Payments
 * Plugin URI: https://hmoonhydro.com
 * Description: ACH payment gateway with batch processing, NACHA file generation, and SFTP upload for WooCommerce
 * Version: 1.0.0
 * Author: Nuwud Multimedia
 * Author URI: https://nuwud.com
 * License: GPL-2.0+
 * License URI: http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain: woo-ach-batch
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * WC requires at least: 8.0
 * WC tested up to: 9.0
 *
 * @package Nuwud\WooAchBatch
 */

namespace Nuwud\WooAchBatch;

defined( 'ABSPATH' ) || exit;

// Plugin constants
define( 'WOO_ACH_BATCH_VERSION', '1.0.0' );
define( 'WOO_ACH_BATCH_PLUGIN_FILE', __FILE__ );
define( 'WOO_ACH_BATCH_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WOO_ACH_BATCH_PATH', plugin_dir_path( __FILE__ ) ); // Alias for backwards compatibility
define( 'WOO_ACH_BATCH_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WOO_ACH_BATCH_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Main plugin class - singleton pattern
 */
final class Plugin {

    /**
     * Plugin instance
     *
     * @var Plugin|null
     */
    private static ?Plugin $instance = null;

    /**
     * Service container for dependency injection
     *
     * @var Container|null
     */
    private ?Container $container = null;

    /**
     * Get plugin instance
     *
     * @return Plugin
     */
    public static function instance(): Plugin {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Private constructor
     */
    private function __construct() {
        $this->load_autoloader();
        $this->init_container();
        $this->init_hooks();
    }

    /**
     * Whether dependencies are loaded
     *
     * @var bool
     */
    private bool $dependencies_loaded = false;

    /**
     * Load Composer autoloader
     */
    private function load_autoloader(): void {
        $autoloader = WOO_ACH_BATCH_PLUGIN_DIR . 'vendor/autoload.php';
        if ( file_exists( $autoloader ) ) {
            require_once $autoloader;
            $this->dependencies_loaded = true;
        } else {
            // Fallback PSR-4 autoloader for plugin classes only
            spl_autoload_register( [ $this, 'autoload' ] );
            $this->dependencies_loaded = false;
        }
    }

    /**
     * PSR-4 compliant autoloader fallback
     *
     * @param string $class Class name to load
     */
    public function autoload( string $class ): void {
        $prefix = 'Nuwud\\WooAchBatch\\';
        $base_dir = WOO_ACH_BATCH_PLUGIN_DIR . 'src/';

        $len = strlen( $prefix );
        if ( strncmp( $prefix, $class, $len ) !== 0 ) {
            return;
        }

        $relative_class = substr( $class, $len );
        $file = $base_dir . str_replace( '\\', '/', $relative_class ) . '.php';

        if ( file_exists( $file ) ) {
            require_once $file;
        }
    }

    /**
     * Initialize service container
     */
    private function init_container(): void {
        // Skip container initialization if dependencies aren't loaded
        if ( ! $this->dependencies_loaded ) {
            return;
        }
        $this->container = new Container();
        $this->container->register_services();
    }

    /**
     * Get service container
     *
     * @return Container|null
     */
    public function container(): ?Container {
        return $this->container;
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks(): void {
        // Check WooCommerce dependency
        add_action( 'plugins_loaded', [ $this, 'on_plugins_loaded' ], 10 );

        // Admin notices
        add_action( 'admin_notices', [ $this, 'admin_notices' ] );

        // Plugin action links
        add_filter( 'plugin_action_links_' . WOO_ACH_BATCH_PLUGIN_BASENAME, [ $this, 'plugin_action_links' ] );

        // Declare HPOS compatibility
        add_action( 'before_woocommerce_init', [ $this, 'declare_hpos_compatibility' ] );
    }

    /**
     * Fires when all plugins are loaded
     */
    public function on_plugins_loaded(): void {
        if ( ! $this->check_dependencies() ) {
            return;
        }

        // Load text domain
        load_plugin_textdomain( 'woo-ach-batch', false, dirname( WOO_ACH_BATCH_PLUGIN_BASENAME ) . '/languages/' );

        // Initialize plugin components
        $this->init_components();
    }

    /**
     * Check plugin dependencies
     *
     * @return bool
     */
    private function check_dependencies(): bool {
        // Check Composer dependencies first
        if ( ! $this->dependencies_loaded ) {
            add_action( 'admin_notices', function() {
                echo '<div class="error"><p><strong>WooCommerce ACH Batch Error:</strong> ';
                esc_html_e( 'Composer dependencies are not installed. Please run "composer install" in the plugin directory or contact support.', 'woo-ach-batch' );
                echo '</p></div>';
            });
            return false;
        }

        if ( ! class_exists( 'WooCommerce' ) ) {
            add_action( 'admin_notices', function() {
                echo '<div class="error"><p>';
                esc_html_e( 'WooCommerce ACH Batch requires WooCommerce to be installed and activated.', 'woo-ach-batch' );
                echo '</p></div>';
            });
            return false;
        }

        if ( version_compare( WC()->version, '8.0', '<' ) ) {
            add_action( 'admin_notices', function() {
                echo '<div class="error"><p>';
                esc_html_e( 'WooCommerce ACH Batch requires WooCommerce 8.0 or higher.', 'woo-ach-batch' );
                echo '</p></div>';
            });
            return false;
        }

        return true;
    }

    /**
     * Initialize plugin components
     */
    private function init_components(): void {
        // Bail if container wasn't initialized (missing dependencies)
        if ( null === $this->container ) {
            return;
        }

        // Register custom order statuses
        $this->container->get( 'order_statuses' )->register();

        // Register payment gateway
        add_filter( 'woocommerce_payment_gateways', [ $this, 'register_gateway' ] );

        // Initialize admin
        if ( is_admin() ) {
            $this->container->get( 'admin' )->init();
        }

        // Initialize cron scheduler
        $this->container->get( 'scheduler' )->init();

        // Initialize REST API endpoints
        $this->container->get( 'rest_api' )->init();

        // Initialize customer-facing verification wizard
        $this->container->get( 'verification_wizard' )->init();
    }

    /**
     * Register ACH payment gateway
     *
     * @param array $gateways Existing gateways
     * @return array
     */
    public function register_gateway( array $gateways ): array {
        $gateways[] = Gateway\AchBatchGateway::class;
        return $gateways;
    }

    /**
     * Declare HPOS (High-Performance Order Storage) compatibility
     */
    public function declare_hpos_compatibility(): void {
        if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
            \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
                'custom_order_tables',
                WOO_ACH_BATCH_PLUGIN_FILE,
                true
            );
        }
    }

    /**
     * Display admin notices
     */
    public function admin_notices(): void {
        // Encryption key warning
        if ( ! defined( 'WOO_ACH_BATCH_ENCRYPTION_KEY' ) ) {
            $screen = get_current_screen();
            if ( $screen && strpos( $screen->id, 'woo-ach-batch' ) !== false ) {
                echo '<div class="notice notice-warning"><p>';
                printf(
                    /* translators: %s: wp-config.php constant definition example */
                    esc_html__( 'For enhanced security, define %s in your wp-config.php file.', 'woo-ach-batch' ),
                    "<code>define( 'WOO_ACH_BATCH_ENCRYPTION_KEY', 'your-32-byte-key' );</code>"
                );
                echo '</p></div>';
            }
        }
    }

    /**
     * Add plugin action links
     *
     * @param array $links Existing links
     * @return array
     */
    public function plugin_action_links( array $links ): array {
        $plugin_links = [
            '<a href="' . admin_url( 'admin.php?page=woo-ach-settings' ) . '">' . __( 'Settings', 'woo-ach-batch' ) . '</a>',
            '<a href="' . admin_url( 'admin.php?page=woo-ach-batch' ) . '">' . __( 'Batches', 'woo-ach-batch' ) . '</a>',
        ];
        return array_merge( $plugin_links, $links );
    }

    /**
     * Prevent cloning
     */
    private function __clone() {}

    /**
     * Prevent unserialization
     */
    public function __wakeup() {
        throw new \Exception( 'Cannot unserialize singleton' );
    }
}

/**
 * Plugin activation hook
 */
function activate(): void {
    // Ensure WooCommerce is active
    if ( ! class_exists( 'WooCommerce' ) ) {
        wp_die(
            esc_html__( 'WooCommerce ACH Batch requires WooCommerce to be installed and activated.', 'woo-ach-batch' ),
            'Plugin Activation Error',
            [ 'back_link' => true ]
        );
    }

    // Create custom database tables if needed
    require_once WOO_ACH_BATCH_PLUGIN_DIR . 'src/Install/Activator.php';
    Install\Activator::activate();

    // Clear any cached data
    wp_cache_flush();

    // Log activation
    if ( function_exists( 'wc_get_logger' ) ) {
        wc_get_logger()->info( 'WooCommerce ACH Batch plugin activated', [ 'source' => 'woo-ach-batch' ] );
    }
}

/**
 * Plugin deactivation hook
 */
function deactivate(): void {
    // Clear scheduled cron events
    require_once WOO_ACH_BATCH_PLUGIN_DIR . 'src/Install/Deactivator.php';
    Install\Deactivator::deactivate();

    // Log deactivation
    if ( function_exists( 'wc_get_logger' ) ) {
        wc_get_logger()->info( 'WooCommerce ACH Batch plugin deactivated', [ 'source' => 'woo-ach-batch' ] );
    }
}

/**
 * Plugin uninstall hook - defined separately in uninstall.php
 */

// Register activation/deactivation hooks
register_activation_hook( __FILE__, __NAMESPACE__ . '\\activate' );
register_deactivation_hook( __FILE__, __NAMESPACE__ . '\\deactivate' );

/**
 * Initialize the plugin
 *
 * @return Plugin
 */
function woo_ach_batch(): Plugin {
    return Plugin::instance();
}

// Initialize plugin on load
add_action( 'plugins_loaded', __NAMESPACE__ . '\\woo_ach_batch', 5 );
