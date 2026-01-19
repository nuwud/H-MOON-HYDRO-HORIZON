<?php
/**
 * KYC Document Handler
 *
 * Handles secure storage and management of KYC verification documents.
 *
 * SECURITY REQUIREMENTS:
 * - All KYC files stored in PrivateStorage (protected directory with .htaccess deny)
 * - Permission checks on file retrieval (admin only)
 * - Rate limiting on upload endpoints to prevent abuse
 * - Secure deletion with file overwrite before unlink
 * - Audit logging of all document operations
 * - NO unauthenticated upload endpoints
 *
 * @package Nuwud\WooAchBatch\Kyc
 */

namespace Nuwud\WooAchBatch\Kyc;

use Nuwud\WooAchBatch\Security\RateLimiter;
use Nuwud\WooAchBatch\Security\AuditLog;
use Nuwud\WooAchBatch\Security\PrivateStorage;

/**
 * Handles KYC (Know Your Customer) document uploads and verification
 */
class DocumentHandler {

    /**
     * Rate limiter for upload protection
     */
    private ?RateLimiter $rate_limiter = null;

    /**
     * Audit log for document operations
     */
    private ?AuditLog $audit_log = null;

    /**
     * Private storage for secure file handling
     */
    private ?PrivateStorage $private_storage = null;

    /**
     * Rate limit: max uploads per window
     */
    private const UPLOAD_RATE_LIMIT = 10;

    /**
     * Rate limit: window in seconds (1 hour)
     */
    private const UPLOAD_RATE_WINDOW = 3600;

    /**
     * Allowed document types
     *
     * @var array
     */
    private const ALLOWED_MIME_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
    ];

    /**
     * Max file size in bytes (10MB)
     *
     * @var int
     */
    private const MAX_FILE_SIZE = 10 * 1024 * 1024;

    /**
     * Document types
     *
     * @var array<string, string>
     */
    public const DOCUMENT_TYPES = [
        'id_front' => 'Government ID (Front)',
        'id_back' => 'Government ID (Back)',
        'bank_statement' => 'Bank Statement',
        'voided_check' => 'Voided Check',
        'utility_bill' => 'Utility Bill (Address Verification)',
        'business_license' => 'Business License',
        'tax_document' => 'Tax Document (W-9/W-8BEN)',
        'other' => 'Other Document',
    ];

    /**
     * Initialize KYC handling
     *
     * SECURITY: Only authenticated admin AJAX endpoint is registered.
     * No unauthenticated (nopriv) upload handlers allowed.
     */
    public function init(): void {
        add_action( 'admin_post_woo_ach_upload_kyc', [ $this, 'handle_admin_upload' ] );
        add_action( 'wp_ajax_woo_ach_upload_kyc', [ $this, 'handle_ajax_upload' ] );
        // SECURITY: REMOVED - No unauthenticated uploads allowed
        // add_action( 'wp_ajax_nopriv_woo_ach_upload_kyc', [ $this, 'handle_ajax_upload' ] );
        add_action( 'wp_ajax_woo_ach_delete_kyc', [ $this, 'handle_delete' ] );
        add_action( 'wp_ajax_woo_ach_download_kyc', [ $this, 'handle_secure_download' ] );
    }

    /**
     * Inject rate limiter (for testability and DI)
     *
     * @param RateLimiter $rate_limiter Rate limiter instance
     */
    public function set_rate_limiter( RateLimiter $rate_limiter ): void {
        $this->rate_limiter = $rate_limiter;
    }

    /**
     * Inject audit log (for testability and DI)
     *
     * @param AuditLog $audit_log Audit log instance
     */
    public function set_audit_log( AuditLog $audit_log ): void {
        $this->audit_log = $audit_log;
    }

    /**
     * Inject private storage (for testability and DI)
     *
     * @param PrivateStorage $private_storage Private storage instance
     */
    public function set_private_storage( PrivateStorage $private_storage ): void {
        $this->private_storage = $private_storage;
    }

    /**
     * Get private storage (lazy load from container if not injected)
     *
     * @return PrivateStorage
     */
    private function get_private_storage(): PrivateStorage {
        if ( null === $this->private_storage ) {
            try {
                $this->private_storage = \Nuwud\WooAchBatch\service( 'private_storage' );
            } catch ( \Exception $e ) {
                // Fallback: create instance directly
                $this->private_storage = new PrivateStorage();
            }
        }
        return $this->private_storage;
    }

    /**
     * Get rate limiter (lazy load from container if not injected)
     *
     * @return RateLimiter|null
     */
    private function get_rate_limiter(): ?RateLimiter {
        if ( null === $this->rate_limiter ) {
            try {
                $this->rate_limiter = \Nuwud\WooAchBatch\service( 'rate_limiter' );
            } catch ( \Exception $e ) {
                // Rate limiter not available - continue without it
                return null;
            }
        }
        return $this->rate_limiter;
    }

    /**
     * Get audit log (lazy load from container if not injected)
     *
     * @return AuditLog|null
     */
    private function get_audit_log(): ?AuditLog {
        if ( null === $this->audit_log ) {
            try {
                $this->audit_log = \Nuwud\WooAchBatch\service( 'audit_log' );
            } catch ( \Exception $e ) {
                return null;
            }
        }
        return $this->audit_log;
    }

    /**
     * Get the secure storage path for KYC documents
     *
     * Uses PrivateStorage which provides:
     * - .htaccess "Deny from all" protection
     * - 0600 file permissions
     * - index.php to prevent directory listing
     *
     * @return string
     */
    public function get_storage_path(): string {
        return $this->get_private_storage()->get_directory( PrivateStorage::STORAGE_KYC );
    }

    /**
     * Upload a KYC document
     *
     * @param int    $customer_id   Customer ID
     * @param string $document_type Document type (from DOCUMENT_TYPES)
     * @param array  $file          $_FILES array element
     * @return array{success: bool, message: string, document_id?: string}
     */
    public function upload( int $customer_id, string $document_type, array $file ): array {
        // Validate document type
        if ( ! isset( self::DOCUMENT_TYPES[ $document_type ] ) ) {
            return [
                'success' => false,
                'message' => __( 'Invalid document type.', 'woo-ach-batch' ),
            ];
        }

        // Check for upload errors
        if ( $file['error'] !== UPLOAD_ERR_OK ) {
            return [
                'success' => false,
                'message' => $this->get_upload_error_message( $file['error'] ),
            ];
        }

        // Validate file size
        if ( $file['size'] > self::MAX_FILE_SIZE ) {
            return [
                'success' => false,
                'message' => sprintf(
                    __( 'File too large. Maximum size is %s MB.', 'woo-ach-batch' ),
                    self::MAX_FILE_SIZE / 1024 / 1024
                ),
            ];
        }

        // Validate MIME type
        $finfo = new \finfo( FILEINFO_MIME_TYPE );
        $mime_type = $finfo->file( $file['tmp_name'] );

        if ( ! in_array( $mime_type, self::ALLOWED_MIME_TYPES, true ) ) {
            return [
                'success' => false,
                'message' => __( 'Invalid file type. Please upload PDF, JPEG, PNG, or GIF.', 'woo-ach-batch' ),
            ];
        }

        // Generate secure filename
        $document_id = wp_generate_uuid4();
        $extension = $this->get_extension_for_mime( $mime_type );
        $filename = sprintf( '%d_%s_%s.%s', $customer_id, $document_type, $document_id, $extension );

        // Move to secure location
        $destination = $this->get_storage_path() . '/' . $filename;

        if ( ! move_uploaded_file( $file['tmp_name'], $destination ) ) {
            return [
                'success' => false,
                'message' => __( 'Failed to save document. Please try again.', 'woo-ach-batch' ),
            ];
        }

        // Set secure permissions
        chmod( $destination, 0600 );

        // Store document metadata
        $this->save_document_meta( $customer_id, $document_id, [
            'type' => $document_type,
            'filename' => $filename,
            'original_name' => sanitize_file_name( $file['name'] ),
            'mime_type' => $mime_type,
            'size' => $file['size'],
            'uploaded_at' => time(),
            'uploaded_by' => get_current_user_id(),
            'status' => 'pending_review',
        ] );

        // Audit log
        \Nuwud\WooAchBatch\service( 'audit_log' )->log(
            'kyc_upload',
            'KYC document uploaded',
            [
                'customer_id' => $customer_id,
                'document_type' => $document_type,
                'document_id' => $document_id,
            ]
        );

        return [
            'success' => true,
            'message' => __( 'Document uploaded successfully.', 'woo-ach-batch' ),
            'document_id' => $document_id,
        ];
    }

    /**
     * Get documents for a customer
     *
     * @param int $customer_id Customer ID
     * @return array
     */
    public function get_documents( int $customer_id ): array {
        $documents = get_user_meta( $customer_id, '_woo_ach_kyc_documents', true );

        return is_array( $documents ) ? $documents : [];
    }

    /**
     * Get a specific document
     *
     * @param int    $customer_id Customer ID
     * @param string $document_id Document ID
     * @return array|null
     */
    public function get_document( int $customer_id, string $document_id ): ?array {
        $documents = $this->get_documents( $customer_id );

        return $documents[ $document_id ] ?? null;
    }

    /**
     * Update document status
     *
     * @param int    $customer_id Customer ID
     * @param string $document_id Document ID
     * @param string $status      New status (pending_review, approved, rejected)
     * @param string $note        Optional note
     * @return bool
     */
    public function update_status( int $customer_id, string $document_id, string $status, string $note = '' ): bool {
        $documents = $this->get_documents( $customer_id );

        if ( ! isset( $documents[ $document_id ] ) ) {
            return false;
        }

        $documents[ $document_id ]['status'] = $status;
        $documents[ $document_id ]['status_updated_at'] = time();
        $documents[ $document_id ]['status_updated_by'] = get_current_user_id();
        $documents[ $document_id ]['status_note'] = $note;

        update_user_meta( $customer_id, '_woo_ach_kyc_documents', $documents );

        // Audit log
        \Nuwud\WooAchBatch\service( 'audit_log' )->log(
            'kyc_status_update',
            sprintf( 'KYC document status updated to %s', $status ),
            [
                'customer_id' => $customer_id,
                'document_id' => $document_id,
                'status' => $status,
                'note' => $note,
            ]
        );

        return true;
    }

    /**
     * Delete a document
     *
     * @param int    $customer_id Customer ID
     * @param string $document_id Document ID
     * @return bool
     */
    public function delete( int $customer_id, string $document_id ): bool {
        $documents = $this->get_documents( $customer_id );

        if ( ! isset( $documents[ $document_id ] ) ) {
            return false;
        }

        // Delete file
        $filename = $documents[ $document_id ]['filename'];
        $filepath = $this->get_storage_path() . '/' . $filename;

        if ( file_exists( $filepath ) ) {
            // Securely delete (overwrite with random data first)
            $size = filesize( $filepath );
            $handle = fopen( $filepath, 'wb' );
            if ( $handle ) {
                fwrite( $handle, random_bytes( $size ) );
                fclose( $handle );
            }
            unlink( $filepath );
        }

        // Remove metadata
        unset( $documents[ $document_id ] );
        update_user_meta( $customer_id, '_woo_ach_kyc_documents', $documents );

        // Audit log
        \Nuwud\WooAchBatch\service( 'audit_log' )->log(
            'kyc_delete',
            'KYC document deleted',
            [
                'customer_id' => $customer_id,
                'document_id' => $document_id,
            ]
        );

        return true;
    }

    /**
     * Get document file contents (for admin viewing)
     *
     * SECURITY: Requires manage_woocommerce capability.
     * All access is audit logged.
     *
     * @param int    $customer_id Customer ID
     * @param string $document_id Document ID
     * @return array{success: bool, data?: string, mime_type?: string, message?: string}
     */
    public function get_file_contents( int $customer_id, string $document_id ): array {
        // SECURITY: Permission check - only shop managers can view KYC documents
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            // Audit log unauthorized attempt
            $audit_log = $this->get_audit_log();
            if ( $audit_log ) {
                $audit_log->log( 'kyc_unauthorized_access', 'user', get_current_user_id(), [
                    'attempted_customer_id' => $customer_id,
                    'attempted_document_id' => $document_id,
                    'ip_address' => $this->get_client_ip(),
                ]);
            }

            return [
                'success' => false,
                'message' => 'Permission denied. Admin access required.',
            ];
        }

        $document = $this->get_document( $customer_id, $document_id );

        if ( ! $document ) {
            return [
                'success' => false,
                'message' => 'Document not found',
            ];
        }

        $filepath = $this->get_storage_path() . '/' . $document['filename'];

        // Validate path is within storage directory (prevent directory traversal)
        $real_storage = realpath( $this->get_storage_path() );
        $real_file = realpath( $filepath );

        if ( false === $real_file || strpos( $real_file, $real_storage ) !== 0 ) {
            return [
                'success' => false,
                'message' => 'Invalid document path',
            ];
        }

        if ( ! file_exists( $filepath ) ) {
            return [
                'success' => false,
                'message' => 'Document file not found',
            ];
        }

        // Audit log successful access
        $audit_log = $this->get_audit_log();
        if ( $audit_log ) {
            $audit_log->log( 'kyc_document_accessed', 'user', $customer_id, [
                'document_id' => $document_id,
                'accessed_by' => get_current_user_id(),
            ]);
        }

        return [
            'success' => true,
            'data' => base64_encode( file_get_contents( $filepath ) ),
            'mime_type' => $document['mime_type'],
            'original_name' => $document['original_name'],
        ];
    }

    /**
     * Check if customer has completed required KYC
     *
     * @param int   $customer_id Customer ID
     * @param array $required    Required document types
     * @return array{complete: bool, missing: array, pending: array}
     */
    public function check_kyc_status( int $customer_id, array $required = [] ): array {
        if ( empty( $required ) ) {
            // Default required documents
            $required = [ 'id_front', 'voided_check' ];
        }

        $documents = $this->get_documents( $customer_id );

        $approved = [];
        $pending = [];
        $missing = [];

        foreach ( $required as $type ) {
            $found = false;
            foreach ( $documents as $doc ) {
                if ( $doc['type'] === $type ) {
                    $found = true;
                    if ( $doc['status'] === 'approved' ) {
                        $approved[] = $type;
                    } else {
                        $pending[] = $type;
                    }
                    break;
                }
            }

            if ( ! $found ) {
                $missing[] = $type;
            }
        }

        return [
            'complete' => empty( $missing ) && empty( $pending ),
            'approved' => $approved,
            'pending' => $pending,
            'missing' => $missing,
        ];
    }

    /**
     * Save document metadata
     *
     * @param int    $customer_id Customer ID
     * @param string $document_id Document ID
     * @param array  $meta        Document metadata
     */
    private function save_document_meta( int $customer_id, string $document_id, array $meta ): void {
        $documents = $this->get_documents( $customer_id );
        $documents[ $document_id ] = $meta;
        update_user_meta( $customer_id, '_woo_ach_kyc_documents', $documents );
    }

    /**
     * Get upload error message
     *
     * @param int $error_code PHP upload error code
     * @return string
     */
    private function get_upload_error_message( int $error_code ): string {
        return match ( $error_code ) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => __( 'File is too large.', 'woo-ach-batch' ),
            UPLOAD_ERR_PARTIAL => __( 'File was only partially uploaded. Please try again.', 'woo-ach-batch' ),
            UPLOAD_ERR_NO_FILE => __( 'No file was uploaded.', 'woo-ach-batch' ),
            UPLOAD_ERR_NO_TMP_DIR => __( 'Server configuration error. Please contact support.', 'woo-ach-batch' ),
            UPLOAD_ERR_CANT_WRITE => __( 'Failed to write file. Please contact support.', 'woo-ach-batch' ),
            default => __( 'An error occurred during upload. Please try again.', 'woo-ach-batch' ),
        };
    }

    /**
     * Get file extension for MIME type
     *
     * @param string $mime_type MIME type
     * @return string
     */
    private function get_extension_for_mime( string $mime_type ): string {
        return match ( $mime_type ) {
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            default => 'bin',
        };
    }

    /**
     * Handle admin upload POST
     */
    public function handle_admin_upload(): void {
        // Verify nonce and capability
        if ( ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'woo_ach_kyc_upload' ) ) {
            wp_die( 'Security check failed' );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( 'Permission denied' );
        }

        $customer_id = (int) ( $_POST['customer_id'] ?? 0 );
        $document_type = sanitize_key( $_POST['document_type'] ?? '' );

        if ( ! $customer_id || ! isset( $_FILES['document'] ) ) {
            wp_die( 'Invalid request' );
        }

        $result = $this->upload( $customer_id, $document_type, $_FILES['document'] );

        if ( $result['success'] ) {
            wp_redirect( add_query_arg( 'kyc_uploaded', '1', wp_get_referer() ) );
        } else {
            wp_die( $result['message'] );
        }
        exit;
    }

    /**
     * Handle AJAX upload with rate limiting
     *
     * SECURITY: Rate limited to prevent abuse (10 uploads per hour per IP).
     */
    public function handle_ajax_upload(): void {
        // Verify nonce
        if ( ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'woo_ach_kyc_upload' ) ) {
            wp_send_json_error( [ 'message' => 'Security check failed' ] );
        }

        // SECURITY: Rate limiting to prevent abuse
        $rate_limiter = $this->get_rate_limiter();
        if ( $rate_limiter ) {
            $ip_address = $this->get_client_ip();
            $rate_check = $rate_limiter->check( 'kyc_upload', $ip_address, self::UPLOAD_RATE_LIMIT, self::UPLOAD_RATE_WINDOW );

            if ( ! $rate_check['allowed'] ) {
                // Audit log rate limit hit
                $audit_log = $this->get_audit_log();
                if ( $audit_log ) {
                    $audit_log->log( 'kyc_upload_rate_limited', 'security', null, [
                        'ip_address' => $ip_address,
                        'retry_after' => $rate_check['retry_after'] ?? 0,
                    ]);
                }

                wp_send_json_error( [
                    'message' => sprintf(
                        'Too many uploads. Please wait %d minutes and try again.',
                        ceil( ( $rate_check['retry_after'] ?? 60 ) / 60 )
                    ),
                    'code' => 'rate_limited',
                ]);
            }
        }

        // Customer uploading their own documents
        $customer_id = get_current_user_id();
        if ( ! $customer_id ) {
            wp_send_json_error( [ 'message' => 'You must be logged in' ] );
        }

        $document_type = sanitize_key( $_POST['document_type'] ?? '' );

        if ( ! isset( $_FILES['document'] ) ) {
            wp_send_json_error( [ 'message' => 'No file uploaded' ] );
        }

        $result = $this->upload( $customer_id, $document_type, $_FILES['document'] );

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * Get client IP address (handles proxies)
     *
     * @return string
     */
    private function get_client_ip(): string {
        $headers = [
            'HTTP_CF_CONNECTING_IP',  // Cloudflare
            'HTTP_X_FORWARDED_FOR',   // Standard proxy
            'HTTP_X_REAL_IP',         // Nginx proxy
            'REMOTE_ADDR',            // Direct connection
        ];

        foreach ( $headers as $header ) {
            if ( ! empty( $_SERVER[ $header ] ) ) {
                // Handle comma-separated IPs (X-Forwarded-For)
                $ip = trim( explode( ',', $_SERVER[ $header ] )[0] );
                if ( filter_var( $ip, FILTER_VALIDATE_IP ) ) {
                    return $ip;
                }
            }
        }

        return '0.0.0.0';
    }

    /**
     * Handle document deletion
     */
    public function handle_delete(): void {
        // Verify nonce and capability
        if ( ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'woo_ach_kyc_delete' ) ) {
            wp_send_json_error( [ 'message' => 'Security check failed' ] );
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( [ 'message' => 'Permission denied' ] );
        }

        $customer_id = (int) ( $_POST['customer_id'] ?? 0 );
        $document_id = sanitize_key( $_POST['document_id'] ?? '' );

        if ( ! $customer_id || ! $document_id ) {
            wp_send_json_error( [ 'message' => 'Invalid request' ] );
        }

        $result = $this->delete( $customer_id, $document_id );

        if ( $result ) {
            wp_send_json_success( [ 'message' => 'Document deleted' ] );
        } else {
            wp_send_json_error( [ 'message' => 'Failed to delete document' ] );
        }
    }

    /**
     * Handle secure KYC document download (admin only)
     *
     * SECURITY:
     * - Requires manage_woocommerce capability
     * - Validates nonce
     * - Prevents directory traversal attacks
     * - Streams file without exposing filesystem path
     * - Audit logs all access attempts
     */
    public function handle_secure_download(): void {
        // Verify nonce
        if ( ! wp_verify_nonce( $_GET['_wpnonce'] ?? '', 'woo_ach_kyc_download' ) ) {
            wp_die( 'Security check failed', 'Error', [ 'response' => 403 ] );
        }

        // SECURITY: Only admins can download KYC documents
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            // Audit log unauthorized attempt
            $audit_log = $this->get_audit_log();
            if ( $audit_log ) {
                $audit_log->log( 'kyc_download_unauthorized', 'security', null, [
                    'user_id' => get_current_user_id(),
                    'ip_address' => $this->get_client_ip(),
                    'customer_id' => $_GET['customer_id'] ?? '',
                    'document_id' => $_GET['document_id'] ?? '',
                ]);
            }
            wp_die( 'Permission denied', 'Error', [ 'response' => 403 ] );
        }

        $customer_id = (int) ( $_GET['customer_id'] ?? 0 );
        $document_id = sanitize_key( $_GET['document_id'] ?? '' );

        if ( ! $customer_id || ! $document_id ) {
            wp_die( 'Invalid request', 'Error', [ 'response' => 400 ] );
        }

        // Get document metadata
        $document = $this->get_document( $customer_id, $document_id );

        if ( ! $document ) {
            wp_die( 'Document not found', 'Error', [ 'response' => 404 ] );
        }

        // Build and validate file path (prevent directory traversal)
        $storage_path = $this->get_storage_path();
        $filename = basename( $document['filename'] ); // Extra safety: strip any path components
        $filepath = $storage_path . '/' . $filename;

        // Validate real path is within storage directory
        $real_storage = realpath( $storage_path );
        $real_file = realpath( $filepath );

        if ( false === $real_file || false === $real_storage || strpos( $real_file, $real_storage ) !== 0 ) {
            wp_die( 'Invalid document path', 'Error', [ 'response' => 400 ] );
        }

        if ( ! file_exists( $filepath ) || ! is_readable( $filepath ) ) {
            wp_die( 'Document file not found', 'Error', [ 'response' => 404 ] );
        }

        // Audit log successful download
        $audit_log = $this->get_audit_log();
        if ( $audit_log ) {
            $audit_log->log( 'kyc_document_downloaded', 'kyc', $document_id, [
                'customer_id' => $customer_id,
                'downloaded_by' => get_current_user_id(),
                'document_type' => $document['type'] ?? 'unknown',
                'ip_address' => $this->get_client_ip(),
            ]);
        }

        // Stream the file securely
        $this->stream_file( $filepath, $document['mime_type'], $document['original_name'] ?? $filename );
        exit;
    }

    /**
     * Stream a file to the browser
     *
     * @param string $filepath      Full path to file
     * @param string $mime_type     MIME type
     * @param string $download_name Filename for download
     */
    private function stream_file( string $filepath, string $mime_type, string $download_name ): void {
        // Clear any output buffers
        while ( ob_get_level() ) {
            ob_end_clean();
        }

        // Set headers for download
        header( 'Content-Type: ' . $mime_type );
        header( 'Content-Disposition: attachment; filename="' . sanitize_file_name( $download_name ) . '"' );
        header( 'Content-Length: ' . filesize( $filepath ) );
        header( 'Cache-Control: private, no-cache, no-store, must-revalidate' );
        header( 'Pragma: no-cache' );
        header( 'Expires: 0' );

        // Prevent script timeout for large files
        set_time_limit( 0 );

        // Stream file in chunks to handle large files
        $handle = fopen( $filepath, 'rb' );
        if ( $handle ) {
            while ( ! feof( $handle ) ) {
                echo fread( $handle, 8192 );
                flush();
            }
            fclose( $handle );
        }
    }

    /**
     * Generate a secure download URL for a KYC document
     *
     * @param int    $customer_id Customer ID
     * @param string $document_id Document ID
     * @return string Download URL (admin only)
     */
    public function get_download_url( int $customer_id, string $document_id ): string {
        return add_query_arg( [
            'action' => 'woo_ach_download_kyc',
            'customer_id' => $customer_id,
            'document_id' => $document_id,
            '_wpnonce' => wp_create_nonce( 'woo_ach_kyc_download' ),
        ], admin_url( 'admin-ajax.php' ) );
    }
}
