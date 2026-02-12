<?php
/**
 * ACH Verification Submitted Email (Admin Notification)
 *
 * Sent to admin when a customer submits ACH verification documents
 *
 * @package Nuwud\WooAchBatch\Emails
 */

namespace Nuwud\WooAchBatch\Emails;

defined( 'ABSPATH' ) || exit;

/**
 * Admin notification email for verification submissions
 */
class VerificationSubmittedEmail extends \WC_Email {

    /**
     * Constructor
     */
    public function __construct() {
        $this->id             = 'woo_ach_verification_submitted';
        $this->title          = __( 'ACH Verification Submitted', 'woo-ach-batch' );
        $this->description    = __( 'Notification sent to admin when a customer submits ACH verification documents.', 'woo-ach-batch' );
        $this->template_html  = 'emails/admin-verification-submitted.php';
        $this->template_plain = 'emails/plain/admin-verification-submitted.php';
        $this->template_base  = \WOO_ACH_BATCH_PATH . 'templates/';
        $this->placeholders   = [
            '{order_date}'   => '',
            '{order_number}' => '',
        ];

        // Trigger on verification submission
        add_action( 'woo_ach_verification_submitted', [ $this, 'trigger' ], 10, 1 );

        // Call parent constructor
        parent::__construct();

        // Admin email
        $this->recipient = $this->get_option( 'recipient', get_option( 'admin_email' ) );
    }

    /**
     * Get email subject
     *
     * @return string
     */
    public function get_default_subject(): string {
        return __( '[{site_title}]: ACH Verification submitted for order #{order_number}', 'woo-ach-batch' );
    }

    /**
     * Get email heading
     *
     * @return string
     */
    public function get_default_heading(): string {
        return __( 'ACH Verification Pending Review', 'woo-ach-batch' );
    }

    /**
     * Trigger the email
     *
     * @param \WC_Order $order Order object
     */
    public function trigger( \WC_Order $order ): void {
        $this->setup_locale();

        if ( ! $order instanceof \WC_Order ) {
            return;
        }

        $this->object = $order;
        $this->placeholders['{order_date}']   = wc_format_datetime( $order->get_date_created() );
        $this->placeholders['{order_number}'] = $order->get_order_number();

        if ( $this->is_enabled() && $this->get_recipient() ) {
            $this->send( $this->get_recipient(), $this->get_subject(), $this->get_content(), $this->get_headers(), $this->get_attachments() );
        }

        $this->restore_locale();
    }

    /**
     * Get content HTML
     *
     * @return string
     */
    public function get_content_html(): string {
        return wc_get_template_html(
            $this->template_html,
            [
                'order'              => $this->object,
                'email_heading'      => $this->get_heading(),
                'additional_content' => $this->get_additional_content(),
                'sent_to_admin'      => true,
                'plain_text'         => false,
                'email'              => $this,
            ],
            '',
            $this->template_base
        );
    }

    /**
     * Get content plain text
     *
     * @return string
     */
    public function get_content_plain(): string {
        return wc_get_template_html(
            $this->template_plain,
            [
                'order'              => $this->object,
                'email_heading'      => $this->get_heading(),
                'additional_content' => $this->get_additional_content(),
                'sent_to_admin'      => true,
                'plain_text'         => true,
                'email'              => $this,
            ],
            '',
            $this->template_base
        );
    }

    /**
     * Default additional content
     *
     * @return string
     */
    public function get_default_additional_content(): string {
        return __( 'Please review the submitted documents and verify the customer\'s bank account information.', 'woo-ach-batch' );
    }

    /**
     * Initialize form fields
     */
    public function init_form_fields(): void {
        parent::init_form_fields();

        $this->form_fields['recipient'] = [
            'title'       => __( 'Recipient(s)', 'woo-ach-batch' ),
            'type'        => 'text',
            // translators: %s: Admin email
            'description' => sprintf( __( 'Enter recipients (comma-separated) for this email. Defaults to %s.', 'woo-ach-batch' ), '<code>' . esc_attr( get_option( 'admin_email' ) ) . '</code>' ),
            'placeholder' => '',
            'default'     => '',
            'desc_tip'    => true,
        ];
    }
}
