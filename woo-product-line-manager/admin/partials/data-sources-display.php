<?php
/**
 * Data Sources display partial
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
?>
<div class="wrap plm-data-sources">
    <h1><?php esc_html_e( 'Data Sources', 'woo-product-line-manager' ); ?></h1>
    
    <p class="description">
        <?php esc_html_e( 'These are the data sources used to build the product catalog and manufacturer database.', 'woo-product-line-manager' ); ?>
    </p>

    <h2><?php esc_html_e( 'Active Sources', 'woo-product-line-manager' ); ?></h2>
    
    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th><?php esc_html_e( 'Source', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Type', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Records', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Last Updated', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Description', 'woo-product-line-manager' ); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php if ( ! empty( $data_sources ) ) : ?>
                <?php foreach ( $data_sources as $key => $source ) : ?>
                <tr>
                    <td><strong><?php echo esc_html( $source['name'] ?? $key ); ?></strong></td>
                    <td>
                        <?php
                        $type_labels = array(
                            'csv'      => '📄 CSV Import',
                            'database' => '🗄️ Database',
                            'api'      => '🔌 API',
                            'web'      => '🌐 Web Scrape',
                            'manual'   => '✏️ Manual',
                        );
                        echo esc_html( $type_labels[ $source['type'] ] ?? $source['type'] );
                        ?>
                    </td>
                    <td><?php echo esc_html( number_format( $source['record_count'] ?? 0 ) ); ?></td>
                    <td><?php echo esc_html( $source['last_sync'] ?? '—' ); ?></td>
                    <td><?php echo esc_html( $source['description'] ?? '' ); ?></td>
                </tr>
                <?php endforeach; ?>
            <?php else : ?>
                <tr>
                    <td colspan="5"><?php esc_html_e( 'No data sources configured.', 'woo-product-line-manager' ); ?></td>
                </tr>
            <?php endif; ?>
        </tbody>
    </table>

    <h2><?php esc_html_e( 'Manufacturer Catalogs', 'woo-product-line-manager' ); ?></h2>
    <p class="description">
        <?php esc_html_e( 'Product line sizes are sourced from these manufacturer websites and catalogs.', 'woo-product-line-manager' ); ?>
    </p>

    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th><?php esc_html_e( 'Manufacturer', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Website', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Distributor', 'woo-product-line-manager' ); ?></th>
                <th><?php esc_html_e( 'Product Lines', 'woo-product-line-manager' ); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php
            $manufacturers = PLM_Data_Manager::get_manufacturers();
            foreach ( $manufacturers as $brand => $data ) :
            ?>
            <tr>
                <td><strong><?php echo esc_html( $brand ); ?></strong></td>
                <td>
                    <?php if ( ! empty( $data['website'] ) ) : ?>
                    <a href="<?php echo esc_url( $data['website'] ); ?>" target="_blank" rel="noopener">
                        <?php echo esc_html( parse_url( $data['website'], PHP_URL_HOST ) ); ?>
                    </a>
                    <?php else : ?>
                    —
                    <?php endif; ?>
                </td>
                <td><?php echo esc_html( $data['distributor'] ?? '—' ); ?></td>
                <td><?php echo esc_html( count( $data['lines'] ?? array() ) ); ?> lines</td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>

    <h2><?php esc_html_e( 'Data Flow', 'woo-product-line-manager' ); ?></h2>
    <div class="plm-data-flow">
        <pre>
┌─────────────────────┐     ┌─────────────────────┐
│   WooCommerce DB    │────▶│  Product Inventory  │
└─────────────────────┘     └──────────┬──────────┘
                                       │
┌─────────────────────┐                │
│   CSV Imports       │────────────────┤
│   (Shopify, POS)    │                │
└─────────────────────┘                ▼
                           ┌─────────────────────┐
┌─────────────────────┐    │   Audit Engine      │
│ Manufacturer Sites  │───▶│   (Gap Analysis)    │
│ (catalog data)      │    └──────────┬──────────┘
└─────────────────────┘               │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │  Gap Report  │  │Special Orders│  │ Distributor  │
          │              │  │   Catalog    │  │    Orders    │
          └──────────────┘  └──────────────┘  └──────────────┘
        </pre>
    </div>
</div>
