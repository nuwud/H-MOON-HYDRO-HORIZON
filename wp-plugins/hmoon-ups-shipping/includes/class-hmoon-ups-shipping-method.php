<?php
/**
 * H-Moon UPS Shipping Method for WooCommerce
 * 
 * Integrates the UPS REST API with WooCommerce shipping zones.
 */

defined('ABSPATH') || exit;

class HMoon_UPS_Shipping_Method extends WC_Shipping_Method {
    
    /** @var HMoon_UPS_API */
    private $api;
    
    /** @var array Enabled services */
    private $enabled_services = [];
    
    /**
     * Constructor
     * 
     * @param int $instance_id
     */
    public function __construct($instance_id = 0) {
        $this->id = 'hmoon_ups';
        $this->instance_id = absint($instance_id);
        $this->method_title = __('UPS Shipping (H-Moon)', 'hmoon-ups-shipping');
        $this->method_description = __('Live UPS shipping rates using REST API. Free alternative to premium plugins.', 'hmoon-ups-shipping');
        $this->supports = [
            'shipping-zones',
            'instance-settings',
            'instance-settings-modal',
        ];
        
        $this->init();
        
        // Initialize API after settings are loaded
        $this->api = new HMoon_UPS_API();
    }
    
    /**
     * Initialize settings
     */
    private function init(): void {
        $this->init_form_fields();
        $this->init_settings();
        
        $this->title = $this->get_option('title', $this->method_title);
        $this->enabled_services = $this->get_option('enabled_services', ['03', '12', '02']);
        
        add_action('woocommerce_update_options_shipping_' . $this->id, [$this, 'process_admin_options']);
    }
    
    /**
     * Define settings fields
     */
    public function init_form_fields(): void {
        $this->instance_form_fields = [
            'title' => [
                'title' => __('Method Title', 'hmoon-ups-shipping'),
                'type' => 'text',
                'description' => __('Title shown to customers at checkout', 'hmoon-ups-shipping'),
                'default' => __('UPS', 'hmoon-ups-shipping'),
                'desc_tip' => true,
            ],
            'enabled_services' => [
                'title' => __('Enabled Services', 'hmoon-ups-shipping'),
                'type' => 'multiselect',
                'class' => 'wc-enhanced-select',
                'description' => __('Select which UPS services to offer', 'hmoon-ups-shipping'),
                'default' => ['03', '12', '02'],
                'options' => [
                    '03' => __('UPS Ground', 'hmoon-ups-shipping'),
                    '12' => __('UPS 3 Day Select', 'hmoon-ups-shipping'),
                    '02' => __('UPS 2nd Day Air', 'hmoon-ups-shipping'),
                    '59' => __('UPS 2nd Day Air A.M.', 'hmoon-ups-shipping'),
                    '13' => __('UPS Next Day Air Saver', 'hmoon-ups-shipping'),
                    '01' => __('UPS Next Day Air', 'hmoon-ups-shipping'),
                    '14' => __('UPS Next Day Air Early', 'hmoon-ups-shipping'),
                ],
                'desc_tip' => true,
            ],
            'handling_fee' => [
                'title' => __('Handling Fee', 'hmoon-ups-shipping'),
                'type' => 'price',
                'description' => __('Additional fee added to each shipment (leave blank for none)', 'hmoon-ups-shipping'),
                'default' => '',
                'desc_tip' => true,
                'placeholder' => '0.00',
            ],
            'handling_fee_percent' => [
                'title' => __('Handling Fee (%)', 'hmoon-ups-shipping'),
                'type' => 'decimal',
                'description' => __('Percentage fee added to shipping cost (leave blank for none)', 'hmoon-ups-shipping'),
                'default' => '',
                'desc_tip' => true,
                'placeholder' => '0',
            ],
            'fallback_rate' => [
                'title' => __('Fallback Rate', 'hmoon-ups-shipping'),
                'type' => 'price',
                'description' => __('Rate to use if UPS API fails (leave blank to show error)', 'hmoon-ups-shipping'),
                'default' => '',
                'desc_tip' => true,
                'placeholder' => wc_format_localized_price(0),
            ],
            'debug_mode' => [
                'title' => __('Debug Mode', 'hmoon-ups-shipping'),
                'type' => 'checkbox',
                'label' => __('Enable debug logging', 'hmoon-ups-shipping'),
                'description' => __('Log API requests and responses to WooCommerce logs', 'hmoon-ups-shipping'),
                'default' => 'no',
                'desc_tip' => true,
            ],
        ];
        
        // Global form fields (shown in Shipping > UPS Settings)
        $this->form_fields = [
            'api_credentials' => [
                'title' => __('UPS API Credentials', 'hmoon-ups-shipping'),
                'type' => 'title',
                'description' => sprintf(
                    __('Get your free API credentials at %s', 'hmoon-ups-shipping'),
                    '<a href="https://developer.ups.com" target="_blank">developer.ups.com</a>'
                ),
            ],
            'client_id' => [
                'title' => __('Client ID', 'hmoon-ups-shipping'),
                'type' => 'text',
                'description' => __('Your UPS API Client ID', 'hmoon-ups-shipping'),
                'default' => get_option('hmoon_ups_client_id', ''),
                'desc_tip' => true,
            ],
            'client_secret' => [
                'title' => __('Client Secret', 'hmoon-ups-shipping'),
                'type' => 'password',
                'description' => __('Your UPS API Client Secret', 'hmoon-ups-shipping'),
                'default' => get_option('hmoon_ups_client_secret', ''),
                'desc_tip' => true,
            ],
            'account_number' => [
                'title' => __('Account Number', 'hmoon-ups-shipping'),
                'type' => 'text',
                'description' => __('Your 6-digit UPS account number', 'hmoon-ups-shipping'),
                'default' => get_option('hmoon_ups_account_number', ''),
                'desc_tip' => true,
            ],
            'origin_settings' => [
                'title' => __('Origin Address', 'hmoon-ups-shipping'),
                'type' => 'title',
                'description' => __('Where packages ship from', 'hmoon-ups-shipping'),
            ],
            'origin_postcode' => [
                'title' => __('Origin Postal Code', 'hmoon-ups-shipping'),
                'type' => 'text',
                'description' => __('Postal/ZIP code packages ship from', 'hmoon-ups-shipping'),
                'default' => get_option('hmoon_ups_origin_postcode', ''),
                'desc_tip' => true,
            ],
            'origin_country' => [
                'title' => __('Origin Country', 'hmoon-ups-shipping'),
                'type' => 'select',
                'description' => __('Country packages ship from', 'hmoon-ups-shipping'),
                'default' => get_option('hmoon_ups_origin_country', 'US'),
                'options' => WC()->countries->get_countries(),
                'desc_tip' => true,
            ],
            'api_settings' => [
                'title' => __('API Settings', 'hmoon-ups-shipping'),
                'type' => 'title',
            ],
            'test_mode' => [
                'title' => __('Test Mode', 'hmoon-ups-shipping'),
                'type' => 'checkbox',
                'label' => __('Enable test/sandbox mode', 'hmoon-ups-shipping'),
                'description' => __('Use UPS sandbox environment for testing', 'hmoon-ups-shipping'),
                'default' => get_option('hmoon_ups_test_mode', 'yes'),
                'desc_tip' => true,
            ],
        ];
    }
    
    /**
     * Process and save global options
     */
    public function process_admin_options(): bool {
        $result = parent::process_admin_options();
        
        // Save to wp_options for API class
        if (isset($_POST['woocommerce_hmoon_ups_client_id'])) {
            update_option('hmoon_ups_client_id', sanitize_text_field($_POST['woocommerce_hmoon_ups_client_id']));
        }
        if (isset($_POST['woocommerce_hmoon_ups_client_secret'])) {
            update_option('hmoon_ups_client_secret', sanitize_text_field($_POST['woocommerce_hmoon_ups_client_secret']));
        }
        if (isset($_POST['woocommerce_hmoon_ups_account_number'])) {
            update_option('hmoon_ups_account_number', sanitize_text_field($_POST['woocommerce_hmoon_ups_account_number']));
        }
        if (isset($_POST['woocommerce_hmoon_ups_origin_postcode'])) {
            update_option('hmoon_ups_origin_postcode', sanitize_text_field($_POST['woocommerce_hmoon_ups_origin_postcode']));
        }
        if (isset($_POST['woocommerce_hmoon_ups_origin_country'])) {
            update_option('hmoon_ups_origin_country', sanitize_text_field($_POST['woocommerce_hmoon_ups_origin_country']));
        }
        if (isset($_POST['woocommerce_hmoon_ups_test_mode'])) {
            update_option('hmoon_ups_test_mode', 'yes');
        } else {
            update_option('hmoon_ups_test_mode', 'no');
        }
        
        // Clear token cache when credentials change
        delete_transient('hmoon_ups_access_token');
        
        return $result;
    }
    
    /**
     * Calculate shipping rates
     * 
     * @param array $package
     */
    public function calculate_shipping($package = []): void {
        // Get origin settings
        $origin = [
            'postcode' => get_option('hmoon_ups_origin_postcode', ''),
            'country' => get_option('hmoon_ups_origin_country', 'US'),
        ];
        
        // Validate destination
        if (empty($package['destination']['postcode']) || empty($package['destination']['country'])) {
            return;
        }
        
        // Check cache first
        $cache_key = $this->get_cache_key($package, $origin);
        $cached_rates = get_transient($cache_key);
        
        if ($cached_rates !== false) {
            $this->add_rates_to_cart($cached_rates);
            return;
        }
        
        // Get enabled services
        $services = $this->get_option('enabled_services', ['03', '12', '02']);
        if (!is_array($services)) {
            $services = ['03'];
        }
        
        // Get rates from API
        $rates = $this->api->get_rates($package, $origin, $services);
        
        if (is_wp_error($rates)) {
            $this->log('API Error: ' . $rates->get_error_message());
            
            // Use fallback rate if configured
            $fallback = $this->get_option('fallback_rate', '');
            if (!empty($fallback)) {
                $this->add_rate([
                    'id' => $this->get_rate_id('fallback'),
                    'label' => $this->title,
                    'cost' => floatval($fallback),
                    'package' => $package,
                ]);
            }
            return;
        }
        
        if (empty($rates)) {
            $this->log('No rates returned from UPS');
            return;
        }
        
        // Cache rates for 1 hour
        set_transient($cache_key, $rates, HOUR_IN_SECONDS);
        
        $this->add_rates_to_cart($rates);
    }
    
    /**
     * Add rates to cart
     * 
     * @param array $rates
     */
    private function add_rates_to_cart(array $rates): void {
        $handling_fee = floatval($this->get_option('handling_fee', 0));
        $handling_percent = floatval($this->get_option('handling_fee_percent', 0));
        
        foreach ($rates as $rate) {
            $cost = $rate['cost'];
            
            // Apply handling fees
            if ($handling_fee > 0) {
                $cost += $handling_fee;
            }
            if ($handling_percent > 0) {
                $cost += ($rate['cost'] * ($handling_percent / 100));
            }
            
            $this->add_rate([
                'id' => $this->get_rate_id($rate['service_code']),
                'label' => $rate['label'],
                'cost' => $cost,
                'meta_data' => [
                    'service_code' => $rate['service_code'],
                ],
            ]);
        }
    }
    
    /**
     * Generate cache key for package
     * 
     * @param array $package
     * @param array $origin
     * @return string
     */
    private function get_cache_key(array $package, array $origin): string {
        $key_data = [
            'origin' => $origin,
            'dest_postcode' => $package['destination']['postcode'],
            'dest_country' => $package['destination']['country'],
            'contents_hash' => md5(serialize(array_map(function($item) {
                return [
                    'id' => $item['product_id'],
                    'qty' => $item['quantity'],
                    'weight' => $item['data']->get_weight(),
                ];
            }, $package['contents']))),
            'services' => $this->get_option('enabled_services', []),
        ];
        
        return 'hmoon_ups_rates_' . md5(serialize($key_data));
    }
    
    /**
     * Log message if debug mode enabled
     * 
     * @param string $message
     */
    private function log(string $message): void {
        if ($this->get_option('debug_mode', 'no') === 'yes') {
            $logger = wc_get_logger();
            $logger->debug($message, ['source' => 'hmoon-ups-shipping']);
        }
    }
}
