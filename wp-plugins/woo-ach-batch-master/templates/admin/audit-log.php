<?php
/**
 * Admin Audit Log Template
 *
 * @package Nuwud\WooAchBatch
 * @var array  $logs        Audit log entries
 * @var int    $total       Total number of logs
 * @var int    $page        Current page number
 * @var int    $per_page    Items per page
 * @var string $event_type  Current event type filter
 * @var array  $event_types Available event types
 */

defined( 'ABSPATH' ) || exit;

$total_pages = ceil( $total / $per_page );
?>

<div class="wrap woo-ach-batch-admin">
    <h1 class="wp-heading-inline"><?php esc_html_e( 'ACH Audit Log', 'woo-ach-batch' ); ?></h1>
    <hr class="wp-header-end">

    <?php settings_errors( 'woo_ach_batch' ); ?>

    <!-- Filter -->
    <div class="tablenav top">
        <div class="alignleft actions">
            <form method="get">
                <input type="hidden" name="page" value="woo-ach-batch-audit">
                <select name="event_type">
                    <option value=""><?php esc_html_e( 'All Events', 'woo-ach-batch' ); ?></option>
                    <?php foreach ( $event_types as $type ) : ?>
                        <option value="<?php echo esc_attr( $type ); ?>" <?php selected( $event_type, $type ); ?>>
                            <?php echo esc_html( ucwords( str_replace( '_', ' ', $type ) ) ); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <button type="submit" class="button"><?php esc_html_e( 'Filter', 'woo-ach-batch' ); ?></button>
            </form>
        </div>
    </div>

    <?php if ( empty( $logs ) ) : ?>
        <div class="woo-ach-empty-state">
            <p><?php esc_html_e( 'No audit log entries found.', 'woo-ach-batch' ); ?></p>
            <p class="description"><?php esc_html_e( 'Security and system events will be logged here.', 'woo-ach-batch' ); ?></p>
        </div>
    <?php else : ?>

        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th scope="col" class="column-time" style="width: 160px;"><?php esc_html_e( 'Time', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-event" style="width: 140px;"><?php esc_html_e( 'Event', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-user" style="width: 120px;"><?php esc_html_e( 'User', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-message"><?php esc_html_e( 'Message', 'woo-ach-batch' ); ?></th>
                    <th scope="col" class="column-ip" style="width: 120px;"><?php esc_html_e( 'IP Address', 'woo-ach-batch' ); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ( $logs as $log ) : ?>
                    <?php 
                    $user = $log->user_id ? get_user_by( 'id', $log->user_id ) : null;
                    $severity = $log->severity ?? 'info';
                    ?>
                    <tr class="woo-ach-log-<?php echo esc_attr( $severity ); ?>">
                        <td>
                            <?php 
                            $date = $log->created_at ?? null;
                            echo esc_html( $date ? date_i18n( 'Y-m-d H:i:s', strtotime( $date ) ) : 'N/A' );
                            ?>
                        </td>
                        <td>
                            <span class="woo-ach-event-badge woo-ach-event--<?php echo esc_attr( $log->event_type ?? 'info' ); ?>">
                                <?php echo esc_html( ucwords( str_replace( '_', ' ', $log->event_type ?? 'Unknown' ) ) ); ?>
                            </span>
                        </td>
                        <td>
                            <?php 
                            if ( $user ) {
                                echo esc_html( $user->display_name );
                            } elseif ( $log->user_id ) {
                                echo esc_html( 'User #' . $log->user_id );
                            } else {
                                echo '<em>' . esc_html__( 'System', 'woo-ach-batch' ) . '</em>';
                            }
                            ?>
                        </td>
                        <td>
                            <?php echo esc_html( $log->message ?? '' ); ?>
                            <?php if ( ! empty( $log->context ) ) : ?>
                                <button type="button" class="button-link woo-ach-toggle-context" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none';">
                                    <?php esc_html_e( '[details]', 'woo-ach-batch' ); ?>
                                </button>
                                <pre class="woo-ach-context" style="display: none; margin-top: 10px; font-size: 11px; background: #f5f5f5; padding: 8px; overflow: auto;"><?php 
                                    $context = is_string( $log->context ) ? json_decode( $log->context, true ) : $log->context;
                                    echo esc_html( json_encode( $context, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
                                ?></pre>
                            <?php endif; ?>
                        </td>
                        <td>
                            <code><?php echo esc_html( $log->ip_address ?? 'N/A' ); ?></code>
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
                        $base_url = add_query_arg( 'event_type', $event_type );
                        echo paginate_links( [
                            'base' => add_query_arg( 'paged', '%#%', $base_url ),
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
.woo-ach-event-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
}
.woo-ach-event--batch_created { background: #d1ecf1; color: #0c5460; }
.woo-ach-event--batch_uploaded { background: #d4edda; color: #155724; }
.woo-ach-event--payment_verified { background: #d4edda; color: #155724; }
.woo-ach-event--verification_failed { background: #f8d7da; color: #721c24; }
.woo-ach-event--return_received { background: #f8d7da; color: #721c24; }
.woo-ach-event--settings_changed { background: #fff3cd; color: #856404; }
.woo-ach-event--sftp_connection { background: #e2e3e5; color: #383d41; }
.woo-ach-event--error { background: #f8d7da; color: #721c24; }
.woo-ach-event--info { background: #e2e3e5; color: #383d41; }
.woo-ach-log-error { background-color: #fff5f5 !important; }
.woo-ach-log-warning { background-color: #fffbf0 !important; }
.woo-ach-toggle-context {
    color: #0073aa;
    text-decoration: none;
    font-size: 11px;
}
.woo-ach-toggle-context:hover {
    color: #006799;
}
</style>
