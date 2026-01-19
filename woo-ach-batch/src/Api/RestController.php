<?php
/**
 * REST API Controller
 *
 * Provides REST API endpoints for ACH batch operations.
 *
 * SECURITY:
 * - Admin endpoints require manage_woocommerce capability
 * - Customer endpoints verify order ownership
 * - Verification endpoints are rate-limited to prevent brute-force
 *
 * @package Nuwud\WooAchBatch\Api
 */

namespace Nuwud\WooAchBatch\Api;

use Nuwud\WooAchBatch\Security\RateLimiter;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * REST API endpoints
 */
class RestController extends WP_REST_Controller {

    /**
     * Namespace
     *
     * @var string
     */
    protected $namespace = 'woo-ach-batch/v1';

    /**
     * Rate limit: max verification attempts per window
     */
    private const VERIFICATION_RATE_LIMIT = 5;

    /**
     * Rate limit: window in seconds (15 minutes)
     */
    private const VERIFICATION_RATE_WINDOW = 900;

    /**
     * Initialize API
     */
    public function init(): void {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }

    /**
     * Register REST routes
     */
    public function register_routes(): void {
        // Batches
        register_rest_route( $this->namespace, '/batches', [
            [
                'methods' => 'GET',
                'callback' => [ $this, 'get_batches' ],
                'permission_callback' => [ $this, 'admin_permissions_check' ],
                'args' => [
                    'page' => [
                        'default' => 1,
                        'sanitize_callback' => 'absint',
                    ],
                    'per_page' => [
                        'default' => 20,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ] );

        register_rest_route( $this->namespace, '/batches/(?P<id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [ $this, 'get_batch' ],
                'permission_callback' => [ $this, 'admin_permissions_check' ],
                'args' => [
                    'id' => [
                        'required' => true,
                        'validate_callback' => fn( $value ) => is_numeric( $value ),
                    ],
                ],
            ],
        ] );

        // Manual batch trigger
        register_rest_route( $this->namespace, '/batches/run', [
            [
                'methods' => 'POST',
                'callback' => [ $this, 'run_batch' ],
                'permission_callback' => [ $this, 'admin_permissions_check' ],
            ],
        ] );

        // Statistics
        register_rest_route( $this->namespace, '/statistics', [
            [
                'methods' => 'GET',
                'callback' => [ $this, 'get_statistics' ],
                'permission_callback' => [ $this, 'admin_permissions_check' ],
            ],
        ] );

        // Verification
        register_rest_route( $this->namespace, '/verification/(?P<order_id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [ $this, 'get_verification_status' ],
                'permission_callback' => [ $this, 'customer_permissions_check' ],
                'args' => [
                    'order_id' => [
                        'required' => true,
                        'validate_callback' => fn( $value ) => is_numeric( $value ),
                    ],
                ],
            ],
        ] );

        register_rest_route( $this->namespace, '/verification/(?P<order_id>\d+)/complete', [
            [
                'methods' => 'POST',
                'callback' => [ $this, 'complete_verification' ],
                'permission_callback' => [ $this, 'customer_permissions_check' ],
                'args' => [
                    'order_id' => [
                        'required' => true,
                        'validate_callback' => fn( $value ) => is_numeric( $value ),
                    ],
                ],
            ],
        ] );

        // Plaid Link token (for frontend)
        register_rest_route( $this->namespace, '/plaid/link-token', [
            [
                'methods' => 'POST',
                'callback' => [ $this, 'get_plaid_link_token' ],
                'permission_callback' => [ $this, 'customer_permissions_check' ],
                'args' => [
                    'order_id' => [
                        'required' => true,
                        'validate_callback' => fn( $value ) => is_numeric( $value ),
                    ],
                ],
            ],
        ] );

        // SFTP test
        register_rest_route( $this->namespace, '/sftp/test', [
            [
                'methods' => 'POST',
                'callback' => [ $this, 'test_sftp' ],
                'permission_callback' => [ $this, 'admin_permissions_check' ],
            ],
        ] );

        // Returns
        register_rest_route( $this->namespace, '/returns', [
            [
                'methods' => 'GET',
                'callback' => [ $this, 'get_returns' ],
                'permission_callback' => [ $this, 'admin_permissions_check' ],
                'args' => [
                    'page' => [
                        'default' => 1,
                        'sanitize_callback' => 'absint',
                    ],
                    'per_page' => [
                        'default' => 20,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ] );
    }

    /**
     * Admin permissions check
     *
     * @param WP_REST_Request $request Request
     * @return bool|WP_Error
     */
    public function admin_permissions_check( WP_REST_Request $request ) {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            return new WP_Error(
                'rest_forbidden',
                __( 'You do not have permission to access this resource.', 'woo-ach-batch' ),
                [ 'status' => 403 ]
            );
        }
        return true;
    }

    /**
     * Customer permissions check (for their own orders)
     *
     * @param WP_REST_Request $request Request
     * @return bool|WP_Error
     */
    public function customer_permissions_check( WP_REST_Request $request ) {
        if ( ! is_user_logged_in() ) {
            return new WP_Error(
                'rest_not_logged_in',
                __( 'You must be logged in.', 'woo-ach-batch' ),
                [ 'status' => 401 ]
            );
        }

        // Admin can access anything
        if ( current_user_can( 'manage_woocommerce' ) ) {
            return true;
        }

        // Customer can only access their own orders
        $order_id = $request->get_param( 'order_id' );
        if ( $order_id ) {
            $order = wc_get_order( $order_id );
            if ( ! $order || $order->get_customer_id() !== get_current_user_id() ) {
                return new WP_Error(
                    'rest_forbidden',
                    __( 'You do not have permission to access this order.', 'woo-ach-batch' ),
                    [ 'status' => 403 ]
                );
            }
        }

        return true;
    }

    /**
     * Get batches
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response
     */
    public function get_batches( WP_REST_Request $request ): WP_REST_Response {
        $repository = \Nuwud\WooAchBatch\service( 'batch_repository' );

        $page = $request->get_param( 'page' );
        $per_page = min( 100, $request->get_param( 'per_page' ) );
        $offset = ( $page - 1 ) * $per_page;

        $batches = $repository->get_recent( $per_page, $offset );

        return new WP_REST_Response( [
            'batches' => $batches,
            'page' => $page,
            'per_page' => $per_page,
        ] );
    }

    /**
     * Get single batch
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response|WP_Error
     */
    public function get_batch( WP_REST_Request $request ) {
        $repository = \Nuwud\WooAchBatch\service( 'batch_repository' );
        $batch = $repository->get( $request->get_param( 'id' ) );

        if ( ! $batch ) {
            return new WP_Error(
                'not_found',
                __( 'Batch not found.', 'woo-ach-batch' ),
                [ 'status' => 404 ]
            );
        }

        $items = $repository->get_batch_items( $batch->id );

        return new WP_REST_Response( [
            'batch' => $batch,
            'items' => $items,
        ] );
    }

    /**
     * Run manual batch
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response|WP_Error
     */
    public function run_batch( WP_REST_Request $request ) {
        try {
            $runner = \Nuwud\WooAchBatch\service( 'batch_runner' );
            $result = $runner->run();

            if ( $result['success'] ) {
                return new WP_REST_Response( $result );
            }

            return new WP_Error(
                'batch_failed',
                $result['message'] ?? __( 'Batch processing failed.', 'woo-ach-batch' ),
                [ 'status' => 500 ]
            );

        } catch ( \Exception $e ) {
            return new WP_Error(
                'batch_error',
                $e->getMessage(),
                [ 'status' => 500 ]
            );
        }
    }

    /**
     * Get statistics
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response
     */
    public function get_statistics( WP_REST_Request $request ): WP_REST_Response {
        $repository = \Nuwud\WooAchBatch\service( 'batch_repository' );
        $reconciliation = \Nuwud\WooAchBatch\service( 'reconciliation' );

        return new WP_REST_Response( [
            'batches' => $repository->get_statistics(),
            'returns' => $reconciliation->getStatistics(),
        ] );
    }

    /**
     * Get verification status
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response|WP_Error
     */
    public function get_verification_status( WP_REST_Request $request ) {
        $manager = \Nuwud\WooAchBatch\service( 'verification_manager' );
        $result = $manager->getStatus( $request->get_param( 'order_id' ) );

        return new WP_REST_Response( $result );
    }

    /**
     * Complete verification with rate limiting
     *
     * SECURITY: Rate limited to 5 attempts per 15 minutes per IP
     * to prevent brute-force guessing of micro-deposit amounts.
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response|WP_Error
     */
    public function complete_verification( WP_REST_Request $request ) {
        // SECURITY: Rate limiting to prevent brute-force
        try {
            $rate_limiter = \Nuwud\WooAchBatch\service( 'rate_limiter' );
            $ip_address = $this->get_client_ip();
            $rate_check = $rate_limiter->check(
                'verification_complete',
                $ip_address,
                self::VERIFICATION_RATE_LIMIT,
                self::VERIFICATION_RATE_WINDOW
            );

            if ( ! $rate_check['allowed'] ) {
                // Audit log rate limit hit
                $audit_log = \Nuwud\WooAchBatch\service( 'audit_log' );
                $audit_log->log( 'verification_rate_limited', 'security', null, [
                    'ip_address' => $ip_address,
                    'order_id' => $request->get_param( 'order_id' ),
                    'retry_after' => $rate_check['retry_after'] ?? 0,
                ]);

                return new WP_Error(
                    'rate_limited',
                    sprintf(
                        __( 'Too many verification attempts. Please wait %d minutes and try again.', 'woo-ach-batch' ),
                        ceil( ( $rate_check['retry_after'] ?? 60 ) / 60 )
                    ),
                    [
                        'status' => 429,
                        'retry_after' => $rate_check['retry_after'] ?? 60,
                    ]
                );
            }
        } catch ( \Exception $e ) {
            // Rate limiter not available - continue without it but log
            \Nuwud\WooAchBatch\log_message( 'Rate limiter unavailable: ' . $e->getMessage(), 'warning' );
        }

        $manager = \Nuwud\WooAchBatch\service( 'verification_manager' );

        $order_id = $request->get_param( 'order_id' );
        $data = $request->get_json_params();

        $result = $manager->completeVerification( $order_id, $data );

        if ( $result['success'] ) {
            return new WP_REST_Response( $result );
        }

        return new WP_Error(
            'verification_failed',
            $result['message'] ?? __( 'Verification failed.', 'woo-ach-batch' ),
            [ 'status' => 400 ]
        );
    }

    /**
     * Get client IP address (handles proxies)
     *
     * @return string
     */
    private function get_client_ip(): string {
        $headers = [
            'HTTP_CF_CONNECTING_IP',  // Cloudflare
            'HTTP_X_FORWARDED_FOR',   // Standard proxy
            'HTTP_X_REAL_IP',         // Nginx proxy
            'REMOTE_ADDR',            // Direct connection
        ];

        foreach ( $headers as $header ) {
            if ( ! empty( $_SERVER[ $header ] ) ) {
                $ip = trim( explode( ',', $_SERVER[ $header ] )[0] );
                if ( filter_var( $ip, FILTER_VALIDATE_IP ) ) {
                    return $ip;
                }
            }
        }

        return '0.0.0.0';
    }

    /**
     * Get Plaid Link token
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response|WP_Error
     */
    public function get_plaid_link_token( WP_REST_Request $request ) {
        $manager = \Nuwud\WooAchBatch\service( 'verification_manager' );
        $plaid = $manager->getVerifier( 'plaid' );

        if ( ! $plaid || ! $plaid->isAvailable() ) {
            return new WP_Error(
                'plaid_unavailable',
                __( 'Plaid verification is not available.', 'woo-ach-batch' ),
                [ 'status' => 400 ]
            );
        }

        $result = $plaid->startVerification(
            $request->get_param( 'order_id' ),
            get_current_user_id(),
            []
        );

        if ( $result['success'] ) {
            return new WP_REST_Response( $result );
        }

        return new WP_Error(
            'plaid_error',
            $result['message'] ?? __( 'Failed to create Plaid Link token.', 'woo-ach-batch' ),
            [ 'status' => 500 ]
        );
    }

    /**
     * Test SFTP connection
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response|WP_Error
     */
    public function test_sftp( WP_REST_Request $request ) {
        try {
            $sftp = \Nuwud\WooAchBatch\service( 'sftp_client' );
            $result = $sftp->testConnection();

            return new WP_REST_Response( $result );

        } catch ( \Exception $e ) {
            return new WP_Error(
                'sftp_error',
                $e->getMessage(),
                [ 'status' => 500 ]
            );
        }
    }

    /**
     * Get returns
     *
     * @param WP_REST_Request $request Request
     * @return WP_REST_Response
     */
    public function get_returns( WP_REST_Request $request ): WP_REST_Response {
        global $wpdb;
        $table = $wpdb->prefix . 'woo_ach_returns';

        $page = $request->get_param( 'page' );
        $per_page = min( 100, $request->get_param( 'per_page' ) );
        $offset = ( $page - 1 ) * $per_page;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $returns = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table} ORDER BY received_date DESC LIMIT %d OFFSET %d",
            $per_page,
            $offset
        ) );

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );

        return new WP_REST_Response( [
            'returns' => $returns,
            'total' => $total,
            'page' => $page,
            'per_page' => $per_page,
            'total_pages' => ceil( $total / $per_page ),
        ] );
    }
}
