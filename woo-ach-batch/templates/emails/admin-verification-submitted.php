<?php
/**
 * Admin notification email for ACH verification submission
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/emails/admin-verification-submitted.php
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

/*
 * @hooked WC_Emails::email_header() Output the email header
 */
do_action( 'woocommerce_email_header', $email_heading, $email );
?>

<p>
    <?php
    printf(
        /* translators: 1: Order number, 2: Customer name */
        esc_html__( 'ACH verification documents have been submitted for order #%1$s by %2$s.', 'woo-ach-batch' ),
        esc_html( $order->get_order_number() ),
        esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() )
    );
    ?>
</p>

<h2><?php esc_html_e( 'Order Summary', 'woo-ach-batch' ); ?></h2>

<table cellspacing="0" cellpadding="6" style="width: 100%; margin-bottom: 20px; border: 1px solid #e5e5e5;">
    <tr>
        <th scope="row" style="text-align: left; border-bottom: 1px solid #e5e5e5; padding: 12px; background-color: #f8f8f8;">
            <?php esc_html_e( 'Order Number', 'woo-ach-batch' ); ?>
        </th>
        <td style="border-bottom: 1px solid #e5e5e5; padding: 12px;">
            <a href="<?php echo esc_url( $order->get_edit_order_url() ); ?>">
                #<?php echo esc_html( $order->get_order_number() ); ?>
            </a>
        </td>
    </tr>
    <tr>
        <th scope="row" style="text-align: left; border-bottom: 1px solid #e5e5e5; padding: 12px; background-color: #f8f8f8;">
            <?php esc_html_e( 'Order Date', 'woo-ach-batch' ); ?>
        </th>
        <td style="border-bottom: 1px solid #e5e5e5; padding: 12px;">
            <?php echo esc_html( wc_format_datetime( $order->get_date_created() ) ); ?>
        </td>
    </tr>
    <tr>
        <th scope="row" style="text-align: left; border-bottom: 1px solid #e5e5e5; padding: 12px; background-color: #f8f8f8;">
            <?php esc_html_e( 'Order Total', 'woo-ach-batch' ); ?>
        </th>
        <td style="border-bottom: 1px solid #e5e5e5; padding: 12px;">
            <?php echo wp_kses_post( $order->get_formatted_order_total() ); ?>
        </td>
    </tr>
    <tr>
        <th scope="row" style="text-align: left; border-bottom: 1px solid #e5e5e5; padding: 12px; background-color: #f8f8f8;">
            <?php esc_html_e( 'Customer', 'woo-ach-batch' ); ?>
        </th>
        <td style="border-bottom: 1px solid #e5e5e5; padding: 12px;">
            <?php echo esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ); ?><br>
            <a href="mailto:<?php echo esc_attr( $order->get_billing_email() ); ?>">
                <?php echo esc_html( $order->get_billing_email() ); ?>
            </a>
        </td>
    </tr>
    <?php
    // Get bank details (last 4 only)
    $last4 = $order->get_meta( '_ach_account_last4' );
    $type = $order->get_meta( '_ach_account_type' );
    $holder = $order->get_meta( '_ach_account_holder_name' );
    ?>
    <?php if ( $holder ) : ?>
    <tr>
        <th scope="row" style="text-align: left; border-bottom: 1px solid #e5e5e5; padding: 12px; background-color: #f8f8f8;">
            <?php esc_html_e( 'Account Holder', 'woo-ach-batch' ); ?>
        </th>
        <td style="border-bottom: 1px solid #e5e5e5; padding: 12px;">
            <?php echo esc_html( $holder ); ?>
        </td>
    </tr>
    <?php endif; ?>
    <?php if ( $last4 ) : ?>
    <tr>
        <th scope="row" style="text-align: left; padding: 12px; background-color: #f8f8f8;">
            <?php esc_html_e( 'Bank Account', 'woo-ach-batch' ); ?>
        </th>
        <td style="padding: 12px;">
            <?php
            echo esc_html( ucfirst( $type ?: 'Checking' ) );
            echo ' ••••';
            echo esc_html( $last4 );
            ?>
        </td>
    </tr>
    <?php endif; ?>
</table>

<h2><?php esc_html_e( 'Documents Submitted', 'woo-ach-batch' ); ?></h2>

<table cellspacing="0" cellpadding="6" style="width: 100%; margin-bottom: 20px; border: 1px solid #e5e5e5;">
    <tr>
        <td style="padding: 12px;">
            <ul style="margin: 0; padding-left: 20px;">
                <li><?php esc_html_e( 'Government ID (Front)', 'woo-ach-batch' ); ?></li>
                <li><?php esc_html_e( 'Government ID (Back)', 'woo-ach-batch' ); ?></li>
                <li><?php esc_html_e( 'Voided Check / Bank Verification', 'woo-ach-batch' ); ?></li>
            </ul>
        </td>
    </tr>
</table>

<p>
    <strong><?php esc_html_e( 'Action Required:', 'woo-ach-batch' ); ?></strong>
    <?php esc_html_e( 'Please review the submitted documents and bank information to complete the verification process.', 'woo-ach-batch' ); ?>
</p>

<p style="margin-top: 20px;">
    <a href="<?php echo esc_url( $order->get_edit_order_url() ); ?>" style="display: inline-block; padding: 12px 24px; background-color: #7e3bd0; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">
        <?php esc_html_e( 'Review Verification', 'woo-ach-batch' ); ?>
    </a>
</p>

<?php if ( $additional_content ) : ?>
    <p style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #7e3bd0;">
        <?php echo wp_kses_post( wpautop( wptexturize( $additional_content ) ) ); ?>
    </p>
<?php endif; ?>

<?php
/*
 * @hooked WC_Emails::email_footer() Output the email footer
 */
do_action( 'woocommerce_email_footer', $email );
