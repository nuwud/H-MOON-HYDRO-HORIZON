<?php
/**
 * Micro-Deposit Verifier
 *
 * Verification via small test deposits.
 *
 * @package Nuwud\WooAchBatch\Verification
 */

namespace Nuwud\WooAchBatch\Verification;

use Nuwud\WooAchBatch\Admin\Settings;
use Nuwud\WooAchBatch\Security\Encryption;

/**
 * Micro-deposit verification (send two small amounts, customer confirms)
 */
class MicroDepositVerifier implements VerificationInterface {

    /**
     * Settings service
     *
     * @var Settings
     */
    private Settings $settings;

    /**
     * Maximum verification attempts
     */
    private const MAX_ATTEMPTS = 3;

    /**
     * Constructor
     *
     * @param Settings $settings Settings service
     */
    public function __construct( Settings $settings ) {
        $this->settings = $settings;
    }

    /**
     * Get verifier ID
     *
     * @return string
     */
    public function getId(): string {
        return 'micro_deposit';
    }

    /**
     * Get display name
     *
     * @return string
     */
    public function getName(): string {
        return __( 'Micro-Deposit Verification', 'woo-ach-batch' );
    }

    /**
     * Check if available
     *
     * @return bool
     */
    public function isAvailable(): bool {
        // Micro-deposits require ability to send ACH credits
        // TODO: Check if processor supports micro-deposit sending
        return $this->settings->get_option( 'enable_micro_deposits', 'no' ) === 'yes';
    }

    /**
     * Start verification process
     *
     * @param int   $order_id    WooCommerce order ID
     * @param int   $customer_id WooCommerce customer ID
     * @param array $bank_data   Bank account data
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

        // Generate two random micro-deposit amounts (1-99 cents)
        $amount1 = wp_rand( 1, 99 );
        $amount2 = wp_rand( 1, 99 );

        // Ensure they're different
        while ( $amount1 === $amount2 ) {
            $amount2 = wp_rand( 1, 99 );
        }

        // Store encrypted amounts
        $encryption = \Nuwud\WooAchBatch\service( 'encryption' );
        $order->update_meta_data( '_ach_micro_deposit_1', $encryption->encrypt( (string) $amount1 ) );
        $order->update_meta_data( '_ach_micro_deposit_2', $encryption->encrypt( (string) $amount2 ) );
        $order->update_meta_data( '_ach_micro_deposit_created', time() );
        $order->update_meta_data( '_ach_micro_deposit_attempts', 0 );
        $order->update_meta_data( '_ach_verification_status', 'pending_deposits' );
        $order->save();

        // TODO: Actually send micro-deposits via ACH
        // This would need a separate NACHA file generation for credits
        // For now, log the amounts (in production, NEVER log actual amounts)
        \Nuwud\WooAchBatch\log_message(
            sprintf( 'Micro-deposit verification initiated for order #%d', $order_id ),
            'info'
        );

        // Schedule a job to send the deposits
        // TODO: Implement actual micro-deposit sending
        do_action( 'woo_ach_batch_send_micro_deposits', $order_id, $bank_data, $amount1, $amount2 );

        return [
            'success' => true,
            'message' => __(
                'Two small deposits will be sent to your bank account within 1-3 business days. ' .
                'Once received, please return here to verify the amounts.',
                'woo-ach-batch'
            ),
            'data' => [
                'requires_action' => true,
                'action_type' => 'confirm_amounts',
                'status' => 'pending_deposits',
                'expires' => time() + ( 7 * DAY_IN_SECONDS ), // 7 days to complete
            ],
        ];
    }

    /**
     * Complete verification (customer confirms amounts)
     *
     * @param int   $order_id         WooCommerce order ID
     * @param int   $customer_id      WooCommerce customer ID
     * @param array $verification_data Customer-provided amounts
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

        // Check attempts
        $attempts = (int) $order->get_meta( '_ach_micro_deposit_attempts' );
        if ( $attempts >= self::MAX_ATTEMPTS ) {
            return [
                'success' => false,
                'message' => __( 'Maximum verification attempts exceeded. Please contact support.', 'woo-ach-batch' ),
                'verified' => false,
            ];
        }

        // Increment attempts
        $order->update_meta_data( '_ach_micro_deposit_attempts', $attempts + 1 );
        $order->save();

        // Get stored amounts
        $encryption = \Nuwud\WooAchBatch\service( 'encryption' );
        $stored_1 = (int) $encryption->decrypt( $order->get_meta( '_ach_micro_deposit_1' ) );
        $stored_2 = (int) $encryption->decrypt( $order->get_meta( '_ach_micro_deposit_2' ) );

        // Get customer-provided amounts (in cents)
        $provided_1 = (int) ( ( $verification_data['amount_1'] ?? 0 ) * 100 );
        $provided_2 = (int) ( ( $verification_data['amount_2'] ?? 0 ) * 100 );

        // Also accept if provided in cents directly
        if ( $provided_1 < 1 ) {
            $provided_1 = (int) ( $verification_data['amount_1_cents'] ?? 0 );
        }
        if ( $provided_2 < 1 ) {
            $provided_2 = (int) ( $verification_data['amount_2_cents'] ?? 0 );
        }

        // Check if amounts match (in any order)
        $matches = (
            ( $provided_1 === $stored_1 && $provided_2 === $stored_2 ) ||
            ( $provided_1 === $stored_2 && $provided_2 === $stored_1 )
        );

        if ( ! $matches ) {
            $remaining = self::MAX_ATTEMPTS - ( $attempts + 1 );

            return [
                'success' => false,
                'message' => sprintf(
                    __( 'The amounts you entered do not match. You have %d attempt(s) remaining.', 'woo-ach-batch' ),
                    $remaining
                ),
                'verified' => false,
            ];
        }

        // Success! Mark as verified
        $order->update_meta_data( '_ach_verification_status', 'verified' );
        $order->update_meta_data( '_ach_micro_deposit_verified', time() );
        $order->save();

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'Micro-deposit verification completed for order #%d', $order_id ),
            'info'
        );

        return [
            'success' => true,
            'message' => __( 'Your bank account has been verified successfully!', 'woo-ach-batch' ),
            'verified' => true,
        ];
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
        $created = $order->get_meta( '_ach_micro_deposit_created' );
        $attempts = (int) $order->get_meta( '_ach_micro_deposit_attempts' );

        // Check if expired (7 days)
        if ( $created && ( time() - $created ) > ( 7 * DAY_IN_SECONDS ) && $status !== 'verified' ) {
            return [
                'status' => 'expired',
                'message' => __( 'Verification period has expired. Please contact support.', 'woo-ach-batch' ),
            ];
        }

        $messages = [
            'pending_deposits' => __( 'Micro-deposits are being sent to your bank. Please check in 1-3 business days.', 'woo-ach-batch' ),
            'verified' => __( 'Verified', 'woo-ach-batch' ),
            'failed' => __( 'Verification failed', 'woo-ach-batch' ),
        ];

        $message = $messages[ $status ] ?? __( 'Unknown status', 'woo-ach-batch' );

        if ( $status === 'pending_deposits' && $attempts > 0 ) {
            $message .= ' ' . sprintf(
                __( '(%d of %d attempts used)', 'woo-ach-batch' ),
                $attempts,
                self::MAX_ATTEMPTS
            );
        }

        return [
            'status' => $status ?: 'unknown',
            'message' => $message,
            'attempts_remaining' => self::MAX_ATTEMPTS - $attempts,
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

        $order->delete_meta_data( '_ach_micro_deposit_1' );
        $order->delete_meta_data( '_ach_micro_deposit_2' );
        $order->delete_meta_data( '_ach_micro_deposit_created' );
        $order->delete_meta_data( '_ach_micro_deposit_attempts' );
        $order->update_meta_data( '_ach_verification_status', 'cancelled' );
        $order->save();

        return true;
    }
}
