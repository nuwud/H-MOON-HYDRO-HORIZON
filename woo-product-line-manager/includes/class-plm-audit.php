<?php
/**
 * Audit Engine - Compares inventory against manufacturer catalogs
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Audit class
 */
class PLM_Audit {

    /**
     * Run a full inventory audit
     *
     * @return array Audit results
     */
    public static function run_full_audit() {
        $results = array(
            'timestamp'      => current_time( 'mysql' ),
            'products_total' => 0,
            'matched'        => 0,
            'unmatched'      => 0,
            'by_brand'       => array(),
            'gaps'           => array(),
            'special_orders' => array(),
        );

        // Get all WooCommerce products
        $products = wc_get_products( array(
            'limit'  => -1,
            'status' => 'publish',
        ) );

        $results['products_total'] = count( $products );

        // Get manufacturer data
        $manufacturers = PLM_Data_Manager::get_manufacturers();

        // Build inventory index
        $inventory = array();

        foreach ( $products as $product ) {
            $title = $product->get_name();
            
            // Try to identify brand
            $matched_brand = null;
            foreach ( array_keys( $manufacturers ) as $brand ) {
                if ( stripos( $title, $brand ) !== false ) {
                    $matched_brand = $brand;
                    break;
                }
            }

            if ( ! $matched_brand ) {
                $results['unmatched']++;
                continue;
            }

            // Match to product line
            $line = PLM_Data_Manager::match_product_line( $title, $matched_brand );
            
            if ( ! $line ) {
                $results['unmatched']++;
                continue;
            }

            $results['matched']++;

            // Track by brand
            if ( ! isset( $results['by_brand'][ $matched_brand ] ) ) {
                $results['by_brand'][ $matched_brand ] = array(
                    'products' => 0,
                    'lines'    => array(),
                );
            }

            $results['by_brand'][ $matched_brand ]['products']++;

            // Track sizes
            $key = "{$matched_brand}|{$line}";
            if ( ! isset( $inventory[ $key ] ) ) {
                $inventory[ $key ] = array(
                    'brand'    => $matched_brand,
                    'line'     => $line,
                    'products' => array(),
                    'sizes'    => array(),
                );
            }

            $size = PLM_Data_Manager::normalize_size( $title );
            if ( $size ) {
                $inventory[ $key ]['sizes'][] = $size;
            }
            $inventory[ $key ]['products'][] = array(
                'id'    => $product->get_id(),
                'title' => $title,
                'size'  => $size,
            );
        }

        // Compare against manufacturer catalogs
        foreach ( $manufacturers as $brand => $brand_data ) {
            foreach ( $brand_data['lines'] as $line_name => $line_info ) {
                $key = "{$brand}|{$line_name}";
                $inv = $inventory[ $key ] ?? array( 'sizes' => array() );
                
                $all_sizes     = $line_info['sizes'] ?? array();
                $have_sizes    = array_unique( $inv['sizes'] );
                $missing_sizes = array_diff( $all_sizes, $have_sizes );
                $coverage      = count( $all_sizes ) > 0 
                    ? count( $have_sizes ) / count( $all_sizes ) 
                    : 0;

                // Track gaps
                if ( ! empty( $missing_sizes ) ) {
                    $results['gaps'][] = array(
                        'brand'         => $brand,
                        'line'          => $line_name,
                        'type'          => $line_info['type'] ?? 'liquid',
                        'all_sizes'     => $all_sizes,
                        'have_sizes'    => $have_sizes,
                        'missing_sizes' => array_values( $missing_sizes ),
                        'coverage'      => round( $coverage * 100 ),
                        'priority'      => $line_info['priority'] ?? 3,
                        'distributor'   => $line_info['distributor'] ?? '',
                    );
                }

                // Special orders (sizes we don't stock)
                if ( ! empty( $missing_sizes ) ) {
                    $results['special_orders'][] = array(
                        'brand'           => $brand,
                        'line'            => $line_name,
                        'available_sizes' => array_values( $missing_sizes ),
                        'distributor'     => $line_info['distributor'] ?? '',
                        'note'            => $line_info['note'] ?? '',
                    );
                }

                // Track in brand results
                if ( isset( $results['by_brand'][ $brand ] ) ) {
                    $results['by_brand'][ $brand ]['lines'][ $line_name ] = array(
                        'coverage'      => round( $coverage * 100 ),
                        'missing_count' => count( $missing_sizes ),
                    );
                }
            }
        }

        // Sort gaps by priority
        usort( $results['gaps'], function( $a, $b ) {
            return $a['priority'] - $b['priority'];
        } );

        // Save audit results
        update_option( 'plm_last_audit', $results );
        update_option( 'plm_last_audit_date', current_time( 'mysql' ) );

        return $results;
    }

    /**
     * Get the last audit results
     *
     * @return array|false
     */
    public static function get_last_audit() {
        return get_option( 'plm_last_audit', false );
    }

    /**
     * Get audit summary
     *
     * @return array
     */
    public static function get_summary() {
        $audit = self::get_last_audit();
        
        if ( ! $audit ) {
            return array(
                'has_audit'          => false,
                'products_total'     => 0,
                'matched_percentage' => 0,
                'gaps_count'         => 0,
                'special_order_count' => 0,
            );
        }

        return array(
            'has_audit'          => true,
            'timestamp'          => $audit['timestamp'],
            'products_total'     => $audit['products_total'],
            'matched'            => $audit['matched'],
            'matched_percentage' => $audit['products_total'] > 0 
                ? round( ( $audit['matched'] / $audit['products_total'] ) * 100 ) 
                : 0,
            'gaps_count'         => count( $audit['gaps'] ),
            'special_order_count' => count( $audit['special_orders'] ),
            'brands_count'       => count( $audit['by_brand'] ),
        );
    }

    /**
     * Export audit as CSV
     *
     * @param string $type Type of export: 'gaps', 'special_orders', 'full'
     * @return string CSV content
     */
    public static function export_csv( $type = 'gaps' ) {
        $audit = self::get_last_audit();
        
        if ( ! $audit ) {
            return '';
        }

        $csv = '';

        switch ( $type ) {
            case 'special_orders':
                $csv = "Brand,Product Line,Available Sizes,Distributor,Notes\n";
                foreach ( $audit['special_orders'] as $item ) {
                    $csv .= sprintf(
                        '"%s","%s","%s","%s","%s"' . "\n",
                        $item['brand'],
                        $item['line'],
                        implode( ', ', $item['available_sizes'] ),
                        $item['distributor'],
                        $item['note']
                    );
                }
                break;

            case 'gaps':
            default:
                $csv = "Brand,Product Line,Type,Coverage %,Missing Sizes,Priority,Distributor\n";
                foreach ( $audit['gaps'] as $gap ) {
                    $csv .= sprintf(
                        '"%s","%s","%s",%d,"%s",%d,"%s"' . "\n",
                        $gap['brand'],
                        $gap['line'],
                        $gap['type'],
                        $gap['coverage'],
                        implode( ', ', $gap['missing_sizes'] ),
                        $gap['priority'],
                        $gap['distributor']
                    );
                }
                break;
        }

        return $csv;
    }

    /**
     * Generate distributor order list
     *
     * @param int $max_priority Maximum priority to include (1-3)
     * @return array Orders grouped by distributor
     */
    public static function generate_distributor_orders( $max_priority = 2 ) {
        $audit = self::get_last_audit();
        
        if ( ! $audit ) {
            return array();
        }

        $orders = array();

        foreach ( $audit['gaps'] as $gap ) {
            if ( $gap['priority'] > $max_priority ) {
                continue;
            }

            $distributor = $gap['distributor'] ?: 'Unknown';
            
            if ( ! isset( $orders[ $distributor ] ) ) {
                $orders[ $distributor ] = array();
            }

            $orders[ $distributor ][] = array(
                'brand'         => $gap['brand'],
                'line'          => $gap['line'],
                'sizes'         => $gap['missing_sizes'],
                'priority'      => $gap['priority'],
                'type'          => $gap['type'],
            );
        }

        return $orders;
    }
}
