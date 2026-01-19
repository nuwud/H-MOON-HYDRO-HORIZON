<?php
/**
 * Admin Settings
 *
 * Handles all plugin settings with a unified interface.
 * Provides both modern dot-notation API and legacy get_option/update_option compatibility.
 *
 * SECURITY: Sensitive fields (passwords, secrets) are NOT stored by this class directly.
 * Use SecureSettings wrapper for any field requiring encryption at rest.
 *
 * @package Nuwud\WooAchBatch\Admin
 */

namespace Nuwud\WooAchBatch\Admin;

/**
 * Settings management class
 */
class Settings {

    /**
     * Option keys for different setting groups
     */
    private const OPTION_KEYS = [
        'general' => 'woo_ach_batch_settings',
        'nacha' => 'woo_ach_batch_nacha_settings',
        'sftp' => 'woo_ach_batch_sftp_settings',
        'schedule' => 'woo_ach_batch_schedule_settings',
        'kyc' => 'woo_ach_batch_kyc_settings',
        'verification' => 'woo_ach_batch_verification_settings',
    ];

    /**
     * Maps flat field names to group.key notation for backward compatibility
     * Used by get_option() and update_option() for template compatibility
     */
    private const FIELD_MAP = [
        // General
        'enabled' => 'general.enabled',
        'test_mode' => 'general.test_mode',
        'logging_level' => 'general.logging_level',

        // NACHA
        'odfi_routing' => 'nacha.immediate_destination',
        'odfi_name' => 'nacha.immediate_destination_name',
        'company_id' => 'nacha.company_id',
        'company_name' => 'nacha.company_name',
        'company_entry_description' => 'nacha.company_entry_description',
        'originator_dfi' => 'nacha.originating_dfi_id',
        'immediate_destination' => 'nacha.immediate_destination',
        'immediate_origin' => 'nacha.immediate_origin',

        // SFTP (non-sensitive - sensitive handled by SecureSettings)
        'sftp_host' => 'sftp.host',
        'sftp_port' => 'sftp.port',
        'sftp_username' => 'sftp.username',
        'sftp_auth_type' => 'sftp.auth_type',
        'sftp_private_key_path' => 'sftp.private_key_path',
        'sftp_remote_path' => 'sftp.remote_path',
        'sftp_password_encrypted' => 'sftp.password_encrypted',
        'private_key_passphrase_encrypted' => 'sftp.private_key_passphrase_encrypted',

        // Verification
        'verification_method' => 'verification.method',
        'plaid_client_id' => 'verification.plaid_client_id',
        'plaid_environment' => 'verification.plaid_environment',
        'enable_micro_deposits' => 'verification.enable_micro_deposits',
        'plaid_secret_encrypted' => 'verification.plaid_secret_encrypted',
        // Note: plaid_secret password save handled by SecureSettings

        // Schedule
        'export_times' => 'schedule.export_times',
        'timezone' => 'schedule.timezone',
    ];

    /**
     * Cached settings
     *
     * @var array<string, array>
     */
    private array $cache = [];

    /**
     * Get a setting value
     *
     * @param string $key     Setting key in dot notation (e.g., 'nacha.company_id')
     * @param mixed  $default Default value if not found
     * @return mixed
     */
    public function get( string $key, mixed $default = null ): mixed {
        $parts = explode( '.', $key );
        $group = $parts[0] ?? 'general';
        $setting_key = $parts[1] ?? null;

        $settings = $this->get_group( $group );

        if ( null === $setting_key ) {
            return $settings;
        }

        return $settings[ $setting_key ] ?? $default;
    }

    /**
     * Set a setting value
     *
     * @param string $key   Setting key in dot notation
     * @param mixed  $value Value to set
     * @return bool
     */
    public function set( string $key, mixed $value ): bool {
        $parts = explode( '.', $key );
        $group = $parts[0] ?? 'general';
        $setting_key = $parts[1] ?? null;

        if ( null === $setting_key ) {
            return false;
        }

        $settings = $this->get_group( $group );
        $settings[ $setting_key ] = $value;

        return $this->save_group( $group, $settings );
    }

    /**
     * Get all settings for a group
     *
     * @param string $group Group name
     * @return array
     */
    public function get_group( string $group ): array {
        if ( isset( $this->cache[ $group ] ) ) {
            return $this->cache[ $group ];
        }

        $option_key = self::OPTION_KEYS[ $group ] ?? self::OPTION_KEYS['general'];
        $this->cache[ $group ] = get_option( $option_key, [] );

        return $this->cache[ $group ];
    }

    /**
     * Save settings for a group
     *
     * @param string $group    Group name
     * @param array  $settings Settings array
     * @return bool
     */
    public function save_group( string $group, array $settings ): bool {
        $option_key = self::OPTION_KEYS[ $group ] ?? self::OPTION_KEYS['general'];

        // Clear cache
        unset( $this->cache[ $group ] );

        return update_option( $option_key, $settings );
    }

    /**
     * COMPATIBILITY: Get a setting using flat field name
     *
     * Maps legacy field names (used in templates) to dot-notation group.key.
     * For new code, prefer using get() with dot notation directly.
     *
     * @param string $field   Flat field name (e.g., 'sftp_host')
     * @param mixed  $default Default value
     * @return mixed
     */
    public function get_option( string $field, mixed $default = '' ): mixed {
        // Check field map for translation
        if ( isset( self::FIELD_MAP[ $field ] ) ) {
            return $this->get( self::FIELD_MAP[ $field ], $default );
        }

        // Direct passthrough - try each group
        foreach ( array_keys( self::OPTION_KEYS ) as $group ) {
            $group_settings = $this->get_group( $group );
            if ( isset( $group_settings[ $field ] ) ) {
                return $group_settings[ $field ];
            }
        }

        return $default;
    }

    /**
     * COMPATIBILITY: Update a setting using flat field name
     *
     * Maps legacy field names to dot-notation group.key.
     * SECURITY: Do NOT use for sensitive fields - use SecureSettings instead.
     *
     * @param string $field Field name
     * @param mixed  $value Value to set
     * @return bool
     */
    public function update_option( string $field, mixed $value ): bool {
        // Check field map for translation
        if ( isset( self::FIELD_MAP[ $field ] ) ) {
            return $this->set( self::FIELD_MAP[ $field ], $value );
        }

        // Try to infer group from field prefix
        $group = $this->infer_group_from_field( $field );
        return $this->set( $group . '.' . $field, $value );
    }

    /**
     * Infer setting group from field name prefix
     *
     * @param string $field Field name
     * @return string Group name
     */
    private function infer_group_from_field( string $field ): string {
        if ( str_starts_with( $field, 'sftp_' ) ) {
            return 'sftp';
        }
        if ( str_starts_with( $field, 'plaid_' ) || str_starts_with( $field, 'verification_' ) ) {
            return 'verification';
        }
        if ( str_contains( $field, 'dfi' ) || str_contains( $field, 'company' ) || str_contains( $field, 'odfi' ) ) {
            return 'nacha';
        }
        if ( str_contains( $field, 'time' ) || str_contains( $field, 'zone' ) || str_contains( $field, 'schedule' ) ) {
            return 'schedule';
        }
        if ( str_contains( $field, 'kyc' ) ) {
            return 'kyc';
        }
        return 'general';
    }

    /**
     * Check if an encrypted field has a value set
     *
     * Use this instead of get_option() for password fields to avoid exposing data.
     *
     * @param string $field Encrypted field name
     * @return bool
     */
    public function has_encrypted_value( string $field ): bool {
        $value = $this->get_option( $field, '' );
        return ! empty( $value );
    }

    /**
     * Get all NACHA configuration
     *
     * @return array
     */
    public function get_nacha_config(): array {
        $defaults = [
            'immediate_destination' => '',
            'immediate_destination_name' => '',
            'immediate_origin' => '',
            'immediate_origin_name' => '',
            'company_id' => '',
            'company_name' => 'H MOON HYDRO',
            'company_entry_description' => 'PURCHASE',
            'company_discretionary_data' => '',
            'originating_dfi_id' => '',
            'sec_code' => 'PPD',
            'service_class_code' => '200',
            'entry_class_code' => 'PPD',
            'file_id_modifier' => 'A',
            'record_size' => '094',
            'blocking_factor' => '10',
            'format_code' => '1',
        ];

        return array_merge( $defaults, $this->get_group( 'nacha' ) );
    }

    /**
     * Get SFTP configuration
     *
     * @return array
     */
    public function get_sftp_config(): array {
        $defaults = [
            'host' => '',
            'port' => '22',
            'username' => '',
            'auth_type' => 'password',
            'password_encrypted' => '',
            'private_key_path' => '',
            'private_key_passphrase_encrypted' => '',
            'remote_path' => '/incoming/',
            'return_path' => '/returns/',
            'enabled' => 'no',
        ];

        return array_merge( $defaults, $this->get_group( 'sftp' ) );
    }

    /**
     * Get schedule configuration
     *
     * @return array
     */
    public function get_schedule_config(): array {
        $defaults = [
            'enabled' => 'yes',
            'morning_time' => '13:00',
            'midnight_time' => '00:00',
            'timezone' => 'America/Los_Angeles',
        ];

        return array_merge( $defaults, $this->get_group( 'schedule' ) );
    }

    /**
     * Get KYC configuration
     *
     * @return array
     */
    public function get_kyc_config(): array {
        $defaults = [
            'require_id_front' => 'no',
            'require_id_back' => 'no',
            'require_voided_check' => 'no',
            'storage_method' => 'private',
            'max_file_size' => 5, // MB
            'allowed_types' => [ 'jpg', 'jpeg', 'png', 'pdf' ],
        ];

        return array_merge( $defaults, $this->get_group( 'kyc' ) );
    }

    /**
     * Get logging level
     *
     * @return string
     */
    public function get_logging_level(): string {
        return $this->get( 'general.logging_level', 'error' );
    }

    /**
     * Check if batch scheduling is enabled
     *
     * @return bool
     */
    public function is_schedule_enabled(): bool {
        return $this->get( 'schedule.enabled', 'yes' ) === 'yes';
    }

    /**
     * Check if SFTP upload is enabled
     *
     * @return bool
     */
    public function is_sftp_enabled(): bool {
        $config = $this->get_sftp_config();
        return $config['enabled'] === 'yes' && ! empty( $config['host'] );
    }

    /**
     * Validate NACHA settings are complete
     *
     * @return array{valid: bool, missing: array}
     */
    public function validate_nacha_settings(): array {
        $config = $this->get_nacha_config();
        $required = [
            'immediate_destination',
            'immediate_origin',
            'company_id',
            'originating_dfi_id',
        ];

        $missing = [];
        foreach ( $required as $field ) {
            if ( empty( $config[ $field ] ) ) {
                $missing[] = $field;
            }
        }

        return [
            'valid' => empty( $missing ),
            'missing' => $missing,
        ];
    }

    /**
     * Get transaction code for account type
     *
     * @param string $account_type 'checking' or 'savings'
     * @param bool   $is_credit    Whether this is a credit (vs debit)
     * @return string
     */
    public function get_transaction_code( string $account_type, bool $is_credit = false ): string {
        // NACHA Transaction Codes:
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
     * Clear settings cache
     */
    public function clear_cache(): void {
        $this->cache = [];
    }

    /**
     * Export settings (for backup/debugging)
     *
     * @param bool $include_sensitive Include encrypted credentials
     * @return array
     */
    public function export_settings( bool $include_sensitive = false ): array {
        $export = [];

        foreach ( self::OPTION_KEYS as $group => $option_key ) {
            $settings = $this->get_group( $group );

            if ( ! $include_sensitive ) {
                // Remove sensitive fields
                unset(
                    $settings['password_encrypted'],
                    $settings['private_key_passphrase_encrypted']
                );
            }

            $export[ $group ] = $settings;
        }

        return $export;
    }

    /**
     * Import settings (restore from backup)
     *
     * @param array $settings Settings array from export
     * @return bool
     */
    public function import_settings( array $settings ): bool {
        $success = true;

        foreach ( $settings as $group => $values ) {
            if ( isset( self::OPTION_KEYS[ $group ] ) ) {
                if ( ! $this->save_group( $group, $values ) ) {
                    $success = false;
                }
            }
        }

        return $success;
    }
}
