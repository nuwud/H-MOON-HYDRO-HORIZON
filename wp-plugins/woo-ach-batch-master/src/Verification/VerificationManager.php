<?php
/**
 * Verification Manager
 *
 * Manages multiple verification providers and routes requests.
 *
 * @package Nuwud\WooAchBatch\Verification
 */

namespace Nuwud\WooAchBatch\Verification;

use Nuwud\WooAchBatch\Admin\Settings;

/**
 * Manager for verification providers
 */
class VerificationManager {

    /**
     * Settings service
     *
     * @var Settings
     */
    private Settings $settings;

    /**
     * Registered verifiers
     *
     * @var VerificationInterface[]
     */
    private array $verifiers = [];

    /**
     * Constructor
     *
     * @param Settings $settings Settings service
     */
    public function __construct( Settings $settings ) {
        $this->settings = $settings;
    }

    /**
     * Initialize verification system
     */
    public function init(): void {
        // Register built-in verifiers
        $this->registerVerifier( new ManualVerifier( $this->settings ) );
        $this->registerVerifier( new MicroDepositVerifier( $this->settings ) );
        $this->registerVerifier( new PlaidVerifier( $this->settings ) );

        // Allow plugins to register additional verifiers
        do_action( 'woo_ach_batch_register_verifiers', $this );
    }

    /**
     * Register a verification provider
     *
     * @param VerificationInterface $verifier Verifier instance
     */
    public function registerVerifier( VerificationInterface $verifier ): void {
        $this->verifiers[ $verifier->getId() ] = $verifier;
    }

    /**
     * Get a specific verifier by ID
     *
     * @param string $id Verifier ID
     * @return VerificationInterface|null
     */
    public function getVerifier( string $id ): ?VerificationInterface {
        return $this->verifiers[ $id ] ?? null;
    }

    /**
     * Get all registered verifiers
     *
     * @return VerificationInterface[]
     */
    public function getAllVerifiers(): array {
        return $this->verifiers;
    }

    /**
     * Get available (configured) verifiers
     *
     * @return VerificationInterface[]
     */
    public function getAvailableVerifiers(): array {
        return array_filter(
            $this->verifiers,
            fn( VerificationInterface $v ) => $v->isAvailable()
        );
    }

    /**
     * Get the active verifier based on settings
     *
     * @return VerificationInterface
     * @throws \RuntimeException If no verifier is configured
     */
    public function getActiveVerifier(): VerificationInterface {
        $active_id = $this->settings->get_option( 'verification_method', 'manual' );

        if ( isset( $this->verifiers[ $active_id ] ) && $this->verifiers[ $active_id ]->isAvailable() ) {
            return $this->verifiers[ $active_id ];
        }

        // Fall back to manual
        if ( isset( $this->verifiers['manual'] ) ) {
            return $this->verifiers['manual'];
        }

        throw new \RuntimeException( 'No verification method available' );
    }

    /**
     * Start verification for an order
     *
     * @param int   $order_id    WooCommerce order ID
     * @param array $bank_data   Bank account data
     * @return array{success: bool, message: string, verifier?: string, data?: array}
     */
    public function startVerification( int $order_id, array $bank_data ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'success' => false,
                'message' => 'Order not found',
            ];
        }

        $customer_id = $order->get_customer_id();
        $verifier = $this->getActiveVerifier();

        $result = $verifier->startVerification( $order_id, $customer_id, $bank_data );

        if ( $result['success'] ) {
            // Store verification method used
            $order->update_meta_data( '_ach_verification_method', $verifier->getId() );
            $order->update_meta_data( '_ach_verification_started', time() );
            $order->save();

            \Nuwud\WooAchBatch\log_message(
                sprintf(
                    'Verification started for order #%d using %s',
                    $order_id,
                    $verifier->getName()
                ),
                'info'
            );
        }

        return array_merge( $result, [ 'verifier' => $verifier->getId() ] );
    }

    /**
     * Complete verification for an order
     *
     * @param int   $order_id         WooCommerce order ID
     * @param array $verification_data Verification data from customer
     * @return array{success: bool, message: string, verified?: bool}
     */
    public function completeVerification( int $order_id, array $verification_data ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'success' => false,
                'message' => 'Order not found',
            ];
        }

        $customer_id = $order->get_customer_id();
        $verifier_id = $order->get_meta( '_ach_verification_method' );

        $verifier = $this->getVerifier( $verifier_id ) ?? $this->getActiveVerifier();

        $result = $verifier->completeVerification( $order_id, $customer_id, $verification_data );

        if ( ! empty( $result['verified'] ) ) {
            // Update order status to verified
            $order->update_meta_data( '_ach_verification_completed', time() );
            $order->update_status(
                'wc-ach-verified',
                __( 'ACH bank account verified.', 'woo-ach-batch' )
            );

            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Verification completed for order #%d', $order_id ),
                'info'
            );
        }

        return $result;
    }

    /**
     * Get verification status for an order
     *
     * @param int $order_id WooCommerce order ID
     * @return array{status: string, message: string, verifier?: string}
     */
    public function getStatus( int $order_id ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'status' => 'unknown',
                'message' => 'Order not found',
            ];
        }

        $customer_id = $order->get_customer_id();
        $verifier_id = $order->get_meta( '_ach_verification_method' );

        if ( ! $verifier_id ) {
            return [
                'status' => 'not_started',
                'message' => 'Verification not started',
            ];
        }

        $verifier = $this->getVerifier( $verifier_id );
        if ( ! $verifier ) {
            return [
                'status' => 'error',
                'message' => 'Verification method not available',
            ];
        }

        $result = $verifier->getVerificationStatus( $order_id, $customer_id );
        $result['verifier'] = $verifier_id;

        return $result;
    }

    /**
     * Get verifier options for settings dropdown
     *
     * @return array<string, string>
     */
    public function getVerifierOptions(): array {
        $options = [];

        foreach ( $this->verifiers as $id => $verifier ) {
            $label = $verifier->getName();
            if ( ! $verifier->isAvailable() ) {
                $label .= ' ' . __( '(Not Configured)', 'woo-ach-batch' );
            }
            $options[ $id ] = $label;
        }

        return $options;
    }
}
