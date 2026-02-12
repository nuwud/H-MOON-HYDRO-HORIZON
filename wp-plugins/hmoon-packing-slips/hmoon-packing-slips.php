<?php
/**
 * Plugin Name: HMoon Packing Slips
 * Description: Custom packing slip generator for H-Moon Hydro orders
 * Version: 1.0.0
 * Author: H-Moon Hydro
 * Requires at least: 5.0
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class HMoon_Packing_Slips {
    
    private static $instance = null;
    
    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // Add "Print Packing Slip" to order actions
        add_filter('woocommerce_admin_order_actions', [$this, 'add_packing_slip_action'], 10, 2);
        
        // Add bulk action
        add_filter('bulk_actions-edit-shop_order', [$this, 'add_bulk_packing_slip_action']);
        add_filter('handle_bulk_actions-edit-shop_order', [$this, 'handle_bulk_packing_slip'], 10, 3);
        
        // Add to order meta box
        add_action('add_meta_boxes', [$this, 'add_meta_box']);
        
        // Handle print request
        add_action('admin_init', [$this, 'maybe_print_packing_slip']);
        
        // Add admin styles
        add_action('admin_enqueue_scripts', [$this, 'admin_styles']);
    }
    
    /**
     * Add print icon to order row
     */
    public function add_packing_slip_action($actions, $order) {
        $actions['packing_slip'] = [
            'url' => wp_nonce_url(
                admin_url('admin.php?action=hmoon_print_packing_slip&order_id=' . $order->get_id()),
                'hmoon_packing_slip'
            ),
            'name' => __('Packing Slip', 'hmoon-packing-slips'),
            'action' => 'packing_slip',
        ];
        return $actions;
    }
    
    /**
     * Add bulk action for multiple orders
     */
    public function add_bulk_packing_slip_action($actions) {
        $actions['print_packing_slips'] = __('Print Packing Slips', 'hmoon-packing-slips');
        return $actions;
    }
    
    /**
     * Handle bulk packing slip print
     */
    public function handle_bulk_packing_slip($redirect_to, $action, $order_ids) {
        if ($action !== 'print_packing_slips') {
            return $redirect_to;
        }
        
        $url = wp_nonce_url(
            admin_url('admin.php?action=hmoon_print_packing_slip&order_ids=' . implode(',', $order_ids)),
            'hmoon_packing_slip'
        );
        
        wp_redirect($url);
        exit;
    }
    
    /**
     * Add meta box to order page
     */
    public function add_meta_box() {
        add_meta_box(
            'hmoon_packing_slip',
            __('Packing Slip', 'hmoon-packing-slips'),
            [$this, 'render_meta_box'],
            'shop_order',
            'side',
            'default'
        );
        
        // HPOS compatible
        add_meta_box(
            'hmoon_packing_slip',
            __('Packing Slip', 'hmoon-packing-slips'),
            [$this, 'render_meta_box'],
            'woocommerce_page_wc-orders',
            'side',
            'default'
        );
    }
    
    /**
     * Render meta box content
     */
    public function render_meta_box($post_or_order) {
        $order_id = is_a($post_or_order, 'WC_Order') ? $post_or_order->get_id() : $post_or_order->ID;
        
        $url = wp_nonce_url(
            admin_url('admin.php?action=hmoon_print_packing_slip&order_id=' . $order_id),
            'hmoon_packing_slip'
        );
        
        echo '<a href="' . esc_url($url) . '" class="button button-primary" target="_blank">';
        echo '🖨️ ' . __('Print Packing Slip', 'hmoon-packing-slips');
        echo '</a>';
    }
    
    /**
     * Process print request
     */
    public function maybe_print_packing_slip() {
        if (!isset($_GET['action']) || $_GET['action'] !== 'hmoon_print_packing_slip') {
            return;
        }
        
        if (!wp_verify_nonce($_GET['_wpnonce'], 'hmoon_packing_slip')) {
            wp_die('Invalid request');
        }
        
        if (!current_user_can('edit_shop_orders')) {
            wp_die('Permission denied');
        }
        
        $order_ids = [];
        if (isset($_GET['order_id'])) {
            $order_ids[] = intval($_GET['order_id']);
        } elseif (isset($_GET['order_ids'])) {
            $order_ids = array_map('intval', explode(',', $_GET['order_ids']));
        }
        
        if (empty($order_ids)) {
            wp_die('No orders specified');
        }
        
        $this->render_packing_slips($order_ids);
        exit;
    }
    
    /**
     * Render the packing slip HTML
     */
    public function render_packing_slips($order_ids) {
        ?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Packing Slip<?php echo count($order_ids) > 1 ? 's' : ''; ?></title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #333;
        }
        
        .packing-slip {
            page-break-after: always;
            padding: 0.5in;
            max-width: 8.5in;
            margin: 0 auto;
        }
        
        .packing-slip:last-child {
            page-break-after: auto;
        }
        
        /* Header */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #2e7d32;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .logo {
            max-width: 200px;
        }
        
        .logo img {
            max-width: 100%;
            height: auto;
        }
        
        .company-name {
            font-size: 24pt;
            font-weight: bold;
            color: #2e7d32;
        }
        
        .company-info {
            text-align: right;
            font-size: 9pt;
            color: #666;
        }
        
        .order-info {
            text-align: right;
            margin-top: 10px;
        }
        
        .order-number {
            font-size: 14pt;
            font-weight: bold;
            color: #2e7d32;
        }
        
        .order-date {
            font-size: 10pt;
            color: #666;
        }
        
        /* Addresses */
        .addresses {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
        }
        
        .address-block {
            width: 48%;
        }
        
        .address-title {
            font-weight: bold;
            font-size: 10pt;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 5px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 3px;
        }
        
        .address-content {
            font-size: 11pt;
        }
        
        .address-name {
            font-weight: bold;
        }
        
        /* Items Table */
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        .items-table th {
            background-color: #2e7d32;
            color: white;
            padding: 10px 8px;
            text-align: left;
            font-size: 10pt;
            text-transform: uppercase;
        }
        
        .items-table th:first-child {
            width: 60%;
        }
        
        .items-table th:last-child,
        .items-table td:last-child {
            text-align: center;
            width: 15%;
        }
        
        .items-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #ddd;
            vertical-align: top;
        }
        
        .items-table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .item-name {
            font-weight: 500;
        }
        
        .item-sku {
            font-size: 9pt;
            color: #666;
        }
        
        .item-meta {
            font-size: 9pt;
            color: #888;
            margin-top: 3px;
        }
        
        .qty {
            font-size: 14pt;
            font-weight: bold;
        }
        
        .checkbox {
            font-size: 18pt;
            color: #ccc;
        }
        
        /* Notes */
        .order-notes {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 10px 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        
        .notes-title {
            font-weight: bold;
            color: #856404;
            margin-bottom: 5px;
        }
        
        /* Footer */
        .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 2px solid #eee;
            font-size: 9pt;
            color: #666;
            text-align: center;
        }
        
        .thank-you {
            font-size: 14pt;
            color: #2e7d32;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .packed-by {
            margin-top: 30px;
            border-top: 1px dashed #ccc;
            padding-top: 10px;
        }
        
        .packed-by label {
            color: #888;
        }
        
        .packed-by input {
            border: none;
            border-bottom: 1px solid #333;
            width: 150px;
            margin-left: 10px;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .packing-slip {
                padding: 0.25in;
            }
            
            .no-print {
                display: none;
            }
        }
        
        /* Print button */
        .print-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2e7d32;
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 16pt;
            cursor: pointer;
            border-radius: 4px;
            z-index: 1000;
        }
        
        .print-btn:hover {
            background: #1b5e20;
        }
    </style>
</head>
<body>
    <button class="print-btn no-print" onclick="window.print()">🖨️ Print</button>
    
    <?php foreach ($order_ids as $order_id): 
        $order = wc_get_order($order_id);
        if (!$order) continue;
    ?>
    
    <div class="packing-slip">
        <div class="header">
            <div class="logo">
                <div class="company-name">H-Moon Hydro</div>
                <div class="company-tagline" style="color: #666; font-size: 10pt;">
                    Harvest Moon Hydroponics
                </div>
            </div>
            <div class="company-info">
                <div>hmoonhydro.com</div>
                <div>support@hmoonhydro.com</div>
                <div class="order-info">
                    <div class="order-number">Order #<?php echo $order->get_order_number(); ?></div>
                    <div class="order-date"><?php echo $order->get_date_created()->date('F j, Y'); ?></div>
                </div>
            </div>
        </div>
        
        <div class="addresses">
            <div class="address-block">
                <div class="address-title">Ship To</div>
                <div class="address-content">
                    <div class="address-name">
                        <?php echo esc_html($order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name()); ?>
                    </div>
                    <?php if ($order->get_shipping_company()): ?>
                        <div><?php echo esc_html($order->get_shipping_company()); ?></div>
                    <?php endif; ?>
                    <div><?php echo esc_html($order->get_shipping_address_1()); ?></div>
                    <?php if ($order->get_shipping_address_2()): ?>
                        <div><?php echo esc_html($order->get_shipping_address_2()); ?></div>
                    <?php endif; ?>
                    <div>
                        <?php echo esc_html($order->get_shipping_city() . ', ' . $order->get_shipping_state() . ' ' . $order->get_shipping_postcode()); ?>
                    </div>
                </div>
            </div>
            
            <div class="address-block">
                <div class="address-title">Bill To</div>
                <div class="address-content">
                    <div class="address-name">
                        <?php echo esc_html($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()); ?>
                    </div>
                    <?php if ($order->get_billing_company()): ?>
                        <div><?php echo esc_html($order->get_billing_company()); ?></div>
                    <?php endif; ?>
                    <div><?php echo esc_html($order->get_billing_address_1()); ?></div>
                    <?php if ($order->get_billing_address_2()): ?>
                        <div><?php echo esc_html($order->get_billing_address_2()); ?></div>
                    <?php endif; ?>
                    <div>
                        <?php echo esc_html($order->get_billing_city() . ', ' . $order->get_billing_state() . ' ' . $order->get_billing_postcode()); ?>
                    </div>
                </div>
            </div>
        </div>
        
        <table class="items-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>✓</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($order->get_items() as $item): 
                    $product = $item->get_product();
                    $sku = $product ? $product->get_sku() : '';
                ?>
                <tr>
                    <td>
                        <div class="item-name"><?php echo esc_html($item->get_name()); ?></div>
                        <?php 
                        $meta = $item->get_formatted_meta_data('_', true);
                        if (!empty($meta)):
                        ?>
                        <div class="item-meta">
                            <?php foreach ($meta as $m): ?>
                                <?php echo esc_html($m->display_key . ': ' . strip_tags($m->display_value)); ?><br>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>
                    </td>
                    <td class="item-sku"><?php echo esc_html($sku); ?></td>
                    <td class="qty"><?php echo esc_html($item->get_quantity()); ?></td>
                    <td class="checkbox">☐</td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        
        <?php if ($order->get_customer_note()): ?>
        <div class="order-notes">
            <div class="notes-title">📝 Customer Notes:</div>
            <div><?php echo esc_html($order->get_customer_note()); ?></div>
        </div>
        <?php endif; ?>
        
        <?php 
        // Get shipping method
        $shipping_methods = $order->get_shipping_methods();
        $shipping_method = !empty($shipping_methods) ? reset($shipping_methods)->get_name() : 'Standard';
        ?>
        
        <div style="background: #e8f5e9; padding: 10px; border-radius: 4px; margin-bottom: 20px;">
            <strong>Shipping:</strong> <?php echo esc_html($shipping_method); ?>
            <?php 
            $total_weight = 0;
            foreach ($order->get_items() as $item) {
                $product = $item->get_product();
                if ($product && $product->get_weight()) {
                    $total_weight += floatval($product->get_weight()) * $item->get_quantity();
                }
            }
            if ($total_weight > 0):
            ?>
            | <strong>Est. Weight:</strong> <?php echo number_format($total_weight, 1); ?> lbs
            <?php endif; ?>
        </div>
        
        <div class="footer">
            <div class="thank-you">Thank you for your order! 🌱</div>
            <div>Questions? Contact us at support@hmoonhydro.com</div>
            <div style="margin-top: 5px;">H-Moon Hydro • Harvest Moon Hydroponics</div>
            
            <div class="packed-by">
                <label>Packed by:</label>
                <input type="text" />
                <label style="margin-left: 30px;">Date:</label>
                <input type="text" style="width: 100px;" value="<?php echo date('m/d/Y'); ?>" />
            </div>
        </div>
    </div>
    
    <?php endforeach; ?>
    
    <script>
        // Auto-print on load (optional)
        // window.onload = function() { window.print(); }
    </script>
</body>
</html>
        <?php
    }
    
    /**
     * Admin styles for the icon
     */
    public function admin_styles() {
        ?>
        <style>
            .wc-action-button-packing_slip::after {
                font-family: 'dashicons';
                content: '\f497' !important;
            }
        </style>
        <?php
    }
}

// Initialize
HMoon_Packing_Slips::instance();
