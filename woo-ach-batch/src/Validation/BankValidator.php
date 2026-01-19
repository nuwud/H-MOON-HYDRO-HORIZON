<?php
/**
 * Bank Validation Utilities
 *
 * Provides client-side and server-side validation for bank account information.
 * Includes ABA routing number checksum validation, account number formatting,
 * and preparedness for future Plaid/micro-deposit integration.
 *
 * @package Nuwud\WooAchBatch\Validation
 */

namespace Nuwud\WooAchBatch\Validation;

/**
 * Bank validation service
 */
class BankValidator {

    /**
     * Minimum account number length
     */
    private const MIN_ACCOUNT_LENGTH = 4;

    /**
     * Maximum account number length
     */
    private const MAX_ACCOUNT_LENGTH = 17;

    /**
     * Routing number length (always 9 digits in US)
     */
    private const ROUTING_LENGTH = 9;

    /**
     * Valid ABA routing number prefixes (Federal Reserve districts)
     * 00 = US Government
     * 01-12 = Federal Reserve Districts
     * 21-32 = Thrift institutions (same districts + 20)
     * 61-72 = Electronic (same districts + 60)
     * 80 = Traveler's checks
     */
    private const VALID_ROUTING_PREFIXES = [
        '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
        '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32',
        '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72',
        '80',
    ];

    /**
     * Validate a complete bank account submission
     *
     * @param array $data Bank data ['routing', 'account', 'account_confirm', 'type', 'holder_name']
     * @return array{valid: bool, errors: array, sanitized?: array}
     */
    public function validate( array $data ): array {
        $errors = [];
        $sanitized = [];

        // Routing number validation
        $routing = $this->sanitize_digits( $data['routing'] ?? '' );
        $routing_validation = $this->validate_routing( $routing );

        if ( ! $routing_validation['valid'] ) {
            $errors['routing'] = $routing_validation['error'];
        } else {
            $sanitized['routing'] = $routing;
        }

        // Account number validation
        $account = $this->sanitize_digits( $data['account'] ?? '' );
        $account_validation = $this->validate_account( $account );

        if ( ! $account_validation['valid'] ) {
            $errors['account'] = $account_validation['error'];
        } else {
            $sanitized['account'] = $account;
        }

        // Account confirmation (must match)
        $account_confirm = $this->sanitize_digits( $data['account_confirm'] ?? '' );
        if ( $account !== $account_confirm ) {
            $errors['account_confirm'] = __( 'Account numbers do not match.', 'woo-ach-batch' );
        }

        // Account type validation
        $type = sanitize_key( $data['type'] ?? 'checking' );
        if ( ! in_array( $type, [ 'checking', 'savings' ], true ) ) {
            $errors['type'] = __( 'Invalid account type.', 'woo-ach-batch' );
        } else {
            $sanitized['type'] = $type;
        }

        // Account holder name validation
        $holder_name = $this->sanitize_name( $data['holder_name'] ?? '' );
        if ( strlen( $holder_name ) < 2 ) {
            $errors['holder_name'] = __( 'Please enter the account holder name.', 'woo-ach-batch' );
        } elseif ( strlen( $holder_name ) > 22 ) {
            $errors['holder_name'] = __( 'Account holder name is too long (max 22 characters).', 'woo-ach-batch' );
        } else {
            $sanitized['holder_name'] = $holder_name;
        }

        // Add masked values for display
        if ( ! empty( $sanitized['account'] ) ) {
            $sanitized['account_last4'] = substr( $sanitized['account'], -4 );
            $sanitized['account_masked'] = str_repeat( '•', strlen( $sanitized['account'] ) - 4 ) . $sanitized['account_last4'];
        }

        return [
            'valid' => empty( $errors ),
            'errors' => $errors,
            'sanitized' => empty( $errors ) ? $sanitized : null,
        ];
    }

    /**
     * Validate ABA routing number with checksum
     *
     * ABA routing numbers use a weighted checksum algorithm:
     * 3(d1) + 7(d2) + 1(d3) + 3(d4) + 7(d5) + 1(d6) + 3(d7) + 7(d8) + 1(d9) ≡ 0 (mod 10)
     *
     * @param string $routing Routing number (digits only)
     * @return array{valid: bool, error?: string, bank_name?: string}
     */
    public function validate_routing( string $routing ): array {
        // Must be exactly 9 digits
        if ( strlen( $routing ) !== self::ROUTING_LENGTH ) {
            return [
                'valid' => false,
                'error' => sprintf(
                    __( 'Routing number must be %d digits.', 'woo-ach-batch' ),
                    self::ROUTING_LENGTH
                ),
            ];
        }

        // Must be all digits
        if ( ! ctype_digit( $routing ) ) {
            return [
                'valid' => false,
                'error' => __( 'Routing number must contain only digits.', 'woo-ach-batch' ),
            ];
        }

        // Check valid prefix (Federal Reserve district)
        $prefix = substr( $routing, 0, 2 );
        if ( ! in_array( $prefix, self::VALID_ROUTING_PREFIXES, true ) ) {
            return [
                'valid' => false,
                'error' => __( 'Invalid routing number prefix.', 'woo-ach-batch' ),
            ];
        }

        // ABA checksum validation
        // Weights: 3, 7, 1, 3, 7, 1, 3, 7, 1
        $weights = [ 3, 7, 1, 3, 7, 1, 3, 7, 1 ];
        $sum = 0;

        for ( $i = 0; $i < 9; $i++ ) {
            $sum += (int) $routing[ $i ] * $weights[ $i ];
        }

        if ( $sum % 10 !== 0 ) {
            return [
                'valid' => false,
                'error' => __( 'Invalid routing number checksum. Please verify the number.', 'woo-ach-batch' ),
            ];
        }

        return [
            'valid' => true,
        ];
    }

    /**
     * Validate bank account number
     *
     * @param string $account Account number (digits only)
     * @return array{valid: bool, error?: string}
     */
    public function validate_account( string $account ): array {
        $length = strlen( $account );

        if ( $length < self::MIN_ACCOUNT_LENGTH ) {
            return [
                'valid' => false,
                'error' => sprintf(
                    __( 'Account number must be at least %d digits.', 'woo-ach-batch' ),
                    self::MIN_ACCOUNT_LENGTH
                ),
            ];
        }

        if ( $length > self::MAX_ACCOUNT_LENGTH ) {
            return [
                'valid' => false,
                'error' => sprintf(
                    __( 'Account number cannot exceed %d digits.', 'woo-ach-batch' ),
                    self::MAX_ACCOUNT_LENGTH
                ),
            ];
        }

        if ( ! ctype_digit( $account ) ) {
            return [
                'valid' => false,
                'error' => __( 'Account number must contain only digits.', 'woo-ach-batch' ),
            ];
        }

        // Check for obviously invalid patterns
        if ( preg_match( '/^0+$/', $account ) || preg_match( '/^(.)\1+$/', $account ) ) {
            return [
                'valid' => false,
                'error' => __( 'Please enter a valid account number.', 'woo-ach-batch' ),
            ];
        }

        return [
            'valid' => true,
        ];
    }

    /**
     * Calculate ABA check digit for a partial routing number
     *
     * Given first 8 digits, calculate what the 9th digit should be.
     *
     * @param string $partial First 8 digits of routing number
     * @return string|null Check digit or null if invalid input
     */
    public function calculate_check_digit( string $partial ): ?string {
        if ( strlen( $partial ) !== 8 || ! ctype_digit( $partial ) ) {
            return null;
        }

        $weights = [ 3, 7, 1, 3, 7, 1, 3, 7 ];
        $sum = 0;

        for ( $i = 0; $i < 8; $i++ ) {
            $sum += (int) $partial[ $i ] * $weights[ $i ];
        }

        // Check digit makes the total divisible by 10
        $check = ( 10 - ( $sum % 10 ) ) % 10;

        return (string) $check;
    }

    /**
     * Format routing number for display (XXX-XXX-XXX)
     *
     * @param string $routing Routing number
     * @return string
     */
    public function format_routing_display( string $routing ): string {
        $routing = $this->sanitize_digits( $routing );

        if ( strlen( $routing ) !== 9 ) {
            return $routing;
        }

        return substr( $routing, 0, 3 ) . '-' . substr( $routing, 3, 3 ) . '-' . substr( $routing, 6, 3 );
    }

    /**
     * Get masked account number for display
     *
     * @param string $account Account number
     * @return string
     */
    public function mask_account( string $account ): string {
        $account = $this->sanitize_digits( $account );

        if ( strlen( $account ) <= 4 ) {
            return str_repeat( '•', strlen( $account ) );
        }

        return str_repeat( '•', strlen( $account ) - 4 ) . substr( $account, -4 );
    }

    /**
     * Remove all non-digit characters
     *
     * @param string $value Input value
     * @return string
     */
    public function sanitize_digits( string $value ): string {
        return preg_replace( '/[^0-9]/', '', $value );
    }

    /**
     * Sanitize account holder name for NACHA
     *
     * NACHA allows: A-Z, 0-9, space
     * Converts to uppercase, removes special characters
     *
     * @param string $name Name to sanitize
     * @return string
     */
    public function sanitize_name( string $name ): string {
        // Convert to uppercase
        $name = strtoupper( trim( $name ) );

        // Remove accents
        $name = remove_accents( $name );

        // Keep only alphanumeric and space
        $name = preg_replace( '/[^A-Z0-9 ]/', '', $name );

        // Collapse multiple spaces
        $name = preg_replace( '/\s+/', ' ', $name );

        return trim( $name );
    }

    /**
     * Validate that the account name reasonably matches the billing name
     *
     * @param string $account_name Account holder name
     * @param string $billing_name Billing name from order
     * @return array{match: bool, similarity: float}
     */
    public function validate_name_match( string $account_name, string $billing_name ): array {
        $account_name = $this->sanitize_name( $account_name );
        $billing_name = $this->sanitize_name( $billing_name );

        // Check for exact match
        if ( $account_name === $billing_name ) {
            return [ 'match' => true, 'similarity' => 1.0 ];
        }

        // Check if one contains the other (partial match for business names, etc.)
        if ( str_contains( $account_name, $billing_name ) || str_contains( $billing_name, $account_name ) ) {
            return [ 'match' => true, 'similarity' => 0.9 ];
        }

        // Calculate similarity
        similar_text( $account_name, $billing_name, $percent );
        $similarity = $percent / 100;

        // Consider it a match if >70% similar
        return [
            'match' => $similarity >= 0.7,
            'similarity' => $similarity,
        ];
    }

    /**
     * Get transaction code for account type and direction
     *
     * @param string $account_type 'checking' or 'savings'
     * @param bool   $is_credit    True for credit, false for debit
     * @return string Two-digit transaction code
     */
    public function get_transaction_code( string $account_type, bool $is_credit ): string {
        // 22 = Checking Credit (deposit)
        // 27 = Checking Debit (withdrawal)
        // 32 = Savings Credit
        // 37 = Savings Debit

        if ( $account_type === 'savings' ) {
            return $is_credit ? '32' : '37';
        }

        return $is_credit ? '22' : '27';
    }

    /**
     * Validate bank details are complete and ready for ACH
     *
     * @param array $bank_details Bank details array
     * @return array{ready: bool, missing: array}
     */
    public function validate_ach_ready( array $bank_details ): array {
        $missing = [];

        if ( empty( $bank_details['routing'] ) ) {
            $missing[] = 'routing';
        } elseif ( ! $this->validate_routing( $bank_details['routing'] )['valid'] ) {
            $missing[] = 'routing (invalid)';
        }

        if ( empty( $bank_details['account'] ) ) {
            $missing[] = 'account';
        } elseif ( ! $this->validate_account( $bank_details['account'] )['valid'] ) {
            $missing[] = 'account (invalid)';
        }

        if ( empty( $bank_details['type'] ) || ! in_array( $bank_details['type'], [ 'checking', 'savings' ], true ) ) {
            $missing[] = 'type';
        }

        return [
            'ready' => empty( $missing ),
            'missing' => $missing,
        ];
    }
}
