<?php
/**
 * Null SFTP Client
 *
 * Stub implementation when no SFTP library is available.
 *
 * @package Nuwud\WooAchBatch\Sftp
 */

namespace Nuwud\WooAchBatch\Sftp;

/**
 * Null SFTP client (throws when used)
 */
class NullSftpClient implements SftpClientInterface {

    /**
     * Connect to SFTP server
     *
     * @throws \RuntimeException Always
     */
    public function connect(): void {
        throw new \RuntimeException(
            'No SFTP implementation available. Install phpseclib (composer require phpseclib/phpseclib) or enable the ssh2 PHP extension.'
        );
    }

    /**
     * Disconnect from SFTP server
     */
    public function disconnect(): void {
        // No-op
    }

    /**
     * Upload a file
     *
     * @param string $local_path  Local file path
     * @param string $remote_path Remote destination path
     * @return bool
     * @throws \RuntimeException Always
     */
    public function upload( string $local_path, string $remote_path ): bool {
        throw new \RuntimeException( 'SFTP not available' );
    }

    /**
     * Download a file
     *
     * @param string $remote_path Remote file path
     * @param string $local_path  Local destination path
     * @return bool
     * @throws \RuntimeException Always
     */
    public function download( string $remote_path, string $local_path ): bool {
        throw new \RuntimeException( 'SFTP not available' );
    }

    /**
     * List directory
     *
     * @param string $remote_path Remote directory path
     * @return array
     * @throws \RuntimeException Always
     */
    public function listDirectory( string $remote_path ): array {
        throw new \RuntimeException( 'SFTP not available' );
    }

    /**
     * Check if file exists
     *
     * @param string $remote_path Remote file path
     * @return bool
     */
    public function fileExists( string $remote_path ): bool {
        return false;
    }

    /**
     * Delete a file
     *
     * @param string $remote_path Remote file path
     * @return bool
     * @throws \RuntimeException Always
     */
    public function delete( string $remote_path ): bool {
        throw new \RuntimeException( 'SFTP not available' );
    }

    /**
     * Test connection
     *
     * @return array{success: bool, message: string}
     */
    public function testConnection(): array {
        return [
            'success' => false,
            'message' => 'No SFTP implementation available. Install phpseclib or enable the ssh2 PHP extension.',
        ];
    }

    /**
     * Check if connected
     *
     * @return bool
     */
    public function isConnected(): bool {
        return false;
    }
}
