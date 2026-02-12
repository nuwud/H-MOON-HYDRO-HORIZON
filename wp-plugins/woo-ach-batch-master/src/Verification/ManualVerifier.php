<?php
/**
 * Manual Verifier
 *
 * Simple manual verification by admin review.
 *
 * @package Nuwud\WooAchBatch\Verification
 */

namespace Nuwud\WooAchBatch\Verification;

use Nuwud\WooAchBatch\Admin\Settings;

/**
 * Manual verification (admin approval)
 */
class ManualVerifier implements VerificationInterface {

    /**
     * Settings service
     *
     * @var Settings
     */
    private Settings $settings;

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
        return 'manual';
    }

    /**
     * Get display name
     *
     * @return string
     */
    public function getName(): string {
        return __( 'Manual Review', 'woo-ach-batch' );
    }

    /**
     * Check if available (always true for manual)
     *
     * @return bool
     */
    public function isAvailable(): bool {
        return true;
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

        // Store that manual verification is pending
        $order->update_meta_data( '_ach_manual_verification_pending', true );
        $order->update_meta_data( '_ach_verification_status', 'pending_review' );
        $order->save();

        // Notify admin
        $this->notifyAdmin( $order );

        return [
            'success' => true,
            'message' => __( 'Your bank details have been submitted for review. You will be notified once verified.', 'woo-ach-batch' ),
            'data' => [
                'requires_action' => false,
                'status' => 'pending_review',
            ],
        ];
    }

    /**
     * Complete verification (admin approves)
     *
     * @param int   $order_id         WooCommerce order ID
     * @param int   $customer_id      WooCommerce customer ID
     * @param array $verification_data Data (action: approve/reject)
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

        $action = $verification_data['action'] ?? 'approve';

        if ( $action === 'reject' ) {
            $order->update_meta_data( '_ach_verification_status', 'rejected' );
            $order->update_meta_data( '_ach_verification_rejection_reason', $verification_data['reason'] ?? '' );
            $order->delete_meta_data( '_ach_manual_verification_pending' );
            $order->save();

            // Notify customer
            $this->notifyCustomerRejected( $order, $verification_data['reason'] ?? '' );

            return [
                'success' => true,
                'message' => __( 'Verification rejected.', 'woo-ach-batch' ),
                'verified' => false,
            ];
        }

        // Approve
        $order->update_meta_data( '_ach_verification_status', 'verified' );
        $order->delete_meta_data( '_ach_manual_verification_pending' );
        $order->save();

        // Notify customer
        $this->notifyCustomerApproved( $order );

        return [
            'success' => true,
            'message' => __( 'Verification approved.', 'woo-ach-batch' ),
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

        $messages = [
            'pending_review' => __( 'Pending admin review', 'woo-ach-batch' ),
            'verified' => __( 'Verified', 'woo-ach-batch' ),
            'rejected' => __( 'Rejected', 'woo-ach-batch' ),
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

        $order->delete_meta_data( '_ach_manual_verification_pending' );
        $order->update_meta_data( '_ach_verification_status', 'cancelled' );
        $order->save();

        return true;
    }

    /**
     * Notify admin of pending verification
     *
     * @param \WC_Order $order Order
     */
    private function notifyAdmin( \WC_Order $order ): void {
        $admin_email = get_option( 'admin_email' );

        // TODO: Create proper WooCommerce email class
        $subject = sprintf(
            __( '[%s] ACH Verification Needed - Order #%s', 'woo-ach-batch' ),
            get_bloginfo( 'name' ),
            $order->get_order_number()
        );

        $message = sprintf(
            __( "Order #%s requires ACH bank account verification.\n\nReview and approve/reject in the order admin:\n%s", 'woo-ach-batch' ),
            $order->get_order_number(),
            admin_url( 'post.php?post=' . $order->get_id() . '&action=edit' )
        );

        wp_mail( $admin_email, $subject, $message );
    }

    /**
     * Notify customer of approval
     *
     * @param \WC_Order $order Order
     */
    private function notifyCustomerApproved( \WC_Order $order ): void {
        $customer_email = $order->get_billing_email();

        // TODO: Create proper WooCommerce email class
        $subject = sprintf(
            __( '[%s] Your payment has been verified - Order #%s', 'woo-ach-batch' ),
            get_bloginfo( 'name' ),
            $order->get_order_number()
        );

        $message = sprintf(
            __( "Your ACH bank details for order #%s have been verified. Your payment will be processed shortly.", 'woo-ach-batch' ),
            $order->get_order_number()
        );

        wp_mail( $customer_email, $subject, $message );
    }

    /**
     * Notify customer of rejection
     *
     * @param \WC_Order $order  Order
     * @param string    $reason Rejection reason
     */
    private function notifyCustomerRejected( \WC_Order $order, string $reason ): void {
        $customer_email = $order->get_billing_email();

        // TODO: Create proper WooCommerce email class
        $subject = sprintf(
            __( '[%s] Payment verification issue - Order #%s', 'woo-ach-batch' ),
            get_bloginfo( 'name' ),
            $order->get_order_number()
        );

        $message = sprintf(
            __( "There was an issue verifying your ACH bank details for order #%s.\n\nReason: %s\n\nPlease contact us to resolve this.", 'woo-ach-batch' ),
            $order->get_order_number(),
            $reason ?: __( 'Not specified', 'woo-ach-batch' )
        );

        wp_mail( $customer_email, $subject, $message );
    }
}
