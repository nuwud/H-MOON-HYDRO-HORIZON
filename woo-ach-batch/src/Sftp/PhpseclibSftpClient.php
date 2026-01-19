<?php
/**
 * phpseclib SFTP Client
 *
 * SFTP implementation using phpseclib3 library.
 *
 * SECURITY: Credentials are only decrypted at connection time using SecureSettings.
 * Decrypted values are not stored in instance properties.
 *
 * @package Nuwud\WooAchBatch\Sftp
 */

namespace Nuwud\WooAchBatch\Sftp;

use Nuwud\WooAchBatch\Admin\Settings;
use Nuwud\WooAchBatch\Security\SecureSettings;
use phpseclib3\Net\SFTP;
use phpseclib3\Crypt\PublicKeyLoader;

/**
 * phpseclib-based SFTP client (preferred implementation)
 */
class PhpseclibSftpClient implements SftpClientInterface {

    /**
     * Settings service
     */
    private Settings $settings;

    /**
     * Secure settings for credential decryption
     */
    private SecureSettings $secure_settings;

    /**
     * SFTP connection
     */
    private ?SFTP $sftp = null;

    /**
     * Constructor
     *
     * @param Settings       $settings        Settings service
     * @param SecureSettings $secure_settings Secure settings for credentials
     */
    public function __construct( Settings $settings, SecureSettings $secure_settings ) {
        $this->settings = $settings;
        $this->secure_settings = $secure_settings;
    }

    /**
     * Connect to SFTP server
     *
     * @throws \RuntimeException On connection failure
     */
    public function connect(): void {
        if ( $this->isConnected() ) {
            return;
        }

        $config = $this->settings->get_sftp_config();

        if ( empty( $config['host'] ) ) {
            throw new \RuntimeException( 'SFTP host not configured' );
        }

        $this->sftp = new SFTP( $config['host'], (int) ( $config['port'] ?? 22 ) );

        // Set timeout
        $this->sftp->setTimeout( 30 );

        // Authenticate
        $authenticated = false;

        if ( $config['auth_type'] === 'key' && ! empty( $config['private_key_path'] ) ) {
            // Key-based authentication
            $authenticated = $this->authenticateWithKey( $config );
        } else {
            // Password authentication
            $authenticated = $this->authenticateWithPassword( $config );
        }

        if ( ! $authenticated ) {
            $this->sftp = null;
            throw new \RuntimeException( 'SFTP authentication failed' );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'SFTP connected to %s:%d', $config['host'], $config['port'] ?? 22 ),
            'debug'
        );
    }

    /**
     * Authenticate using private key
     *
     * SECURITY: Passphrase is decrypted at call time and not stored.
     *
     * @param array $config SFTP configuration
     * @return bool
     */
    private function authenticateWithKey( array $config ): bool {
        $key_path = $config['private_key_path'];

        if ( ! file_exists( $key_path ) ) {
            throw new \RuntimeException( 'Private key file not found: ' . $key_path );
        }

        $key_content = file_get_contents( $key_path );

        try {
            // Decrypt passphrase using SecureSettings - only at call time
            $passphrase = $this->secure_settings->get_sftp_passphrase();

            $key = PublicKeyLoader::load( $key_content, $passphrase ?? false );

            // Explicitly clear passphrase from memory
            $passphrase = null;

            return $this->sftp->login( $config['username'], $key );

        } catch ( \Exception $e ) {
            throw new \RuntimeException( 'Private key authentication failed: ' . $e->getMessage() );
        }
    }

    /**
     * Authenticate using password
     *
     * SECURITY: Password is decrypted at call time and not stored.
     *
     * @param array $config SFTP configuration
     * @return bool
     */
    private function authenticateWithPassword( array $config ): bool {
        if ( empty( $config['username'] ) ) {
            throw new \RuntimeException( 'SFTP username not configured' );
        }

        // Decrypt password using SecureSettings - only at call time
        $password = $this->secure_settings->get_sftp_password() ?? '';

        $result = $this->sftp->login( $config['username'], $password );

        // Explicitly clear password from memory
        $password = '';

        return $result;
    }

    /**
     * Disconnect from SFTP server
     */
    public function disconnect(): void {
        if ( $this->sftp ) {
            $this->sftp->disconnect();
            $this->sftp = null;

            \Nuwud\WooAchBatch\log_message( 'SFTP disconnected', 'debug' );
        }
    }

    /**
     * Upload a file to the SFTP server
     *
     * @param string $local_path  Local file path
     * @param string $remote_path Remote destination path
     * @return bool
     * @throws \RuntimeException On upload failure
     */
    public function upload( string $local_path, string $remote_path ): bool {
        $this->ensureConnected();

        if ( ! file_exists( $local_path ) ) {
            throw new \RuntimeException( 'Local file not found: ' . $local_path );
        }

        // Ensure remote directory exists
        $remote_dir = dirname( $remote_path );
        if ( $remote_dir !== '.' && $remote_dir !== '/' ) {
            $this->sftp->mkdir( $remote_dir, -1, true );
        }

        // Upload file
        $result = $this->sftp->put( $remote_path, $local_path, SFTP::SOURCE_LOCAL_FILE );

        if ( ! $result ) {
            throw new \RuntimeException( 'SFTP upload failed: ' . $this->sftp->getLastSFTPError() );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'SFTP uploaded: %s -> %s', basename( $local_path ), $remote_path ),
            'debug'
        );

        return true;
    }

    /**
     * Download a file from the SFTP server
     *
     * @param string $remote_path Remote file path
     * @param string $local_path  Local destination path
     * @return bool
     * @throws \RuntimeException On download failure
     */
    public function download( string $remote_path, string $local_path ): bool {
        $this->ensureConnected();

        // Ensure local directory exists
        $local_dir = dirname( $local_path );
        if ( ! file_exists( $local_dir ) ) {
            wp_mkdir_p( $local_dir );
        }

        $result = $this->sftp->get( $remote_path, $local_path );

        if ( false === $result ) {
            throw new \RuntimeException( 'SFTP download failed: ' . $this->sftp->getLastSFTPError() );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'SFTP downloaded: %s -> %s', $remote_path, basename( $local_path ) ),
            'debug'
        );

        return true;
    }

    /**
     * List files in a remote directory
     *
     * @param string $remote_path Remote directory path
     * @return array File listing
     * @throws \RuntimeException On listing failure
     */
    public function listDirectory( string $remote_path ): array {
        $this->ensureConnected();

        $listing = $this->sftp->nlist( $remote_path );

        if ( false === $listing ) {
            throw new \RuntimeException( 'SFTP directory listing failed: ' . $this->sftp->getLastSFTPError() );
        }

        // Filter out . and ..
        return array_values( array_filter( $listing, fn( $item ) => ! in_array( $item, [ '.', '..' ], true ) ) );
    }

    /**
     * Check if a remote file exists
     *
     * @param string $remote_path Remote file path
     * @return bool
     */
    public function fileExists( string $remote_path ): bool {
        $this->ensureConnected();

        return $this->sftp->file_exists( $remote_path );
    }

    /**
     * Delete a remote file
     *
     * @param string $remote_path Remote file path
     * @return bool
     * @throws \RuntimeException On deletion failure
     */
    public function delete( string $remote_path ): bool {
        $this->ensureConnected();

        $result = $this->sftp->delete( $remote_path );

        if ( ! $result ) {
            throw new \RuntimeException( 'SFTP delete failed: ' . $this->sftp->getLastSFTPError() );
        }

        return true;
    }

    /**
     * Test the connection
     *
     * @return array{success: bool, message: string}
     */
    public function testConnection(): array {
        try {
            $this->connect();

            $config = $this->settings->get_sftp_config();
            $remote_path = rtrim( $config['remote_path'] ?? '/', '/' );

            // Try to list the remote directory
            $listing = $this->sftp->nlist( $remote_path );

            $this->disconnect();

            if ( false === $listing ) {
                return [
                    'success' => false,
                    'message' => 'Connected but cannot access remote path: ' . $remote_path,
                ];
            }

            return [
                'success' => true,
                'message' => sprintf(
                    'Connection successful. Remote path contains %d items.',
                    count( array_filter( $listing, fn( $item ) => ! in_array( $item, [ '.', '..' ], true ) ) )
                ),
            ];

        } catch ( \Exception $e ) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Check if client is currently connected
     *
     * @return bool
     */
    public function isConnected(): bool {
        return $this->sftp && $this->sftp->isConnected();
    }

    /**
     * Ensure we're connected, throw if not
     *
     * @throws \RuntimeException If not connected
     */
    private function ensureConnected(): void {
        if ( ! $this->isConnected() ) {
            throw new \RuntimeException( 'SFTP not connected. Call connect() first.' );
        }
    }

    /**
     * Destructor - ensure disconnect
     */
    public function __destruct() {
        $this->disconnect();
    }
}
