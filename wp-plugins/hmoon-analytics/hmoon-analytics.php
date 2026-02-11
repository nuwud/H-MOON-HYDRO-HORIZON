<?php
/**
 * Plugin Name: H-Moon Analytics & Tracking
 * Description: Lightweight Google Analytics 4 and Facebook Pixel integration. Replaces bloated analytics plugins.
 * Version: 1.0.0
 * Author: H-Moon Hydro
 * 
 * INSTRUCTIONS:
 * 1. Upload to wp-content/plugins/ and activate
 * 2. Go to Settings → H-Moon Analytics
 * 3. Enter your GA4 Measurement ID and/or Facebook Pixel ID
 */

defined('ABSPATH') || exit;

class HMoon_Analytics {
    
    private $ga4_id;
    private $fb_pixel_id;
    private $gtm_id;
    
    public function __construct() {
        $this->ga4_id = get_option('hmoon_ga4_id', '');
        $this->fb_pixel_id = get_option('hmoon_fb_pixel_id', '');
        $this->gtm_id = get_option('hmoon_gtm_id', '');
        
        // Frontend tracking
        add_action('wp_head', [$this, 'output_tracking_head'], 1);
        add_action('wp_body_open', [$this, 'output_gtm_body'], 1);
        
        // WooCommerce tracking
        if (class_exists('WooCommerce')) {
            add_action('woocommerce_thankyou', [$this, 'track_purchase']);
            add_action('woocommerce_add_to_cart', [$this, 'track_add_to_cart'], 10, 6);
        }
        
        // Admin settings
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
    }
    
    /**
     * Output tracking code in <head>
     */
    public function output_tracking_head() {
        // Skip admin and logged-in admins (optional)
        if (is_admin() || (is_user_logged_in() && current_user_can('manage_options'))) {
            return;
        }
        
        // Google Analytics 4
        if (!empty($this->ga4_id)) {
            $this->output_ga4();
        }
        
        // Google Tag Manager (head portion)
        if (!empty($this->gtm_id)) {
            $this->output_gtm_head();
        }
        
        // Facebook Pixel
        if (!empty($this->fb_pixel_id)) {
            $this->output_fb_pixel();
        }
    }
    
    /**
     * Google Analytics 4
     */
    private function output_ga4() {
        $ga4_id = esc_attr($this->ga4_id);
        ?>
<!-- H-Moon: Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo $ga4_id; ?>"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '<?php echo $ga4_id; ?>', {
    'anonymize_ip': true,
    'cookie_flags': 'SameSite=None;Secure'
});
<?php if (class_exists('WooCommerce') && is_product()): 
    global $product;
    if ($product): ?>
gtag('event', 'view_item', {
    'currency': '<?php echo get_woocommerce_currency(); ?>',
    'value': <?php echo $product->get_price(); ?>,
    'items': [{
        'item_id': '<?php echo $product->get_sku() ?: $product->get_id(); ?>',
        'item_name': '<?php echo esc_js($product->get_name()); ?>',
        'price': <?php echo $product->get_price(); ?>
    }]
});
<?php endif; endif; ?>
</script>
        <?php
    }
    
    /**
     * Google Tag Manager - Head
     */
    private function output_gtm_head() {
        $gtm_id = esc_attr($this->gtm_id);
        ?>
<!-- H-Moon: Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','<?php echo $gtm_id; ?>');</script>
        <?php
    }
    
    /**
     * Google Tag Manager - Body (noscript)
     */
    public function output_gtm_body() {
        if (empty($this->gtm_id) || is_admin()) return;
        $gtm_id = esc_attr($this->gtm_id);
        ?>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=<?php echo $gtm_id; ?>"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
        <?php
    }
    
    /**
     * Facebook Pixel
     */
    private function output_fb_pixel() {
        $pixel_id = esc_attr($this->fb_pixel_id);
        ?>
<!-- H-Moon: Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '<?php echo $pixel_id; ?>');
fbq('track', 'PageView');
<?php if (class_exists('WooCommerce') && is_product()): 
    global $product;
    if ($product): ?>
fbq('track', 'ViewContent', {
    content_ids: ['<?php echo $product->get_sku() ?: $product->get_id(); ?>'],
    content_name: '<?php echo esc_js($product->get_name()); ?>',
    content_type: 'product',
    value: <?php echo $product->get_price(); ?>,
    currency: '<?php echo get_woocommerce_currency(); ?>'
});
<?php endif; endif; ?>
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=<?php echo $pixel_id; ?>&ev=PageView&noscript=1"/></noscript>
        <?php
    }
    
    /**
     * Track WooCommerce purchase
     */
    public function track_purchase($order_id) {
        if (!$order_id) return;
        
        $order = wc_get_order($order_id);
        if (!$order || $order->get_meta('_hmoon_tracked')) return;
        
        $items = [];
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $items[] = [
                'item_id' => $product ? ($product->get_sku() ?: $product->get_id()) : $item->get_product_id(),
                'item_name' => $item->get_name(),
                'price' => $item->get_total() / $item->get_quantity(),
                'quantity' => $item->get_quantity(),
            ];
        }
        
        $order_data = [
            'transaction_id' => $order->get_order_number(),
            'value' => $order->get_total(),
            'currency' => $order->get_currency(),
            'tax' => $order->get_total_tax(),
            'shipping' => $order->get_shipping_total(),
            'items' => $items,
        ];
        
        ?>
        <script>
        <?php if (!empty($this->ga4_id)): ?>
        gtag('event', 'purchase', <?php echo json_encode($order_data); ?>);
        <?php endif; ?>
        
        <?php if (!empty($this->fb_pixel_id)): ?>
        fbq('track', 'Purchase', {
            content_ids: <?php echo json_encode(array_column($items, 'item_id')); ?>,
            content_type: 'product',
            value: <?php echo $order->get_total(); ?>,
            currency: '<?php echo $order->get_currency(); ?>'
        });
        <?php endif; ?>
        </script>
        <?php
        
        $order->update_meta_data('_hmoon_tracked', true);
        $order->save();
    }
    
    /**
     * Settings page
     */
    public function add_settings_page() {
        add_options_page(
            'H-Moon Analytics',
            'H-Moon Analytics',
            'manage_options',
            'hmoon-analytics',
            [$this, 'render_settings_page']
        );
    }
    
    public function register_settings() {
        register_setting('hmoon_analytics', 'hmoon_ga4_id', 'sanitize_text_field');
        register_setting('hmoon_analytics', 'hmoon_fb_pixel_id', 'sanitize_text_field');
        register_setting('hmoon_analytics', 'hmoon_gtm_id', 'sanitize_text_field');
    }
    
    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>H-Moon Analytics</h1>
            <p>Lightweight tracking without the bloat. Enter your tracking IDs below.</p>
            
            <form method="post" action="options.php">
                <?php settings_fields('hmoon_analytics'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="hmoon_ga4_id">Google Analytics 4 ID</label>
                        </th>
                        <td>
                            <input type="text" id="hmoon_ga4_id" name="hmoon_ga4_id" 
                                   value="<?php echo esc_attr(get_option('hmoon_ga4_id')); ?>" 
                                   class="regular-text" placeholder="G-XXXXXXXXXX">
                            <p class="description">Found in GA4 → Admin → Data Streams → Measurement ID</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="hmoon_gtm_id">Google Tag Manager ID</label>
                        </th>
                        <td>
                            <input type="text" id="hmoon_gtm_id" name="hmoon_gtm_id" 
                                   value="<?php echo esc_attr(get_option('hmoon_gtm_id')); ?>" 
                                   class="regular-text" placeholder="GTM-XXXXXXX">
                            <p class="description">Optional. Use GTM OR GA4, not both (GTM can contain GA4)</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="hmoon_fb_pixel_id">Facebook Pixel ID</label>
                        </th>
                        <td>
                            <input type="text" id="hmoon_fb_pixel_id" name="hmoon_fb_pixel_id" 
                                   value="<?php echo esc_attr(get_option('hmoon_fb_pixel_id')); ?>" 
                                   class="regular-text" placeholder="123456789012345">
                            <p class="description">Found in Facebook Events Manager → Data Sources → Pixel ID</p>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <hr>
            
            <h2>WooCommerce Events Tracked</h2>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>GA4</th>
                        <th>Facebook</th>
                        <th>Trigger</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Page View</td>
                        <td>✅</td>
                        <td>✅</td>
                        <td>Every page load</td>
                    </tr>
                    <tr>
                        <td>View Product</td>
                        <td>✅ view_item</td>
                        <td>✅ ViewContent</td>
                        <td>Product page view</td>
                    </tr>
                    <tr>
                        <td>Purchase</td>
                        <td>✅ purchase</td>
                        <td>✅ Purchase</td>
                        <td>Order confirmation</td>
                    </tr>
                </tbody>
            </table>
            
            <p style="margin-top:20px;"><em>Note: Admin users are excluded from tracking.</em></p>
        </div>
        <?php
    }
}

new HMoon_Analytics();
