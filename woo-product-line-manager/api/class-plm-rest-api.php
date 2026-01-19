<?php
/**
 * REST API endpoints
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST API class
 */
class PLM_REST_API {

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
     * Namespace
     *
     * @var string
     */
    private $namespace = 'plm/v1';

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
     * Register routes
     */
    public function register_routes() {
        // Manufacturers
        register_rest_route(
            $this->namespace,
            '/manufacturers',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'get_manufacturers' ),
                'permission_callback' => '__return_true',
            )
        );

        // Single manufacturer with lines
        register_rest_route(
            $this->namespace,
            '/manufacturers/(?P<slug>[a-zA-Z0-9-]+)',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'get_manufacturer' ),
                'permission_callback' => '__return_true',
                'args'                => array(
                    'slug' => array(
                        'required'          => true,
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_title',
                    ),
                ),
            )
        );

        // Audit
        register_rest_route(
            $this->namespace,
            '/audit',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'get_audit' ),
                'permission_callback' => array( $this, 'check_admin_permissions' ),
            )
        );

        // Run audit
        register_rest_route(
            $this->namespace,
            '/audit/run',
            array(
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => array( $this, 'run_audit' ),
                'permission_callback' => array( $this, 'check_admin_permissions' ),
            )
        );

        // Special orders
        register_rest_route(
            $this->namespace,
            '/special-orders',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'get_special_orders' ),
                'permission_callback' => '__return_true',
                'args'                => array(
                    'brand' => array(
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ),
                ),
            )
        );

        // Data sources
        register_rest_route(
            $this->namespace,
            '/sources',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'get_sources' ),
                'permission_callback' => array( $this, 'check_admin_permissions' ),
            )
        );

        // Essentials
        register_rest_route(
            $this->namespace,
            '/essentials',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'get_essentials' ),
                'permission_callback' => '__return_true',
                'args'                => array(
                    'limit' => array(
                        'type'              => 'integer',
                        'default'           => 20,
                        'sanitize_callback' => 'absint',
                    ),
                ),
            )
        );
    }

    /**
     * Check admin permissions
     *
     * @return bool
     */
    public function check_admin_permissions() {
        return current_user_can( 'manage_woocommerce' );
    }

    /**
     * Get all manufacturers
     *
     * @return WP_REST_Response
     */
    public function get_manufacturers() {
        $manufacturers = PLM_Data_Manager::get_manufacturers();
        
        $response = array();
        foreach ( $manufacturers as $name => $data ) {
            $response[] = array(
                'name'        => $name,
                'slug'        => sanitize_title( $name ),
                'distributor' => $data['distributor'] ?? '',
                'website'     => $data['website'] ?? '',
                'lines_count' => count( $data['lines'] ?? array() ),
            );
        }

        return rest_ensure_response( $response );
    }

    /**
     * Get single manufacturer
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function get_manufacturer( $request ) {
        $slug = $request->get_param( 'slug' );
        $manufacturers = PLM_Data_Manager::get_manufacturers();

        foreach ( $manufacturers as $name => $data ) {
            if ( sanitize_title( $name ) === $slug ) {
                return rest_ensure_response(
                    array(
                        'name'        => $name,
                        'slug'        => $slug,
                        'distributor' => $data['distributor'] ?? '',
                        'website'     => $data['website'] ?? '',
                        'lines'       => $data['lines'] ?? array(),
                    )
                );
            }
        }

        return new WP_Error( 'not_found', 'Manufacturer not found', array( 'status' => 404 ) );
    }

    /**
     * Get audit results
     *
     * @return WP_REST_Response
     */
    public function get_audit() {
        $audit = PLM_Audit::get_last_audit();
        
        if ( ! $audit ) {
            return rest_ensure_response(
                array(
                    'has_audit' => false,
                    'message'   => 'No audit has been run yet.',
                )
            );
        }

        return rest_ensure_response( $audit );
    }

    /**
     * Run new audit
     *
     * @return WP_REST_Response
     */
    public function run_audit() {
        $results = PLM_Audit::run_full_audit();
        return rest_ensure_response( $results );
    }

    /**
     * Get special orders
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function get_special_orders( $request ) {
        $audit = PLM_Audit::get_last_audit();
        
        if ( ! $audit || empty( $audit['special_orders'] ) ) {
            return rest_ensure_response( array() );
        }

        $items = $audit['special_orders'];
        $brand = $request->get_param( 'brand' );

        if ( $brand ) {
            $items = array_filter( $items, function( $item ) use ( $brand ) {
                return stripos( $item['brand'], $brand ) !== false;
            } );
        }

        return rest_ensure_response( array_values( $items ) );
    }

    /**
     * Get data sources
     *
     * @return WP_REST_Response
     */
    public function get_sources() {
        return rest_ensure_response( PLM_Data_Manager::get_data_sources() );
    }

    /**
     * Get essential products
     *
     * @param WP_REST_Request $request Request object.
     * @return WP_REST_Response
     */
    public function get_essentials( $request ) {
        $limit = $request->get_param( 'limit' );
        $essentials = PLM_Data_Manager::get_essential_products();
        
        return rest_ensure_response( array_slice( $essentials, 0, $limit ) );
    }
}
