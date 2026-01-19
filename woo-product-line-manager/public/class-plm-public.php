<?php
/**
 * Public functionality
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Public class
 */
class PLM_Public {

    /**
     * Plugin name
     *
     * @var string
     */
    private $plugin_name;

    /**
     * Version
     *
     * @var string
     */
    private $version;

    /**
     * Constructor
     *
     * @param string $plugin_name Plugin name.
     * @param string $version     Version.
     */
    public function __construct( $plugin_name, $version ) {
        $this->plugin_name = $plugin_name;
        $this->version     = $version;
    }

    /**
     * Register the stylesheets for the public-facing side.
     */
    public function enqueue_styles() {
        if ( is_product() || is_shop() || has_shortcode( get_post()->post_content ?? '', 'plm_special_orders' ) ) {
            wp_enqueue_style(
                $this->plugin_name,
                PLM_PLUGIN_URL . 'assets/css/frontend.css',
                array(),
                $this->version,
                'all'
            );
        }
    }

    /**
     * Register the JavaScript for the public-facing side.
     */
    public function enqueue_scripts() {
        if ( is_product() || is_shop() || has_shortcode( get_post()->post_content ?? '', 'plm_special_orders' ) ) {
            wp_enqueue_script(
                $this->plugin_name,
                PLM_PLUGIN_URL . 'assets/js/frontend.js',
                array( 'jquery' ),
                $this->version,
                true
            );

            wp_localize_script(
                $this->plugin_name,
                'plmFrontend',
                array(
                    'ajaxUrl' => admin_url( 'admin-ajax.php' ),
                    'nonce'   => wp_create_nonce( 'plm_frontend_nonce' ),
                    'email'   => get_option( 'plm_special_order_email', get_option( 'admin_email' ) ),
                )
            );
        }
    }

    /**
     * Register shortcodes
     */
    public function register_shortcodes() {
        add_shortcode( 'plm_special_orders', array( $this, 'shortcode_special_orders' ) );
        add_shortcode( 'plm_essentials', array( $this, 'shortcode_essentials' ) );
        add_shortcode( 'plm_product_filter', array( $this, 'shortcode_product_filter' ) );
    }

    /**
     * Special orders shortcode
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function shortcode_special_orders( $atts ) {
        $atts = shortcode_atts(
            array(
                'brand'      => 'all',
                'show_sizes' => 'true',
                'layout'     => 'accordion',
            ),
            $atts,
            'plm_special_orders'
        );

        $audit = PLM_Audit::get_last_audit();
        
        if ( ! $audit || empty( $audit['special_orders'] ) ) {
            return '<p>' . esc_html__( 'Special order catalog is not available.', 'woo-product-line-manager' ) . '</p>';
        }

        // Filter by brand if specified
        $items = $audit['special_orders'];
        if ( $atts['brand'] !== 'all' ) {
            $items = array_filter( $items, function( $item ) use ( $atts ) {
                return stripos( $item['brand'], $atts['brand'] ) !== false;
            } );
        }

        // Group by brand
        $by_brand = array();
        foreach ( $items as $item ) {
            $by_brand[ $item['brand'] ][] = $item;
        }

        ob_start();
        include PLM_PLUGIN_PATH . 'public/partials/special-order-catalog.php';
        return ob_get_clean();
    }

    /**
     * Essentials shortcode
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function shortcode_essentials( $atts ) {
        $atts = shortcode_atts(
            array(
                'category' => '',
                'limit'    => 10,
            ),
            $atts,
            'plm_essentials'
        );

        $essentials = PLM_Data_Manager::get_essential_products();
        $essentials = array_slice( $essentials, 0, intval( $atts['limit'] ) );

        ob_start();
        ?>
        <div class="plm-essentials">
            <h3><?php esc_html_e( 'Industry Essentials', 'woo-product-line-manager' ); ?></h3>
            <ul class="plm-essentials-list">
                <?php foreach ( $essentials as $item ) : ?>
                <li>
                    <strong><?php echo esc_html( $item['brand'] ); ?></strong>
                    <?php echo esc_html( $item['line'] ); ?>
                    <?php if ( $item['note'] ) : ?>
                    <small><?php echo esc_html( $item['note'] ); ?></small>
                    <?php endif; ?>
                </li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Product filter shortcode
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function shortcode_product_filter( $atts ) {
        $atts = shortcode_atts(
            array(
                'show_manufacturers' => 'true',
                'show_lines'         => 'true',
            ),
            $atts,
            'plm_product_filter'
        );

        $manufacturers = PLM_Data_Manager::get_manufacturers();

        ob_start();
        include PLM_PLUGIN_PATH . 'public/partials/product-line-filter.php';
        return ob_get_clean();
    }

    /**
     * Display other sizes on product page
     */
    public function display_other_sizes() {
        global $product;
        
        if ( ! $product ) {
            return;
        }

        $manufacturer = get_post_meta( $product->get_id(), '_plm_manufacturer', true );
        $product_line = get_post_meta( $product->get_id(), '_plm_product_line', true );

        if ( ! $manufacturer || ! $product_line ) {
            return;
        }

        $manufacturers = PLM_Data_Manager::get_manufacturers();
        
        if ( ! isset( $manufacturers[ $manufacturer ]['lines'][ $product_line ] ) ) {
            return;
        }

        $line_data = $manufacturers[ $manufacturer ]['lines'][ $product_line ];
        $all_sizes = $line_data['sizes'] ?? array();
        
        // Get currently available sizes from other products in this line
        $current_size = get_post_meta( $product->get_id(), '_plm_normalized_size', true );
        
        // Get other products in same line
        $other_products = wc_get_products( array(
            'limit'      => -1,
            'status'     => 'publish',
            'exclude'    => array( $product->get_id() ),
            'meta_query' => array(
                'relation' => 'AND',
                array(
                    'key'   => '_plm_manufacturer',
                    'value' => $manufacturer,
                ),
                array(
                    'key'   => '_plm_product_line',
                    'value' => $product_line,
                ),
            ),
        ) );

        $available_sizes = array();
        foreach ( $other_products as $other ) {
            $size = get_post_meta( $other->get_id(), '_plm_normalized_size', true );
            if ( $size ) {
                $available_sizes[ $size ] = $other->get_permalink();
            }
        }

        // Find sizes not in stock
        $stocked_sizes = array_keys( $available_sizes );
        if ( $current_size ) {
            $stocked_sizes[] = $current_size;
        }
        $special_order_sizes = array_diff( $all_sizes, $stocked_sizes );

        if ( empty( $available_sizes ) && empty( $special_order_sizes ) ) {
            return;
        }

        ?>
        <div class="plm-other-sizes">
            <h4><?php esc_html_e( 'Other Sizes Available', 'woo-product-line-manager' ); ?></h4>
            
            <?php if ( ! empty( $available_sizes ) ) : ?>
            <div class="plm-in-stock-sizes">
                <span class="plm-label"><?php esc_html_e( 'In Stock:', 'woo-product-line-manager' ); ?></span>
                <?php foreach ( $available_sizes as $size => $url ) : ?>
                <a href="<?php echo esc_url( $url ); ?>" class="plm-size-link"><?php echo esc_html( $size ); ?></a>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>

            <?php if ( ! empty( $special_order_sizes ) ) : ?>
            <div class="plm-special-order-sizes">
                <span class="plm-label"><?php esc_html_e( 'Special Order:', 'woo-product-line-manager' ); ?></span>
                <?php echo esc_html( implode( ', ', $special_order_sizes ) ); ?>
                <button type="button" class="plm-request-quote" 
                    data-brand="<?php echo esc_attr( $manufacturer ); ?>" 
                    data-product="<?php echo esc_attr( $product_line ); ?>">
                    <?php esc_html_e( 'Request Quote', 'woo-product-line-manager' ); ?>
                </button>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Register widgets
     */
    public function register_widgets() {
        register_widget( 'PLM_Product_Lines_Widget' );
    }
}

/**
 * Product Lines Widget
 */
class PLM_Product_Lines_Widget extends WP_Widget {

    /**
     * Constructor
     */
    public function __construct() {
        parent::__construct(
            'plm_product_lines',
            __( 'Product Lines Browser', 'woo-product-line-manager' ),
            array( 'description' => __( 'Browse products by manufacturer and product line.', 'woo-product-line-manager' ) )
        );
    }

    /**
     * Widget output
     *
     * @param array $args     Widget arguments.
     * @param array $instance Widget instance.
     */
    public function widget( $args, $instance ) {
        echo $args['before_widget'];
        
        if ( ! empty( $instance['title'] ) ) {
            echo $args['before_title'] . apply_filters( 'widget_title', $instance['title'] ) . $args['after_title'];
        }

        $manufacturers = PLM_Data_Manager::get_manufacturers();
        ?>
        <div class="plm-lines-widget">
            <?php foreach ( array_slice( $manufacturers, 0, 10 ) as $brand => $data ) : ?>
            <details>
                <summary><?php echo esc_html( $brand ); ?></summary>
                <ul>
                    <?php foreach ( $data['lines'] ?? array() as $line_name => $line_data ) : ?>
                    <li><a href="<?php echo esc_url( add_query_arg( array( 'plm_line' => sanitize_title( $brand . '-' . $line_name ) ), wc_get_page_permalink( 'shop' ) ) ); ?>"><?php echo esc_html( $line_name ); ?></a></li>
                    <?php endforeach; ?>
                </ul>
            </details>
            <?php endforeach; ?>
        </div>
        <?php
        
        echo $args['after_widget'];
    }

    /**
     * Widget form
     *
     * @param array $instance Instance.
     * @return string
     */
    public function form( $instance ) {
        $title = ! empty( $instance['title'] ) ? $instance['title'] : __( 'Browse Product Lines', 'woo-product-line-manager' );
        ?>
        <p>
            <label for="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>"><?php esc_attr_e( 'Title:', 'woo-product-line-manager' ); ?></label>
            <input class="widefat" id="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>" name="<?php echo esc_attr( $this->get_field_name( 'title' ) ); ?>" type="text" value="<?php echo esc_attr( $title ); ?>">
        </p>
        <?php
    }

    /**
     * Update widget
     *
     * @param array $new_instance New instance.
     * @param array $old_instance Old instance.
     * @return array
     */
    public function update( $new_instance, $old_instance ) {
        $instance          = array();
        $instance['title'] = ( ! empty( $new_instance['title'] ) ) ? sanitize_text_field( $new_instance['title'] ) : '';
        return $instance;
    }
}
