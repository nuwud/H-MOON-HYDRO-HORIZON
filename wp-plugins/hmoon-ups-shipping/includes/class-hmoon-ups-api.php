<?php
/**
 * UPS REST API Handler
 * 
 * Uses the new UPS REST API (OAuth 2.0) instead of legacy XML API.
 * Free to use - no per-request charges, just need a UPS developer account.
 * 
 * @see https://developer.ups.com/api/reference
 */

defined('ABSPATH') || exit;

class HMoon_UPS_API {
    
    /** @var string API base URL */
    private $api_base;
    
    /** @var string OAuth token URL */
    private $token_url;
    
    /** @var string Client ID */
    private $client_id;
    
    /** @var string Client Secret */
    private $client_secret;
    
    /** @var string Account Number */
    private $account_number;
    
    /** @var bool Test mode */
    private $test_mode;
    
    /** @var string|null Cached access token */
    private $access_token = null;
    
    /**
     * Constructor
     */
    public function __construct() {
        $this->client_id = get_option('hmoon_ups_client_id', '');
        $this->client_secret = get_option('hmoon_ups_client_secret', '');
        $this->account_number = get_option('hmoon_ups_account_number', '');
        $this->test_mode = get_option('hmoon_ups_test_mode', 'yes') === 'yes';
        
        // Set API endpoints based on mode
        if ($this->test_mode) {
            $this->api_base = 'https://wwwcie.ups.com/api';
            $this->token_url = 'https://wwwcie.ups.com/security/v1/oauth/token';
        } else {
            $this->api_base = 'https://onlinetools.ups.com/api';
            $this->token_url = 'https://onlinetools.ups.com/security/v1/oauth/token';
        }
    }
    
    /**
     * Check if API is configured
     * 
     * @return bool
     */
    public function is_configured(): bool {
        return !empty($this->client_id) && 
               !empty($this->client_secret) && 
               !empty($this->account_number);
    }
    
    /**
     * Get OAuth 2.0 access token
     * 
     * @return string|WP_Error
     */
    private function get_access_token() {
        // Check cached token
        $cached = get_transient('hmoon_ups_access_token');
        if ($cached !== false) {
            return $cached;
        }
        
        $response = wp_remote_post($this->token_url, [
            'headers' => [
                'Content-Type' => 'application/x-www-form-urlencoded',
                'Authorization' => 'Basic ' . base64_encode($this->client_id . ':' . $this->client_secret),
            ],
            'body' => 'grant_type=client_credentials',
            'timeout' => 30,
        ]);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (empty($body['access_token'])) {
            return new WP_Error('auth_failed', 'Failed to obtain UPS access token');
        }
        
        // Cache token (expires in ~4 hours, cache for 3.5)
        $expires_in = isset($body['expires_in']) ? intval($body['expires_in']) - 1800 : 12600;
        set_transient('hmoon_ups_access_token', $body['access_token'], $expires_in);
        
        return $body['access_token'];
    }
    
    /**
     * Get shipping rates from UPS
     * 
     * @param array $package WooCommerce package array
     * @param array $origin Origin address
     * @param array $services Service codes to request
     * @return array|WP_Error
     */
    public function get_rates(array $package, array $origin, array $services = []): array|WP_Error {
        if (!$this->is_configured()) {
            return new WP_Error('not_configured', 'UPS API credentials not configured');
        }
        
        $token = $this->get_access_token();
        if (is_wp_error($token)) {
            return $token;
        }
        
        // Default services if none specified
        if (empty($services)) {
            $services = ['03', '12', '02', '59']; // Ground, 3 Day, 2 Day, 2 Day AM
        }
        
        // Calculate package dimensions/weight
        $package_data = $this->calculate_package_data($package);
        
        // Build rate request
        $request_body = $this->build_rate_request($origin, $package, $package_data, $services);
        
        // Make API request
        $response = wp_remote_post($this->api_base . '/rating/v1/Rate', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $token,
                'transId' => uniqid('hmoon_'),
                'transactionSrc' => 'HMoonHydro',
            ],
            'body' => json_encode($request_body),
            'timeout' => 30,
        ]);
        
        if (is_wp_error($response)) {
            $this->log_error('API request failed: ' . $response->get_error_message());
            return $response;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code !== 200) {
            $error_msg = isset($body['response']['errors'][0]['message']) 
                ? $body['response']['errors'][0]['message'] 
                : 'Unknown UPS API error';
            $this->log_error("API error ($status_code): $error_msg");
            return new WP_Error('api_error', $error_msg);
        }
        
        return $this->parse_rates_response($body);
    }
    
    /**
     * Calculate package data from cart contents
     * 
     * @param array $package
     * @return array
     */
    private function calculate_package_data(array $package): array {
        $total_weight = 0;
        $total_value = 0;
        
        foreach ($package['contents'] as $item) {
            $product = $item['data'];
            $quantity = $item['quantity'];
            
            // Weight in pounds
            $weight = floatval($product->get_weight());
            if ($weight <= 0) {
                $weight = 0.5; // Default 0.5 lb for products without weight
            }
            $total_weight += $weight * $quantity;
            
            // Value
            $total_value += floatval($product->get_price()) * $quantity;
        }
        
        // Ensure minimum weight
        $total_weight = max(1, $total_weight);
        
        return [
            'weight' => round($total_weight, 1),
            'value' => round($total_value, 2),
            'currency' => get_woocommerce_currency(),
        ];
    }
    
    /**
     * Build UPS rate request payload
     * 
     * @param array $origin
     * @param array $package
     * @param array $package_data
     * @param array $services
     * @return array
     */
    private function build_rate_request(array $origin, array $package, array $package_data, array $services): array {
        $destination = [
            'PostalCode' => $package['destination']['postcode'],
            'CountryCode' => $package['destination']['country'],
        ];
        
        if (!empty($package['destination']['state'])) {
            $destination['StateProvinceCode'] = $package['destination']['state'];
        }
        if (!empty($package['destination']['city'])) {
            $destination['City'] = $package['destination']['city'];
        }
        
        return [
            'RateRequest' => [
                'Request' => [
                    'SubVersion' => '1801',
                    'TransactionReference' => [
                        'CustomerContext' => 'HMoonHydro Rate Request',
                    ],
                ],
                'Shipment' => [
                    'Shipper' => [
                        'Name' => get_bloginfo('name'),
                        'ShipperNumber' => $this->account_number,
                        'Address' => [
                            'PostalCode' => $origin['postcode'],
                            'CountryCode' => $origin['country'],
                        ],
                    ],
                    'ShipTo' => [
                        'Name' => 'Customer',
                        'Address' => $destination,
                    ],
                    'ShipFrom' => [
                        'Name' => get_bloginfo('name'),
                        'Address' => [
                            'PostalCode' => $origin['postcode'],
                            'CountryCode' => $origin['country'],
                        ],
                    ],
                    'Package' => [
                        'PackagingType' => [
                            'Code' => '02', // Customer Supplied Package
                        ],
                        'Dimensions' => [
                            'UnitOfMeasurement' => ['Code' => 'IN'],
                            'Length' => '12',
                            'Width' => '12', 
                            'Height' => '8',
                        ],
                        'PackageWeight' => [
                            'UnitOfMeasurement' => ['Code' => 'LBS'],
                            'Weight' => strval($package_data['weight']),
                        ],
                        'PackageServiceOptions' => [
                            'DeclaredValue' => [
                                'CurrencyCode' => $package_data['currency'],
                                'MonetaryValue' => strval($package_data['value']),
                            ],
                        ],
                    ],
                    'ShipmentRatingOptions' => [
                        'NegotiatedRatesIndicator' => '',
                    ],
                ],
            ],
        ];
    }
    
    /**
     * Parse UPS rates response
     * 
     * @param array $body
     * @return array
     */
    private function parse_rates_response(array $body): array {
        $rates = [];
        
        if (!isset($body['RateResponse']['RatedShipment'])) {
            return $rates;
        }
        
        $shipments = $body['RateResponse']['RatedShipment'];
        
        // Ensure it's an array of shipments
        if (isset($shipments['Service'])) {
            $shipments = [$shipments];
        }
        
        foreach ($shipments as $shipment) {
            $service_code = $shipment['Service']['Code'] ?? '';
            $service_name = $this->get_service_name($service_code);
            
            // Prefer negotiated rates if available
            $total = isset($shipment['NegotiatedRateCharges']['TotalCharge']['MonetaryValue'])
                ? $shipment['NegotiatedRateCharges']['TotalCharge']['MonetaryValue']
                : ($shipment['TotalCharges']['MonetaryValue'] ?? 0);
            
            if ($total > 0) {
                $rates[$service_code] = [
                    'id' => 'hmoon_ups_' . $service_code,
                    'label' => 'UPS ' . $service_name,
                    'cost' => floatval($total),
                    'service_code' => $service_code,
                ];
            }
        }
        
        return $rates;
    }
    
    /**
     * Get human-readable service name
     * 
     * @param string $code
     * @return string
     */
    public function get_service_name(string $code): string {
        $services = [
            '01' => 'Next Day Air',
            '02' => '2nd Day Air',
            '03' => 'Ground',
            '07' => 'Worldwide Express',
            '08' => 'Worldwide Expedited',
            '11' => 'Standard',
            '12' => '3 Day Select',
            '13' => 'Next Day Air Saver',
            '14' => 'UPS Next Day Air Early',
            '54' => 'Worldwide Express Plus',
            '59' => '2nd Day Air A.M.',
            '65' => 'Saver',
            '82' => 'Today Standard',
            '83' => 'Today Dedicated Courier',
            '84' => 'Today Intercity',
            '85' => 'Today Express',
            '86' => 'Today Express Saver',
            '96' => 'UPS Worldwide Express Freight',
        ];
        
        return $services[$code] ?? "Service $code";
    }
    
    /**
     * Get all available service codes
     * 
     * @return array
     */
    public function get_available_services(): array {
        return [
            '03' => 'Ground',
            '12' => '3 Day Select',
            '02' => '2nd Day Air',
            '59' => '2nd Day Air A.M.',
            '13' => 'Next Day Air Saver',
            '01' => 'Next Day Air',
            '14' => 'Next Day Air Early',
        ];
    }
    
    /**
     * Log error for debugging
     * 
     * @param string $message
     */
    private function log_error(string $message): void {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[HMoon UPS] ' . $message);
        }
    }
}
