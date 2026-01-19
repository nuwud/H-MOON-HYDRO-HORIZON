<?php
/**
 * Dashboard display partial
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
?>
<div class="wrap plm-dashboard">
    <h1><?php esc_html_e( 'Product Line Manager', 'woo-product-line-manager' ); ?></h1>

    <nav class="nav-tab-wrapper">
        <a href="?page=product-line-manager&tab=overview" class="nav-tab <?php echo $tab === 'overview' ? 'nav-tab-active' : ''; ?>">
            <?php esc_html_e( 'Overview', 'woo-product-line-manager' ); ?>
        </a>
        <a href="?page=product-line-manager&tab=audit" class="nav-tab <?php echo $tab === 'audit' ? 'nav-tab-active' : ''; ?>">
            <?php esc_html_e( 'Audit', 'woo-product-line-manager' ); ?>
        </a>
        <a href="?page=product-line-manager&tab=manufacturers" class="nav-tab <?php echo $tab === 'manufacturers' ? 'nav-tab-active' : ''; ?>">
            <?php esc_html_e( 'Manufacturers', 'woo-product-line-manager' ); ?>
        </a>
        <a href="?page=product-line-manager&tab=special-orders" class="nav-tab <?php echo $tab === 'special-orders' ? 'nav-tab-active' : ''; ?>">
            <?php esc_html_e( 'Special Orders', 'woo-product-line-manager' ); ?>
        </a>
        <a href="?page=plm-data-sources" class="nav-tab">
            <?php esc_html_e( 'Data Sources', 'woo-product-line-manager' ); ?>
        </a>
    </nav>

    <div class="plm-tab-content">
        <?php
        switch ( $tab ) {
            case 'audit':
                $this->render_audit_tab( $summary );
                break;
            case 'manufacturers':
                $this->render_manufacturers_tab( $manufacturers );
                break;
            case 'special-orders':
                $this->render_special_orders_tab( $summary );
                break;
            default:
                $this->render_overview_tab( $summary, $manufacturers );
        }
        ?>
    </div>
</div>

<?php
/**
 * Render Overview Tab
 */
function render_overview_tab( $summary, $manufacturers ) {
    ?>
    <div class="plm-overview">
        <div class="plm-cards">
            <div class="plm-card">
                <h3><?php esc_html_e( 'Products', 'woo-product-line-manager' ); ?></h3>
                <div class="plm-stat"><?php echo esc_html( $summary['products_total'] ?? 0 ); ?></div>
                <div class="plm-stat-label"><?php esc_html_e( 'Total Products', 'woo-product-line-manager' ); ?></div>
            </div>

            <div class="plm-card">
                <h3><?php esc_html_e( 'Matched', 'woo-product-line-manager' ); ?></h3>
                <div class="plm-stat"><?php echo esc_html( $summary['matched_percentage'] ?? 0 ); ?>%</div>
                <div class="plm-stat-label"><?php esc_html_e( 'Products Matched to Lines', 'woo-product-line-manager' ); ?></div>
            </div>

            <div class="plm-card">
                <h3><?php esc_html_e( 'Manufacturers', 'woo-product-line-manager' ); ?></h3>
                <div class="plm-stat"><?php echo esc_html( count( $manufacturers ) ); ?></div>
                <div class="plm-stat-label"><?php esc_html_e( 'Brands Tracked', 'woo-product-line-manager' ); ?></div>
            </div>

            <div class="plm-card">
                <h3><?php esc_html_e( 'Gaps', 'woo-product-line-manager' ); ?></h3>
                <div class="plm-stat"><?php echo esc_html( $summary['gaps_count'] ?? 0 ); ?></div>
                <div class="plm-stat-label"><?php esc_html_e( 'Missing Size Opportunities', 'woo-product-line-manager' ); ?></div>
            </div>
        </div>

        <div class="plm-quick-actions">
            <h3><?php esc_html_e( 'Quick Actions', 'woo-product-line-manager' ); ?></h3>
            <button type="button" class="button button-primary" id="plm-run-audit">
                <?php esc_html_e( 'Run Inventory Audit', 'woo-product-line-manager' ); ?>
            </button>
            <a href="?page=product-line-manager&tab=special-orders" class="button">
                <?php esc_html_e( 'View Special Orders', 'woo-product-line-manager' ); ?>
            </a>
            <a href="?page=plm-data-sources" class="button">
                <?php esc_html_e( 'View Data Sources', 'woo-product-line-manager' ); ?>
            </a>
        </div>

        <?php if ( $summary['has_audit'] ?? false ) : ?>
        <div class="plm-last-audit">
            <p>
                <?php
                printf(
                    /* translators: %s: timestamp */
                    esc_html__( 'Last audit: %s', 'woo-product-line-manager' ),
                    esc_html( $summary['timestamp'] )
                );
                ?>
            </p>
        </div>
        <?php endif; ?>
    </div>
    <?php
}

/**
 * Render Audit Tab
 */
function render_audit_tab( $summary ) {
    $audit = PLM_Audit::get_last_audit();
    ?>
    <div class="plm-audit">
        <h2><?php esc_html_e( 'Inventory Audit', 'woo-product-line-manager' ); ?></h2>
        
        <div class="plm-audit-actions">
            <button type="button" class="button button-primary" id="plm-run-audit">
                <?php esc_html_e( 'Run New Audit', 'woo-product-line-manager' ); ?>
            </button>
            <?php if ( $audit ) : ?>
            <a href="<?php echo esc_url( admin_url( 'admin-post.php?action=plm_export_gaps' ) ); ?>" class="button">
                <?php esc_html_e( 'Export Gaps CSV', 'woo-product-line-manager' ); ?>
            </a>
            <?php endif; ?>
        </div>

        <div id="plm-audit-results">
            <?php if ( $audit ) : ?>
            <h3><?php esc_html_e( 'Gaps Found', 'woo-product-line-manager' ); ?></h3>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Brand', 'woo-product-line-manager' ); ?></th>
                        <th><?php esc_html_e( 'Product Line', 'woo-product-line-manager' ); ?></th>
                        <th><?php esc_html_e( 'Coverage', 'woo-product-line-manager' ); ?></th>
                        <th><?php esc_html_e( 'Missing Sizes', 'woo-product-line-manager' ); ?></th>
                        <th><?php esc_html_e( 'Priority', 'woo-product-line-manager' ); ?></th>
                        <th><?php esc_html_e( 'Distributor', 'woo-product-line-manager' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( array_slice( $audit['gaps'], 0, 20 ) as $gap ) : ?>
                    <tr>
                        <td><?php echo esc_html( $gap['brand'] ); ?></td>
                        <td><?php echo esc_html( $gap['line'] ); ?></td>
                        <td>
                            <div class="plm-coverage-bar">
                                <div class="plm-coverage-fill" style="width: <?php echo esc_attr( $gap['coverage'] ); ?>%"></div>
                                <span><?php echo esc_html( $gap['coverage'] ); ?>%</span>
                            </div>
                        </td>
                        <td><?php echo esc_html( implode( ', ', $gap['missing_sizes'] ) ); ?></td>
                        <td>
                            <?php
                            $priority_labels = array( 1 => 'Essential', 2 => 'Important', 3 => 'Optional' );
                            echo esc_html( $priority_labels[ $gap['priority'] ] ?? 'Optional' );
                            ?>
                        </td>
                        <td><?php echo esc_html( $gap['distributor'] ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php if ( count( $audit['gaps'] ) > 20 ) : ?>
            <p class="description">
                <?php
                printf(
                    /* translators: %d: number of gaps */
                    esc_html__( 'Showing 20 of %d gaps. Export CSV for full list.', 'woo-product-line-manager' ),
                    count( $audit['gaps'] )
                );
                ?>
            </p>
            <?php endif; ?>
            <?php else : ?>
            <p class="description"><?php esc_html_e( 'No audit has been run yet. Click "Run New Audit" to start.', 'woo-product-line-manager' ); ?></p>
            <?php endif; ?>
        </div>
    </div>
    <?php
}

/**
 * Render Manufacturers Tab
 */
function render_manufacturers_tab( $manufacturers ) {
    ?>
    <div class="plm-manufacturers">
        <h2><?php esc_html_e( 'Manufacturers Database', 'woo-product-line-manager' ); ?></h2>
        <p class="description">
            <?php esc_html_e( 'These are the manufacturer catalogs being tracked.', 'woo-product-line-manager' ); ?>
        </p>

        <div class="plm-manufacturer-list">
            <?php foreach ( $manufacturers as $brand => $data ) : ?>
            <div class="plm-manufacturer-card">
                <h3><?php echo esc_html( $brand ); ?></h3>
                <p><strong><?php esc_html_e( 'Distributor:', 'woo-product-line-manager' ); ?></strong> <?php echo esc_html( $data['distributor'] ?? '—' ); ?></p>
                <p><strong><?php esc_html_e( 'Product Lines:', 'woo-product-line-manager' ); ?></strong> <?php echo esc_html( count( $data['lines'] ?? array() ) ); ?></p>
                
                <details>
                    <summary><?php esc_html_e( 'View Lines', 'woo-product-line-manager' ); ?></summary>
                    <ul>
                        <?php foreach ( $data['lines'] ?? array() as $line_name => $line_data ) : ?>
                        <li>
                            <strong><?php echo esc_html( $line_name ); ?></strong>
                            <br>
                            <small><?php echo esc_html( implode( ', ', $line_data['sizes'] ?? array() ) ); ?></small>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                </details>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php
}

/**
 * Render Special Orders Tab
 */
function render_special_orders_tab( $summary ) {
    $audit = PLM_Audit::get_last_audit();
    ?>
    <div class="plm-special-orders">
        <h2><?php esc_html_e( 'Special Order Catalog', 'woo-product-line-manager' ); ?></h2>
        <p class="description">
            <?php esc_html_e( 'Products available for special order that are not currently in stock.', 'woo-product-line-manager' ); ?>
        </p>

        <?php if ( $audit && ! empty( $audit['special_orders'] ) ) : ?>
        <div class="plm-export-actions">
            <a href="<?php echo esc_url( admin_url( 'admin-post.php?action=plm_export_special_orders' ) ); ?>" class="button">
                <?php esc_html_e( 'Export Special Orders CSV', 'woo-product-line-manager' ); ?>
            </a>
        </div>

        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th><?php esc_html_e( 'Brand', 'woo-product-line-manager' ); ?></th>
                    <th><?php esc_html_e( 'Product Line', 'woo-product-line-manager' ); ?></th>
                    <th><?php esc_html_e( 'Available Sizes', 'woo-product-line-manager' ); ?></th>
                    <th><?php esc_html_e( 'Distributor', 'woo-product-line-manager' ); ?></th>
                    <th><?php esc_html_e( 'Notes', 'woo-product-line-manager' ); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ( $audit['special_orders'] as $item ) : ?>
                <tr>
                    <td><?php echo esc_html( $item['brand'] ); ?></td>
                    <td><?php echo esc_html( $item['line'] ); ?></td>
                    <td><?php echo esc_html( implode( ', ', $item['available_sizes'] ) ); ?></td>
                    <td><?php echo esc_html( $item['distributor'] ); ?></td>
                    <td><?php echo esc_html( $item['note'] ); ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php else : ?>
        <p class="description"><?php esc_html_e( 'Run an audit to generate the special order catalog.', 'woo-product-line-manager' ); ?></p>
        <?php endif; ?>
    </div>
    <?php
}
?>
