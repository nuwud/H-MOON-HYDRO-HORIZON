<?php
/**
 * Custom Order Statuses for ACH workflow
 *
 * @package Nuwud\WooAchBatch\Order
 */

namespace Nuwud\WooAchBatch\Order;

/**
 * Manages custom order statuses for ACH payment workflow
 */
class OrderStatuses {

    /**
     * Custom statuses configuration
     *
     * @var array<string, array>
     */
    private array $statuses = [
        'wc-ach-pending-verify' => [
            'label' => 'ACH Pending Verification',
            'label_count' => 'ACH Pending Verification <span class="count">(%s)</span>',
            'description' => 'Customer needs to complete ACH verification wizard',
            'color' => '#ffba00',
        ],
        'wc-ach-pending-review' => [
            'label' => 'ACH Pending Review',
            'label_count' => 'ACH Pending Review <span class="count">(%s)</span>',
            'description' => 'Customer submitted verification, awaiting admin review',
            'color' => '#7e3bd0',
        ],
        'wc-pending-ach' => [
            'label' => 'Pending ACH',
            'label_count' => 'Pending ACH <span class="count">(%s)</span>',
            'description' => 'Awaiting ACH bank verification',
            'color' => '#f0ad4e',
        ],
        'wc-ach-verified' => [
            'label' => 'ACH Verified',
            'label_count' => 'ACH Verified <span class="count">(%s)</span>',
            'description' => 'Bank account verified, ready for batch export',
            'color' => '#5bc0de',
        ],
        'wc-ach-exported' => [
            'label' => 'ACH Exported',
            'label_count' => 'ACH Exported <span class="count">(%s)</span>',
            'description' => 'Included in NACHA batch file and uploaded',
            'color' => '#5cb85c',
        ],
        'wc-ach-returned' => [
            'label' => 'ACH Returned',
            'label_count' => 'ACH Returned <span class="count">(%s)</span>',
            'description' => 'ACH payment was returned by the bank',
            'color' => '#d9534f',
        ],
    ];

    /**
     * Register hooks for custom statuses
     */
    public function register(): void {
        // Register the custom statuses
        add_action( 'init', [ $this, 'register_statuses' ] );

        // Add statuses to WooCommerce
        add_filter( 'wc_order_statuses', [ $this, 'add_to_wc_statuses' ] );

        // Add bulk actions for custom statuses
        add_filter( 'bulk_actions-edit-shop_order', [ $this, 'add_bulk_actions' ] );
        add_filter( 'bulk_actions-woocommerce_page_wc-orders', [ $this, 'add_bulk_actions' ] );

        // Style the statuses in admin
        add_action( 'admin_head', [ $this, 'add_status_styles' ] );

        // Add status to reports
        add_filter( 'woocommerce_reports_order_statuses', [ $this, 'add_to_reports' ] );

        // Valid for payment/complete
        add_filter( 'woocommerce_valid_order_statuses_for_payment', [ $this, 'valid_for_payment' ] );
        add_filter( 'woocommerce_valid_order_statuses_for_payment_complete', [ $this, 'valid_for_payment_complete' ] );
    }

    /**
     * Register custom post statuses
     */
    public function register_statuses(): void {
        foreach ( $this->statuses as $status => $config ) {
            register_post_status( $status, [
                'label' => _x( $config['label'], 'Order status', 'woo-ach-batch' ),
                'public' => true,
                'exclude_from_search' => false,
                'show_in_admin_all_list' => true,
                'show_in_admin_status_list' => true,
                // translators: %s: order count
                'label_count' => _n_noop(
                    $config['label'] . ' <span class="count">(%s)</span>',
                    $config['label'] . ' <span class="count">(%s)</span>',
                    'woo-ach-batch'
                ),
            ] );
        }
    }

    /**
     * Add custom statuses to WooCommerce status list
     *
     * @param array $statuses Existing statuses
     * @return array
     */
    public function add_to_wc_statuses( array $statuses ): array {
        $new_statuses = [];

        foreach ( $statuses as $key => $label ) {
            $new_statuses[ $key ] = $label;

            // Insert ACH statuses after 'on-hold'
            if ( 'wc-on-hold' === $key ) {
                foreach ( $this->statuses as $ach_status => $config ) {
                    $new_statuses[ $ach_status ] = _x( $config['label'], 'Order status', 'woo-ach-batch' );
                }
            }
        }

        return $new_statuses;
    }

    /**
     * Add bulk actions for ACH statuses
     *
     * @param array $actions Existing bulk actions
     * @return array
     */
    public function add_bulk_actions( array $actions ): array {
        $actions['mark_pending-ach'] = __( 'Change status to Pending ACH', 'woo-ach-batch' );
        $actions['mark_ach-verified'] = __( 'Change status to ACH Verified', 'woo-ach-batch' );
        return $actions;
    }

    /**
     * Add CSS styles for status badges
     */
    public function add_status_styles(): void {
        global $pagenow;

        if ( ! in_array( $pagenow, [ 'edit.php', 'admin.php' ], true ) ) {
            return;
        }

        echo '<style>';
        foreach ( $this->statuses as $status => $config ) {
            $status_slug = str_replace( 'wc-', '', $status );
            printf(
                '.order-status.status-%1$s { background: %2$s; color: #fff; }
                 .wc-order-status.status-%1$s { background: %2$s; }
                 mark.order-status.status-%1$s { background: %2$s; color: #fff; }',
                esc_attr( $status_slug ),
                esc_attr( $config['color'] )
            );
        }
        echo '</style>';
    }

    /**
     * Add ACH statuses to WooCommerce reports
     *
     * @param array $statuses Existing report statuses
     * @return array
     */
    public function add_to_reports( array $statuses ): array {
        return array_merge( $statuses, [ 'pending-ach', 'ach-verified', 'ach-exported' ] );
    }

    /**
     * Allow payment for ACH pending orders
     *
     * @param array $statuses Valid statuses
     * @return array
     */
    public function valid_for_payment( array $statuses ): array {
        $statuses[] = 'pending-ach';
        return $statuses;
    }

    /**
     * Allow payment completion for ACH statuses
     *
     * @param array $statuses Valid statuses
     * @return array
     */
    public function valid_for_payment_complete( array $statuses ): array {
        $statuses[] = 'pending-ach';
        $statuses[] = 'ach-verified';
        $statuses[] = 'ach-exported';
        return $statuses;
    }

    /**
     * Get status configuration
     *
     * @param string $status Status key
     * @return array|null
     */
    public function get_status_config( string $status ): ?array {
        return $this->statuses[ $status ] ?? null;
    }

    /**
     * Get all custom status keys
     *
     * @return array
     */
    public function get_status_keys(): array {
        return array_keys( $this->statuses );
    }

    /**
     * Check if a status is an ACH status
     *
     * @param string $status Status to check
     * @return bool
     */
    public function is_ach_status( string $status ): bool {
        $status = strpos( $status, 'wc-' ) === 0 ? $status : 'wc-' . $status;
        return isset( $this->statuses[ $status ] );
    }
}
