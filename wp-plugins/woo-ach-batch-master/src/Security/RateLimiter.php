<?php
/**
 * Rate Limiter
 *
 * Provides rate limiting for sensitive operations to prevent brute-force attacks.
 *
 * @package Nuwud\WooAchBatch\Security
 */

namespace Nuwud\WooAchBatch\Security;

/**
 * Rate limiter for sensitive operations
 */
class RateLimiter {

    /**
     * Default rate limit configurations
     *
     * @var array<string, array>
     */
    private const LIMITS = [
        // Verification attempts per IP per hour
        'verification_attempt' => [
            'max_attempts' => 10,
            'window_seconds' => 3600,
            'lockout_seconds' => 3600,
        ],
        // Failed login attempts per IP per hour  
        'failed_verification' => [
            'max_attempts' => 5,
            'window_seconds' => 3600,
            'lockout_seconds' => 7200, // 2 hour lockout after 5 failures
        ],
        // API requests per IP per minute
        'api_request' => [
            'max_attempts' => 60,
            'window_seconds' => 60,
            'lockout_seconds' => 300,
        ],
        // Batch export runs per day
        'batch_export' => [
            'max_attempts' => 50,
            'window_seconds' => 86400,
            'lockout_seconds' => 3600,
        ],
        // KYC upload attempts per user per hour
        'kyc_upload' => [
            'max_attempts' => 10,
            'window_seconds' => 3600,
            'lockout_seconds' => 3600,
        ],
    ];

    /**
     * Transient prefix
     *
     * @var string
     */
    private const PREFIX = 'woo_ach_rl_';

    /**
     * Check if an action is rate limited
     *
     * @param string $action     Action identifier (e.g., 'verification_attempt')
     * @param string $identifier Unique identifier (IP address, user ID, etc.)
     * @return array{allowed: bool, remaining: int, reset_at: int, message?: string}
     */
    public function check( string $action, string $identifier ): array {
        $limits = $this->get_limits( $action );
        $key = $this->get_key( $action, $identifier );
        $lockout_key = $key . '_lockout';

        // Check if currently locked out
        $lockout_until = get_transient( $lockout_key );
        if ( $lockout_until !== false && time() < $lockout_until ) {
            return [
                'allowed' => false,
                'remaining' => 0,
                'reset_at' => (int) $lockout_until,
                'message' => sprintf(
                    __( 'Too many attempts. Please try again in %d minutes.', 'woo-ach-batch' ),
                    ceil( ( $lockout_until - time() ) / 60 )
                ),
            ];
        }

        // Get current attempt count
        $data = get_transient( $key );
        if ( $data === false ) {
            $data = [
                'count' => 0,
                'window_start' => time(),
            ];
        }

        // Check if window has expired
        if ( time() - $data['window_start'] > $limits['window_seconds'] ) {
            $data = [
                'count' => 0,
                'window_start' => time(),
            ];
        }

        $remaining = max( 0, $limits['max_attempts'] - $data['count'] );
        $reset_at = $data['window_start'] + $limits['window_seconds'];

        return [
            'allowed' => $remaining > 0,
            'remaining' => $remaining,
            'reset_at' => $reset_at,
        ];
    }

    /**
     * Record an attempt
     *
     * @param string $action     Action identifier
     * @param string $identifier Unique identifier
     * @param bool   $success    Whether the attempt was successful
     * @return array{allowed: bool, remaining: int, reset_at: int, locked_out?: bool}
     */
    public function record( string $action, string $identifier, bool $success = true ): array {
        $limits = $this->get_limits( $action );
        $key = $this->get_key( $action, $identifier );

        // Get or initialize data
        $data = get_transient( $key );
        if ( $data === false || time() - $data['window_start'] > $limits['window_seconds'] ) {
            $data = [
                'count' => 0,
                'window_start' => time(),
                'failures' => 0,
            ];
        }

        // Increment count
        $data['count']++;

        // Track failures separately for failed_verification actions
        if ( ! $success ) {
            $data['failures'] = ( $data['failures'] ?? 0 ) + 1;
        }

        // Save updated data
        set_transient( $key, $data, $limits['window_seconds'] );

        $remaining = max( 0, $limits['max_attempts'] - $data['count'] );
        $reset_at = $data['window_start'] + $limits['window_seconds'];

        $result = [
            'allowed' => $remaining > 0,
            'remaining' => $remaining,
            'reset_at' => $reset_at,
            'locked_out' => false,
        ];

        // Apply lockout if limit exceeded
        if ( $data['count'] >= $limits['max_attempts'] ) {
            $lockout_key = $key . '_lockout';
            $lockout_until = time() + $limits['lockout_seconds'];
            set_transient( $lockout_key, $lockout_until, $limits['lockout_seconds'] );

            $result['locked_out'] = true;
            $result['allowed'] = false;

            // Log the lockout
            $this->log_lockout( $action, $identifier, $data );
        }

        return $result;
    }

    /**
     * Clear rate limit for an identifier
     *
     * Typically called after successful verification to reset counters.
     *
     * @param string $action     Action identifier
     * @param string $identifier Unique identifier
     */
    public function clear( string $action, string $identifier ): void {
        $key = $this->get_key( $action, $identifier );
        delete_transient( $key );
        delete_transient( $key . '_lockout' );
    }

    /**
     * Check if an IP is currently blocked
     *
     * @param string $ip_address IP address to check
     * @return bool
     */
    public function is_ip_blocked( string $ip_address ): bool {
        // Check against blocklist option
        $blocklist = get_option( 'woo_ach_batch_blocked_ips', [] );
        if ( in_array( $ip_address, $blocklist, true ) ) {
            return true;
        }

        // Check if any rate limit is in lockout
        foreach ( array_keys( self::LIMITS ) as $action ) {
            $key = $this->get_key( $action, $ip_address );
            $lockout = get_transient( $key . '_lockout' );
            if ( $lockout !== false && time() < $lockout ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Block an IP address permanently
     *
     * @param string $ip_address IP to block
     * @param string $reason     Reason for blocking
     */
    public function block_ip( string $ip_address, string $reason = '' ): void {
        $blocklist = get_option( 'woo_ach_batch_blocked_ips', [] );

        if ( ! in_array( $ip_address, $blocklist, true ) ) {
            $blocklist[] = $ip_address;
            update_option( 'woo_ach_batch_blocked_ips', $blocklist );

            // Audit log
            \Nuwud\WooAchBatch\service( 'audit_log' )->log(
                'ip_blocked',
                'security',
                $ip_address,
                [ 'reason' => $reason ]
            );
        }
    }

    /**
     * Unblock an IP address
     *
     * @param string $ip_address IP to unblock
     */
    public function unblock_ip( string $ip_address ): void {
        $blocklist = get_option( 'woo_ach_batch_blocked_ips', [] );
        $blocklist = array_diff( $blocklist, [ $ip_address ] );
        update_option( 'woo_ach_batch_blocked_ips', array_values( $blocklist ) );

        // Also clear any transient lockouts
        foreach ( array_keys( self::LIMITS ) as $action ) {
            $this->clear( $action, $ip_address );
        }
    }

    /**
     * Get limits for an action
     *
     * @param string $action Action identifier
     * @return array
     */
    private function get_limits( string $action ): array {
        // Allow overriding via filter
        $limits = self::LIMITS[ $action ] ?? [
            'max_attempts' => 10,
            'window_seconds' => 3600,
            'lockout_seconds' => 3600,
        ];

        return apply_filters( "woo_ach_batch_rate_limit_{$action}", $limits );
    }

    /**
     * Generate transient key
     *
     * @param string $action     Action identifier
     * @param string $identifier Unique identifier
     * @return string
     */
    private function get_key( string $action, string $identifier ): string {
        // Hash the identifier to avoid long keys
        $hash = substr( md5( $identifier ), 0, 12 );
        return self::PREFIX . $action . '_' . $hash;
    }

    /**
     * Log a lockout event
     *
     * @param string $action     Action that triggered lockout
     * @param string $identifier Who was locked out
     * @param array  $data       Rate limit data
     */
    private function log_lockout( string $action, string $identifier, array $data ): void {
        \Nuwud\WooAchBatch\log_message(
            sprintf(
                'Rate limit lockout triggered: action=%s, identifier=%s, attempts=%d',
                $action,
                $this->mask_identifier( $identifier ),
                $data['count']
            ),
            'warning'
        );

        // Also audit log
        try {
            \Nuwud\WooAchBatch\service( 'audit_log' )->log(
                'rate_limit_lockout',
                'security',
                null,
                [
                    'action' => $action,
                    'identifier_hash' => md5( $identifier ),
                    'attempts' => $data['count'],
                    'failures' => $data['failures'] ?? 0,
                ]
            );
        } catch ( \Exception $e ) {
            // Ignore if audit log not available
        }
    }

    /**
     * Mask an identifier for logging (don't log full IP)
     *
     * @param string $identifier Identifier to mask
     * @return string
     */
    private function mask_identifier( string $identifier ): string {
        // If it looks like an IP, mask the last octet
        if ( filter_var( $identifier, FILTER_VALIDATE_IP ) ) {
            $parts = explode( '.', $identifier );
            if ( count( $parts ) === 4 ) {
                $parts[3] = 'xxx';
                return implode( '.', $parts );
            }
        }

        // Otherwise just show first/last few chars
        if ( strlen( $identifier ) > 8 ) {
            return substr( $identifier, 0, 4 ) . '...' . substr( $identifier, -4 );
        }

        return $identifier;
    }

    /**
     * Get statistics for admin display
     *
     * @return array
     */
    public function get_statistics(): array {
        global $wpdb;

        $blocklist = get_option( 'woo_ach_batch_blocked_ips', [] );

        return [
            'blocked_ips' => count( $blocklist ),
            'blocked_ip_list' => array_slice( $blocklist, 0, 10 ), // First 10 for display
        ];
    }
}
