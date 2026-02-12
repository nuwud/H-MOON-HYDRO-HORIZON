<?php
/**
 * ACH Batch Payment Gateway
 *
 * WooCommerce payment gateway for ACH batch processing.
 *
 * @package Nuwud\WooAchBatch\Gateway
 */

namespace Nuwud\WooAchBatch\Gateway;

use WC_Payment_Gateway;
use WC_Order;

/**
 * ACH Batch Payment Gateway Class
 */
class AchBatchGateway extends WC_Payment_Gateway {

    /**
     * Whether to store raw bank details (should be false in production)
     *
     * @var bool
     */
    private bool $store_raw_details = false;

    /**
     * Constructor
     */
    public function __construct() {
        $this->id = 'ach_batch';
        $this->icon = apply_filters( 'woo_ach_batch_icon', '' );
        $this->has_fields = true;
        $this->method_title = __( 'ACH Bank Transfer (Batch)', 'woo-ach-batch' );
        $this->method_description = __(
            'Accept ACH bank transfers with batch processing, NACHA file generation, and SFTP upload.',
            'woo-ach-batch'
        );

        // Supports
        $this->supports = [
            'products',
            'refunds',
        ];

        // Load settings
        $this->init_form_fields();
        $this->init_settings();

        // Get settings
        $this->title = $this->get_option( 'title' );
        $this->description = $this->get_option( 'description' );
        $this->enabled = $this->get_option( 'enabled' );
        $this->store_raw_details = $this->get_option( 'store_raw_details' ) === 'yes';

        // Hooks
        add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, [ $this, 'process_admin_options' ] );
        add_action( 'woocommerce_thankyou_' . $this->id, [ $this, 'thankyou_page' ] );
        add_action( 'woocommerce_email_before_order_table', [ $this, 'email_instructions' ], 10, 3 );

        // Add ACH meta box to order
        add_action( 'add_meta_boxes', [ $this, 'add_order_meta_box' ] );
    }

    /**
     * Initialize gateway settings form fields
     */
    public function init_form_fields(): void {
        $this->form_fields = [
            'enabled' => [
                'title' => __( 'Enable/Disable', 'woo-ach-batch' ),
                'type' => 'checkbox',
                'label' => __( 'Enable ACH Bank Transfer', 'woo-ach-batch' ),
                'default' => 'no',
            ],
            'title' => [
                'title' => __( 'Title', 'woo-ach-batch' ),
                'type' => 'text',
                'description' => __( 'Title shown during checkout.', 'woo-ach-batch' ),
                'default' => __( 'ACH Bank Transfer', 'woo-ach-batch' ),
                'desc_tip' => true,
            ],
            'description' => [
                'title' => __( 'Description', 'woo-ach-batch' ),
                'type' => 'textarea',
                'description' => __( 'Description shown during checkout.', 'woo-ach-batch' ),
                'default' => __( 'Pay directly from your bank account. Your order will be processed once the payment is verified.', 'woo-ach-batch' ),
                'desc_tip' => true,
            ],
            'instructions' => [
                'title' => __( 'Instructions', 'woo-ach-batch' ),
                'type' => 'textarea',
                'description' => __( 'Instructions shown on the thank you page and in emails.', 'woo-ach-batch' ),
                'default' => __( 'Thank you for your order. Your ACH payment is being processed and you will be notified once it has been verified.', 'woo-ach-batch' ),
                'desc_tip' => true,
            ],
            'verification_section' => [
                'title' => __( 'Bank Verification', 'woo-ach-batch' ),
                'type' => 'title',
                'description' => __( 'Configure how bank accounts are verified.', 'woo-ach-batch' ),
            ],
            'verification_method' => [
                'title' => __( 'Verification Method', 'woo-ach-batch' ),
                'type' => 'select',
                'description' => __( 'How to verify bank accounts before processing.', 'woo-ach-batch' ),
                'default' => 'manual',
                'options' => [
                    'manual' => __( 'Manual Verification (Admin approves)', 'woo-ach-batch' ),
                    'micro_deposits' => __( 'Micro-deposits (Coming soon)', 'woo-ach-batch' ),
                    'instant' => __( 'Instant Verification - Plaid (Coming soon)', 'woo-ach-batch' ),
                ],
                'desc_tip' => true,
            ],
            'checkout_section' => [
                'title' => __( 'Checkout Fields', 'woo-ach-batch' ),
                'type' => 'title',
                'description' => __( 'Configure checkout form fields.', 'woo-ach-batch' ),
            ],
            'require_account_holder_name' => [
                'title' => __( 'Account Holder Name', 'woo-ach-batch' ),
                'type' => 'checkbox',
                'label' => __( 'Require account holder name', 'woo-ach-batch' ),
                'default' => 'yes',
            ],
            'allow_savings' => [
                'title' => __( 'Account Types', 'woo-ach-batch' ),
                'type' => 'checkbox',
                'label' => __( 'Allow savings accounts (in addition to checking)', 'woo-ach-batch' ),
                'default' => 'yes',
            ],
            'security_section' => [
                'title' => __( 'Security', 'woo-ach-batch' ),
                'type' => 'title',
                'description' => __( 'Security settings for bank data storage.', 'woo-ach-batch' ),
            ],
            'store_raw_details' => [
                'title' => __( 'Store Bank Details', 'woo-ach-batch' ),
                'type' => 'checkbox',
                'label' => __( 'Store encrypted bank details (required for batch processing)', 'woo-ach-batch' ),
                'description' => __( 'Bank details are encrypted at rest. Only enable if not using token-based verification.', 'woo-ach-batch' ),
                'default' => 'yes',
                'desc_tip' => true,
            ],
            'clear_after_settlement' => [
                'title' => __( 'Clear After Settlement', 'woo-ach-batch' ),
                'type' => 'checkbox',
                'label' => __( 'Clear sensitive bank data after successful settlement', 'woo-ach-batch' ),
                'default' => 'yes',
            ],
        ];
    }

    /**
     * Check if gateway is available
     *
     * @return bool
     */
    public function is_available(): bool {
        if ( $this->enabled !== 'yes' ) {
            return false;
        }

        // Check if NACHA settings are configured
        $nacha_settings = get_option( 'woo_ach_batch_nacha_settings', [] );
        $required_fields = [ 'immediate_destination', 'immediate_origin', 'company_id', 'originating_dfi_id' ];

        foreach ( $required_fields as $field ) {
            if ( empty( $nacha_settings[ $field ] ) ) {
                return false;
            }
        }

        return true;
    }

    /**
     * Output payment fields on checkout
     */
    public function payment_fields(): void {
        // Description
        if ( $this->description ) {
            echo wp_kses_post( wpautop( wptexturize( $this->description ) ) );
        }

        ?>
        <fieldset id="wc-<?php echo esc_attr( $this->id ); ?>-form" class="wc-payment-form">
            <?php do_action( 'woocommerce_ach_batch_form_start', $this->id ); ?>

            <?php if ( $this->get_option( 'require_account_holder_name' ) === 'yes' ) : ?>
                <p class="form-row form-row-wide">
                    <label for="ach_account_holder_name">
                        <?php esc_html_e( 'Account Holder Name', 'woo-ach-batch' ); ?>
                        <span class="required">*</span>
                    </label>
                    <input
                        id="ach_account_holder_name"
                        name="ach_account_holder_name"
                        type="text"
                        autocomplete="name"
                        class="input-text"
                        maxlength="22"
                        required
                    />
                </p>
            <?php endif; ?>

            <p class="form-row form-row-wide">
                <label for="ach_routing_number">
                    <?php esc_html_e( 'Routing Number', 'woo-ach-batch' ); ?>
                    <span class="required">*</span>
                </label>
                <input
                    id="ach_routing_number"
                    name="ach_routing_number"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]{9}"
                    autocomplete="off"
                    class="input-text"
                    maxlength="9"
                    placeholder="<?php esc_attr_e( '9-digit routing number', 'woo-ach-batch' ); ?>"
                    required
                />
            </p>

            <p class="form-row form-row-wide">
                <label for="ach_account_number">
                    <?php esc_html_e( 'Account Number', 'woo-ach-batch' ); ?>
                    <span class="required">*</span>
                </label>
                <input
                    id="ach_account_number"
                    name="ach_account_number"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    class="input-text"
                    maxlength="17"
                    placeholder="<?php esc_attr_e( 'Bank account number', 'woo-ach-batch' ); ?>"
                    required
                />
            </p>

            <p class="form-row form-row-wide">
                <label for="ach_account_number_confirm">
                    <?php esc_html_e( 'Confirm Account Number', 'woo-ach-batch' ); ?>
                    <span class="required">*</span>
                </label>
                <input
                    id="ach_account_number_confirm"
                    name="ach_account_number_confirm"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    class="input-text"
                    maxlength="17"
                    placeholder="<?php esc_attr_e( 'Re-enter account number', 'woo-ach-batch' ); ?>"
                    required
                />
            </p>

            <p class="form-row form-row-wide">
                <label for="ach_account_type">
                    <?php esc_html_e( 'Account Type', 'woo-ach-batch' ); ?>
                    <span class="required">*</span>
                </label>
                <select id="ach_account_type" name="ach_account_type" class="select" required>
                    <option value="checking"><?php esc_html_e( 'Checking', 'woo-ach-batch' ); ?></option>
                    <?php if ( $this->get_option( 'allow_savings' ) === 'yes' ) : ?>
                        <option value="savings"><?php esc_html_e( 'Savings', 'woo-ach-batch' ); ?></option>
                    <?php endif; ?>
                </select>
            </p>

            <!-- ACH Authorization -->
            <p class="form-row form-row-wide ach-authorization">
                <label class="checkbox">
                    <input
                        type="checkbox"
                        name="ach_authorization"
                        id="ach_authorization"
                        required
                    />
                    <span class="ach-authorization-text">
                        <?php echo esc_html( \Nuwud\WooAchBatch\get_authorization_text( '1.0' ) ); ?>
                    </span>
                </label>
            </p>

            <input type="hidden" name="ach_authorization_version" value="1.0" />

            <?php do_action( 'woocommerce_ach_batch_form_end', $this->id ); ?>
            <div class="clear"></div>
        </fieldset>

        <style>
            .ach-authorization-text {
                font-size: 0.85em;
                color: #666;
                display: inline-block;
                margin-left: 5px;
            }
            #wc-ach_batch-form input[type="text"] {
                font-family: monospace;
            }
        </style>

        <script>
        jQuery(function($) {
            // Validate routing number format
            $('#ach_routing_number').on('blur', function() {
                var routing = $(this).val().replace(/\D/g, '');
                if (routing.length !== 9) {
                    $(this).addClass('woocommerce-invalid');
                } else {
                    $(this).removeClass('woocommerce-invalid');
                }
            });

            // Validate account numbers match
            $('#ach_account_number_confirm').on('blur', function() {
                var account = $('#ach_account_number').val();
                var confirm = $(this).val();
                if (account !== confirm) {
                    $(this).addClass('woocommerce-invalid');
                } else {
                    $(this).removeClass('woocommerce-invalid');
                }
            });

            // Only allow numeric input
            $('#ach_routing_number, #ach_account_number, #ach_account_number_confirm').on('input', function() {
                $(this).val($(this).val().replace(/\D/g, ''));
            });
        });
        </script>
        <?php
    }

    /**
     * Validate payment fields
     *
     * @return bool
     */
    public function validate_fields(): bool {
        $errors = [];

        // Account holder name
        if ( $this->get_option( 'require_account_holder_name' ) === 'yes' ) {
            $holder_name = isset( $_POST['ach_account_holder_name'] )
                ? sanitize_text_field( wp_unslash( $_POST['ach_account_holder_name'] ) )
                : '';
            if ( empty( $holder_name ) ) {
                $errors[] = __( 'Account holder name is required.', 'woo-ach-batch' );
            }
        }

        // Routing number
        $routing = isset( $_POST['ach_routing_number'] )
            ? sanitize_text_field( wp_unslash( $_POST['ach_routing_number'] ) )
            : '';
        if ( empty( $routing ) ) {
            $errors[] = __( 'Routing number is required.', 'woo-ach-batch' );
        } elseif ( ! \Nuwud\WooAchBatch\validate_routing_number( $routing ) ) {
            $errors[] = __( 'Invalid routing number. Please check and try again.', 'woo-ach-batch' );
        }

        // Account number
        $account = isset( $_POST['ach_account_number'] )
            ? sanitize_text_field( wp_unslash( $_POST['ach_account_number'] ) )
            : '';
        $account_confirm = isset( $_POST['ach_account_number_confirm'] )
            ? sanitize_text_field( wp_unslash( $_POST['ach_account_number_confirm'] ) )
            : '';

        if ( empty( $account ) ) {
            $errors[] = __( 'Account number is required.', 'woo-ach-batch' );
        } elseif ( strlen( $account ) < 4 || strlen( $account ) > 17 ) {
            $errors[] = __( 'Account number must be between 4 and 17 digits.', 'woo-ach-batch' );
        } elseif ( $account !== $account_confirm ) {
            $errors[] = __( 'Account numbers do not match.', 'woo-ach-batch' );
        }

        // Account type
        $account_type = isset( $_POST['ach_account_type'] )
            ? sanitize_text_field( wp_unslash( $_POST['ach_account_type'] ) )
            : '';
        if ( empty( $account_type ) || ! in_array( $account_type, [ 'checking', 'savings' ], true ) ) {
            $errors[] = __( 'Please select a valid account type.', 'woo-ach-batch' );
        }

        // Authorization checkbox
        if ( empty( $_POST['ach_authorization'] ) ) {
            $errors[] = __( 'You must authorize the ACH debit to proceed.', 'woo-ach-batch' );
        }

        // Display errors
        foreach ( $errors as $error ) {
            wc_add_notice( $error, 'error' );
        }

        return empty( $errors );
    }

    /**
     * Process payment
     *
     * @param int $order_id Order ID
     * @return array
     */
    public function process_payment( $order_id ): array {
        $order = wc_get_order( $order_id );

        if ( ! $order ) {
            return [
                'result' => 'failure',
                'messages' => __( 'Order not found.', 'woo-ach-batch' ),
            ];
        }

        // Get form data
        $holder_name = isset( $_POST['ach_account_holder_name'] )
            ? sanitize_text_field( wp_unslash( $_POST['ach_account_holder_name'] ) )
            : $order->get_billing_first_name() . ' ' . $order->get_billing_last_name();
        $routing = sanitize_text_field( wp_unslash( $_POST['ach_routing_number'] ?? '' ) );
        $account = sanitize_text_field( wp_unslash( $_POST['ach_account_number'] ?? '' ) );
        $account_type = sanitize_text_field( wp_unslash( $_POST['ach_account_type'] ?? 'checking' ) );
        $auth_version = sanitize_text_field( wp_unslash( $_POST['ach_authorization_version'] ?? '1.0' ) );

        try {
            // Get order meta service
            $order_meta = \Nuwud\WooAchBatch\service( 'order_meta' );

            // Store encrypted bank details
            if ( $this->store_raw_details ) {
                $order_meta->save_bank_details( $order, $routing, $account, $account_type );
            }

            // Store account holder name
            $order->update_meta_data( '_ach_account_holder_name', $holder_name );

            // Store authorization
            $order_meta->save_authorization( $order, $auth_version );

            // Set initial verification status
            $verification_method = $this->get_option( 'verification_method', 'manual' );
            $initial_status = $verification_method === 'manual' ? 'pending_manual' : 'pending';
            $order_meta->save_verification_status( $order, $initial_status, $verification_method );

            // Update order status
            $order->set_status( 'pending-ach', __( 'Awaiting ACH bank verification.', 'woo-ach-batch' ) );
            $order->save();

            // Log the order
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'ACH payment initiated for order #%d', $order_id ),
                'info',
                [ 'account_last4' => substr( $account, -4 ), 'account_type' => $account_type ]
            );

            // Audit log
            $audit_log = \Nuwud\WooAchBatch\service( 'audit_log' );
            $audit_log->log( 'payment_initiated', 'order', $order_id, [
                'account_last4' => substr( $account, -4 ),
                'account_type' => $account_type,
                'verification_method' => $verification_method,
            ]);

            // Reduce stock levels
            wc_reduce_stock_levels( $order_id );

            // Remove cart
            WC()->cart->empty_cart();

            // Return success
            return [
                'result' => 'success',
                'redirect' => $this->get_return_url( $order ),
            ];

        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'ACH payment failed for order #%d: %s', $order_id, $e->getMessage() ),
                'error'
            );

            return [
                'result' => 'failure',
                'messages' => __( 'There was an error processing your payment. Please try again.', 'woo-ach-batch' ),
            ];
        }
    }

    /**
     * Output for the order received page
     */
    public function thankyou_page(): void {
        $instructions = $this->get_option( 'instructions' );
        if ( $instructions ) {
            echo wp_kses_post( wpautop( wptexturize( $instructions ) ) );
        }
    }

    /**
     * Add content to order emails
     *
     * @param WC_Order $order         Order object
     * @param bool     $sent_to_admin Whether email is for admin
     * @param bool     $plain_text    Whether plain text email
     */
    public function email_instructions( $order, $sent_to_admin, $plain_text = false ): void {
        if ( ! $sent_to_admin && $this->id === $order->get_payment_method() && $order->has_status( 'pending-ach' ) ) {
            $instructions = $this->get_option( 'instructions' );
            if ( $instructions ) {
                if ( $plain_text ) {
                    echo esc_html( wp_strip_all_tags( $instructions ) ) . "\n\n";
                } else {
                    echo wp_kses_post( wpautop( wptexturize( $instructions ) ) );
                }
            }
        }
    }

    /**
     * Add ACH details meta box to order admin
     */
    public function add_order_meta_box(): void {
        $screen = wc_get_container()->get( \Automattic\WooCommerce\Internal\DataStores\Orders\CustomOrdersTableController::class )->custom_orders_table_usage_is_enabled()
            ? wc_get_page_screen_id( 'shop-order' )
            : 'shop_order';

        add_meta_box(
            'woo_ach_batch_details',
            __( 'ACH Payment Details', 'woo-ach-batch' ),
            [ $this, 'render_order_meta_box' ],
            $screen,
            'side',
            'high'
        );
    }

    /**
     * Render ACH details meta box content
     *
     * @param WC_Order|\WP_Post $post_or_order Order object or post
     */
    public function render_order_meta_box( $post_or_order ): void {
        $order = $post_or_order instanceof WC_Order ? $post_or_order : wc_get_order( $post_or_order->ID );

        if ( ! $order || $order->get_payment_method() !== $this->id ) {
            echo '<p>' . esc_html__( 'This order was not paid via ACH.', 'woo-ach-batch' ) . '</p>';
            return;
        }

        $order_meta = \Nuwud\WooAchBatch\service( 'order_meta' );
        $verification = $order_meta->get_verification_status( $order );
        $authorization = $order_meta->get_authorization( $order );
        $batch_details = $order_meta->get_batch_details( $order );

        ?>
        <div class="ach-details">
            <p>
                <strong><?php esc_html_e( 'Account:', 'woo-ach-batch' ); ?></strong>
                <?php echo esc_html( ucfirst( $order->get_meta( '_ach_account_type' ) ) ); ?>
                ****<?php echo esc_html( $order->get_meta( '_ach_account_last4' ) ); ?>
            </p>

            <p>
                <strong><?php esc_html_e( 'Verification:', 'woo-ach-batch' ); ?></strong>
                <span class="ach-status ach-status-<?php echo esc_attr( $verification['status'] ); ?>">
                    <?php echo esc_html( ucfirst( str_replace( '_', ' ', $verification['status'] ) ) ); ?>
                </span>
            </p>

            <?php if ( $authorization ) : ?>
                <p>
                    <strong><?php esc_html_e( 'Authorized:', 'woo-ach-batch' ); ?></strong>
                    <?php echo esc_html( $authorization['timestamp'] ); ?>
                    <br />
                    <small>IP: <?php echo esc_html( $authorization['ip_address'] ); ?></small>
                </p>
            <?php endif; ?>

            <?php if ( $batch_details ) : ?>
                <hr />
                <p>
                    <strong><?php esc_html_e( 'Batch ID:', 'woo-ach-batch' ); ?></strong>
                    <?php echo esc_html( $batch_details['batch_id'] ); ?>
                </p>
                <p>
                    <strong><?php esc_html_e( 'Trace #:', 'woo-ach-batch' ); ?></strong>
                    <?php echo esc_html( $batch_details['trace_number'] ); ?>
                </p>
                <p>
                    <strong><?php esc_html_e( 'Exported:', 'woo-ach-batch' ); ?></strong>
                    <?php echo esc_html( $batch_details['exported_at'] ); ?>
                </p>
            <?php endif; ?>

            <?php if ( $verification['status'] === 'pending_manual' && current_user_can( 'verify_woo_ach_payments' ) ) : ?>
                <hr />
                <button type="button" class="button button-primary ach-verify-btn" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>">
                    <?php esc_html_e( 'Mark Verified', 'woo-ach-batch' ); ?>
                </button>
                <?php wp_nonce_field( 'ach_verify_order_' . $order->get_id(), 'ach_verify_nonce' ); ?>
            <?php endif; ?>
        </div>

        <style>
            .ach-status { padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
            .ach-status-verified { background: #c6e1c6; color: #5b841b; }
            .ach-status-pending_manual, .ach-status-pending { background: #f8dda7; color: #94660c; }
            .ach-status-failed { background: #eba3a3; color: #761919; }
        </style>

        <script>
        jQuery(function($) {
            $('.ach-verify-btn').on('click', function() {
                var $btn = $(this);
                var orderId = $btn.data('order-id');
                var nonce = $('#ach_verify_nonce').val();

                if (!confirm('<?php esc_html_e( 'Mark this ACH payment as verified?', 'woo-ach-batch' ); ?>')) {
                    return;
                }

                $btn.prop('disabled', true).text('<?php esc_html_e( 'Verifying...', 'woo-ach-batch' ); ?>');

                $.post(ajaxurl, {
                    action: 'woo_ach_batch_verify_order',
                    order_id: orderId,
                    nonce: nonce
                }, function(response) {
                    if (response.success) {
                        location.reload();
                    } else {
                        alert(response.data.message || '<?php esc_html_e( 'Verification failed.', 'woo-ach-batch' ); ?>');
                        $btn.prop('disabled', false).text('<?php esc_html_e( 'Mark Verified', 'woo-ach-batch' ); ?>');
                    }
                });
            });
        });
        </script>
        <?php
    }

    /**
     * Process refund
     *
     * @param int    $order_id Order ID
     * @param float  $amount   Refund amount
     * @param string $reason   Refund reason
     * @return bool|\WP_Error
     */
    public function process_refund( $order_id, $amount = null, $reason = '' ) {
        $order = wc_get_order( $order_id );

        if ( ! $order ) {
            return new \WP_Error( 'invalid_order', __( 'Order not found.', 'woo-ach-batch' ) );
        }

        // ACH refunds must be processed as credit entries in a future batch
        // For now, just add an order note - actual refund processing TODO
        $order->add_order_note(
            sprintf(
                /* translators: 1: refund amount, 2: reason */
                __( 'ACH refund of %1$s requested. Reason: %2$s. Refund will be processed in next batch.', 'woo-ach-batch' ),
                wc_price( $amount ),
                $reason ?: __( 'No reason provided', 'woo-ach-batch' )
            )
        );

        // TODO: Queue refund for next batch as credit entry
        $order->update_meta_data( '_ach_pending_refund', [
            'amount' => $amount,
            'reason' => $reason,
            'requested_at' => current_time( 'mysql' ),
        ]);
        $order->save();

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'ACH refund requested for order #%d: %s', $order_id, wc_price( $amount ) ),
            'info'
        );

        return true;
    }
}
