<?php
/**
 * SFTP Client Factory
 *
 * Creates the appropriate SFTP client based on available extensions.
 *
 * SECURITY: SFTP credentials (password/passphrase) are retrieved decrypted
 * from SecureSettings only at connection time, never stored in memory long-term.
 *
 * @package Nuwud\WooAchBatch\Sftp
 */

namespace Nuwud\WooAchBatch\Sftp;

use Nuwud\WooAchBatch\Admin\Settings;
use Nuwud\WooAchBatch\Security\SecureSettings;

/**
 * Factory for creating SFTP clients with secure credential handling
 */
class SftpClientFactory {

    /**
     * Create an SFTP client based on available extensions
     *
     * @param Settings       $settings        Settings service
     * @param SecureSettings $secure_settings Secure settings for credential decryption
     * @return SftpClientInterface
     * @throws \RuntimeException If no SFTP implementation is available
     */
    public static function create( Settings $settings, SecureSettings $secure_settings ): SftpClientInterface {
        // Prefer phpseclib for portability
        if ( class_exists( '\\phpseclib3\\Net\\SFTP' ) ) {
            return new PhpseclibSftpClient( $settings, $secure_settings );
        }

        // Fallback to native ssh2 extension
        if ( function_exists( 'ssh2_connect' ) ) {
            return new Ssh2SftpClient( $settings, $secure_settings );
        }

        // Return a null client that throws when used
        return new NullSftpClient();
    }

    /**
     * Check which SFTP implementations are available
     *
     * @return array{phpseclib: bool, ssh2: bool}
     */
    public static function getAvailableImplementations(): array {
        return [
            'phpseclib' => class_exists( '\\phpseclib3\\Net\\SFTP' ),
            'ssh2' => function_exists( 'ssh2_connect' ),
        ];
    }
}
