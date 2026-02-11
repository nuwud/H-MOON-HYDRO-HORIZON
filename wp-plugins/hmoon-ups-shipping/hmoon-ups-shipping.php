<?php
/**
 * Plugin Name: H-Moon UPS Shipping
 * Plugin URI: https://hmoonhydro.com
 * Description: Lightweight UPS shipping rates integration using UPS REST API. Replaces $100/yr premium plugins.
 * Version: 1.0.0
 * Author: H-Moon Hydro
 * Author URI: https://hmoonhydro.com
 * License: GPL v2 or later
 * Text Domain: hmoon-ups-shipping
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 8.5
 */

defined('ABSPATH') || exit;

// Check if WooCommerce is active
if (!in_array('woocommerce/woocommerce.php', apply_filters('active_plugins', get_option('active_plugins')))) {
    return;
}

define('HMOON_UPS_VERSION', '1.0.0');
define('HMOON_UPS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HMOON_UPS_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Initialize the shipping method
 */
function hmoon_ups_shipping_init() {
    if (!class_exists('WC_Shipping_Method')) {
        return;
    }
    
    require_once HMOON_UPS_PLUGIN_DIR . 'includes/class-hmoon-ups-shipping-method.php';
    require_once HMOON_UPS_PLUGIN_DIR . 'includes/class-hmoon-ups-api.php';
}
add_action('woocommerce_shipping_init', 'hmoon_ups_shipping_init');

/**
 * Add shipping method to WooCommerce
 */
function hmoon_ups_add_shipping_method($methods) {
    $methods['hmoon_ups'] = 'HMoon_UPS_Shipping_Method';
    return $methods;
}
add_filter('woocommerce_shipping_methods', 'hmoon_ups_add_shipping_method');

/**
 * Add settings link on plugins page
 */
function hmoon_ups_plugin_links($links) {
    $settings_link = '<a href="' . admin_url('admin.php?page=wc-settings&tab=shipping&section=hmoon_ups') . '">' . __('Settings', 'hmoon-ups-shipping') . '</a>';
    array_unshift($links, $settings_link);
    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'hmoon_ups_plugin_links');

/**
 * Declare HPOS compatibility
 */
add_action('before_woocommerce_init', function() {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

/**
 * Activation hook - set default options
 */
register_activation_hook(__FILE__, function() {
    add_option('hmoon_ups_client_id', '');
    add_option('hmoon_ups_client_secret', '');
    add_option('hmoon_ups_account_number', '');
    add_option('hmoon_ups_test_mode', 'yes');
    add_option('hmoon_ups_origin_postcode', '');
    add_option('hmoon_ups_origin_country', 'US');
});

/**
 * Deactivation hook - cleanup transients
 */
register_deactivation_hook(__FILE__, function() {
    global $wpdb;
    $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_hmoon_ups_%'");
    $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_hmoon_ups_%'");
});
