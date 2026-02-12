<?php
/**
 * Secure Settings Handler
 *
 * Wrapper around Settings that provides transparent encryption/decryption
 * for sensitive configuration values like SFTP credentials.
 *
 * SECURITY: All sensitive settings are encrypted at rest using AES-256-GCM.
 * Decryption only happens in memory when credentials are actively needed.
 *
 * @package Nuwud\WooAchBatch\Security
 */

namespace Nuwud\WooAchBatch\Security;

use Nuwud\WooAchBatch\Admin\Settings;

/**
 * Handles secure storage and retrieval of sensitive settings
 */
class SecureSettings {

    /**
     * Encryption service
     */
    private Encryption $encryption;

    /**
     * Base settings service
     */
    private Settings $settings;

    /**
     * Audit log for tracking sensitive operations
     */
    private AuditLog $audit_log;

    /**
     * Settings keys that require encryption
     * Format: 'group.key' => encrypted key suffix
     */
    private const ENCRYPTED_KEYS = [
        'sftp.password' => 'password_encrypted',
        'sftp.private_key_passphrase' => 'private_key_passphrase_encrypted',
        'verification.plaid_secret' => 'plaid_secret_encrypted',
    ];

    /**
     * Constructor
     *
     * @param Encryption $encryption Encryption service
     * @param Settings   $settings   Base settings service
     * @param AuditLog   $audit_log  Audit log service
     */
    public function __construct( Encryption $encryption, Settings $settings, AuditLog $audit_log ) {
        $this->encryption = $encryption;
        $this->settings = $settings;
        $this->audit_log = $audit_log;
    }

    /**
     * Save SFTP password (encrypted)
     *
     * @param string $password Plaintext password
     * @return bool Success
     */
    public function save_sftp_password( string $password ): bool {
        if ( empty( $password ) ) {
            // Allow clearing the password
            return $this->settings->set( 'sftp.password_encrypted', '' );
        }

        $encrypted = $this->encryption->encrypt( $password );

        $this->audit_log->log( 'sftp_password_updated', 'settings', null, [
            'action' => 'encrypted_and_saved',
        ]);

        return $this->settings->set( 'sftp.password_encrypted', $encrypted );
    }

    /**
     * Get SFTP password (decrypted)
     *
     * SECURITY: Only call when password is actively needed for SFTP connection.
     *
     * @return string|null Decrypted password or null if not set
     */
    public function get_sftp_password(): ?string {
        $encrypted = $this->settings->get( 'sftp.password_encrypted', '' );

        if ( empty( $encrypted ) ) {
            return null;
        }

        try {
            $password = $this->encryption->decrypt( $encrypted );

            $this->audit_log->log( 'sftp_password_accessed', 'settings', null, [
                'action' => 'decrypted_for_use',
            ]);

            return $password;
        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                'Failed to decrypt SFTP password: ' . $e->getMessage(),
                'error'
            );
            return null;
        }
    }

    /**
     * Save SFTP private key passphrase (encrypted)
     *
     * @param string $passphrase Plaintext passphrase
     * @return bool Success
     */
    public function save_sftp_passphrase( string $passphrase ): bool {
        if ( empty( $passphrase ) ) {
            return $this->settings->set( 'sftp.private_key_passphrase_encrypted', '' );
        }

        $encrypted = $this->encryption->encrypt( $passphrase );

        $this->audit_log->log( 'sftp_passphrase_updated', 'settings', null, [
            'action' => 'encrypted_and_saved',
        ]);

        return $this->settings->set( 'sftp.private_key_passphrase_encrypted', $encrypted );
    }

    /**
     * Get SFTP private key passphrase (decrypted)
     *
     * @return string|null Decrypted passphrase or null if not set
     */
    public function get_sftp_passphrase(): ?string {
        $encrypted = $this->settings->get( 'sftp.private_key_passphrase_encrypted', '' );

        if ( empty( $encrypted ) ) {
            return null;
        }

        try {
            $passphrase = $this->encryption->decrypt( $encrypted );

            $this->audit_log->log( 'sftp_passphrase_accessed', 'settings', null, [
                'action' => 'decrypted_for_use',
            ]);

            return $passphrase;
        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                'Failed to decrypt SFTP passphrase: ' . $e->getMessage(),
                'error'
            );
            return null;
        }
    }

    /**
     * Save Plaid API secret (encrypted)
     *
     * @param string $secret Plaintext Plaid secret
     * @return bool Success
     */
    public function save_plaid_secret( string $secret ): bool {
        if ( empty( $secret ) ) {
            return $this->settings->set( 'verification.plaid_secret_encrypted', '' );
        }

        $encrypted = $this->encryption->encrypt( $secret );

        $this->audit_log->log( 'plaid_secret_updated', 'settings', null, [
            'action' => 'encrypted_and_saved',
        ]);

        return $this->settings->set( 'verification.plaid_secret_encrypted', $encrypted );
    }

    /**
     * Get Plaid API secret (decrypted)
     *
     * SECURITY: Only call when secret is actively needed for Plaid API calls.
     *
     * @return string|null Decrypted secret or null if not set
     */
    public function get_plaid_secret(): ?string {
        $encrypted = $this->settings->get( 'verification.plaid_secret_encrypted', '' );

        if ( empty( $encrypted ) ) {
            return null;
        }

        try {
            $secret = $this->encryption->decrypt( $encrypted );

            $this->audit_log->log( 'plaid_secret_accessed', 'settings', null, [
                'action' => 'decrypted_for_use',
            ]);

            return $secret;
        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                'Failed to decrypt Plaid secret: ' . $e->getMessage(),
                'error'
            );
            return null;
        }
    }

    /**
     * Get SFTP configuration with decrypted credentials
     *
     * SECURITY: Only call when establishing SFTP connection.
     * Do not store the returned array or pass to logging/display functions.
     *
     * @return array SFTP config with decrypted credentials
     */
    public function get_sftp_config_decrypted(): array {
        $config = $this->settings->get_sftp_config();

        // Decrypt credentials in place
        if ( ! empty( $config['password_encrypted'] ) ) {
            try {
                $config['password'] = $this->encryption->decrypt( $config['password_encrypted'] );
            } catch ( \Exception $e ) {
                $config['password'] = '';
            }
        } else {
            $config['password'] = '';
        }

        if ( ! empty( $config['private_key_passphrase_encrypted'] ) ) {
            try {
                $config['passphrase'] = $this->encryption->decrypt( $config['private_key_passphrase_encrypted'] );
            } catch ( \Exception $e ) {
                $config['passphrase'] = '';
            }
        } else {
            $config['passphrase'] = '';
        }

        // Remove encrypted versions from output
        unset( $config['password_encrypted'], $config['private_key_passphrase_encrypted'] );

        return $config;
    }

    /**
     * Check if SFTP credentials are configured
     *
     * Does NOT decrypt - just checks if encrypted values exist.
     *
     * @return array{has_password: bool, has_passphrase: bool, has_private_key: bool}
     */
    public function check_sftp_credentials(): array {
        $config = $this->settings->get_sftp_config();

        return [
            'has_password' => ! empty( $config['password_encrypted'] ),
            'has_passphrase' => ! empty( $config['private_key_passphrase_encrypted'] ),
            'has_private_key' => ! empty( $config['private_key_path'] ) && file_exists( $config['private_key_path'] ),
        ];
    }

    /**
     * Migrate plaintext SFTP credentials to encrypted storage
     *
     * Call this during plugin upgrade to encrypt any existing plaintext credentials.
     *
     * @return array{password_migrated: bool, passphrase_migrated: bool}
     */
    public function migrate_plaintext_credentials(): array {
        $result = [
            'password_migrated' => false,
            'passphrase_migrated' => false,
        ];

        $config = $this->settings->get_sftp_config();

        // Check for plaintext password (old key without _encrypted suffix)
        $plaintext_password = $this->settings->get( 'sftp.password', '' );
        if ( ! empty( $plaintext_password ) && empty( $config['password_encrypted'] ) ) {
            if ( $this->save_sftp_password( $plaintext_password ) ) {
                // Remove plaintext version
                $this->settings->set( 'sftp.password', '' );
                $result['password_migrated'] = true;

                \Nuwud\WooAchBatch\log_message(
                    'Migrated plaintext SFTP password to encrypted storage',
                    'info'
                );
            }
        }

        // Check for plaintext passphrase
        $plaintext_passphrase = $this->settings->get( 'sftp.private_key_passphrase', '' );
        if ( ! empty( $plaintext_passphrase ) && empty( $config['private_key_passphrase_encrypted'] ) ) {
            if ( $this->save_sftp_passphrase( $plaintext_passphrase ) ) {
                $this->settings->set( 'sftp.private_key_passphrase', '' );
                $result['passphrase_migrated'] = true;

                \Nuwud\WooAchBatch\log_message(
                    'Migrated plaintext SFTP passphrase to encrypted storage',
                    'info'
                );
            }
        }

        return $result;
    }

    /**
     * Verify encryption key is working
     *
     * Tests that we can encrypt and decrypt a test value.
     *
     * @return bool True if encryption is working
     */
    public function verify_encryption(): bool {
        $test_value = 'woo_ach_batch_encryption_test_' . time();

        try {
            $encrypted = $this->encryption->encrypt( $test_value );
            $decrypted = $this->encryption->decrypt( $encrypted );

            return $decrypted === $test_value;
        } catch ( \Exception $e ) {
            \Nuwud\WooAchBatch\log_message(
                'Encryption verification failed: ' . $e->getMessage(),
                'error'
            );
            return false;
        }
    }
}
