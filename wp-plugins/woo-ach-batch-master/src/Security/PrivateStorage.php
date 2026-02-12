<?php
/**
 * Private Storage Handler
 *
 * Provides secure file storage with directory protection and safe write operations.
 * Ensures sensitive files (NACHA, manifests, KYC) are never publicly accessible.
 *
 * @package Nuwud\WooAchBatch\Security
 */

namespace Nuwud\WooAchBatch\Security;

/**
 * Secure file storage service
 *
 * SECURITY NOTES:
 * - All directories created with .htaccess "Deny from all"
 * - All files written with 0600 permissions (owner read/write only)
 * - Index.php prevents directory listing even if .htaccess bypassed
 * - NGINX users MUST add server-level deny rules (see docs)
 */
class PrivateStorage {

    /**
     * Storage types with their subdirectory paths
     */
    public const STORAGE_NACHA = 'nacha';
    public const STORAGE_MANIFEST = 'manifest';
    public const STORAGE_KYC = 'kyc';
    public const STORAGE_TEMP = 'temp';

    /**
     * Base upload directory
     *
     * @var string
     */
    private string $base_dir;

    /**
     * Directories that have been initialized this request
     *
     * @var array<string, bool>
     */
    private static array $initialized_dirs = [];

    /**
     * Constructor
     */
    public function __construct() {
        $upload_dir = wp_upload_dir();
        $this->base_dir = trailingslashit( $upload_dir['basedir'] ) . 'woo-ach-batch-private';
    }

    /**
     * Get the full path to a storage directory
     *
     * @param string $type Storage type constant
     * @return string Full directory path
     */
    public function get_directory( string $type ): string {
        $dir = $this->base_dir . '/' . $type;
        $this->ensure_directory_protected( $dir );
        return $dir;
    }

    /**
     * Write content to a protected file
     *
     * @param string $type     Storage type constant
     * @param string $filename Filename (without path)
     * @param string $content  File content
     * @return string|false Full path on success, false on failure
     */
    public function write( string $type, string $filename, string $content ): string|false {
        $dir = $this->get_directory( $type );

        // Sanitize filename - prevent directory traversal
        $safe_filename = $this->sanitize_filename( $filename );
        if ( ! $safe_filename ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'PrivateStorage: Invalid filename rejected: %s', substr( $filename, 0, 50 ) ),
                'error'
            );
            return false;
        }

        $filepath = $dir . '/' . $safe_filename;

        // Write file
        $result = file_put_contents( $filepath, $content, LOCK_EX );
        if ( false === $result ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'PrivateStorage: Failed to write file: %s', $safe_filename ),
                'error'
            );
            return false;
        }

        // Set restrictive permissions (owner read/write only)
        chmod( $filepath, 0600 );

        return $filepath;
    }

    /**
     * Read content from a protected file
     *
     * @param string $type     Storage type constant
     * @param string $filename Filename (without path)
     * @return string|false Content on success, false on failure
     */
    public function read( string $type, string $filename ): string|false {
        $safe_filename = $this->sanitize_filename( $filename );
        if ( ! $safe_filename ) {
            return false;
        }

        $filepath = $this->get_directory( $type ) . '/' . $safe_filename;

        if ( ! file_exists( $filepath ) ) {
            return false;
        }

        return file_get_contents( $filepath );
    }

    /**
     * Check if a file exists
     *
     * @param string $type     Storage type constant
     * @param string $filename Filename (without path)
     * @return bool
     */
    public function exists( string $type, string $filename ): bool {
        $safe_filename = $this->sanitize_filename( $filename );
        if ( ! $safe_filename ) {
            return false;
        }

        return file_exists( $this->get_directory( $type ) . '/' . $safe_filename );
    }

    /**
     * Delete a file securely
     *
     * For maximum security, overwrites file content before deletion.
     * This prevents recovery from disk forensics.
     *
     * @param string $type     Storage type constant
     * @param string $filename Filename (without path)
     * @param bool   $secure   Whether to securely overwrite before delete
     * @return bool
     */
    public function delete( string $type, string $filename, bool $secure = true ): bool {
        $safe_filename = $this->sanitize_filename( $filename );
        if ( ! $safe_filename ) {
            return false;
        }

        $filepath = $this->get_directory( $type ) . '/' . $safe_filename;

        if ( ! file_exists( $filepath ) ) {
            return true; // Already deleted
        }

        if ( $secure ) {
            $this->secure_overwrite( $filepath );
        }

        return unlink( $filepath );
    }

    /**
     * List files in a storage directory
     *
     * @param string $type    Storage type constant
     * @param string $pattern Optional glob pattern (e.g., '*.ach')
     * @return array<string> List of filenames
     */
    public function list_files( string $type, string $pattern = '*' ): array {
        $dir = $this->get_directory( $type );
        $files = glob( $dir . '/' . $pattern );

        if ( false === $files ) {
            return [];
        }

        return array_map( 'basename', $files );
    }

    /**
     * Get file info
     *
     * @param string $type     Storage type constant
     * @param string $filename Filename
     * @return array|null File info or null if not found
     */
    public function get_file_info( string $type, string $filename ): ?array {
        $safe_filename = $this->sanitize_filename( $filename );
        if ( ! $safe_filename ) {
            return null;
        }

        $filepath = $this->get_directory( $type ) . '/' . $safe_filename;

        if ( ! file_exists( $filepath ) ) {
            return null;
        }

        return [
            'filename' => $safe_filename,
            'path' => $filepath,
            'size' => filesize( $filepath ),
            'modified' => filemtime( $filepath ),
            'permissions' => substr( sprintf( '%o', fileperms( $filepath ) ), -4 ),
        ];
    }

    /**
     * Purge old files from a storage directory
     *
     * @param string $type       Storage type constant
     * @param int    $max_age    Maximum age in seconds
     * @param bool   $secure     Whether to securely delete
     * @return int Number of files purged
     */
    public function purge_old_files( string $type, int $max_age, bool $secure = true ): int {
        $files = $this->list_files( $type );
        $cutoff = time() - $max_age;
        $purged = 0;

        foreach ( $files as $filename ) {
            $info = $this->get_file_info( $type, $filename );
            if ( $info && $info['modified'] < $cutoff ) {
                if ( $this->delete( $type, $filename, $secure ) ) {
                    $purged++;
                }
            }
        }

        return $purged;
    }

    /**
     * Ensure directory exists and is protected
     *
     * @param string $dir Directory path
     */
    private function ensure_directory_protected( string $dir ): void {
        // Skip if already initialized this request
        if ( isset( self::$initialized_dirs[ $dir ] ) ) {
            return;
        }

        // Create directory if needed
        if ( ! file_exists( $dir ) ) {
            wp_mkdir_p( $dir );
        }

        // Create .htaccess to deny all access
        $htaccess = $dir . '/.htaccess';
        if ( ! file_exists( $htaccess ) ) {
            $htaccess_content = <<<HTACCESS
# Deny all direct access - WooCommerce ACH Batch Security
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Order deny,allow
    Deny from all
</IfModule>

# Disable PHP execution as extra protection
<FilesMatch "\.php$">
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order deny,allow
        Deny from all
    </IfModule>
</FilesMatch>
HTACCESS;
            file_put_contents( $htaccess, $htaccess_content );
            chmod( $htaccess, 0644 );
        }

        // Create index.php to prevent directory listing
        $index = $dir . '/index.php';
        if ( ! file_exists( $index ) ) {
            file_put_contents( $index, "<?php\n// Silence is golden.\nhttp_response_code(403);\nexit;\n" );
            chmod( $index, 0644 );
        }

        // Create index.html as backup
        $index_html = $dir . '/index.html';
        if ( ! file_exists( $index_html ) ) {
            file_put_contents( $index_html, '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head><body></body></html>' );
            chmod( $index_html, 0644 );
        }

        self::$initialized_dirs[ $dir ] = true;
    }

    /**
     * Sanitize filename to prevent directory traversal
     *
     * @param string $filename Input filename
     * @return string|false Sanitized filename or false if invalid
     */
    private function sanitize_filename( string $filename ): string|false {
        // Remove any path components
        $filename = basename( $filename );

        // Remove null bytes and other dangerous characters
        $filename = str_replace( [ "\0", "\n", "\r" ], '', $filename );

        // Only allow alphanumeric, dash, underscore, dot
        if ( ! preg_match( '/^[a-zA-Z0-9_\-\.]+$/', $filename ) ) {
            return false;
        }

        // Prevent hidden files
        if ( str_starts_with( $filename, '.' ) ) {
            return false;
        }

        // Prevent dangerous extensions
        $dangerous_extensions = [ 'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phar', 'htaccess' ];
        $ext = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
        if ( in_array( $ext, $dangerous_extensions, true ) ) {
            return false;
        }

        return $filename;
    }

    /**
     * Securely overwrite file before deletion
     *
     * Writes random data over the file content multiple times.
     * This is a defense-in-depth measure; encrypted-at-rest storage
     * is the primary protection.
     *
     * @param string $filepath File path
     */
    private function secure_overwrite( string $filepath ): void {
        if ( ! file_exists( $filepath ) ) {
            return;
        }

        $size = filesize( $filepath );
        if ( $size <= 0 ) {
            return;
        }

        // Limit overwrite to 10MB to prevent DoS on huge files
        $overwrite_size = min( $size, 10 * 1024 * 1024 );

        try {
            $handle = fopen( $filepath, 'r+b' );
            if ( ! $handle ) {
                return;
            }

            // Overwrite with random data
            fwrite( $handle, random_bytes( $overwrite_size ) );

            // Overwrite with zeros
            fseek( $handle, 0 );
            fwrite( $handle, str_repeat( "\0", $overwrite_size ) );

            fclose( $handle );
        } catch ( \Exception $e ) {
            // Silently fail - unlink will still happen
        }
    }

    /**
     * Get base directory path
     *
     * @return string
     */
    public function get_base_directory(): string {
        $this->ensure_directory_protected( $this->base_dir );
        return $this->base_dir;
    }

    /**
     * Verify directory protection is in place
     *
     * Used for health checks and admin notices.
     *
     * @return array{protected: bool, issues: array}
     */
    public function verify_protection(): array {
        $issues = [];

        // Check base directory
        if ( ! file_exists( $this->base_dir . '/.htaccess' ) ) {
            $issues[] = 'Missing .htaccess in base directory';
        }

        // Check each storage type
        $types = [ self::STORAGE_NACHA, self::STORAGE_MANIFEST, self::STORAGE_KYC, self::STORAGE_TEMP ];
        foreach ( $types as $type ) {
            $dir = $this->base_dir . '/' . $type;
            if ( file_exists( $dir ) && ! file_exists( $dir . '/.htaccess' ) ) {
                $issues[] = sprintf( 'Missing .htaccess in %s directory', $type );
            }
        }

        return [
            'protected' => empty( $issues ),
            'issues' => $issues,
        ];
    }
}
