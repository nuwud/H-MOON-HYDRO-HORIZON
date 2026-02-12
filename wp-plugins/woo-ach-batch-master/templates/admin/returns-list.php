<?php
/**
 * Admin Returns List Template
 *
 * @package Nuwud\WooAchBatch
 * @var array  $returns Return records from database
 * @var int    $total   Total number of returns
 * @var int    $page    Current page number
 * @var int    $per_page Items per page
 */

defined( 'ABSPATH' ) || exit;

$total_pages = ceil( $total / $per_page );
?>

<div class="wrap woo-ach-batch-admin">
    <h1 class="wp-heading-inline"><?php esc_html_e( 'ACH Returns', 'woo-ach-batch' ); ?></h1>

    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display: inline-block; margin-left: 10px;">
        <input type="hidden" name="action" value="woo_ach_import_returns">
        <?php wp_nonce_field( 'woo_ach_import_returns' ); ?>
        <button type="submit" class="page-title-action">
            <?php esc_html_e( 'Check for Returns', 'woo-ach-batch' ); ?>
        </button>
    </form>

    <hr class="wp-header-end">

    <?php settings_errors( 'woo_ach_batch' ); ?>

    <?php if ( empty( $returns ) ) : ?>
        <div class="woo-ach-empty-state">
            <p><?php esc_html_e( 'No ACH returns have been recorded.', 'woo-ach-batch' ); ?></p>
            <p class="description"><?php esc_html_e( 'Returns (NSF, account closed, etc.) from your bank will appear here after processing.', 'woo-ach-batch' ); ?></p>
        </div>
    <?php else : ?>

        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th scope="col" class="column-id"><?php esc_html_e( 'ID', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-order"><?php esc_html_e( 'Order', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-code"><?php esc_html_e( 'Return Code', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-reason"><?php esc_html_e( 'Reason', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-amount"><?php esc_html_e( 'Amount', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-date"><?php esc_html_e( 'Received', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-status"><?php esc_html_e( 'Status', 'woo-ach-batch' ); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ( $returns as $return ) : ?>
                    <?php $order = wc_get_order( $return->order_id ?? 0 ); ?>
                    <tr>
                        <td><?php echo esc_html( $return->id ); ?></td>
                        <td>
                            <?php if ( $order ) : ?>
                                <a href="<?php echo esc_url( $order->get_edit_order_url() ); ?>">
                                    #<?php echo esc_html( $return->order_id ); ?>
                                </a>
                            <?php else : ?>
                                #<?php echo esc_html( $return->order_id ?? 'N/A' ); ?>
                            <?php endif; ?>
                        </td>
                        <td>
                            <code><?php echo esc_html( $return->return_code ?? 'N/A' ); ?></code>
                        </td>
                        <td>
                            <?php echo esc_html( $return->return_reason ?? $return->reason ?? 'Unknown' ); ?>
                        </td>
                        <td>
                            <?php echo wc_price( ( $return->amount ?? 0 ) / 100 ); ?>
                        </td>
                        <td>
                            <?php 
                            $date = $return->received_date ?? $return->created_at ?? null;
                            echo esc_html( $date ? date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $date ) ) : 'N/A' );
                            ?>
                        </td>
                        <td>
                            <span class="woo-ach-status woo-ach-status--<?php echo esc_attr( $return->status ?? 'new' ); ?>">
                                <?php echo esc_html( ucfirst( $return->status ?? 'new' ) ); ?>
                            </span>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <?php if ( $total_pages > 1 ) : ?>
            <div class="tablenav bottom">
                <div class="tablenav-pages">
                    <span class="displaying-num">
                        <?php
                        printf(
                            /* translators: %s: number of items */
                            esc_html( _n( '%s item', '%s items', $total, 'woo-ach-batch' ) ),
                            number_format_i18n( $total )
                        );
                        ?>
                    </span>
                    <span class="pagination-links">
                        <?php
                        echo paginate_links( [
                            'base' => add_query_arg( 'paged', '%#%' ),
                            'format' => '',
                            'prev_text' => '&laquo;',
                            'next_text' => '&raquo;',
                            'total' => $total_pages,
                            'current' => $page,
                        ] );
                        ?>
                    </span>
                </div>
            </div>
        <?php endif; ?>

    <?php endif; ?>
</div>

<style>
.woo-ach-empty-state {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 40px;
    text-align: center;
    margin: 20px 0;
}
.woo-ach-empty-state p {
    margin: 0 0 10px;
    font-size: 14px;
}
.woo-ach-status {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
}
.woo-ach-status--new { background: #fff3cd; color: #856404; }
.woo-ach-status--processed { background: #d4edda; color: #155724; }
.woo-ach-status--refunded { background: #d1ecf1; color: #0c5460; }
.column-code { width: 100px; }
.column-amount { width: 100px; }
.column-date { width: 150px; }
.column-status { width: 100px; }
</style>
