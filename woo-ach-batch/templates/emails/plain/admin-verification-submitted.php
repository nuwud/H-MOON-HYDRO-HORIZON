<?php
/**
 * Admin notification email for ACH verification submission (Plain Text)
 *
 * @package Nuwud\WooAchBatch\Templates
 * @version 1.0.0
 *
 * @var WC_Order $order
 * @var string   $email_heading
 * @var string   $additional_content
 * @var bool     $sent_to_admin
 * @var bool     $plain_text
 * @var WC_Email $email
 */

defined( 'ABSPATH' ) || exit;

echo "=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=\n";
echo esc_html( wp_strip_all_tags( $email_heading ) );
echo "\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=\n\n";

printf(
    /* translators: 1: Order number, 2: Customer name */
    esc_html__( 'ACH verification documents have been submitted for order #%1$s by %2$s.', 'woo-ach-batch' ),
    esc_html( $order->get_order_number() ),
    esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() )
);

echo "\n\n";

echo "----------------------------------------\n";
echo esc_html__( 'ORDER SUMMARY', 'woo-ach-batch' );
echo "\n----------------------------------------\n\n";

echo esc_html__( 'Order Number: ', 'woo-ach-batch' ) . '#' . esc_html( $order->get_order_number() ) . "\n";
echo esc_html__( 'Order Date: ', 'woo-ach-batch' ) . esc_html( wc_format_datetime( $order->get_date_created() ) ) . "\n";
echo esc_html__( 'Order Total: ', 'woo-ach-batch' ) . wp_strip_all_tags( $order->get_formatted_order_total() ) . "\n";
echo esc_html__( 'Customer: ', 'woo-ach-batch' ) . esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ) . "\n";
echo esc_html__( 'Email: ', 'woo-ach-batch' ) . esc_html( $order->get_billing_email() ) . "\n";

$last4 = $order->get_meta( '_ach_account_last4' );
$type = $order->get_meta( '_ach_account_type' );
$holder = $order->get_meta( '_ach_account_holder_name' );

if ( $holder ) {
    echo esc_html__( 'Account Holder: ', 'woo-ach-batch' ) . esc_html( $holder ) . "\n";
}

if ( $last4 ) {
    echo esc_html__( 'Bank Account: ', 'woo-ach-batch' ) . ucfirst( $type ?: 'Checking' ) . ' ••••' . esc_html( $last4 ) . "\n";
}

echo "\n";

echo "----------------------------------------\n";
echo esc_html__( 'DOCUMENTS SUBMITTED', 'woo-ach-batch' );
echo "\n----------------------------------------\n\n";

echo "• " . esc_html__( 'Government ID (Front)', 'woo-ach-batch' ) . "\n";
echo "• " . esc_html__( 'Government ID (Back)', 'woo-ach-batch' ) . "\n";
echo "• " . esc_html__( 'Voided Check / Bank Verification', 'woo-ach-batch' ) . "\n";

echo "\n";

echo "----------------------------------------\n";
echo esc_html__( 'ACTION REQUIRED', 'woo-ach-batch' );
echo "\n----------------------------------------\n\n";

echo esc_html__( 'Please review the submitted documents and bank information to complete the verification process.', 'woo-ach-batch' );
echo "\n\n";

echo esc_html__( 'Review this order: ', 'woo-ach-batch' ) . esc_url( $order->get_edit_order_url() );
echo "\n\n";

if ( $additional_content ) {
    echo "----------------------------------------\n";
    echo esc_html( wp_strip_all_tags( wptexturize( $additional_content ) ) );
    echo "\n----------------------------------------\n\n";
}

echo wp_kses_post( apply_filters( 'woocommerce_email_footer_text', get_option( 'woocommerce_email_footer_text' ) ) );
