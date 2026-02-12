<?php
/**
 * Admin Batch Detail Template
 *
 * @package Nuwud\WooAchBatch
 * @var object $batch Batch object
 * @var array  $items Batch items
 */

defined( 'ABSPATH' ) || exit;
?>

<div class="wrap woo-ach-batch-admin">
    <h1 class="wp-heading-inline">
        <?php
        printf(
            /* translators: %s: batch ID */
            esc_html__( 'Batch #%s Details', 'woo-ach-batch' ),
            esc_html( $batch->id )
        );
        ?>
    </h1>

    <a href="<?php echo esc_url( admin_url( 'admin.php?page=woo-ach-batch' ) ); ?>" class="page-title-action">
        <?php esc_html_e( '← Back to Batches', 'woo-ach-batch' ); ?>
    </a>

    <hr class="wp-header-end">

    <?php settings_errors( 'woo_ach_batch' ); ?>

    <!-- Batch Summary -->
    <div class="woo-ach-batch-summary">
        <table class="widefat fixed" style="max-width: 600px;">
            <tbody>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Batch ID', 'woo-ach-batch' ); ?></th>
                    <td><?php echo esc_html( $batch->id ); ?></td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Reference', 'woo-ach-batch' ); ?></th>
                    <td><code><?php echo esc_html( $batch->reference ?? 'N/A' ); ?></code></td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Status', 'woo-ach-batch' ); ?></th>
                    <td>
                        <span class="woo-ach-status woo-ach-status--<?php echo esc_attr( $batch->status ?? 'pending' ); ?>">
                            <?php echo esc_html( ucfirst( $batch->status ?? 'pending' ) ); ?>
                        </span>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Total Amount', 'woo-ach-batch' ); ?></th>
                    <td><?php echo wc_price( ( $batch->total_amount ?? 0 ) / 100 ); ?></td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Order Count', 'woo-ach-batch' ); ?></th>
                    <td><?php echo esc_html( $batch->order_count ?? count( $items ) ); ?></td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Created', 'woo-ach-batch' ); ?></th>
                    <td><?php echo esc_html( $batch->created_at ?? 'N/A' ); ?></td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Uploaded', 'woo-ach-batch' ); ?></th>
                    <td><?php echo esc_html( $batch->uploaded_at ?? 'Not yet' ); ?></td>
                </tr>
                <?php if ( ! empty( $batch->file_path ) ) : ?>
                <tr>
                    <th scope="row"><?php esc_html_e( 'File', 'woo-ach-batch' ); ?></th>
                    <td><code><?php echo esc_html( basename( $batch->file_path ) ); ?></code></td>
                </tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <!-- Batch Items -->
    <h2 style="margin-top: 30px;"><?php esc_html_e( 'Orders in Batch', 'woo-ach-batch' ); ?></h2>

    <?php if ( empty( $items ) ) : ?>
        <p><?php esc_html_e( 'No orders in this batch.', 'woo-ach-batch' ); ?></p>
    <?php else : ?>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th scope="col" class="column-order"><?php esc_html_e( 'Order', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-customer"><?php esc_html_e( 'Customer', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-amount"><?php esc_html_e( 'Amount', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-status"><?php esc_html_e( 'Status', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-routing"><?php esc_html_e( 'Routing (last 4)', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-account"><?php esc_html_e( 'Account (last 4)', 'woo-ach-batch' ); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ( $items as $item ) : ?>
                    <?php $order = wc_get_order( $item->order_id ?? 0 ); ?>
                    <tr>
                        <td>
                            <?php if ( $order ) : ?>
                                <a href="<?php echo esc_url( $order->get_edit_order_url() ); ?>">
                                    #<?php echo esc_html( $item->order_id ); ?>
                                </a>
                            <?php else : ?>
                                #<?php echo esc_html( $item->order_id ?? 'N/A' ); ?>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php 
                            if ( $order ) {
                                echo esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() );
                            } else {
                                echo esc_html( $item->customer_name ?? 'N/A' );
                            }
                            ?>
                        </td>
                        <td><?php echo wc_price( ( $item->amount ?? 0 ) / 100 ); ?></td>
                        <td>
                            <span class="woo-ach-status woo-ach-status--<?php echo esc_attr( $item->status ?? 'pending' ); ?>">
                                <?php echo esc_html( ucfirst( $item->status ?? 'pending' ) ); ?>
                            </span>
                        </td>
                        <td>
                            <?php echo esc_html( $item->routing_last4 ?? '****' ); ?>
                        </td>
                        <td>
                            <?php echo esc_html( $item->account_last4 ?? '****' ); ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<style>
.woo-ach-batch-summary {
    margin: 20px 0;
}
.woo-ach-batch-summary th {
    width: 150px;
    font-weight: 600;
}
.woo-ach-status {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
}
.woo-ach-status--pending { background: #f0f0f0; color: #666; }
.woo-ach-status--processing { background: #fff3cd; color: #856404; }
.woo-ach-status--uploaded { background: #d1ecf1; color: #0c5460; }
.woo-ach-status--completed { background: #d4edda; color: #155724; }
.woo-ach-status--failed { background: #f8d7da; color: #721c24; }
.woo-ach-status--returned { background: #f8d7da; color: #721c24; }
</style>
