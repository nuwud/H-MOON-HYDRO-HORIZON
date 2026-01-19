<?php
/**
 * Admin Batches List Template
 *
 * @package Nuwud\WooAchBatch
 * @var array $batches
 * @var array $stats
 * @var int $page
 * @var int $per_page
 */

defined( 'ABSPATH' ) || exit;
?>

<div class="wrap woo-ach-batch-admin">
    <h1 class="wp-heading-inline"><?php esc_html_e( 'ACH Batch History', 'woo-ach-batch' ); ?></h1>

    <form method="post" style="display: inline-block; margin-left: 10px;">
        <?php wp_nonce_field( 'woo_ach_manual_batch' ); ?>
        <button type="submit" name="woo_ach_manual_batch" class="page-title-action" 
                onclick="return confirm('<?php esc_attr_e( 'Run a manual batch export now?', 'woo-ach-batch' ); ?>');">
            <?php esc_html_e( 'Run Manual Batch', 'woo-ach-batch' ); ?>
        </button>
    </form>

    <hr class="wp-header-end">

    <?php settings_errors( 'woo_ach_batch' ); ?>

    <!-- Statistics Cards -->
    <div class="woo-ach-stats-cards">
        <div class="woo-ach-stat-card">
            <span class="stat-value"><?php echo esc_html( number_format( $stats['total_batches'] ?? 0 ) ); ?></span>
            <span class="stat-label"><?php esc_html_e( 'Total Batches', 'woo-ach-batch' ); ?></span>
        </div>
        <div class="woo-ach-stat-card">
            <span class="stat-value"><?php echo esc_html( number_format( $stats['total_orders'] ?? 0 ) ); ?></span>
            <span class="stat-label"><?php esc_html_e( 'Orders Processed', 'woo-ach-batch' ); ?></span>
        </div>
        <div class="woo-ach-stat-card">
            <span class="stat-value"><?php echo wc_price( ( $stats['total_amount'] ?? 0 ) / 100 ); ?></span>
            <span class="stat-label"><?php esc_html_e( 'Total Volume', 'woo-ach-batch' ); ?></span>
        </div>
        <div class="woo-ach-stat-card">
            <span class="stat-value"><?php echo esc_html( number_format( $stats['pending_orders'] ?? 0 ) ); ?></span>
            <span class="stat-label"><?php esc_html_e( 'Pending Orders', 'woo-ach-batch' ); ?></span>
        </div>
    </div>

    <!-- Batches Table -->
    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th scope="col" class="column-id"><?php esc_html_e( 'ID', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-reference"><?php esc_html_e( 'Reference', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-status"><?php esc_html_e( 'Status', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-orders"><?php esc_html_e( 'Orders', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-amount"><?php esc_html_e( 'Amount', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-created"><?php esc_html_e( 'Created', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-uploaded"><?php esc_html_e( 'Uploaded', 'woo-ach-batch' ); ?></th>
                <th scope="col" class="column-actions"><?php esc_html_e( 'Actions', 'woo-ach-batch' ); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php if ( empty( $batches ) ) : ?>
                <tr>
                    <td colspan="8"><?php esc_html_e( 'No batches found.', 'woo-ach-batch' ); ?></td>
                </tr>
            <?php else : ?>
                <?php foreach ( $batches as $batch ) : ?>
                    <tr>
                        <td class="column-id"><?php echo esc_html( $batch->id ); ?></td>
                        <td class="column-reference">
                            <a href="<?php echo esc_url( add_query_arg( 'batch_id', $batch->id ) ); ?>">
                                <?php echo esc_html( $batch->batch_reference ); ?>
                            </a>
                        </td>
                        <td class="column-status">
                            <span class="batch-status status-<?php echo esc_attr( $batch->status ); ?>">
                                <?php echo esc_html( ucfirst( $batch->status ) ); ?>
                            </span>
                        </td>
                        <td class="column-orders"><?php echo esc_html( $batch->order_count ); ?></td>
                        <td class="column-amount"><?php echo wc_price( $batch->total_amount / 100 ); ?></td>
                        <td class="column-created">
                            <?php echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $batch->created_at ) ) ); ?>
                        </td>
                        <td class="column-uploaded">
                            <?php if ( $batch->uploaded_at ) : ?>
                                <?php echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $batch->uploaded_at ) ) ); ?>
                            <?php else : ?>
                                <span class="not-uploaded"><?php esc_html_e( 'Not uploaded', 'woo-ach-batch' ); ?></span>
                            <?php endif; ?>
                        </td>
                        <td class="column-actions">
                            <a href="<?php echo esc_url( add_query_arg( 'batch_id', $batch->id ) ); ?>" class="button button-small">
                                <?php esc_html_e( 'View', 'woo-ach-batch' ); ?>
                            </a>
                            <?php if ( $batch->file_path && file_exists( $batch->file_path ) ) : ?>
                                <a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=woo_ach_download_nacha&batch_id=' . $batch->id ), 'download_nacha' ) ); ?>" 
                                   class="button button-small">
                                    <?php esc_html_e( 'Download', 'woo-ach-batch' ); ?>
                                </a>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>

    <!-- Pagination -->
    <?php if ( count( $batches ) >= $per_page ) : ?>
        <div class="tablenav bottom">
            <div class="tablenav-pages">
                <?php
                echo paginate_links( [
                    'base' => add_query_arg( 'paged', '%#%' ),
                    'format' => '',
                    'prev_text' => __( '&laquo;', 'woo-ach-batch' ),
                    'next_text' => __( '&raquo;', 'woo-ach-batch' ),
                    'current' => $page,
                ] );
                ?>
            </div>
        </div>
    <?php endif; ?>
</div>

<style>
.woo-ach-stats-cards {
    display: flex;
    gap: 20px;
    margin: 20px 0;
}
.woo-ach-stat-card {
    background: #fff;
    border: 1px solid #c3c4c7;
    border-radius: 4px;
    padding: 20px;
    text-align: center;
    min-width: 150px;
}
.woo-ach-stat-card .stat-value {
    display: block;
    font-size: 24px;
    font-weight: bold;
    color: #1d2327;
}
.woo-ach-stat-card .stat-label {
    display: block;
    font-size: 12px;
    color: #646970;
    margin-top: 5px;
}
.batch-status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
}
.batch-status.status-pending { background: #f0f0f1; color: #646970; }
.batch-status.status-generated { background: #dff0d8; color: #3c763d; }
.batch-status.status-uploaded { background: #d9edf7; color: #31708f; }
.batch-status.status-failed { background: #f2dede; color: #a94442; }
.not-uploaded { color: #999; font-style: italic; }
</style>
