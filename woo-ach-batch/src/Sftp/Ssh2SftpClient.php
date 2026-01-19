<?php
/**
 * SSH2 SFTP Client
 *
 * SFTP implementation using PHP's native ssh2 extension.
 *
 * SECURITY: Credentials are only decrypted at connection time using SecureSettings.
 * Decrypted values are not stored in instance properties.
 *
 * @package Nuwud\WooAchBatch\Sftp
 */

namespace Nuwud\WooAchBatch\Sftp;

use Nuwud\WooAchBatch\Admin\Settings;
use Nuwud\WooAchBatch\Security\SecureSettings;

/**
 * Native ssh2 extension-based SFTP client (fallback implementation)
 */
class Ssh2SftpClient implements SftpClientInterface {

    /**
     * Settings service
     */
    private Settings $settings;

    /**
     * Secure settings for credential decryption
     */
    private SecureSettings $secure_settings;

    /**
     * SSH connection resource
     *
     * @var resource|null
     */
    private $connection = null;

    /**
     * SFTP subsystem resource
     *
     * @var resource|null
     */
    private $sftp = null;

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

        // Connect
        $this->connection = @ssh2_connect(
            $config['host'],
            (int) ( $config['port'] ?? 22 )
        );

        if ( ! $this->connection ) {
            throw new \RuntimeException( 'SSH connection failed to ' . $config['host'] );
        }

        // Authenticate
        $authenticated = false;

        if ( $config['auth_type'] === 'key' && ! empty( $config['private_key_path'] ) ) {
            $authenticated = $this->authenticateWithKey( $config );
        } else {
            $authenticated = $this->authenticateWithPassword( $config );
        }

        if ( ! $authenticated ) {
            $this->connection = null;
            throw new \RuntimeException( 'SSH authentication failed' );
        }

        // Initialize SFTP subsystem
        $this->sftp = @ssh2_sftp( $this->connection );

        if ( ! $this->sftp ) {
            $this->connection = null;
            throw new \RuntimeException( 'Could not initialize SFTP subsystem' );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'SFTP connected (ssh2) to %s:%d', $config['host'], $config['port'] ?? 22 ),
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
        $pub_key_path = $config['private_key_path'] . '.pub';
        $priv_key_path = $config['private_key_path'];

        // Decrypt passphrase using SecureSettings - only at call time
        $passphrase = $this->secure_settings->get_sftp_passphrase();

        $result = @ssh2_auth_pubkey_file(
            $this->connection,
            $config['username'],
            $pub_key_path,
            $priv_key_path,
            $passphrase ?? ''
        );

        // Explicitly clear passphrase from memory
        $passphrase = null;

        return $result;
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
        // Decrypt password using SecureSettings - only at call time
        $password = $this->secure_settings->get_sftp_password() ?? '';

        $result = @ssh2_auth_password(
            $this->connection,
            $config['username'],
            $password
        );

        // Explicitly clear password from memory
        $password = '';

        return $result;
    }

    /**
     * Disconnect from SFTP server
     */
    public function disconnect(): void {
        // ssh2 extension doesn't have an explicit disconnect
        // Resources are freed when set to null
        $this->sftp = null;
        $this->connection = null;

        \Nuwud\WooAchBatch\log_message( 'SFTP (ssh2) disconnected', 'debug' );
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

        $sftp_path = 'ssh2.sftp://' . intval( $this->sftp ) . $remote_path;

        // Ensure remote directory exists
        $remote_dir = dirname( $remote_path );
        if ( $remote_dir !== '.' && $remote_dir !== '/' ) {
            @ssh2_sftp_mkdir( $this->sftp, $remote_dir, 0755, true );
        }

        // Copy file
        $local_content = file_get_contents( $local_path );
        $result = @file_put_contents( $sftp_path, $local_content );

        if ( false === $result ) {
            throw new \RuntimeException( 'SFTP upload failed' );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'SFTP (ssh2) uploaded: %s -> %s', basename( $local_path ), $remote_path ),
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

        $sftp_path = 'ssh2.sftp://' . intval( $this->sftp ) . $remote_path;

        $remote_content = @file_get_contents( $sftp_path );

        if ( false === $remote_content ) {
            throw new \RuntimeException( 'SFTP download failed' );
        }

        $result = file_put_contents( $local_path, $remote_content );

        if ( false === $result ) {
            throw new \RuntimeException( 'Failed to write local file' );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'SFTP (ssh2) downloaded: %s -> %s', $remote_path, basename( $local_path ) ),
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

        $sftp_path = 'ssh2.sftp://' . intval( $this->sftp ) . $remote_path;

        $handle = @opendir( $sftp_path );

        if ( ! $handle ) {
            throw new \RuntimeException( 'SFTP directory listing failed' );
        }

        $files = [];
        while ( ( $file = readdir( $handle ) ) !== false ) {
            if ( $file !== '.' && $file !== '..' ) {
                $files[] = $file;
            }
        }

        closedir( $handle );

        return $files;
    }

    /**
     * Check if a remote file exists
     *
     * @param string $remote_path Remote file path
     * @return bool
     */
    public function fileExists( string $remote_path ): bool {
        $this->ensureConnected();

        $sftp_path = 'ssh2.sftp://' . intval( $this->sftp ) . $remote_path;

        return @file_exists( $sftp_path );
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

        $result = @ssh2_sftp_unlink( $this->sftp, $remote_path );

        if ( ! $result ) {
            throw new \RuntimeException( 'SFTP delete failed' );
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
            $listing = $this->listDirectory( $remote_path );

            $this->disconnect();

            return [
                'success' => true,
                'message' => sprintf(
                    'Connection successful (ssh2). Remote path contains %d items.',
                    count( $listing )
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
        return $this->connection !== null && $this->sftp !== null;
    }

    /**
     * Ensure we're connected
     *
     * @throws \RuntimeException If not connected
     */
    private function ensureConnected(): void {
        if ( ! $this->isConnected() ) {
            throw new \RuntimeException( 'SFTP not connected. Call connect() first.' );
        }
    }

    /**
     * Destructor
     */
    public function __destruct() {
        $this->disconnect();
    }
}
