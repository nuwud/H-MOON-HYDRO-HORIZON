<?php
/**
 * Plaid Verifier
 *
 * Instant verification via Plaid API.
 *
 * @package Nuwud\WooAchBatch\Verification
 */

namespace Nuwud\WooAchBatch\Verification;

use Nuwud\WooAchBatch\Admin\Settings;

/**
 * Plaid-based instant bank account verification
 *
 * TODO: Complete implementation when Plaid credentials are available
 * This is a stub implementation that provides the structure.
 *
 * @see https://plaid.com/docs/auth/
 */
class PlaidVerifier implements VerificationInterface {

    /**
     * Settings service
     *
     * @var Settings
     */
    private Settings $settings;

    /**
     * Plaid API base URL
     *
     * @var string
     */
    private string $api_base;

    /**
     * Constructor
     *
     * @param Settings $settings Settings service
     */
    public function __construct( Settings $settings ) {
        $this->settings = $settings;

        // Set API base based on environment
        $environment = $this->settings->get_option( 'plaid_environment', 'sandbox' );
        $this->api_base = match ( $environment ) {
            'production' => 'https://production.plaid.com',
            'development' => 'https://development.plaid.com',
            default => 'https://sandbox.plaid.com',
        };
    }

    /**
     * Get verifier ID
     *
     * @return string
     */
    public function getId(): string {
        return 'plaid';
    }

    /**
     * Get display name
     *
     * @return string
     */
    public function getName(): string {
        return __( 'Instant Verification (Plaid)', 'woo-ach-batch' );
    }

    /**
     * Check if Plaid is configured
     *
     * @return bool
     */
    public function isAvailable(): bool {
        $client_id = $this->settings->get_option( 'plaid_client_id' );
        $secret = $this->settings->get_option( 'plaid_secret' );

        return ! empty( $client_id ) && ! empty( $secret );
    }

    /**
     * Start Plaid Link flow
     *
     * @param int   $order_id    WooCommerce order ID
     * @param int   $customer_id WooCommerce customer ID
     * @param array $bank_data   Bank account data (not used, Plaid handles this)
     * @return array{success: bool, message: string, data?: array}
     */
    public function startVerification( int $order_id, int $customer_id, array $bank_data ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'success' => false,
                'message' => 'Order not found',
            ];
        }

        try {
            // Create Link token
            $link_token = $this->createLinkToken( $order, $customer_id );

            if ( ! $link_token ) {
                throw new \Exception( 'Failed to create Plaid Link token' );
            }

            // Store that Plaid verification is in progress
            $order->update_meta_data( '_ach_plaid_link_token', $link_token );
            $order->update_meta_data( '_ach_verification_status', 'pending_plaid' );
            $order->save();

            return [
                'success' => true,
                'message' => __( 'Please connect your bank account using Plaid.', 'woo-ach-batch' ),
                'data' => [
                    'requires_action' => true,
                    'action_type' => 'plaid_link',
                    'link_token' => $link_token,
                    'status' => 'pending_plaid',
                ],
            ];

        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Plaid verification error for order #%d: %s', $order_id, $e->getMessage() ),
                'error'
            );

            return [
                'success' => false,
                'message' => __( 'Unable to start bank verification. Please try again or use a different method.', 'woo-ach-batch' ),
            ];
        }
    }

    /**
     * Complete Plaid verification (exchange public token)
     *
     * @param int   $order_id         WooCommerce order ID
     * @param int   $customer_id      WooCommerce customer ID
     * @param array $verification_data Plaid public_token and account_id
     * @return array{success: bool, message: string, verified?: bool}
     */
    public function completeVerification( int $order_id, int $customer_id, array $verification_data ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'success' => false,
                'message' => 'Order not found',
            ];
        }

        $public_token = $verification_data['public_token'] ?? '';
        $account_id = $verification_data['account_id'] ?? '';

        if ( empty( $public_token ) || empty( $account_id ) ) {
            return [
                'success' => false,
                'message' => __( 'Invalid verification data.', 'woo-ach-batch' ),
            ];
        }

        try {
            // Exchange public token for access token
            $access_token = $this->exchangePublicToken( $public_token );

            if ( ! $access_token ) {
                throw new \Exception( 'Failed to exchange Plaid token' );
            }

            // Get account details
            $account_data = $this->getAccountDetails( $access_token, $account_id );

            if ( ! $account_data ) {
                throw new \Exception( 'Failed to get account details' );
            }

            // Store encrypted routing and account numbers
            $encryption = \Nuwud\WooAchBatch\service( 'encryption' );
            $order_meta = \Nuwud\WooAchBatch\service( 'order_meta' );

            $order_meta->save_bank_details( $order_id, [
                'routing_number' => $account_data['routing'],
                'account_number' => $account_data['account'],
                'account_type' => $account_data['subtype'] === 'savings' ? 'savings' : 'checking',
            ] );

            // Mark as verified
            $order->update_meta_data( '_ach_verification_status', 'verified' );
            $order->update_meta_data( '_ach_plaid_verified', time() );
            $order->update_meta_data( '_ach_plaid_institution', $account_data['institution_name'] ?? '' );
            $order->save();

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Plaid verification completed for order #%d', $order_id ),
                'info'
            );

            return [
                'success' => true,
                'message' => __( 'Your bank account has been verified!', 'woo-ach-batch' ),
                'verified' => true,
            ];

        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Plaid completion error for order #%d: %s', $order_id, $e->getMessage() ),
                'error'
            );

            return [
                'success' => false,
                'message' => __( 'Unable to complete verification. Please try again.', 'woo-ach-batch' ),
                'verified' => false,
            ];
        }
    }

    /**
     * Get verification status
     *
     * @param int $order_id    WooCommerce order ID
     * @param int $customer_id WooCommerce customer ID
     * @return array{status: string, message: string}
     */
    public function getVerificationStatus( int $order_id, int $customer_id ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'status' => 'unknown',
                'message' => 'Order not found',
            ];
        }

        $status = $order->get_meta( '_ach_verification_status' );

        $messages = [
            'pending_plaid' => __( 'Waiting for Plaid verification', 'woo-ach-batch' ),
            'verified' => __( 'Verified via Plaid', 'woo-ach-batch' ),
        ];

        return [
            'status' => $status ?: 'unknown',
            'message' => $messages[ $status ] ?? __( 'Unknown status', 'woo-ach-batch' ),
        ];
    }

    /**
     * Cancel verification
     *
     * @param int $order_id    WooCommerce order ID
     * @param int $customer_id WooCommerce customer ID
     * @return bool
     */
    public function cancelVerification( int $order_id, int $customer_id ): bool {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return false;
        }

        $order->delete_meta_data( '_ach_plaid_link_token' );
        $order->update_meta_data( '_ach_verification_status', 'cancelled' );
        $order->save();

        return true;
    }

    /**
     * Create a Plaid Link token
     *
     * @param \WC_Order $order       Order
     * @param int       $customer_id Customer ID
     * @return string|null Link token
     */
    private function createLinkToken( \WC_Order $order, int $customer_id ): ?string {
        // TODO: Implement actual Plaid API call
        // This is a stub that shows the structure

        $client_id = $this->settings->get_option( 'plaid_client_id' );
        $secret = $this->getDecryptedSecret();

        $response = wp_remote_post( $this->api_base . '/link/token/create', [
            'headers' => [
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode( [
                'client_id' => $client_id,
                'secret' => $secret,
                'user' => [
                    'client_user_id' => (string) $customer_id,
                ],
                'client_name' => get_bloginfo( 'name' ),
                'products' => [ 'auth' ],
                'country_codes' => [ 'US' ],
                'language' => 'en',
            ] ),
            'timeout' => 30,
        ] );

        if ( is_wp_error( $response ) ) {
            return null;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        return $body['link_token'] ?? null;
    }

    /**
     * Exchange public token for access token
     *
     * @param string $public_token Public token from Link
     * @return string|null Access token
     */
    private function exchangePublicToken( string $public_token ): ?string {
        // TODO: Implement actual Plaid API call

        $client_id = $this->settings->get_option( 'plaid_client_id' );
        $secret = $this->getDecryptedSecret();

        $response = wp_remote_post( $this->api_base . '/item/public_token/exchange', [
            'headers' => [
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode( [
                'client_id' => $client_id,
                'secret' => $secret,
                'public_token' => $public_token,
            ] ),
            'timeout' => 30,
        ] );

        if ( is_wp_error( $response ) ) {
            return null;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        return $body['access_token'] ?? null;
    }

    /**
     * Get account details using Auth endpoint
     *
     * @param string $access_token Access token
     * @param string $account_id   Account ID
     * @return array|null Account data
     */
    private function getAccountDetails( string $access_token, string $account_id ): ?array {
        // TODO: Implement actual Plaid API call

        $client_id = $this->settings->get_option( 'plaid_client_id' );
        $secret = $this->getDecryptedSecret();

        $response = wp_remote_post( $this->api_base . '/auth/get', [
            'headers' => [
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode( [
                'client_id' => $client_id,
                'secret' => $secret,
                'access_token' => $access_token,
            ] ),
            'timeout' => 30,
        ] );

        if ( is_wp_error( $response ) ) {
            return null;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        // Find the selected account
        foreach ( $body['numbers']['ach'] ?? [] as $ach ) {
            if ( $ach['account_id'] === $account_id ) {
                // Find account details
                $account_info = null;
                foreach ( $body['accounts'] ?? [] as $acct ) {
                    if ( $acct['account_id'] === $account_id ) {
                        $account_info = $acct;
                        break;
                    }
                }

                return [
                    'routing' => $ach['routing'],
                    'account' => $ach['account'],
                    'subtype' => $account_info['subtype'] ?? 'checking',
                    'institution_name' => $body['item']['institution_id'] ?? '',
                ];
            }
        }

        return null;
    }

    /**
     * Get decrypted Plaid secret
     *
     * @return string
     */
    private function getDecryptedSecret(): string {
        $secret = $this->settings->get_option( 'plaid_secret' );

        // If stored encrypted, decrypt
        if ( str_starts_with( $secret, 'enc:' ) ) {
            $encryption = \Nuwud\WooAchBatch\service( 'encryption' );
            return $encryption->decrypt( substr( $secret, 4 ) );
        }

        return $secret;
    }
}
