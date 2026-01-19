<?php
/**
 * Order Meta Handler
 *
 * Handles secure storage and retrieval of ACH-related order metadata.
 *
 * @package Nuwud\WooAchBatch\Order
 */

namespace Nuwud\WooAchBatch\Order;

use Nuwud\WooAchBatch\Security\Encryption;
use WC_Order;

/**
 * Manages ACH-related order metadata with encryption
 */
class OrderMeta {

    /**
     * Encryption service
     *
     * @var Encryption
     */
    private Encryption $encryption;

    /**
     * Meta keys that require encryption
     *
     * @var array
     */
    private const ENCRYPTED_KEYS = [
        '_ach_routing_encrypted',
        '_ach_account_encrypted',
    ];

    /**
     * Constructor
     *
     * @param Encryption $encryption Encryption service
     */
    public function __construct( Encryption $encryption ) {
        $this->encryption = $encryption;
    }

    /**
     * Save bank details for an order (encrypted)
     *
     * @param WC_Order $order          Order object
     * @param string   $routing_number 9-digit routing number
     * @param string   $account_number Bank account number
     * @param string   $account_type   'checking' or 'savings'
     */
    public function save_bank_details( WC_Order $order, string $routing_number, string $account_number, string $account_type ): void {
        // Encrypt sensitive data
        $encrypted_routing = $this->encryption->encrypt( $routing_number );
        $encrypted_account = $this->encryption->encrypt( $account_number );

        // Store encrypted values
        $order->update_meta_data( '_ach_routing_encrypted', $encrypted_routing );
        $order->update_meta_data( '_ach_account_encrypted', $encrypted_account );

        // Store non-sensitive metadata
        $order->update_meta_data( '_ach_account_last4', substr( $account_number, -4 ) );
        $order->update_meta_data( '_ach_account_type', sanitize_text_field( $account_type ) );

        $order->save();
    }

    /**
     * Get decrypted bank details for an order
     *
     * @param WC_Order $order Order object
     * @return array{routing: string, account: string, type: string, last4: string}|null
     */
    public function get_bank_details( WC_Order $order ): ?array {
        $encrypted_routing = $order->get_meta( '_ach_routing_encrypted' );
        $encrypted_account = $order->get_meta( '_ach_account_encrypted' );

        if ( empty( $encrypted_routing ) || empty( $encrypted_account ) ) {
            return null;
        }

        try {
            return [
                'routing' => $this->encryption->decrypt( $encrypted_routing ),
                'account' => $this->encryption->decrypt( $encrypted_account ),
                'type' => $order->get_meta( '_ach_account_type' ) ?: 'checking',
                'last4' => $order->get_meta( '_ach_account_last4' ),
            ];
        } catch ( \Exception $e ) {
            // Log decryption failure
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Failed to decrypt bank details for order %d: %s', $order->get_id(), $e->getMessage() ),
                'error'
            );
            return null;
        }
    }

    /**
     * Store bank verification token (for external verification services like Plaid)
     *
     * SECURITY: Token is encrypted at rest using AES-256-GCM.
     * Token metadata (non-sensitive) is stored JSON-encoded but not encrypted.
     *
     * @param WC_Order $order Order object
     * @param string   $token Verification token
     * @param array    $metadata Additional token metadata (non-sensitive only!)
     */
    public function save_bank_token( WC_Order $order, string $token, array $metadata = [] ): void {
        // SECURITY: Encrypt token before storage
        $encrypted_token = $this->encryption->encrypt( $token );
        $order->update_meta_data( '_ach_bank_token_encrypted', $encrypted_token );

        // Remove any legacy plaintext token that might exist
        $order->delete_meta_data( '_ach_bank_token' );

        if ( ! empty( $metadata ) ) {
            // Sanitize metadata - never store sensitive data here
            $safe_metadata = $this->sanitize_token_metadata( $metadata );
            $order->update_meta_data( '_ach_bank_token_metadata', wp_json_encode( $safe_metadata ) );
        }

        $order->save();
    }

    /**
     * Sanitize token metadata to ensure no sensitive data is stored unencrypted
     *
     * @param array $metadata Raw metadata
     * @return array Sanitized metadata
     */
    private function sanitize_token_metadata( array $metadata ): array {
        // Allowlist of safe metadata fields
        $allowed_keys = [
            'provider',       // e.g., 'plaid', 'finicity'
            'institution_id', // Bank institution ID (not sensitive)
            'institution_name',
            'account_type',   // 'checking', 'savings'
            'verified_at',    // ISO timestamp
            'expires_at',     // ISO timestamp
        ];

        $safe = [];
        foreach ( $allowed_keys as $key ) {
            if ( isset( $metadata[ $key ] ) ) {
                $safe[ $key ] = sanitize_text_field( (string) $metadata[ $key ] );
            }
        }

        return $safe;
    }

    /**
     * Get bank verification token (decrypted)
     *
     * SECURITY: Token is decrypted from secure storage. Only call when
     * token is actively needed for verification API calls.
     *
     * @param WC_Order $order Order object
     * @return array{token: string, metadata: array}|null
     */
    public function get_bank_token( WC_Order $order ): ?array {
        // Try encrypted storage first (new format)
        $encrypted_token = $order->get_meta( '_ach_bank_token_encrypted' );

        if ( ! empty( $encrypted_token ) ) {
            try {
                $token = $this->encryption->decrypt( $encrypted_token );
            } catch ( \Exception $e ) {
                \Nuwud\WooAchBatch\log_message(
                    sprintf( 'Failed to decrypt bank token for order %d', $order->get_id() ),
                    'error'
                );
                return null;
            }
        } else {
            // Fall back to legacy plaintext storage for migration
            $token = $order->get_meta( '_ach_bank_token' );

            if ( ! empty( $token ) ) {
                // Auto-migrate: encrypt and save in new format
                \Nuwud\WooAchBatch\log_message(
                    sprintf( 'Migrating plaintext bank token for order %d to encrypted storage', $order->get_id() ),
                    'info'
                );
                $this->save_bank_token( $order, $token );
            }
        }

        if ( empty( $token ) ) {
            return null;
        }

        $metadata_json = $order->get_meta( '_ach_bank_token_metadata' );
        $metadata = $metadata_json ? json_decode( $metadata_json, true ) : [];

        return [
            'token' => $token,
            'metadata' => is_array( $metadata ) ? $metadata : [],
        ];
    }

    /**
     * Save ACH authorization details
     *
     * @param WC_Order $order   Order object
     * @param string   $version Authorization text version
     */
    public function save_authorization( WC_Order $order, string $version = '1.0' ): void {
        $order->update_meta_data( '_ach_authorization_timestamp', current_time( 'mysql' ) );
        $order->update_meta_data( '_ach_authorization_ip', $this->get_client_ip() );
        $order->update_meta_data( '_ach_authorization_version', sanitize_text_field( $version ) );
        $order->save();
    }

    /**
     * Get authorization details
     *
     * @param WC_Order $order Order object
     * @return array|null
     */
    public function get_authorization( WC_Order $order ): ?array {
        $timestamp = $order->get_meta( '_ach_authorization_timestamp' );

        if ( empty( $timestamp ) ) {
            return null;
        }

        return [
            'timestamp' => $timestamp,
            'ip_address' => $order->get_meta( '_ach_authorization_ip' ),
            'version' => $order->get_meta( '_ach_authorization_version' ),
        ];
    }

    /**
     * Save verification status
     *
     * @param WC_Order $order  Order object
     * @param string   $status Verification status
     * @param string   $method Verification method used
     */
    public function save_verification_status( WC_Order $order, string $status, string $method = '' ): void {
        $order->update_meta_data( '_ach_verification_status', sanitize_text_field( $status ) );
        $order->update_meta_data( '_ach_verification_timestamp', current_time( 'mysql' ) );

        if ( $method ) {
            $order->update_meta_data( '_ach_verification_method', sanitize_text_field( $method ) );
        }

        $order->save();
    }

    /**
     * Get verification status
     *
     * @param WC_Order $order Order object
     * @return array
     */
    public function get_verification_status( WC_Order $order ): array {
        return [
            'status' => $order->get_meta( '_ach_verification_status' ) ?: 'pending',
            'timestamp' => $order->get_meta( '_ach_verification_timestamp' ),
            'method' => $order->get_meta( '_ach_verification_method' ),
        ];
    }

    /**
     * Save batch export details
     *
     * @param WC_Order $order        Order object
     * @param string   $batch_id     Batch ID
     * @param string   $trace_number Trace number
     */
    public function save_batch_details( WC_Order $order, string $batch_id, string $trace_number ): void {
        $order->update_meta_data( '_ach_batch_id', sanitize_text_field( $batch_id ) );
        $order->update_meta_data( '_ach_trace_number', sanitize_text_field( $trace_number ) );
        $order->update_meta_data( '_ach_exported_at', current_time( 'mysql' ) );
        $order->save();
    }

    /**
     * Get batch export details
     *
     * @param WC_Order $order Order object
     * @return array|null
     */
    public function get_batch_details( WC_Order $order ): ?array {
        $batch_id = $order->get_meta( '_ach_batch_id' );

        if ( empty( $batch_id ) ) {
            return null;
        }

        return [
            'batch_id' => $batch_id,
            'trace_number' => $order->get_meta( '_ach_trace_number' ),
            'exported_at' => $order->get_meta( '_ach_exported_at' ),
        ];
    }

    /**
     * Check if order is eligible for batch export
     *
     * @param WC_Order $order Order object
     * @return bool
     */
    public function is_eligible_for_export( WC_Order $order ): bool {
        // Must be ACH payment method
        if ( $order->get_payment_method() !== 'ach_batch' ) {
            return false;
        }

        // Must be in verified status
        if ( $order->get_status() !== 'ach-verified' ) {
            return false;
        }

        // Must not already be exported
        if ( $order->get_meta( '_ach_batch_id' ) ) {
            return false;
        }

        // Must have bank details
        if ( ! $this->get_bank_details( $order ) && ! $this->get_bank_token( $order ) ) {
            return false;
        }

        // Must be verified
        $verification = $this->get_verification_status( $order );
        if ( $verification['status'] !== 'verified' ) {
            return false;
        }

        return true;
    }

    /**
     * Clear sensitive bank data after successful settlement
     *
     * @param WC_Order $order Order object
     */
    public function clear_sensitive_data( WC_Order $order ): void {
        $order->delete_meta_data( '_ach_routing_encrypted' );
        $order->delete_meta_data( '_ach_account_encrypted' );
        $order->delete_meta_data( '_ach_bank_token' );
        $order->delete_meta_data( '_ach_bank_token_metadata' );
        $order->save();

        // Add note
        $order->add_order_note(
            __( 'Sensitive ACH bank data cleared after successful settlement.', 'woo-ach-batch' ),
            false,
            true
        );
    }

    /**
     * Get client IP address
     *
     * @return string
     */
    private function get_client_ip(): string {
        $ip = '';

        if ( ! empty( $_SERVER['HTTP_CLIENT_IP'] ) ) {
            $ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_CLIENT_IP'] ) );
        } elseif ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
            $ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) );
            // Take first IP if multiple
            $ip = explode( ',', $ip )[0];
        } elseif ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
            $ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
        }

        return trim( $ip );
    }
}
