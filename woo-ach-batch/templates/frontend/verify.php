<?php
/**
 * ACH Verification Wizard Template
 *
 * Available variables:
 * - $order: WC_Order object
 * - $state: array with wizard state (current_step, bank, documents, verification)
 * - $this: VerificationWizard instance
 *
 * @package Nuwud\WooAchBatch\Templates
 */

defined( 'ABSPATH' ) || exit;

/** @var WC_Order $order */
/** @var array $state */
$order = $this->current_order;
$state = $state ?? $this->get_wizard_state( $order );
$current_step = $state['current_step'];
$is_token_access = $this->access_context['type'] === 'token';
?>

<div class="woo-ach-verify" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>">
    <?php if ( $is_token_access ) : ?>
    <input type="hidden" id="woo-ach-token" value="<?php echo esc_attr( $this->access_context['token'] ); ?>">
    <?php endif; ?>

    <!-- Progress Indicator -->
    <div class="woo-ach-verify__progress">
        <div class="woo-ach-verify__progress-step <?php echo $current_step >= 1 ? 'active' : ''; ?> <?php echo $current_step > 1 ? 'completed' : ''; ?>" data-step="1">
            <span class="step-number">1</span>
            <span class="step-label"><?php esc_html_e( 'Bank Info', 'woo-ach-batch' ); ?></span>
        </div>
        <div class="woo-ach-verify__progress-connector <?php echo $current_step > 1 ? 'completed' : ''; ?>"></div>
        <div class="woo-ach-verify__progress-step <?php echo $current_step >= 2 ? 'active' : ''; ?> <?php echo $current_step > 2 ? 'completed' : ''; ?>" data-step="2">
            <span class="step-number">2</span>
            <span class="step-label"><?php esc_html_e( 'Documents', 'woo-ach-batch' ); ?></span>
        </div>
        <div class="woo-ach-verify__progress-connector <?php echo $current_step > 2 ? 'completed' : ''; ?>"></div>
        <div class="woo-ach-verify__progress-step <?php echo $current_step >= 3 ? 'active' : ''; ?> <?php echo $current_step > 3 ? 'completed' : ''; ?>" data-step="3">
            <span class="step-number">3</span>
            <span class="step-label"><?php esc_html_e( 'Confirm', 'woo-ach-batch' ); ?></span>
        </div>
        <div class="woo-ach-verify__progress-connector <?php echo $current_step > 3 ? 'completed' : ''; ?>"></div>
        <div class="woo-ach-verify__progress-step <?php echo $current_step >= 4 ? 'active completed' : ''; ?>" data-step="4">
            <span class="step-number">✓</span>
            <span class="step-label"><?php esc_html_e( 'Done', 'woo-ach-batch' ); ?></span>
        </div>
    </div>

    <!-- Order Summary -->
    <div class="woo-ach-verify__order-summary">
        <h3><?php esc_html_e( 'Order Details', 'woo-ach-batch' ); ?></h3>
        <p>
            <?php printf(
                /* translators: %s: Order number */
                esc_html__( 'Order #%s', 'woo-ach-batch' ),
                esc_html( $state['order_number'] )
            ); ?>
            &bull;
            <?php echo wc_price( $state['order_total'] ); ?>
        </p>
    </div>

    <!-- Step 1: Bank Information -->
    <div class="woo-ach-verify__step" id="step-1" <?php echo $current_step !== 1 ? 'style="display:none;"' : ''; ?>>
        <div class="woo-ach-verify__step-header">
            <h2><?php esc_html_e( 'Bank Account Information', 'woo-ach-batch' ); ?></h2>
            <p><?php esc_html_e( 'Enter the bank account details for this ACH payment.', 'woo-ach-batch' ); ?></p>
        </div>

        <?php if ( $state['bank']['validated'] ) : ?>
            <div class="woo-ach-verify__success-message">
                <span class="dashicons dashicons-yes-alt"></span>
                <?php printf(
                    /* translators: %s: Last 4 digits of account */
                    esc_html__( 'Bank account ending in %s has been validated.', 'woo-ach-batch' ),
                    esc_html( $state['bank']['last4'] )
                ); ?>
            </div>
            <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--secondary" id="edit-bank-btn">
                <?php esc_html_e( 'Edit Bank Details', 'woo-ach-batch' ); ?>
            </button>
        <?php endif; ?>

        <form id="bank-form" class="woo-ach-verify__form" <?php echo $state['bank']['validated'] ? 'style="display:none;"' : ''; ?>>
            <div class="woo-ach-verify__form-row">
                <label for="holder_name"><?php esc_html_e( 'Account Holder Name', 'woo-ach-batch' ); ?> <span class="required">*</span></label>
                <input type="text" id="holder_name" name="holder_name" required
                       value="<?php echo esc_attr( $state['bank']['holder_name'] ?: $state['billing_name'] ); ?>"
                       placeholder="<?php esc_attr_e( 'Name as shown on account', 'woo-ach-batch' ); ?>">
                <span class="woo-ach-verify__field-error" data-field="holder_name"></span>
            </div>

            <div class="woo-ach-verify__form-row">
                <label for="routing"><?php esc_html_e( 'Routing Number', 'woo-ach-batch' ); ?> <span class="required">*</span></label>
                <input type="text" id="routing" name="routing" required
                       maxlength="9" pattern="[0-9]{9}" inputmode="numeric"
                       placeholder="<?php esc_attr_e( '9-digit routing number', 'woo-ach-batch' ); ?>">
                <span class="woo-ach-verify__field-error" data-field="routing"></span>
                <span class="woo-ach-verify__field-hint">
                    <?php esc_html_e( 'Find this on the bottom left of your checks', 'woo-ach-batch' ); ?>
                </span>
            </div>

            <div class="woo-ach-verify__form-row">
                <label for="account"><?php esc_html_e( 'Account Number', 'woo-ach-batch' ); ?> <span class="required">*</span></label>
                <input type="text" id="account" name="account" required
                       maxlength="17" pattern="[0-9]{4,17}" inputmode="numeric"
                       placeholder="<?php esc_attr_e( 'Your account number', 'woo-ach-batch' ); ?>">
                <span class="woo-ach-verify__field-error" data-field="account"></span>
            </div>

            <div class="woo-ach-verify__form-row">
                <label for="account_confirm"><?php esc_html_e( 'Confirm Account Number', 'woo-ach-batch' ); ?> <span class="required">*</span></label>
                <input type="text" id="account_confirm" name="account_confirm" required
                       maxlength="17" pattern="[0-9]{4,17}" inputmode="numeric"
                       placeholder="<?php esc_attr_e( 'Re-enter account number', 'woo-ach-batch' ); ?>">
                <span class="woo-ach-verify__field-error" data-field="account_confirm"></span>
            </div>

            <div class="woo-ach-verify__form-row">
                <label for="type"><?php esc_html_e( 'Account Type', 'woo-ach-batch' ); ?> <span class="required">*</span></label>
                <select id="type" name="type" required>
                    <option value="checking" <?php selected( $state['bank']['type'], 'checking' ); ?>>
                        <?php esc_html_e( 'Checking', 'woo-ach-batch' ); ?>
                    </option>
                    <option value="savings" <?php selected( $state['bank']['type'], 'savings' ); ?>>
                        <?php esc_html_e( 'Savings', 'woo-ach-batch' ); ?>
                    </option>
                </select>
            </div>

            <div class="woo-ach-verify__form-actions">
                <button type="submit" class="woo-ach-verify__btn woo-ach-verify__btn--primary" id="verify-bank-btn">
                    <span class="btn-text"><?php esc_html_e( 'Validate & Continue', 'woo-ach-batch' ); ?></span>
                    <span class="btn-loading" style="display:none;">
                        <span class="spinner"></span>
                        <?php esc_html_e( 'Validating...', 'woo-ach-batch' ); ?>
                    </span>
                </button>
            </div>
        </form>

        <?php if ( $state['bank']['validated'] ) : ?>
        <div class="woo-ach-verify__form-actions">
            <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--primary" id="continue-to-docs-btn">
                <?php esc_html_e( 'Continue to Documents', 'woo-ach-batch' ); ?>
            </button>
        </div>
        <?php endif; ?>
    </div>

    <!-- Step 2: Document Uploads -->
    <div class="woo-ach-verify__step" id="step-2" <?php echo $current_step !== 2 ? 'style="display:none;"' : ''; ?>>
        <div class="woo-ach-verify__step-header">
            <h2><?php esc_html_e( 'Verification Documents', 'woo-ach-batch' ); ?></h2>
            <p><?php esc_html_e( 'Please upload the following documents to verify your identity and bank account.', 'woo-ach-batch' ); ?></p>
        </div>

        <!-- Mobile Handoff Option (desktop only) -->
        <?php if ( ! wp_is_mobile() && ! $is_token_access ) : ?>
        <div class="woo-ach-verify__handoff-panel">
            <div class="woo-ach-verify__handoff-toggle">
                <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--secondary" id="show-handoff-btn">
                    <span class="dashicons dashicons-smartphone"></span>
                    <?php esc_html_e( 'Continue on Phone', 'woo-ach-batch' ); ?>
                </button>
                <span class="woo-ach-verify__handoff-hint">
                    <?php esc_html_e( 'Easier to take photos with your phone camera', 'woo-ach-batch' ); ?>
                </span>
            </div>

            <div class="woo-ach-verify__handoff-content" id="handoff-content" style="display:none;">
                <div class="woo-ach-verify__qr-container">
                    <div id="handoff-qr" class="woo-ach-verify__qr"></div>
                    <p class="woo-ach-verify__qr-instructions">
                        <?php esc_html_e( 'Scan this QR code with your phone camera', 'woo-ach-batch' ); ?>
                    </p>
                    <p class="woo-ach-verify__qr-timer">
                        <?php esc_html_e( 'Link expires in', 'woo-ach-batch' ); ?>
                        <span id="handoff-timer">30:00</span>
                    </p>
                </div>

                <div class="woo-ach-verify__handoff-or">
                    <span><?php esc_html_e( 'or', 'woo-ach-batch' ); ?></span>
                </div>

                <div class="woo-ach-verify__handoff-email">
                    <label for="handoff-email"><?php esc_html_e( 'Send link to email:', 'woo-ach-batch' ); ?></label>
                    <div class="woo-ach-verify__handoff-email-row">
                        <input type="email" id="handoff-email" placeholder="<?php esc_attr_e( 'your@email.com', 'woo-ach-batch' ); ?>"
                               value="<?php echo esc_attr( $order->get_billing_email() ); ?>">
                        <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--small" id="send-handoff-email-btn">
                            <?php esc_html_e( 'Send', 'woo-ach-batch' ); ?>
                        </button>
                    </div>
                </div>

                <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--link" id="hide-handoff-btn">
                    <?php esc_html_e( 'Continue on this device instead', 'woo-ach-batch' ); ?>
                </button>
            </div>
        </div>
        <?php endif; ?>

        <!-- Document Upload Grid -->
        <div class="woo-ach-verify__documents" id="documents-grid">
            <!-- ID Front -->
            <div class="woo-ach-verify__document-card <?php echo $state['documents']['id_front'] ? 'uploaded' : ''; ?>" data-type="id_front">
                <div class="woo-ach-verify__document-icon">
                    <?php if ( $state['documents']['id_front'] ) : ?>
                        <span class="dashicons dashicons-yes-alt"></span>
                    <?php else : ?>
                        <span class="dashicons dashicons-id"></span>
                    <?php endif; ?>
                </div>
                <h4><?php esc_html_e( 'Government ID (Front)', 'woo-ach-batch' ); ?></h4>
                <p><?php esc_html_e( 'Driver\'s license, passport, or state ID', 'woo-ach-batch' ); ?></p>

                <div class="woo-ach-verify__document-upload">
                    <input type="file" id="upload-id_front" accept="image/jpeg,image/png,application/pdf" capture="environment" style="display:none;">
                    <label for="upload-id_front" class="woo-ach-verify__upload-btn">
                        <span class="dashicons dashicons-camera"></span>
                        <span class="upload-text">
                            <?php echo $state['documents']['id_front']
                                ? esc_html__( 'Replace', 'woo-ach-batch' )
                                : esc_html__( 'Take Photo or Upload', 'woo-ach-batch' ); ?>
                        </span>
                    </label>
                    <div class="woo-ach-verify__upload-progress" style="display:none;">
                        <div class="progress-bar"><div class="progress-fill"></div></div>
                        <span class="progress-text"><?php esc_html_e( 'Uploading...', 'woo-ach-batch' ); ?></span>
                    </div>
                </div>
            </div>

            <!-- ID Back -->
            <div class="woo-ach-verify__document-card <?php echo $state['documents']['id_back'] ? 'uploaded' : ''; ?>" data-type="id_back">
                <div class="woo-ach-verify__document-icon">
                    <?php if ( $state['documents']['id_back'] ) : ?>
                        <span class="dashicons dashicons-yes-alt"></span>
                    <?php else : ?>
                        <span class="dashicons dashicons-id"></span>
                    <?php endif; ?>
                </div>
                <h4><?php esc_html_e( 'Government ID (Back)', 'woo-ach-batch' ); ?></h4>
                <p><?php esc_html_e( 'Back of your government-issued ID', 'woo-ach-batch' ); ?></p>

                <div class="woo-ach-verify__document-upload">
                    <input type="file" id="upload-id_back" accept="image/jpeg,image/png,application/pdf" capture="environment" style="display:none;">
                    <label for="upload-id_back" class="woo-ach-verify__upload-btn">
                        <span class="dashicons dashicons-camera"></span>
                        <span class="upload-text">
                            <?php echo $state['documents']['id_back']
                                ? esc_html__( 'Replace', 'woo-ach-batch' )
                                : esc_html__( 'Take Photo or Upload', 'woo-ach-batch' ); ?>
                        </span>
                    </label>
                    <div class="woo-ach-verify__upload-progress" style="display:none;">
                        <div class="progress-bar"><div class="progress-fill"></div></div>
                        <span class="progress-text"><?php esc_html_e( 'Uploading...', 'woo-ach-batch' ); ?></span>
                    </div>
                </div>
            </div>

            <!-- Voided Check / Bank Letter -->
            <div class="woo-ach-verify__document-card <?php echo $state['documents']['bank_proof'] ? 'uploaded' : ''; ?>" data-type="voided_check">
                <div class="woo-ach-verify__document-icon">
                    <?php if ( $state['documents']['bank_proof'] ) : ?>
                        <span class="dashicons dashicons-yes-alt"></span>
                    <?php else : ?>
                        <span class="dashicons dashicons-money-alt"></span>
                    <?php endif; ?>
                </div>
                <h4><?php esc_html_e( 'Voided Check', 'woo-ach-batch' ); ?></h4>
                <p><?php esc_html_e( 'Or a bank statement/verification letter', 'woo-ach-batch' ); ?></p>

                <div class="woo-ach-verify__document-upload">
                    <input type="file" id="upload-voided_check" accept="image/jpeg,image/png,application/pdf" capture="environment" style="display:none;">
                    <label for="upload-voided_check" class="woo-ach-verify__upload-btn">
                        <span class="dashicons dashicons-camera"></span>
                        <span class="upload-text">
                            <?php echo $state['documents']['bank_proof']
                                ? esc_html__( 'Replace', 'woo-ach-batch' )
                                : esc_html__( 'Take Photo or Upload', 'woo-ach-batch' ); ?>
                        </span>
                    </label>
                    <div class="woo-ach-verify__upload-progress" style="display:none;">
                        <div class="progress-bar"><div class="progress-fill"></div></div>
                        <span class="progress-text"><?php esc_html_e( 'Uploading...', 'woo-ach-batch' ); ?></span>
                    </div>
                </div>
            </div>
        </div>

        <div class="woo-ach-verify__form-actions">
            <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--secondary" id="back-to-bank-btn">
                <?php esc_html_e( '← Back', 'woo-ach-batch' ); ?>
            </button>
            <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--primary" id="continue-to-confirm-btn"
                    <?php echo ! $state['documents']['complete'] ? 'disabled' : ''; ?>>
                <?php esc_html_e( 'Continue to Review', 'woo-ach-batch' ); ?>
            </button>
        </div>
    </div>

    <!-- Step 3: Review & Confirm -->
    <div class="woo-ach-verify__step" id="step-3" <?php echo $current_step !== 3 ? 'style="display:none;"' : ''; ?>>
        <div class="woo-ach-verify__step-header">
            <h2><?php esc_html_e( 'Review & Submit', 'woo-ach-batch' ); ?></h2>
            <p><?php esc_html_e( 'Please review your information before submitting for verification.', 'woo-ach-batch' ); ?></p>
        </div>

        <div class="woo-ach-verify__review">
            <div class="woo-ach-verify__review-section">
                <h4><?php esc_html_e( 'Bank Account', 'woo-ach-batch' ); ?></h4>
                <dl>
                    <dt><?php esc_html_e( 'Account Type', 'woo-ach-batch' ); ?></dt>
                    <dd id="review-account-type"><?php echo esc_html( ucfirst( $state['bank']['type'] ) ); ?></dd>

                    <dt><?php esc_html_e( 'Account Ending', 'woo-ach-batch' ); ?></dt>
                    <dd id="review-account-last4">••••<?php echo esc_html( $state['bank']['last4'] ); ?></dd>
                </dl>
            </div>

            <div class="woo-ach-verify__review-section">
                <h4><?php esc_html_e( 'Documents', 'woo-ach-batch' ); ?></h4>
                <ul class="woo-ach-verify__review-docs">
                    <li class="<?php echo $state['documents']['id_front'] ? 'complete' : 'incomplete'; ?>">
                        <span class="dashicons <?php echo $state['documents']['id_front'] ? 'dashicons-yes' : 'dashicons-minus'; ?>"></span>
                        <?php esc_html_e( 'Government ID (Front)', 'woo-ach-batch' ); ?>
                    </li>
                    <li class="<?php echo $state['documents']['id_back'] ? 'complete' : 'incomplete'; ?>">
                        <span class="dashicons <?php echo $state['documents']['id_back'] ? 'dashicons-yes' : 'dashicons-minus'; ?>"></span>
                        <?php esc_html_e( 'Government ID (Back)', 'woo-ach-batch' ); ?>
                    </li>
                    <li class="<?php echo $state['documents']['bank_proof'] ? 'complete' : 'incomplete'; ?>">
                        <span class="dashicons <?php echo $state['documents']['bank_proof'] ? 'dashicons-yes' : 'dashicons-minus'; ?>"></span>
                        <?php esc_html_e( 'Bank Verification Document', 'woo-ach-batch' ); ?>
                    </li>
                </ul>
            </div>

            <div class="woo-ach-verify__review-section">
                <h4><?php esc_html_e( 'Order', 'woo-ach-batch' ); ?></h4>
                <dl>
                    <dt><?php esc_html_e( 'Order Number', 'woo-ach-batch' ); ?></dt>
                    <dd>#<?php echo esc_html( $state['order_number'] ); ?></dd>

                    <dt><?php esc_html_e( 'Amount', 'woo-ach-batch' ); ?></dt>
                    <dd><?php echo wc_price( $state['order_total'] ); ?></dd>
                </dl>
            </div>
        </div>

        <div class="woo-ach-verify__terms">
            <label>
                <input type="checkbox" id="accept-terms" required>
                <?php printf(
                    /* translators: %s: Terms link */
                    esc_html__( 'I authorize %s to debit my bank account for this order and certify that all information provided is accurate.', 'woo-ach-batch' ),
                    esc_html( get_bloginfo( 'name' ) )
                ); ?>
            </label>
        </div>

        <div class="woo-ach-verify__form-actions">
            <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--secondary" id="back-to-docs-btn">
                <?php esc_html_e( '← Back', 'woo-ach-batch' ); ?>
            </button>
            <button type="button" class="woo-ach-verify__btn woo-ach-verify__btn--primary woo-ach-verify__btn--large" id="submit-verification-btn" disabled>
                <span class="btn-text"><?php esc_html_e( 'Submit for Verification', 'woo-ach-batch' ); ?></span>
                <span class="btn-loading" style="display:none;">
                    <span class="spinner"></span>
                    <?php esc_html_e( 'Submitting...', 'woo-ach-batch' ); ?>
                </span>
            </button>
        </div>
    </div>

    <!-- Step 4: Success -->
    <div class="woo-ach-verify__step" id="step-4" <?php echo $current_step !== 4 ? 'style="display:none;"' : ''; ?>>
        <div class="woo-ach-verify__success">
            <div class="woo-ach-verify__success-icon">✓</div>
            <h2><?php esc_html_e( 'Verification Submitted!', 'woo-ach-batch' ); ?></h2>
            <p><?php esc_html_e( 'Thank you for completing the verification process. We will review your information and process your order shortly.', 'woo-ach-batch' ); ?></p>

            <?php if ( $state['verification']['status'] === 'verified' ) : ?>
                <div class="woo-ach-verify__verified-badge">
                    <span class="dashicons dashicons-yes-alt"></span>
                    <?php esc_html_e( 'Verified', 'woo-ach-batch' ); ?>
                </div>
            <?php elseif ( $state['verification']['is_pending_review'] ) : ?>
                <div class="woo-ach-verify__pending-badge">
                    <span class="dashicons dashicons-clock"></span>
                    <?php esc_html_e( 'Pending Review', 'woo-ach-batch' ); ?>
                </div>
                <p class="woo-ach-verify__review-time">
                    <?php esc_html_e( 'Reviews are typically completed within 1-2 business days.', 'woo-ach-batch' ); ?>
                </p>
            <?php endif; ?>

            <div class="woo-ach-verify__form-actions">
                <a href="<?php echo esc_url( wc_get_account_endpoint_url( 'orders' ) ); ?>" class="woo-ach-verify__btn woo-ach-verify__btn--primary">
                    <?php esc_html_e( 'View My Orders', 'woo-ach-batch' ); ?>
                </a>
            </div>
        </div>
    </div>

    <!-- Loading Overlay -->
    <div class="woo-ach-verify__loading" id="loading-overlay" style="display:none;">
        <div class="woo-ach-verify__loading-spinner"></div>
        <p id="loading-message"><?php esc_html_e( 'Please wait...', 'woo-ach-batch' ); ?></p>
    </div>
</div>
