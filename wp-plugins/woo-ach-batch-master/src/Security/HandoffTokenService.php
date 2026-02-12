<?php
/**
 * Handoff Token Service
 *
 * Generates and validates secure one-time-use tokens for desktop-to-mobile handoff.
 * Tokens are short-lived (default 30 minutes), single-use, and do not expose order IDs.
 *
 * SECURITY:
 * - Tokens are cryptographically random (32 bytes = 64 hex chars)
 * - Stored in transients with automatic expiration
 * - Invalidated immediately after use
 * - Order ID is stored server-side, never in token
 * - Rate-limited token generation per user/IP
 *
 * @package Nuwud\WooAchBatch\Security
 */

namespace Nuwud\WooAchBatch\Security;

/**
 * Service for generating and validating handoff tokens
 */
class HandoffTokenService {

    /**
     * Token TTL in seconds (default 30 minutes)
     */
    private const DEFAULT_TTL = 1800;

    /**
     * Transient prefix for token storage
     */
    private const TOKEN_PREFIX = 'woo_ach_handoff_';

    /**
     * Maximum tokens per user per hour
     */
    private const MAX_TOKENS_PER_HOUR = 10;

    /**
     * Rate limiter service
     */
    private ?RateLimiter $rate_limiter = null;

    /**
     * Audit log service
     */
    private ?AuditLog $audit_log = null;

    /**
     * Token TTL (configurable)
     */
    private int $ttl;

    /**
     * Constructor
     *
     * @param int $ttl Token TTL in seconds (0 = use default)
     */
    public function __construct( int $ttl = 0 ) {
        $this->ttl = $ttl > 0 ? $ttl : self::DEFAULT_TTL;
    }

    /**
     * Inject rate limiter
     *
     * @param RateLimiter $rate_limiter Rate limiter instance
     */
    public function set_rate_limiter( RateLimiter $rate_limiter ): void {
        $this->rate_limiter = $rate_limiter;
    }

    /**
     * Inject audit log
     *
     * @param AuditLog $audit_log Audit log instance
     */
    public function set_audit_log( AuditLog $audit_log ): void {
        $this->audit_log = $audit_log;
    }

    /**
     * Generate a handoff token for an order
     *
     * @param int    $order_id    Order ID to associate
     * @param int    $customer_id Customer ID (for ownership verification)
     * @param string $purpose     Token purpose (default 'verification')
     * @return array{success: bool, token?: string, expires?: int, error?: string}
     */
    public function generate( int $order_id, int $customer_id, string $purpose = 'verification' ): array {
        // Rate limiting
        if ( $this->rate_limiter ) {
            $identifier = $customer_id > 0 ? "user_{$customer_id}" : $this->get_client_ip();
            $check = $this->rate_limiter->check(
                'handoff_token_generate',
                $identifier,
                self::MAX_TOKENS_PER_HOUR,
                3600
            );

            if ( ! $check['allowed'] ) {
                return [
                    'success' => false,
                    'error' => 'Too many token requests. Please wait before trying again.',
                ];
            }
        }

        // Validate order ownership
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [
                'success' => false,
                'error' => 'Invalid order.',
            ];
        }

        if ( $customer_id > 0 && (int) $order->get_customer_id() !== $customer_id ) {
            return [
                'success' => false,
                'error' => 'Order ownership verification failed.',
            ];
        }

        // Generate cryptographically secure token
        $token = bin2hex( random_bytes( 32 ) );
        $expires = time() + $this->ttl;

        // Store token data (order ID is never in the token itself)
        $token_data = [
            'order_id' => $order_id,
            'customer_id' => $customer_id,
            'purpose' => $purpose,
            'created' => time(),
            'expires' => $expires,
            'ip_created' => $this->get_client_ip(),
            'used' => false,
        ];

        $stored = set_transient( self::TOKEN_PREFIX . $token, $token_data, $this->ttl );

        if ( ! $stored ) {
            return [
                'success' => false,
                'error' => 'Failed to create token.',
            ];
        }

        // Audit log (do NOT log the full token)
        if ( $this->audit_log ) {
            $this->audit_log->log( 'handoff_token_created', 'order', $order_id, [
                'token_prefix' => substr( $token, 0, 8 ) . '...',
                'purpose' => $purpose,
                'ttl_seconds' => $this->ttl,
            ]);
        }

        return [
            'success' => true,
            'token' => $token,
            'expires' => $expires,
        ];
    }

    /**
     * Validate a token without consuming it
     *
     * Use this for read-only operations or initial page load.
     *
     * @param string $token Token to validate
     * @return array{valid: bool, order_id?: int, customer_id?: int, purpose?: string, error?: string}
     */
    public function validate( string $token ): array {
        // Sanitize token (should be 64 hex chars)
        $token = preg_replace( '/[^a-f0-9]/i', '', $token );

        if ( strlen( $token ) !== 64 ) {
            return [
                'valid' => false,
                'error' => 'Invalid token format.',
            ];
        }

        $token_data = get_transient( self::TOKEN_PREFIX . $token );

        if ( false === $token_data ) {
            return [
                'valid' => false,
                'error' => 'Token not found or expired.',
            ];
        }

        // Check if already used
        if ( ! empty( $token_data['used'] ) ) {
            return [
                'valid' => false,
                'error' => 'Token has already been used.',
            ];
        }

        // Check expiration (redundant with transient but explicit)
        if ( time() > $token_data['expires'] ) {
            delete_transient( self::TOKEN_PREFIX . $token );
            return [
                'valid' => false,
                'error' => 'Token has expired.',
            ];
        }

        return [
            'valid' => true,
            'order_id' => $token_data['order_id'],
            'customer_id' => $token_data['customer_id'],
            'purpose' => $token_data['purpose'],
        ];
    }

    /**
     * Consume (use) a token - marks it as used
     *
     * After consumption, token cannot be reused.
     *
     * @param string $token Token to consume
     * @return array{success: bool, order_id?: int, error?: string}
     */
    public function consume( string $token ): array {
        $validation = $this->validate( $token );

        if ( ! $validation['valid'] ) {
            return [
                'success' => false,
                'error' => $validation['error'],
            ];
        }

        // Get full token data
        $token_data = get_transient( self::TOKEN_PREFIX . $token );

        // Mark as used (keep for audit trail until natural expiration)
        $token_data['used'] = true;
        $token_data['used_at'] = time();
        $token_data['used_ip'] = $this->get_client_ip();

        // Calculate remaining TTL
        $remaining_ttl = max( 1, $token_data['expires'] - time() );
        set_transient( self::TOKEN_PREFIX . $token, $token_data, $remaining_ttl );

        // Audit log
        if ( $this->audit_log ) {
            $this->audit_log->log( 'handoff_token_consumed', 'order', $token_data['order_id'], [
                'token_prefix' => substr( $token, 0, 8 ) . '...',
            ]);
        }

        return [
            'success' => true,
            'order_id' => $token_data['order_id'],
        ];
    }

    /**
     * Revoke a token (delete before expiration)
     *
     * @param string $token Token to revoke
     * @return bool
     */
    public function revoke( string $token ): bool {
        $token = preg_replace( '/[^a-f0-9]/i', '', $token );
        return delete_transient( self::TOKEN_PREFIX . $token );
    }

    /**
     * Revoke all tokens for an order
     *
     * Note: This requires scanning transients, which is not efficient.
     * In production, consider using a custom DB table instead.
     *
     * @param int $order_id Order ID
     * @return int Number of tokens revoked
     */
    public function revoke_all_for_order( int $order_id ): int {
        global $wpdb;

        // Find all handoff token transients
        $transients = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT option_name FROM {$wpdb->options} 
                 WHERE option_name LIKE %s",
                '_transient_' . self::TOKEN_PREFIX . '%'
            )
        );

        $revoked = 0;
        foreach ( $transients as $option_name ) {
            $token = str_replace( '_transient_' . self::TOKEN_PREFIX, '', $option_name );
            $data = get_transient( self::TOKEN_PREFIX . $token );

            if ( $data && isset( $data['order_id'] ) && (int) $data['order_id'] === $order_id ) {
                delete_transient( self::TOKEN_PREFIX . $token );
                $revoked++;
            }
        }

        return $revoked;
    }

    /**
     * Generate a verification URL with token
     *
     * @param string $token    Token
     * @param bool   $absolute Whether to return absolute URL
     * @return string
     */
    public function get_verification_url( string $token, bool $absolute = true ): string {
        // Use My Account endpoint if available
        $base_url = wc_get_account_endpoint_url( 'ach-verify' );

        // Fallback to home if endpoint not registered
        if ( ! $base_url || $base_url === wc_get_page_permalink( 'myaccount' ) ) {
            $base_url = home_url( '/ach-verify/' );
        }

        return add_query_arg( 't', $token, $base_url );
    }

    /**
     * Get client IP address
     *
     * @return string
     */
    private function get_client_ip(): string {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR',
        ];

        foreach ( $headers as $header ) {
            if ( ! empty( $_SERVER[ $header ] ) ) {
                $ip = trim( explode( ',', $_SERVER[ $header ] )[0] );
                if ( filter_var( $ip, FILTER_VALIDATE_IP ) ) {
                    return $ip;
                }
            }
        }

        return '0.0.0.0';
    }

    /**
     * Get token TTL in human-readable format
     *
     * @return string
     */
    public function get_ttl_display(): string {
        $minutes = ceil( $this->ttl / 60 );
        return sprintf( _n( '%d minute', '%d minutes', $minutes, 'woo-ach-batch' ), $minutes );
    }
}
