<?php
/**
 * Plugin Name: H-Moon Security Hardening
 * Description: Essential WordPress security hardening without bloat. Replaces premium security plugins for basic protection.
 * Version: 1.0.0
 * Author: H-Moon Hydro
 * 
 * INSTALLATION: Upload to wp-content/mu-plugins/ (creates if doesn't exist)
 * MU-plugins load automatically and cannot be deactivated via admin.
 */

defined('ABSPATH') || exit;

/**
 * ============================================
 * 1. HIDE WORDPRESS VERSION
 * ============================================
 */
remove_action('wp_head', 'wp_generator');
add_filter('the_generator', '__return_empty_string');

// Remove version from scripts and styles
add_filter('style_loader_src', 'hmoon_remove_version_query', 10, 2);
add_filter('script_loader_src', 'hmoon_remove_version_query', 10, 2);
function hmoon_remove_version_query($src, $handle) {
    if (strpos($src, 'ver=')) {
        $src = remove_query_arg('ver', $src);
    }
    return $src;
}

/**
 * ============================================
 * 2. DISABLE XML-RPC (Common attack vector)
 * ============================================
 */
add_filter('xmlrpc_enabled', '__return_false');
add_filter('wp_headers', function($headers) {
    unset($headers['X-Pingback']);
    return $headers;
});

/**
 * ============================================
 * 3. DISABLE FILE EDITING IN ADMIN
 * ============================================
 */
if (!defined('DISALLOW_FILE_EDIT')) {
    define('DISALLOW_FILE_EDIT', true);
}

/**
 * ============================================
 * 4. LIMIT LOGIN ATTEMPTS
 * ============================================
 */
class HMoon_Login_Limiter {
    private $max_attempts = 5;
    private $lockout_time = 900; // 15 minutes
    
    public function __construct() {
        add_filter('authenticate', [$this, 'check_attempts'], 30, 3);
        add_action('wp_login_failed', [$this, 'record_failed_attempt']);
        add_action('wp_login', [$this, 'clear_attempts'], 10, 2);
    }
    
    public function check_attempts($user, $username, $password) {
        if (empty($username)) return $user;
        
        $ip = $this->get_ip();
        $attempts = get_transient('hmoon_login_attempts_' . md5($ip));
        
        if ($attempts && $attempts >= $this->max_attempts) {
            return new WP_Error(
                'too_many_attempts',
                sprintf(
                    __('Too many failed login attempts. Please try again in %d minutes.', 'hmoon-security'),
                    ceil($this->lockout_time / 60)
                )
            );
        }
        
        return $user;
    }
    
    public function record_failed_attempt($username) {
        $ip = $this->get_ip();
        $key = 'hmoon_login_attempts_' . md5($ip);
        $attempts = get_transient($key) ?: 0;
        set_transient($key, $attempts + 1, $this->lockout_time);
        
        // Log for admin awareness
        if ($attempts + 1 >= $this->max_attempts) {
            error_log("[HMoon Security] IP $ip locked out after " . ($attempts + 1) . " failed attempts for user: $username");
        }
    }
    
    public function clear_attempts($username, $user) {
        $ip = $this->get_ip();
        delete_transient('hmoon_login_attempts_' . md5($ip));
    }
    
    private function get_ip() {
        $ip = $_SERVER['REMOTE_ADDR'];
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            $ip = trim($ips[0]);
        }
        return filter_var($ip, FILTER_VALIDATE_IP) ?: '0.0.0.0';
    }
}
new HMoon_Login_Limiter();

/**
 * ============================================
 * 5. SECURITY HEADERS
 * ============================================
 */
add_action('send_headers', function() {
    if (is_admin()) return;
    
    // Prevent clickjacking
    header('X-Frame-Options: SAMEORIGIN');
    
    // Prevent MIME type sniffing
    header('X-Content-Type-Options: nosniff');
    
    // Enable XSS filtering
    header('X-XSS-Protection: 1; mode=block');
    
    // Referrer policy
    header('Referrer-Policy: strict-origin-when-cross-origin');
    
    // Permissions policy (disable unnecessary browser features)
    header("Permissions-Policy: geolocation=(), microphone=(), camera=()");
});

/**
 * ============================================
 * 6. DISABLE AUTHOR ARCHIVES (username enumeration)
 * ============================================
 */
add_action('template_redirect', function() {
    if (is_author()) {
        wp_redirect(home_url(), 301);
        exit;
    }
});

// Block ?author=N queries
add_filter('redirect_canonical', function($redirect, $request) {
    if (preg_match('/\?author=(\d+)/i', $request)) {
        wp_redirect(home_url(), 301);
        exit;
    }
    return $redirect;
}, 10, 2);

/**
 * ============================================
 * 7. DISABLE REST API USER ENUMERATION
 * ============================================
 */
add_filter('rest_endpoints', function($endpoints) {
    if (!is_user_logged_in()) {
        // Remove user endpoints for non-logged-in users
        if (isset($endpoints['/wp/v2/users'])) {
            unset($endpoints['/wp/v2/users']);
        }
        if (isset($endpoints['/wp/v2/users/(?P<id>[\d]+)'])) {
            unset($endpoints['/wp/v2/users/(?P<id>[\d]+)']);
        }
    }
    return $endpoints;
});

/**
 * ============================================
 * 8. REMOVE UNNECESSARY HEADER INFO
 * ============================================
 */
remove_action('wp_head', 'wlwmanifest_link');
remove_action('wp_head', 'rsd_link');
remove_action('wp_head', 'wp_shortlink_wp_head');
remove_action('wp_head', 'adjacent_posts_rel_link_wp_head', 10);
remove_action('wp_head', 'feed_links_extra', 3);

/**
 * ============================================
 * 9. DISABLE EMBEDS (oEmbed)
 * ============================================
 */
add_action('init', function() {
    // Remove oEmbed discovery links
    remove_action('wp_head', 'wp_oembed_add_discovery_links');
    remove_action('wp_head', 'wp_oembed_add_host_js');
    
    // Disable oEmbed auto discovery
    add_filter('embed_oembed_discover', '__return_false');
    
    // Remove oEmbed REST route
    remove_action('rest_api_init', 'wp_oembed_register_route');
});

/**
 * ============================================
 * 10. ADMIN SECURITY NOTICES
 * ============================================
 */
add_action('admin_notices', function() {
    if (!current_user_can('manage_options')) return;
    
    $notices = [];
    
    // Check for default 'admin' username
    if (username_exists('admin')) {
        $notices[] = '⚠️ The username "admin" exists. Consider using a less predictable admin username.';
    }
    
    // Check for WP_DEBUG in production
    if (defined('WP_DEBUG') && WP_DEBUG && !defined('WP_DEBUG_LOG')) {
        $notices[] = '⚠️ WP_DEBUG is enabled but errors may be displayed publicly. Add WP_DEBUG_LOG to log errors instead.';
    }
    
    // Check table prefix
    global $wpdb;
    if ($wpdb->prefix === 'wp_') {
        $notices[] = '⚠️ Default table prefix "wp_" in use. Consider changing for additional security.';
    }
    
    foreach ($notices as $notice) {
        echo '<div class="notice notice-warning"><p><strong>H-Moon Security:</strong> ' . esc_html($notice) . '</p></div>';
    }
});

/**
 * ============================================
 * 11. BLOCK SUSPICIOUS QUERY STRINGS
 * ============================================
 */
add_action('init', function() {
    if (is_admin()) return;
    
    $request = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
    $query = isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '';
    
    // Block common SQL injection patterns
    $blocked_patterns = [
        '/(\%27)|(\')|(\-\-)|(\%23)|(#)/i',           // SQL meta characters
        '/(union)(\s+)(select)/i',                     // UNION SELECT
        '/(select)(\s+)(benchmark|sleep|pg_sleep)/i', // Timing attacks
        '/(<|%3C).*script.*(>|%3E)/i',                // XSS
        '/(base64_encode|base64_decode)/i',            // Base64 encoding attempts
    ];
    
    foreach ($blocked_patterns as $pattern) {
        if (preg_match($pattern, $request) || preg_match($pattern, $query)) {
            status_header(403);
            exit('Access Denied');
        }
    }
});

/**
 * ============================================
 * ADMIN PAGE - Security Status
 * ============================================
 */
add_action('admin_menu', function() {
    add_submenu_page(
        'tools.php',
        'Security Status',
        'Security Status',
        'manage_options',
        'hmoon-security',
        'hmoon_security_status_page'
    );
});

function hmoon_security_status_page() {
    ?>
    <div class="wrap">
        <h1>H-Moon Security Status</h1>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th>Protection</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>WordPress Version Hidden</td>
                    <td>✅ Active</td>
                </tr>
                <tr>
                    <td>XML-RPC Disabled</td>
                    <td>✅ Active</td>
                </tr>
                <tr>
                    <td>File Editor Disabled</td>
                    <td><?php echo defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT ? '✅ Active' : '❌ Not Set'; ?></td>
                </tr>
                <tr>
                    <td>Login Attempt Limiting</td>
                    <td>✅ Active (5 attempts, 15min lockout)</td>
                </tr>
                <tr>
                    <td>Security Headers</td>
                    <td>✅ Active</td>
                </tr>
                <tr>
                    <td>Author Archives Disabled</td>
                    <td>✅ Active</td>
                </tr>
                <tr>
                    <td>REST API User Enumeration</td>
                    <td>✅ Blocked for guests</td>
                </tr>
                <tr>
                    <td>Query String Filtering</td>
                    <td>✅ Active</td>
                </tr>
            </tbody>
        </table>
        
        <h2 style="margin-top:20px;">Recent Login Lockouts</h2>
        <p><em>Check error_log for [HMoon Security] entries.</em></p>
        
        <h2>Recommendations</h2>
        <ul>
            <li>✅ Keep WordPress, themes, and plugins updated</li>
            <li>✅ Use strong passwords (12+ characters)</li>
            <li>✅ Enable 2FA for admin accounts (via separate plugin if needed)</li>
            <li>✅ Regular backups with UpdraftPlus</li>
            <li>✅ SSL certificate active (HTTPS)</li>
        </ul>
    </div>
    <?php
}
