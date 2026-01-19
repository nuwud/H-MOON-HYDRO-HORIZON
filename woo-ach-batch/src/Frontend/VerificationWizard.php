<?php
/**
 * ACH Verification Wizard Frontend Controller
 *
 * Handles the customer-facing verification wizard including:
 * - Bank account validation
 * - KYC document uploads
 * - Desktop-to-mobile handoff with QR codes
 * - Secure token-based access
 *
 * SECURITY:
 * - All endpoints require either logged-in order owner OR valid handoff token
 * - Rate-limited uploads and verification attempts
 * - No PII/bank numbers logged
 * - Files stored via PrivateStorage with deny rules
 *
 * @package Nuwud\WooAchBatch\Frontend
 */

namespace Nuwud\WooAchBatch\Frontend;

use Nuwud\WooAchBatch\Security\HandoffTokenService;
use Nuwud\WooAchBatch\Security\QrCodeGenerator;
use Nuwud\WooAchBatch\Security\RateLimiter;
use Nuwud\WooAchBatch\Security\AuditLog;
use Nuwud\WooAchBatch\Validation\BankValidator;
use Nuwud\WooAchBatch\Kyc\DocumentHandler;
use Nuwud\WooAchBatch\Order\OrderMeta;

/**
 * Frontend verification wizard controller
 */
class VerificationWizard {

    /**
     * My Account endpoint slug
     */
    public const ENDPOINT = 'ach-verify';

    /**
     * Services
     */
    private HandoffTokenService $token_service;
    private BankValidator $bank_validator;
    private DocumentHandler $document_handler;
    private OrderMeta $order_meta;
    private ?RateLimiter $rate_limiter = null;
    private ?AuditLog $audit_log = null;
    private ?QrCodeGenerator $qr_generator = null;

    /**
     * Current order being verified (set during request)
     */
    private ?\WC_Order $current_order = null;

    /**
     * Current access context (set during request)
     *
     * @var array{type: string, customer_id?: int, token?: string}
     */
    private array $access_context = [];

    /**
     * Constructor
     */
    public function __construct(
        HandoffTokenService $token_service,
        BankValidator $bank_validator,
        DocumentHandler $document_handler,
        OrderMeta $order_meta
    ) {
        $this->token_service = $token_service;
        $this->bank_validator = $bank_validator;
        $this->document_handler = $document_handler;
        $this->order_meta = $order_meta;
    }

    /**
     * Inject optional services
     */
    public function set_rate_limiter( RateLimiter $rate_limiter ): void {
        $this->rate_limiter = $rate_limiter;
    }

    public function set_audit_log( AuditLog $audit_log ): void {
        $this->audit_log = $audit_log;
    }

    public function set_qr_generator( QrCodeGenerator $qr_generator ): void {
        $this->qr_generator = $qr_generator;
    }

    /**
     * Initialize the wizard
     */
    public function init(): void {
        // Register My Account endpoint
        add_action( 'init', [ $this, 'register_endpoint' ] );
        add_filter( 'woocommerce_account_menu_items', [ $this, 'add_menu_item' ] );
        add_action( 'woocommerce_account_' . self::ENDPOINT . '_endpoint', [ $this, 'render_endpoint' ] );

        // Register shortcode
        add_shortcode( 'woo_ach_verify', [ $this, 'render_shortcode' ] );

        // Register AJAX handlers
        add_action( 'wp_ajax_woo_ach_verify_bank', [ $this, 'ajax_verify_bank' ] );
        add_action( 'wp_ajax_nopriv_woo_ach_verify_bank', [ $this, 'ajax_verify_bank_token' ] );

        add_action( 'wp_ajax_woo_ach_upload_document', [ $this, 'ajax_upload_document' ] );
        add_action( 'wp_ajax_nopriv_woo_ach_upload_document', [ $this, 'ajax_upload_document_token' ] );

        add_action( 'wp_ajax_woo_ach_complete_verification', [ $this, 'ajax_complete_verification' ] );
        add_action( 'wp_ajax_nopriv_woo_ach_complete_verification', [ $this, 'ajax_complete_verification_token' ] );

        add_action( 'wp_ajax_woo_ach_generate_handoff', [ $this, 'ajax_generate_handoff' ] );
        add_action( 'wp_ajax_woo_ach_send_handoff_email', [ $this, 'ajax_send_handoff_email' ] );

        add_action( 'wp_ajax_woo_ach_get_wizard_state', [ $this, 'ajax_get_wizard_state' ] );
        add_action( 'wp_ajax_nopriv_woo_ach_get_wizard_state', [ $this, 'ajax_get_wizard_state_token' ] );

        // Enqueue scripts
        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_scripts' ] );
    }

    /**
     * Register My Account endpoint
     */
    public function register_endpoint(): void {
        add_rewrite_endpoint( self::ENDPOINT, EP_ROOT | EP_PAGES );

        // Flush rewrite rules on plugin activation (not here)
    }

    /**
     * Add menu item to My Account
     */
    public function add_menu_item( array $items ): array {
        // Only show if customer has pending ACH orders
        if ( ! $this->customer_has_pending_verification() ) {
            return $items;
        }

        // Insert before logout
        $logout = $items['customer-logout'] ?? null;
        unset( $items['customer-logout'] );

        $items[ self::ENDPOINT ] = __( 'ACH Verification', 'woo-ach-batch' );

        if ( $logout ) {
            $items['customer-logout'] = $logout;
        }

        return $items;
    }

    /**
     * Check if current customer has pending verification orders
     */
    private function customer_has_pending_verification(): bool {
        if ( ! is_user_logged_in() ) {
            return false;
        }

        $orders = wc_get_orders([
            'customer_id' => get_current_user_id(),
            'status' => [ 'ach-pending-verify', 'pending' ],
            'payment_method' => 'ach_batch',
            'limit' => 1,
        ]);

        return ! empty( $orders );
    }

    /**
     * Enqueue frontend scripts and styles
     */
    public function enqueue_scripts(): void {
        // Only on relevant pages
        if ( ! $this->is_verification_page() ) {
            return;
        }

        wp_enqueue_style(
            'woo-ach-verify',
            plugins_url( 'assets/css/frontend-verify.css', WOO_ACH_BATCH_FILE ),
            [],
            WOO_ACH_BATCH_VERSION
        );

        wp_enqueue_script(
            'woo-ach-verify',
            plugins_url( 'assets/js/frontend-verify.js', WOO_ACH_BATCH_FILE ),
            [ 'jquery' ],
            WOO_ACH_BATCH_VERSION,
            true
        );

        wp_localize_script( 'woo-ach-verify', 'wooAchVerify', [
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce' => wp_create_nonce( 'woo_ach_verify' ),
            'token' => $this->get_current_token(),
            'orderId' => $this->get_current_order_id(),
            'i18n' => [
                'uploading' => __( 'Uploading...', 'woo-ach-batch' ),
                'validating' => __( 'Validating...', 'woo-ach-batch' ),
                'success' => __( 'Success!', 'woo-ach-batch' ),
                'error' => __( 'An error occurred. Please try again.', 'woo-ach-batch' ),
                'invalidRouting' => __( 'Please enter a valid 9-digit routing number.', 'woo-ach-batch' ),
                'invalidAccount' => __( 'Please enter a valid account number.', 'woo-ach-batch' ),
                'accountMismatch' => __( 'Account numbers do not match.', 'woo-ach-batch' ),
                'fileTooLarge' => __( 'File is too large. Maximum size is 10MB.', 'woo-ach-batch' ),
                'invalidFileType' => __( 'Invalid file type. Please upload JPG, PNG, or PDF.', 'woo-ach-batch' ),
                'cameraError' => __( 'Could not access camera. Please upload a file instead.', 'woo-ach-batch' ),
                'scanQrCode' => __( 'Scan this QR code with your phone to continue', 'woo-ach-batch' ),
                'linkExpires' => __( 'Link expires in', 'woo-ach-batch' ),
                'minutes' => __( 'minutes', 'woo-ach-batch' ),
            ],
            'documentTypes' => [
                'id_front' => __( 'Government ID (Front)', 'woo-ach-batch' ),
                'id_back' => __( 'Government ID (Back)', 'woo-ach-batch' ),
                'voided_check' => __( 'Voided Check or Bank Letter', 'woo-ach-batch' ),
            ],
            'maxFileSize' => 10 * 1024 * 1024, // 10MB
            'allowedTypes' => [ 'image/jpeg', 'image/png', 'application/pdf' ],
        ]);
    }

    /**
     * Check if current page is verification page
     */
    private function is_verification_page(): bool {
        global $wp_query;

        // My Account endpoint
        if ( isset( $wp_query->query_vars[ self::ENDPOINT ] ) ) {
            return true;
        }

        // Shortcode detection (check if post contains shortcode)
        if ( is_singular() ) {
            global $post;
            if ( has_shortcode( $post->post_content ?? '', 'woo_ach_verify' ) ) {
                return true;
            }
        }

        // Token access
        if ( isset( $_GET['t'] ) && strlen( $_GET['t'] ) === 64 ) {
            return true;
        }

        return false;
    }

    /**
     * Get current token from request
     */
    private function get_current_token(): string {
        return isset( $_GET['t'] ) ? preg_replace( '/[^a-f0-9]/i', '', $_GET['t'] ) : '';
    }

    /**
     * Get current order ID from request or token
     */
    private function get_current_order_id(): int {
        // From direct parameter (logged-in users)
        if ( isset( $_GET['order'] ) ) {
            return absint( $_GET['order'] );
        }

        // From token
        $token = $this->get_current_token();
        if ( $token ) {
            $validation = $this->token_service->validate( $token );
            if ( $validation['valid'] ) {
                return $validation['order_id'];
            }
        }

        return 0;
    }

    /**
     * Render My Account endpoint content
     */
    public function render_endpoint(): void {
        $this->render_wizard();
    }

    /**
     * Render shortcode
     */
    public function render_shortcode( array $atts = [] ): string {
        ob_start();
        $this->render_wizard();
        return ob_get_clean();
    }

    /**
     * Render the verification wizard
     */
    private function render_wizard(): void {
        // Determine access method and order
        $access = $this->determine_access();

        if ( ! $access['valid'] ) {
            $this->render_error( $access['error'] ?? __( 'Access denied.', 'woo-ach-batch' ) );
            return;
        }

        $this->current_order = $access['order'];
        $this->access_context = $access['context'];

        // Get wizard state
        $state = $this->get_wizard_state( $this->current_order );

        // Load template
        $template_path = WOO_ACH_BATCH_PATH . 'templates/frontend/verify.php';

        if ( file_exists( $template_path ) ) {
            include $template_path;
        } else {
            $this->render_error( __( 'Template not found.', 'woo-ach-batch' ) );
        }
    }

    /**
     * Determine access method and validate
     *
     * @return array{valid: bool, order?: \WC_Order, context?: array, error?: string}
     */
    private function determine_access(): array {
        // Method 1: Token-based access
        $token = $this->get_current_token();
        if ( $token ) {
            $validation = $this->token_service->validate( $token );

            if ( ! $validation['valid'] ) {
                return [
                    'valid' => false,
                    'error' => $validation['error'],
                ];
            }

            $order = wc_get_order( $validation['order_id'] );
            if ( ! $order ) {
                return [
                    'valid' => false,
                    'error' => __( 'Order not found.', 'woo-ach-batch' ),
                ];
            }

            return [
                'valid' => true,
                'order' => $order,
                'context' => [
                    'type' => 'token',
                    'token' => $token,
                ],
            ];
        }

        // Method 2: Logged-in user with order ownership
        if ( ! is_user_logged_in() ) {
            return [
                'valid' => false,
                'error' => __( 'Please log in to continue.', 'woo-ach-batch' ),
            ];
        }

        $customer_id = get_current_user_id();
        $order_id = isset( $_GET['order'] ) ? absint( $_GET['order'] ) : 0;

        // If no order specified, get the most recent pending verification order
        if ( ! $order_id ) {
            $orders = wc_get_orders([
                'customer_id' => $customer_id,
                'status' => [ 'ach-pending-verify', 'pending' ],
                'payment_method' => 'ach_batch',
                'limit' => 1,
                'orderby' => 'date',
                'order' => 'DESC',
            ]);

            if ( empty( $orders ) ) {
                return [
                    'valid' => false,
                    'error' => __( 'No orders requiring verification.', 'woo-ach-batch' ),
                ];
            }

            $order = $orders[0];
        } else {
            $order = wc_get_order( $order_id );
        }

        if ( ! $order ) {
            return [
                'valid' => false,
                'error' => __( 'Order not found.', 'woo-ach-batch' ),
            ];
        }

        // Verify ownership
        if ( (int) $order->get_customer_id() !== $customer_id ) {
            return [
                'valid' => false,
                'error' => __( 'You do not have permission to verify this order.', 'woo-ach-batch' ),
            ];
        }

        return [
            'valid' => true,
            'order' => $order,
            'context' => [
                'type' => 'logged_in',
                'customer_id' => $customer_id,
            ],
        ];
    }

    /**
     * Get current wizard state for an order
     */
    public function get_wizard_state( \WC_Order $order ): array {
        $order_id = $order->get_id();

        // Bank validation status
        $bank_details = $this->order_meta->get_bank_details( $order );
        $bank_validated = ! empty( $bank_details ) && ! empty( $bank_details['routing'] );

        // Document upload status
        $kyc_docs = $this->document_handler->get_documents( $order->get_customer_id() );
        $order_docs = array_filter( $kyc_docs, function( $doc ) use ( $order_id ) {
            return ( $doc['order_id'] ?? 0 ) === $order_id;
        });

        $has_id_front = false;
        $has_id_back = false;
        $has_bank_proof = false;

        foreach ( $order_docs as $doc ) {
            switch ( $doc['type'] ?? '' ) {
                case 'id_front':
                    $has_id_front = true;
                    break;
                case 'id_back':
                    $has_id_back = true;
                    break;
                case 'voided_check':
                case 'bank_statement':
                    $has_bank_proof = true;
                    break;
            }
        }

        $docs_complete = $has_id_front && $has_id_back && $has_bank_proof;

        // Overall status
        $verification_status = $order->get_meta( '_ach_verification_status' );
        $is_verified = $verification_status === 'verified';
        $is_pending = in_array( $verification_status, [ 'pending', 'pending_review' ], true );

        // Determine current step
        $current_step = 1;
        if ( $bank_validated ) {
            $current_step = 2;
        }
        if ( $bank_validated && $docs_complete ) {
            $current_step = 3;
        }
        if ( $is_verified ) {
            $current_step = 4;
        }

        return [
            'order_id' => $order_id,
            'order_number' => $order->get_order_number(),
            'order_total' => $order->get_total(),
            'current_step' => $current_step,
            'bank' => [
                'validated' => $bank_validated,
                'last4' => $bank_details['last4'] ?? '',
                'type' => $bank_details['type'] ?? 'checking',
                'holder_name' => $order->get_meta( '_ach_account_holder_name' ) ?: '',
            ],
            'documents' => [
                'id_front' => $has_id_front,
                'id_back' => $has_id_back,
                'bank_proof' => $has_bank_proof,
                'complete' => $docs_complete,
            ],
            'verification' => [
                'status' => $verification_status ?: 'pending',
                'is_verified' => $is_verified,
                'is_pending_review' => $is_pending,
            ],
            'billing_name' => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ),
        ];
    }

    /**
     * Render error message
     */
    private function render_error( string $message ): void {
        ?>
        <div class="woo-ach-verify-error">
            <div class="woo-ach-verify-error__icon">⚠️</div>
            <h2><?php esc_html_e( 'Verification Error', 'woo-ach-batch' ); ?></h2>
            <p><?php echo esc_html( $message ); ?></p>
            <?php if ( ! is_user_logged_in() ) : ?>
                <p>
                    <a href="<?php echo esc_url( wc_get_page_permalink( 'myaccount' ) ); ?>" class="button">
                        <?php esc_html_e( 'Log In', 'woo-ach-batch' ); ?>
                    </a>
                </p>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * AJAX: Verify bank details (logged-in users)
     */
    public function ajax_verify_bank(): void {
        $this->handle_verify_bank( false );
    }

    /**
     * AJAX: Verify bank details (token access)
     */
    public function ajax_verify_bank_token(): void {
        $this->handle_verify_bank( true );
    }

    /**
     * Handle bank verification
     */
    private function handle_verify_bank( bool $require_token ): void {
        // Verify access
        $access = $this->verify_ajax_access( $require_token );
        if ( ! $access['valid'] ) {
            wp_send_json_error( [ 'message' => $access['error'] ] );
        }

        $order = $access['order'];

        // Rate limiting
        if ( $this->rate_limiter ) {
            $identifier = $require_token ? 'token_' . substr( $_POST['token'] ?? '', 0, 16 ) : 'user_' . get_current_user_id();
            $check = $this->rate_limiter->check( 'bank_verify', $identifier, 10, 3600 );

            if ( ! $check['allowed'] ) {
                wp_send_json_error( [
                    'message' => __( 'Too many attempts. Please wait before trying again.', 'woo-ach-batch' ),
                    'code' => 'rate_limited',
                ]);
            }
        }

        // Validate bank details
        $validation = $this->bank_validator->validate([
            'routing' => $_POST['routing'] ?? '',
            'account' => $_POST['account'] ?? '',
            'account_confirm' => $_POST['account_confirm'] ?? '',
            'type' => $_POST['type'] ?? 'checking',
            'holder_name' => $_POST['holder_name'] ?? '',
        ]);

        if ( ! $validation['valid'] ) {
            wp_send_json_error( [
                'message' => __( 'Please correct the errors below.', 'woo-ach-batch' ),
                'errors' => $validation['errors'],
            ]);
        }

        // Save bank details (encrypted)
        $bank_data = $validation['sanitized'];
        $saved = $this->order_meta->save_bank_details( $order, [
            'routing' => $bank_data['routing'],
            'account' => $bank_data['account'],
            'type' => $bank_data['type'],
        ]);

        if ( ! $saved ) {
            wp_send_json_error( [
                'message' => __( 'Failed to save bank details. Please try again.', 'woo-ach-batch' ),
            ]);
        }

        // Save holder name
        $order->update_meta_data( '_ach_account_holder_name', $bank_data['holder_name'] );
        $order->save();

        // Audit log (no sensitive data)
        if ( $this->audit_log ) {
            $this->audit_log->log( 'bank_details_submitted', 'order', $order->get_id(), [
                'type' => $bank_data['type'],
                'last4' => $bank_data['account_last4'],
            ]);
        }

        wp_send_json_success([
            'message' => __( 'Bank details validated successfully.', 'woo-ach-batch' ),
            'last4' => $bank_data['account_last4'],
            'next_step' => 2,
        ]);
    }

    /**
     * AJAX: Upload document (logged-in users)
     */
    public function ajax_upload_document(): void {
        $this->handle_upload_document( false );
    }

    /**
     * AJAX: Upload document (token access)
     */
    public function ajax_upload_document_token(): void {
        $this->handle_upload_document( true );
    }

    /**
     * Handle document upload
     */
    private function handle_upload_document( bool $require_token ): void {
        // Verify access
        $access = $this->verify_ajax_access( $require_token );
        if ( ! $access['valid'] ) {
            wp_send_json_error( [ 'message' => $access['error'] ] );
        }

        $order = $access['order'];

        // Validate document type
        $doc_type = sanitize_key( $_POST['document_type'] ?? '' );
        $allowed_types = [ 'id_front', 'id_back', 'voided_check' ];

        if ( ! in_array( $doc_type, $allowed_types, true ) ) {
            wp_send_json_error( [ 'message' => __( 'Invalid document type.', 'woo-ach-batch' ) ] );
        }

        // Check file upload
        if ( ! isset( $_FILES['document'] ) ) {
            wp_send_json_error( [ 'message' => __( 'No file uploaded.', 'woo-ach-batch' ) ] );
        }

        // Upload via DocumentHandler
        $result = $this->document_handler->upload(
            $order->get_customer_id(),
            $doc_type,
            $_FILES['document'],
            [ 'order_id' => $order->get_id() ]
        );

        if ( ! $result['success'] ) {
            wp_send_json_error( [ 'message' => $result['message'] ] );
        }

        wp_send_json_success([
            'message' => __( 'Document uploaded successfully.', 'woo-ach-batch' ),
            'document_id' => $result['document_id'],
            'document_type' => $doc_type,
        ]);
    }

    /**
     * AJAX: Complete verification (logged-in users)
     */
    public function ajax_complete_verification(): void {
        $this->handle_complete_verification( false );
    }

    /**
     * AJAX: Complete verification (token access)
     */
    public function ajax_complete_verification_token(): void {
        $this->handle_complete_verification( true );
    }

    /**
     * Handle verification completion
     */
    private function handle_complete_verification( bool $require_token ): void {
        // Verify access
        $access = $this->verify_ajax_access( $require_token );
        if ( ! $access['valid'] ) {
            wp_send_json_error( [ 'message' => $access['error'] ] );
        }

        $order = $access['order'];
        $state = $this->get_wizard_state( $order );

        // Verify all steps completed
        if ( ! $state['bank']['validated'] ) {
            wp_send_json_error( [ 'message' => __( 'Please complete bank verification first.', 'woo-ach-batch' ) ] );
        }

        if ( ! $state['documents']['complete'] ) {
            wp_send_json_error( [ 'message' => __( 'Please upload all required documents.', 'woo-ach-batch' ) ] );
        }

        // Update order status to pending review
        $order->update_meta_data( '_ach_verification_status', 'pending_review' );
        $order->update_meta_data( '_ach_verification_submitted_at', current_time( 'mysql' ) );
        $order->set_status( 'ach-pending-review', __( 'Verification documents submitted for review.', 'woo-ach-batch' ) );
        $order->save();

        // Consume token if used
        if ( $require_token && ! empty( $_POST['token'] ) ) {
            $this->token_service->consume( $_POST['token'] );
        }

        // Audit log
        if ( $this->audit_log ) {
            $this->audit_log->log( 'verification_submitted', 'order', $order->get_id(), [
                'access_method' => $require_token ? 'token' : 'logged_in',
            ]);
        }

        // Send admin notification
        do_action( 'woo_ach_verification_submitted', $order );

        wp_send_json_success([
            'message' => __( 'Verification submitted successfully! We will review your information shortly.', 'woo-ach-batch' ),
            'redirect' => wc_get_account_endpoint_url( 'orders' ),
        ]);
    }

    /**
     * AJAX: Generate handoff token and QR code
     */
    public function ajax_generate_handoff(): void {
        // Must be logged in
        check_ajax_referer( 'woo_ach_verify', 'nonce' );

        if ( ! is_user_logged_in() ) {
            wp_send_json_error( [ 'message' => __( 'Please log in.', 'woo-ach-batch' ) ] );
        }

        $order_id = absint( $_POST['order_id'] ?? 0 );
        $order = wc_get_order( $order_id );

        if ( ! $order || (int) $order->get_customer_id() !== get_current_user_id() ) {
            wp_send_json_error( [ 'message' => __( 'Invalid order.', 'woo-ach-batch' ) ] );
        }

        // Generate token
        $result = $this->token_service->generate( $order_id, get_current_user_id() );

        if ( ! $result['success'] ) {
            wp_send_json_error( [ 'message' => $result['error'] ] );
        }

        // Generate QR code
        $url = $this->token_service->get_verification_url( $result['token'] );

        $qr_generator = $this->qr_generator ?? new QrCodeGenerator();
        $qr_svg = $qr_generator->generate( $url, 200 );

        wp_send_json_success([
            'token' => $result['token'],
            'url' => $url,
            'qr_svg' => $qr_svg,
            'expires' => $result['expires'],
            'expires_in' => $result['expires'] - time(),
            'ttl_display' => $this->token_service->get_ttl_display(),
        ]);
    }

    /**
     * AJAX: Send handoff email
     */
    public function ajax_send_handoff_email(): void {
        check_ajax_referer( 'woo_ach_verify', 'nonce' );

        if ( ! is_user_logged_in() ) {
            wp_send_json_error( [ 'message' => __( 'Please log in.', 'woo-ach-batch' ) ] );
        }

        $order_id = absint( $_POST['order_id'] ?? 0 );
        $email = sanitize_email( $_POST['email'] ?? '' );
        $token = sanitize_text_field( $_POST['token'] ?? '' );

        if ( ! is_email( $email ) ) {
            wp_send_json_error( [ 'message' => __( 'Please enter a valid email address.', 'woo-ach-batch' ) ] );
        }

        $order = wc_get_order( $order_id );
        if ( ! $order || (int) $order->get_customer_id() !== get_current_user_id() ) {
            wp_send_json_error( [ 'message' => __( 'Invalid order.', 'woo-ach-batch' ) ] );
        }

        // Validate token is still valid
        $validation = $this->token_service->validate( $token );
        if ( ! $validation['valid'] ) {
            wp_send_json_error( [ 'message' => __( 'Token expired. Please generate a new QR code.', 'woo-ach-batch' ) ] );
        }

        // Send email
        $url = $this->token_service->get_verification_url( $token );
        $site_name = get_bloginfo( 'name' );

        $subject = sprintf(
            /* translators: %s: Site name */
            __( '[%s] Complete Your ACH Verification', 'woo-ach-batch' ),
            $site_name
        );

        $message = sprintf(
            /* translators: 1: Site name, 2: Verification URL, 3: TTL display */
            __(
                "Complete your ACH verification for %1\$s.\n\n" .
                "Click the link below to continue on your mobile device:\n\n" .
                "%2\$s\n\n" .
                "This link expires in %3\$s and can only be used once.\n\n" .
                "If you did not request this, please ignore this email.",
                'woo-ach-batch'
            ),
            $site_name,
            $url,
            $this->token_service->get_ttl_display()
        );

        $sent = wp_mail( $email, $subject, $message );

        if ( ! $sent ) {
            wp_send_json_error( [ 'message' => __( 'Failed to send email. Please try again.', 'woo-ach-batch' ) ] );
        }

        // Audit log (email address only, not the token)
        if ( $this->audit_log ) {
            $this->audit_log->log( 'handoff_email_sent', 'order', $order_id, [
                'email_domain' => substr( strrchr( $email, '@' ), 1 ),
            ]);
        }

        wp_send_json_success([
            'message' => sprintf(
                /* translators: %s: Email address */
                __( 'Verification link sent to %s', 'woo-ach-batch' ),
                $email
            ),
        ]);
    }

    /**
     * AJAX: Get wizard state (logged-in)
     */
    public function ajax_get_wizard_state(): void {
        $this->handle_get_wizard_state( false );
    }

    /**
     * AJAX: Get wizard state (token)
     */
    public function ajax_get_wizard_state_token(): void {
        $this->handle_get_wizard_state( true );
    }

    /**
     * Handle get wizard state
     */
    private function handle_get_wizard_state( bool $require_token ): void {
        $access = $this->verify_ajax_access( $require_token );
        if ( ! $access['valid'] ) {
            wp_send_json_error( [ 'message' => $access['error'] ] );
        }

        $state = $this->get_wizard_state( $access['order'] );
        wp_send_json_success( $state );
    }

    /**
     * Verify AJAX access
     *
     * @return array{valid: bool, order?: \WC_Order, error?: string}
     */
    private function verify_ajax_access( bool $require_token ): array {
        if ( $require_token ) {
            // Token-based access
            $token = sanitize_text_field( $_POST['token'] ?? '' );

            if ( empty( $token ) ) {
                return [
                    'valid' => false,
                    'error' => __( 'Missing access token.', 'woo-ach-batch' ),
                ];
            }

            $validation = $this->token_service->validate( $token );

            if ( ! $validation['valid'] ) {
                return [
                    'valid' => false,
                    'error' => $validation['error'],
                ];
            }

            $order = wc_get_order( $validation['order_id'] );

            if ( ! $order ) {
                return [
                    'valid' => false,
                    'error' => __( 'Order not found.', 'woo-ach-batch' ),
                ];
            }

            return [
                'valid' => true,
                'order' => $order,
            ];
        }

        // Logged-in access
        check_ajax_referer( 'woo_ach_verify', 'nonce' );

        if ( ! is_user_logged_in() ) {
            return [
                'valid' => false,
                'error' => __( 'Please log in.', 'woo-ach-batch' ),
            ];
        }

        $order_id = absint( $_POST['order_id'] ?? 0 );
        $order = wc_get_order( $order_id );

        if ( ! $order ) {
            return [
                'valid' => false,
                'error' => __( 'Order not found.', 'woo-ach-batch' ),
            ];
        }

        if ( (int) $order->get_customer_id() !== get_current_user_id() ) {
            return [
                'valid' => false,
                'error' => __( 'You do not have permission to access this order.', 'woo-ach-batch' ),
            ];
        }

        return [
            'valid' => true,
            'order' => $order,
        ];
    }
}
