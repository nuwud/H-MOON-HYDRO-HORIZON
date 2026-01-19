<?php
/**
 * Special order catalog template
 *
 * @package WooProductLineManager
 * @var array $by_brand Grouped items
 * @var array $atts Shortcode attributes
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
?>
<div class="plm-special-order-catalog plm-layout-<?php echo esc_attr( $atts['layout'] ); ?>">
    <div class="plm-catalog-header">
        <h2><?php esc_html_e( 'Special Order Catalog', 'woo-product-line-manager' ); ?></h2>
        <p><?php esc_html_e( "Can't find the size you need? We can order it for you!", 'woo-product-line-manager' ); ?></p>
    </div>

    <div class="plm-info-box">
        <h4><?php esc_html_e( 'How Special Orders Work', 'woo-product-line-manager' ); ?></h4>
        <ul>
            <li><strong><?php esc_html_e( 'Lead Time:', 'woo-product-line-manager' ); ?></strong> <?php esc_html_e( 'Most items ship within 3-7 business days', 'woo-product-line-manager' ); ?></li>
            <li><strong><?php esc_html_e( 'Minimum Order:', 'woo-product-line-manager' ); ?></strong> <?php esc_html_e( 'No minimum for most items', 'woo-product-line-manager' ); ?></li>
            <li><strong><?php esc_html_e( 'Bulk Discounts:', 'woo-product-line-manager' ); ?></strong> <?php esc_html_e( 'Available on case quantities', 'woo-product-line-manager' ); ?></li>
        </ul>
    </div>

    <?php if ( $atts['layout'] === 'accordion' ) : ?>
        
        <?php foreach ( $by_brand as $brand => $items ) : ?>
        <details class="plm-brand-section">
            <summary class="plm-brand-name"><?php echo esc_html( $brand ); ?> <span class="plm-count">(<?php echo count( $items ); ?>)</span></summary>
            
            <table class="plm-catalog-table">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Product Line', 'woo-product-line-manager' ); ?></th>
                        <?php if ( $atts['show_sizes'] === 'true' ) : ?>
                        <th><?php esc_html_e( 'Available Sizes', 'woo-product-line-manager' ); ?></th>
                        <?php endif; ?>
                        <th><?php esc_html_e( 'Notes', 'woo-product-line-manager' ); ?></th>
                        <th><?php esc_html_e( 'Action', 'woo-product-line-manager' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $items as $item ) : ?>
                    <tr>
                        <td class="plm-line-name"><?php echo esc_html( $item['line'] ); ?></td>
                        <?php if ( $atts['show_sizes'] === 'true' ) : ?>
                        <td class="plm-sizes"><?php echo esc_html( implode( ', ', $item['available_sizes'] ) ); ?></td>
                        <?php endif; ?>
                        <td class="plm-notes"><?php echo esc_html( $item['note'] ); ?></td>
                        <td class="plm-action">
                            <button type="button" class="plm-request-quote-btn" 
                                data-brand="<?php echo esc_attr( $brand ); ?>"
                                data-product="<?php echo esc_attr( $item['line'] ); ?>">
                                <?php esc_html_e( 'Request Quote', 'woo-product-line-manager' ); ?>
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </details>
        <?php endforeach; ?>

    <?php elseif ( $atts['layout'] === 'grid' ) : ?>
        
        <div class="plm-grid">
            <?php foreach ( $by_brand as $brand => $items ) : ?>
                <?php foreach ( $items as $item ) : ?>
                <div class="plm-grid-item">
                    <span class="plm-brand"><?php echo esc_html( $brand ); ?></span>
                    <h4><?php echo esc_html( $item['line'] ); ?></h4>
                    <?php if ( $atts['show_sizes'] === 'true' ) : ?>
                    <p class="plm-sizes"><?php echo esc_html( implode( ', ', $item['available_sizes'] ) ); ?></p>
                    <?php endif; ?>
                    <?php if ( $item['note'] ) : ?>
                    <p class="plm-note"><?php echo esc_html( $item['note'] ); ?></p>
                    <?php endif; ?>
                    <button type="button" class="plm-request-quote-btn"
                        data-brand="<?php echo esc_attr( $brand ); ?>"
                        data-product="<?php echo esc_attr( $item['line'] ); ?>">
                        <?php esc_html_e( 'Request Quote', 'woo-product-line-manager' ); ?>
                    </button>
                </div>
                <?php endforeach; ?>
            <?php endforeach; ?>
        </div>

    <?php else : ?>
        
        <table class="plm-catalog-table plm-full-table">
            <thead>
                <tr>
                    <th><?php esc_html_e( 'Brand', 'woo-product-line-manager' ); ?></th>
                    <th><?php esc_html_e( 'Product Line', 'woo-product-line-manager' ); ?></th>
                    <?php if ( $atts['show_sizes'] === 'true' ) : ?>
                    <th><?php esc_html_e( 'Available Sizes', 'woo-product-line-manager' ); ?></th>
                    <?php endif; ?>
                    <th><?php esc_html_e( 'Notes', 'woo-product-line-manager' ); ?></th>
                    <th><?php esc_html_e( 'Action', 'woo-product-line-manager' ); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ( $by_brand as $brand => $items ) : ?>
                    <?php foreach ( $items as $item ) : ?>
                    <tr>
                        <td class="plm-brand"><?php echo esc_html( $brand ); ?></td>
                        <td class="plm-line-name"><?php echo esc_html( $item['line'] ); ?></td>
                        <?php if ( $atts['show_sizes'] === 'true' ) : ?>
                        <td class="plm-sizes"><?php echo esc_html( implode( ', ', $item['available_sizes'] ) ); ?></td>
                        <?php endif; ?>
                        <td class="plm-notes"><?php echo esc_html( $item['note'] ); ?></td>
                        <td class="plm-action">
                            <button type="button" class="plm-request-quote-btn"
                                data-brand="<?php echo esc_attr( $brand ); ?>"
                                data-product="<?php echo esc_attr( $item['line'] ); ?>">
                                <?php esc_html_e( 'Request Quote', 'woo-product-line-manager' ); ?>
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>

    <div class="plm-catalog-footer">
        <p>
            <?php esc_html_e( 'Questions?', 'woo-product-line-manager' ); ?>
            <a href="mailto:<?php echo esc_attr( get_option( 'plm_special_order_email', get_option( 'admin_email' ) ) ); ?>">
                <?php esc_html_e( 'Contact us', 'woo-product-line-manager' ); ?>
            </a>
        </p>
    </div>
</div>
