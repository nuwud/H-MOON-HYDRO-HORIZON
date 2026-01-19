<?php
/**
 * Plugin helper functions
 *
 * @package Nuwud\WooAchBatch
 */

namespace Nuwud\WooAchBatch;

/**
 * Get plugin instance
 *
 * @return Plugin
 */
function plugin(): Plugin {
    return Plugin::instance();
}

/**
 * Get a service from the container
 *
 * @param string $id Service identifier
 * @return mixed
 */
function service( string $id ): mixed {
    return plugin()->container()->get( $id );
}

/**
 * Get plugin settings
 *
 * @param string|null $key     Optional setting key
 * @param mixed       $default Default value if key not found
 * @return mixed
 */
function get_setting( ?string $key = null, mixed $default = null ): mixed {
    $settings = service( 'settings' );
    if ( null === $key ) {
        return $settings;
    }
    return $settings->get( $key, $default );
}

/**
 * Log a message
 *
 * @param string $message Log message
 * @param string $level   Log level (debug, info, warning, error)
 * @param array  $context Additional context data
 */
function log_message( string $message, string $level = 'info', array $context = [] ): void {
    $logger = wc_get_logger();
    $log_level = get_setting( 'logging_level', 'error' );

    $levels = [ 'debug' => 0, 'info' => 1, 'warning' => 2, 'error' => 3 ];
    $current_level = $levels[ $log_level ] ?? 1;
    $message_level = $levels[ $level ] ?? 1;

    if ( $message_level >= $current_level ) {
        $logger->log( $level, $message, array_merge( $context, [ 'source' => 'woo-ach-batch' ] ) );
    }
}

/**
 * Format money amount for NACHA (remove decimals, convert to cents)
 *
 * @param float $amount Amount in dollars
 * @return int Amount in cents
 */
function format_amount_cents( float $amount ): int {
    return (int) round( $amount * 100 );
}

/**
 * Generate a unique batch ID
 *
 * @return string
 */
function generate_batch_id(): string {
    return 'BATCH-' . date( 'Ymd' ) . '-' . strtoupper( substr( md5( uniqid( '', true ) ), 0, 8 ) );
}

/**
 * Generate a trace number for ACH entries
 *
 * @param string $originating_dfi ODFI routing number (first 8 digits)
 * @param int    $sequence        Sequence number within batch
 * @return string 15-character trace number
 */
function generate_trace_number( string $originating_dfi, int $sequence ): string {
    // Trace number = 8-digit ODFI routing transit number + 7-digit sequence
    $odfi = substr( str_pad( $originating_dfi, 8, '0', STR_PAD_LEFT ), 0, 8 );
    $seq = str_pad( (string) $sequence, 7, '0', STR_PAD_LEFT );
    return $odfi . $seq;
}

/**
 * Validate routing number using checksum
 *
 * @param string $routing 9-digit routing number
 * @return bool
 */
function validate_routing_number( string $routing ): bool {
    if ( strlen( $routing ) !== 9 || ! ctype_digit( $routing ) ) {
        return false;
    }

    // ABA routing number checksum algorithm
    $sum = 0;
    $weights = [ 3, 7, 1, 3, 7, 1, 3, 7, 1 ];
    for ( $i = 0; $i < 9; $i++ ) {
        $sum += (int) $routing[ $i ] * $weights[ $i ];
    }

    return $sum % 10 === 0;
}

/**
 * Mask bank account number for display
 *
 * @param string $account_number Full account number
 * @return string Masked account (e.g., "****1234")
 */
function mask_account_number( string $account_number ): string {
    $last4 = substr( $account_number, -4 );
    return '****' . $last4;
}

/**
 * Get last 4 digits of account number
 *
 * @param string $account_number Full account number
 * @return string Last 4 digits
 */
function get_account_last4( string $account_number ): string {
    return substr( $account_number, -4 );
}

/**
 * Sanitize string for NACHA file (alphanumeric + space only)
 *
 * @param string $string Input string
 * @param int    $length Max length
 * @return string Sanitized string
 */
function sanitize_nacha_string( string $string, int $length ): string {
    // Convert to uppercase, remove non-alphanumeric except space
    $string = strtoupper( preg_replace( '/[^A-Za-z0-9 ]/', '', $string ) );
    return str_pad( substr( $string, 0, $length ), $length );
}

/**
 * Format date for NACHA (YYMMDD)
 *
 * @param int|null $timestamp Unix timestamp (null for current time)
 * @return string
 */
function format_nacha_date( ?int $timestamp = null ): string {
    return date( 'ymd', $timestamp ?? time() );
}

/**
 * Format time for NACHA (HHMM)
 *
 * @param int|null $timestamp Unix timestamp (null for current time)
 * @return string
 */
function format_nacha_time( ?int $timestamp = null ): string {
    return date( 'Hi', $timestamp ?? time() );
}

/**
 * Get order ACH authorization text
 *
 * @param string $version Version of authorization text
 * @return string
 */
function get_authorization_text( string $version = '1.0' ): string {
    $texts = [
        '1.0' => __(
            'I authorize H Moon Hydro to initiate a single ACH debit entry to my bank account for the amount shown. ' .
            'I understand that this authorization will remain in effect until I notify H Moon Hydro in writing to cancel it.',
            'woo-ach-batch'
        ),
    ];

    return $texts[ $version ] ?? $texts['1.0'];
}

/**
 * Check if current user can manage ACH batches
 *
 * @return bool
 */
function current_user_can_manage_batches(): bool {
    return current_user_can( 'manage_woo_ach_batches' ) || current_user_can( 'manage_woocommerce' );
}

/**
 * Check if current user can export ACH batches
 *
 * @return bool
 */
function current_user_can_export_batches(): bool {
    return current_user_can( 'export_woo_ach_batches' ) || current_user_can( 'manage_woocommerce' );
}

/**
 * Get the timezone for batch scheduling
 *
 * @return \DateTimeZone
 */
function get_batch_timezone(): \DateTimeZone {
    return new \DateTimeZone( 'America/Los_Angeles' );
}

/**
 * Convert WordPress timestamp to batch timezone
 *
 * @param int $timestamp Unix timestamp
 * @return \DateTime
 */
function timestamp_to_batch_time( int $timestamp ): \DateTime {
    $dt = new \DateTime( '@' . $timestamp );
    $dt->setTimezone( get_batch_timezone() );
    return $dt;
}
