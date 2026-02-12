<?php
/**
 * Encryption Service
 *
 * Handles encryption/decryption of sensitive data at rest.
 *
 * @package Nuwud\WooAchBatch\Security
 */

namespace Nuwud\WooAchBatch\Security;

/**
 * Encryption helper for secure data storage
 */
class Encryption {

    /**
     * Encryption cipher method
     */
    private const CIPHER = 'aes-256-gcm';

    /**
     * Tag length for GCM
     */
    private const TAG_LENGTH = 16;

    /**
     * Get the encryption key
     *
     * @return string
     * @throws \RuntimeException If no valid key is available
     */
    private function get_key(): string {
        // First priority: Dedicated constant in wp-config.php
        if ( defined( 'WOO_ACH_BATCH_ENCRYPTION_KEY' ) && strlen( WOO_ACH_BATCH_ENCRYPTION_KEY ) >= 32 ) {
            return substr( WOO_ACH_BATCH_ENCRYPTION_KEY, 0, 32 );
        }

        // Second priority: Derive from WordPress salts
        if ( defined( 'LOGGED_IN_KEY' ) && defined( 'NONCE_KEY' ) ) {
            $derived = hash( 'sha256', LOGGED_IN_KEY . NONCE_KEY . 'woo-ach-batch', true );
            return substr( $derived, 0, 32 );
        }

        throw new \RuntimeException(
            'No encryption key available. Define WOO_ACH_BATCH_ENCRYPTION_KEY in wp-config.php'
        );
    }

    /**
     * Encrypt data
     *
     * @param string $plaintext Data to encrypt
     * @return string Base64-encoded encrypted data (iv:tag:ciphertext)
     * @throws \RuntimeException On encryption failure
     */
    public function encrypt( string $plaintext ): string {
        $key = $this->get_key();

        // Generate random IV
        $iv = random_bytes( openssl_cipher_iv_length( self::CIPHER ) );

        // Encrypt
        $tag = '';
        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LENGTH
        );

        if ( false === $ciphertext ) {
            throw new \RuntimeException( 'Encryption failed: ' . openssl_error_string() );
        }

        // Combine IV + tag + ciphertext and base64 encode
        return base64_encode( $iv . $tag . $ciphertext );
    }

    /**
     * Decrypt data
     *
     * @param string $encrypted Base64-encoded encrypted data
     * @return string Decrypted plaintext
     * @throws \RuntimeException On decryption failure
     */
    public function decrypt( string $encrypted ): string {
        $key = $this->get_key();

        // Decode
        $data = base64_decode( $encrypted, true );
        if ( false === $data ) {
            throw new \RuntimeException( 'Invalid encrypted data: base64 decode failed' );
        }

        // Extract components
        $iv_length = openssl_cipher_iv_length( self::CIPHER );
        if ( strlen( $data ) < $iv_length + self::TAG_LENGTH ) {
            throw new \RuntimeException( 'Invalid encrypted data: too short' );
        }

        $iv = substr( $data, 0, $iv_length );
        $tag = substr( $data, $iv_length, self::TAG_LENGTH );
        $ciphertext = substr( $data, $iv_length + self::TAG_LENGTH );

        // Decrypt
        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ( false === $plaintext ) {
            throw new \RuntimeException( 'Decryption failed: ' . openssl_error_string() );
        }

        return $plaintext;
    }

    /**
     * Hash a value for comparison (one-way)
     *
     * @param string $value Value to hash
     * @return string
     */
    public function hash( string $value ): string {
        $key = $this->get_key();
        return hash_hmac( 'sha256', $value, $key );
    }

    /**
     * Verify a value against a hash
     *
     * @param string $value Value to verify
     * @param string $hash  Hash to compare against
     * @return bool
     */
    public function verify_hash( string $value, string $hash ): bool {
        return hash_equals( $hash, $this->hash( $value ) );
    }

    /**
     * Check if encryption is available
     *
     * @return bool
     */
    public function is_available(): bool {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            return false;
        }

        if ( ! in_array( self::CIPHER, openssl_get_cipher_methods(), true ) ) {
            return false;
        }

        try {
            $this->get_key();
            return true;
        } catch ( \RuntimeException $e ) {
            return false;
        }
    }

    /**
     * Rotate encryption key - re-encrypt all stored data with new key
     *
     * @param string $old_key Old encryption key
     * @param string $new_key New encryption key
     * @return array Results of re-encryption
     */
    public function rotate_key( string $old_key, string $new_key ): array {
        global $wpdb;

        $results = [
            'success' => 0,
            'failed' => 0,
            'errors' => [],
        ];

        // Find all orders with encrypted ACH data
        $meta_keys = [ '_ach_routing_encrypted', '_ach_account_encrypted' ];

        foreach ( $meta_keys as $meta_key ) {
            $orders = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s",
                    $meta_key
                )
            );

            foreach ( $orders as $order_data ) {
                try {
                    // Decrypt with old key
                    $plaintext = $this->decrypt_with_key( $order_data->meta_value, $old_key );

                    // Encrypt with new key
                    $new_encrypted = $this->encrypt_with_key( $plaintext, $new_key );

                    // Update
                    $wpdb->update(
                        $wpdb->postmeta,
                        [ 'meta_value' => $new_encrypted ],
                        [ 'post_id' => $order_data->post_id, 'meta_key' => $meta_key ]
                    );

                    $results['success']++;
                } catch ( \Exception $e ) {
                    $results['failed']++;
                    $results['errors'][] = sprintf(
                        'Order %d, key %s: %s',
                        $order_data->post_id,
                        $meta_key,
                        $e->getMessage()
                    );
                }
            }
        }

        return $results;
    }

    /**
     * Encrypt with a specific key
     *
     * @param string $plaintext Data to encrypt
     * @param string $key       Encryption key
     * @return string
     */
    private function encrypt_with_key( string $plaintext, string $key ): string {
        $key = substr( $key, 0, 32 );
        $iv = random_bytes( openssl_cipher_iv_length( self::CIPHER ) );
        $tag = '';

        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LENGTH
        );

        return base64_encode( $iv . $tag . $ciphertext );
    }

    /**
     * Decrypt with a specific key
     *
     * @param string $encrypted Encrypted data
     * @param string $key       Encryption key
     * @return string
     */
    private function decrypt_with_key( string $encrypted, string $key ): string {
        $key = substr( $key, 0, 32 );
        $data = base64_decode( $encrypted, true );

        $iv_length = openssl_cipher_iv_length( self::CIPHER );
        $iv = substr( $data, 0, $iv_length );
        $tag = substr( $data, $iv_length, self::TAG_LENGTH );
        $ciphertext = substr( $data, $iv_length + self::TAG_LENGTH );

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ( false === $plaintext ) {
            throw new \RuntimeException( 'Decryption failed' );
        }

        return $plaintext;
    }
}
