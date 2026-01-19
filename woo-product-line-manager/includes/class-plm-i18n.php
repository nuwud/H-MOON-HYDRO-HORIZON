<?php
/**
 * Internationalization
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * i18n class
 */
class PLM_i18n {

    /**
     * Load text domain
     */
    public function load_plugin_textdomain() {
        load_plugin_textdomain(
            'woo-product-line-manager',
            false,
            dirname( dirname( plugin_basename( __FILE__ ) ) ) . '/languages/'
        );
    }
}
