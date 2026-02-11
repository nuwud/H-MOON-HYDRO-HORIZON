<?php
/**
 * Plugin Name: H-Moon WooCommerce Optimizer
 * Description: Performance optimizations for WooCommerce. Removes bloat, speeds up admin, reduces database queries.
 * Version: 1.0.0
 * Author: H-Moon Hydro
 * Requires Plugins: woocommerce
 */

defined('ABSPATH') || exit;

class HMoon_WC_Optimizer {
    
    public function __construct() {
        // Frontend optimizations
        add_action('wp_enqueue_scripts', [$this, 'dequeue_unnecessary_scripts'], 99);
        add_action('init', [$this, 'disable_wc_bloat']);
        
        // Admin optimizations
        add_action('admin_init', [$this, 'optimize_admin']);
        
        // Database optimizations
        add_action('init', [$this, 'optimize_queries']);
        
        // Cart fragment throttling
        add_action('wp_enqueue_scripts', [$this, 'optimize_cart_fragments'], 100);
        
        // Checkout optimizations
        add_filter('woocommerce_checkout_fields', [$this, 'optimize_checkout_fields']);
    }
    
    /**
     * Remove WooCommerce scripts/styles from non-WC pages
     */
    public function dequeue_unnecessary_scripts() {
        // Only on non-WC pages
        if ($this->is_wc_page()) return;
        
        // Remove WC styles
        wp_dequeue_style('woocommerce-general');
        wp_dequeue_style('woocommerce-layout');
        wp_dequeue_style('woocommerce-smallscreen');
        wp_dequeue_style('wc-blocks-style');
        wp_dequeue_style('wc-blocks-vendors-style');
        
        // Remove WC scripts (be careful with cart widget)
        // Only dequeue if no cart widget in sidebar
        if (!is_active_widget(false, false, 'woocommerce_widget_cart', true)) {
            wp_dequeue_script('wc-cart-fragments');
        }
        
        // Remove selectWoo if not needed
        if (!is_account_page()) {
            wp_dequeue_script('selectWoo');
            wp_dequeue_style('select2');
        }
    }
    
    /**
     * Check if current page needs WooCommerce
     */
    private function is_wc_page(): bool {
        return is_woocommerce() || 
               is_cart() || 
               is_checkout() || 
               is_account_page() ||
               is_product() ||
               is_product_category() ||
               is_product_tag();
    }
    
    /**
     * Disable WooCommerce bloat features
     */
    public function disable_wc_bloat() {
        // Disable WooCommerce marketing hub
        add_filter('woocommerce_admin_features', function($features) {
            return array_diff($features, [
                'marketing-coupons',
                'remote-inbox-notifications',
                'remote-free-extensions',
                'payment-gateway-suggestions',
                'shipping-label-banner',
                'onboarding',
            ]);
        });
        
        // Disable WC Tracker
        if (class_exists('WC_Tracker')) {
            remove_action('init', ['WC_Tracker', 'init']);
        }
        
        // Disable SkyVerge dashboard
        add_filter('wc_' . 'memberships' . '_show_admin_dashboard_notice', '__return_false');
        
        // Remove WC widget bloat
        add_action('widgets_init', function() {
            // Uncomment to remove unused widgets:
            // unregister_widget('WC_Widget_Products');
            // unregister_widget('WC_Widget_Recently_Viewed');
        }, 15);
        
        // Disable password strength meter on checkout (saves ~200KB)
        add_action('wp_print_scripts', function() {
            if (is_checkout() || is_account_page()) {
                wp_dequeue_script('wc-password-strength-meter');
            }
        });
        
        // Remove WC generator tag
        remove_action('wp_head', ['WC', 'generator']);
    }
    
    /**
     * Admin optimizations
     */
    public function optimize_admin() {
        // Disable WC admin marketing hub
        add_filter('woocommerce_marketing_menu_items', '__return_empty_array');
        
        // Remove dashboard widgets
        add_action('wp_dashboard_setup', function() {
            // Remove 'WooCommerce Status' if not needed
            // remove_meta_box('woocommerce_dashboard_status', 'dashboard', 'normal');
            
            // Remove 'WooCommerce Recent Reviews'
            remove_meta_box('woocommerce_dashboard_recent_reviews', 'dashboard', 'normal');
        }, 40);
        
        // Reduce action scheduler query load in admin
        if (class_exists('ActionScheduler_AdminView')) {
            remove_action('admin_init', ['ActionScheduler_AdminView', 'schedule_admin_notices']);
        }
    }
    
    /**
     * Optimize database queries
     */
    public function optimize_queries() {
        // Prevent WooCommerce from loading all attributes on every page
        add_filter('woocommerce_attribute_taxonomies', function($taxonomies) {
            if (is_admin() || is_product() || is_product_taxonomy()) {
                return $taxonomies;
            }
            return [];
        });
        
        // Reduce meta lookups for guests
        if (!is_user_logged_in()) {
            add_filter('woocommerce_customer_meta_fields', '__return_empty_array');
        }
    }
    
    /**
     * Optimize cart fragments AJAX
     */
    public function optimize_cart_fragments() {
        // Throttle cart fragment updates
        // Default is 30 seconds, increase to reduce server load
        wp_localize_script('wc-cart-fragments', 'wc_cart_fragments_params', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'wc_ajax_url' => WC_AJAX::get_endpoint('%%endpoint%%'),
            'cart_hash_key' => apply_filters('woocommerce_cart_hash_key', 'wc_cart_hash_' . md5(get_current_blog_id() . '_' . get_site_url())),
            'fragment_name' => apply_filters('woocommerce_cart_fragment_name', 'wc_fragments_' . md5(get_current_blog_id() . '_' . get_site_url())),
            'request_timeout' => 60000, // 60 seconds (increased from 5)
        ]);
        
        // Disable fragments on pages where cart isn't shown
        if (!is_cart() && !is_checkout() && !$this->has_cart_in_menu()) {
            wp_dequeue_script('wc-cart-fragments');
        }
    }
    
    /**
     * Check if site uses cart in navigation
     */
    private function has_cart_in_menu(): bool {
        // Assume cart is in header - override if you don't have one
        return true;
    }
    
    /**
     * Clean up checkout fields
     */
    public function optimize_checkout_fields($fields) {
        // Remove company field for B2C
        // Uncomment if you don't need company:
        // unset($fields['billing']['billing_company']);
        // unset($fields['shipping']['shipping_company']);
        
        // Remove order comments if not using
        // unset($fields['order']['order_comments']);
        
        return $fields;
    }
}

// Only load if WooCommerce is active
add_action('plugins_loaded', function() {
    if (class_exists('WooCommerce')) {
        new HMoon_WC_Optimizer();
    }
});

/**
 * ============================================
 * DATABASE MAINTENANCE (run via WP-CLI or cron)
 * ============================================
 */

/**
 * Clean expired transients
 * Usage: wp eval 'hmoon_cleanup_transients();'
 */
function hmoon_cleanup_transients() {
    global $wpdb;
    
    $expired = $wpdb->query(
        "DELETE a, b FROM {$wpdb->options} a 
         LEFT JOIN {$wpdb->options} b ON a.option_name = CONCAT('_transient_timeout_', SUBSTRING(b.option_name, 12))
         WHERE a.option_name LIKE '_transient_timeout_%' 
         AND a.option_value < UNIX_TIMESTAMP()"
    );
    
    return $expired;
}

/**
 * Clean orphaned order meta
 * Usage: wp eval 'hmoon_cleanup_order_meta();'
 */
function hmoon_cleanup_order_meta() {
    global $wpdb;
    
    // For HPOS stores
    if (function_exists('wc_get_orders') && get_option('woocommerce_custom_orders_table_enabled') === 'yes') {
        // Clean up orders_meta for deleted orders
        $wpdb->query(
            "DELETE om FROM {$wpdb->prefix}wc_orders_meta om
             LEFT JOIN {$wpdb->prefix}wc_orders o ON om.order_id = o.id
             WHERE o.id IS NULL"
        );
    }
    
    return true;
}

/**
 * Optimize Action Scheduler (can grow large)
 * Usage: wp action-scheduler clean
 */
add_action('init', function() {
    // Set AS retention to 7 days instead of default 30
    add_filter('action_scheduler_retention_period', function() {
        return 7 * DAY_IN_SECONDS;
    });
});
