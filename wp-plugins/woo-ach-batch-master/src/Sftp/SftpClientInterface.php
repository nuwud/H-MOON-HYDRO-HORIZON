<?php
/**
 * SFTP Client Interface
 *
 * Defines the contract for SFTP operations.
 *
 * @package Nuwud\WooAchBatch\Sftp
 */

namespace Nuwud\WooAchBatch\Sftp;

/**
 * SFTP client interface
 */
interface SftpClientInterface {

    /**
     * Connect to SFTP server
     *
     * @throws \RuntimeException On connection failure
     */
    public function connect(): void;

    /**
     * Disconnect from SFTP server
     */
    public function disconnect(): void;

    /**
     * Upload a file to the SFTP server
     *
     * @param string $local_path  Local file path
     * @param string $remote_path Remote destination path
     * @return bool
     * @throws \RuntimeException On upload failure
     */
    public function upload( string $local_path, string $remote_path ): bool;

    /**
     * Download a file from the SFTP server
     *
     * @param string $remote_path Remote file path
     * @param string $local_path  Local destination path
     * @return bool
     * @throws \RuntimeException On download failure
     */
    public function download( string $remote_path, string $local_path ): bool;

    /**
     * List files in a remote directory
     *
     * @param string $remote_path Remote directory path
     * @return array File listing
     * @throws \RuntimeException On listing failure
     */
    public function listDirectory( string $remote_path ): array;

    /**
     * Check if a remote file exists
     *
     * @param string $remote_path Remote file path
     * @return bool
     */
    public function fileExists( string $remote_path ): bool;

    /**
     * Delete a remote file
     *
     * @param string $remote_path Remote file path
     * @return bool
     * @throws \RuntimeException On deletion failure
     */
    public function delete( string $remote_path ): bool;

    /**
     * Test the connection
     *
     * @return array{success: bool, message: string}
     */
    public function testConnection(): array;

    /**
     * Check if client is currently connected
     *
     * @return bool
     */
    public function isConnected(): bool;
}
