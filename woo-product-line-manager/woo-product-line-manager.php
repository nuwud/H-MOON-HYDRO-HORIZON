<?php
/**
 * Plugin Name: WooCommerce Product Line Manager
 * Plugin URI: https://github.com/nuwud/H-MOON-HYDRO-HORIZON
 * Description: Manage product lines, track manufacturer catalogs, identify inventory gaps, and offer special orders.
 * Version: 1.0.0
 * Author: H Moon Hydro
 * Author URI: https://hmoonhydro.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: woo-product-line-manager
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * WC requires at least: 8.0
 * WC tested up to: 9.0
 *
 * @package WooProductLineManager
 */

// Exit if accessed directly
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Plugin version
define( 'PLM_VERSION', '1.0.0' );

// Plugin path
define( 'PLM_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );

// Plugin URL
define( 'PLM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// Plugin basename
define( 'PLM_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Check if WooCommerce is active
 */
function plm_check_woocommerce() {
    if ( ! class_exists( 'WooCommerce' ) ) {
        add_action( 'admin_notices', 'plm_woocommerce_missing_notice' );
        return false;
    }
    return true;
}

/**
 * WooCommerce missing notice
 */
function plm_woocommerce_missing_notice() {
    ?>
    <div class="notice notice-error">
        <p><?php esc_html_e( 'WooCommerce Product Line Manager requires WooCommerce to be installed and active.', 'woo-product-line-manager' ); ?></p>
    </div>
    <?php
}

/**
 * Initialize the plugin
 */
function plm_init() {
    if ( ! plm_check_woocommerce() ) {
        return;
    }

    // Load the main plugin class
    require_once PLM_PLUGIN_PATH . 'includes/class-plm-core.php';

    // Initialize
    $plugin = new PLM_Core();
    $plugin->run();
}
add_action( 'plugins_loaded', 'plm_init' );

/**
 * Activation hook
 */
function plm_activate() {
    require_once PLM_PLUGIN_PATH . 'includes/class-plm-activator.php';
    PLM_Activator::activate();
}
register_activation_hook( __FILE__, 'plm_activate' );

/**
 * Deactivation hook
 */
function plm_deactivate() {
    require_once PLM_PLUGIN_PATH . 'includes/class-plm-deactivator.php';
    PLM_Deactivator::deactivate();
}
register_deactivation_hook( __FILE__, 'plm_deactivate' );

/**
 * Declare HPOS compatibility
 */
add_action( 'before_woocommerce_init', function() {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
    }
} );
