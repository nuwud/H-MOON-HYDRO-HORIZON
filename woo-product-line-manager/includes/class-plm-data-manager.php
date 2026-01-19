<?php
/**
 * Data Manager - Handles manufacturer and product line data
 *
 * @package WooProductLineManager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Data Manager class
 */
class PLM_Data_Manager {

    /**
     * Cached manufacturer data
     *
     * @var array|null
     */
    private static $manufacturers = null;

    /**
     * Cached data sources
     *
     * @var array|null
     */
    private static $data_sources = null;

    /**
     * Get all manufacturers with their product lines
     *
     * @return array
     */
    public static function get_manufacturers() {
        if ( self::$manufacturers !== null ) {
            return self::$manufacturers;
        }

        $json_file = PLM_PLUGIN_PATH . 'data/manufacturers.json';
        
        if ( file_exists( $json_file ) ) {
            $json = file_get_contents( $json_file );
            self::$manufacturers = json_decode( $json, true ) ?: array();
        } else {
            // Return default data if JSON doesn't exist
            self::$manufacturers = self::get_default_manufacturers();
        }

        return self::$manufacturers;
    }

    /**
     * Get product lines for a specific manufacturer
     *
     * @param string $manufacturer_slug Manufacturer slug
     * @return array
     */
    public static function get_product_lines( $manufacturer_slug ) {
        $manufacturers = self::get_manufacturers();
        return $manufacturers[ $manufacturer_slug ]['lines'] ?? array();
    }

    /**
     * Get all data sources
     *
     * @return array
     */
    public static function get_data_sources() {
        if ( self::$data_sources !== null ) {
            return self::$data_sources;
        }

        $json_file = PLM_PLUGIN_PATH . 'data/data-sources.json';
        
        if ( file_exists( $json_file ) ) {
            $json = file_get_contents( $json_file );
            self::$data_sources = json_decode( $json, true ) ?: array();
        } else {
            self::$data_sources = self::get_default_data_sources();
        }

        return self::$data_sources;
    }

    /**
     * Get size normalization rules
     *
     * @return array
     */
    public static function get_size_normalizations() {
        $json_file = PLM_PLUGIN_PATH . 'data/size-normalization.json';
        
        if ( file_exists( $json_file ) ) {
            $json = file_get_contents( $json_file );
            return json_decode( $json, true ) ?: array();
        }

        return array(
            'aliases' => array(
                'qt'  => 'Quart',
                'pt'  => 'Pint',
                'gal' => 'Gallon',
                'l'   => 'L',
                'ml'  => 'ml',
                'oz'  => 'oz',
                'lb'  => 'lb',
            ),
            'conversions' => array(
                '32 oz'  => 'Quart',
                '16 oz'  => 'Pint',
                '128 oz' => 'Gallon',
                '3.78L'  => 'Gallon',
                '946ml'  => 'Quart',
            ),
        );
    }

    /**
     * Normalize a size string
     *
     * @param string $size_string Raw size string
     * @return string|null Normalized size or null
     */
    public static function normalize_size( $size_string ) {
        if ( empty( $size_string ) ) {
            return null;
        }

        $text = strtolower( $size_string );
        
        $patterns = array(
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*gal/i', 'format' => '%s Gallon' ),
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*qt/i', 'format' => 'Quart' ),
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*pt/i', 'format' => 'Pint' ),
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*l(?:iter)?(?!\s*b)/i', 'format' => '%sL' ),
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*ml/i', 'format' => '%sml' ),
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*oz/i', 'format' => '%s oz' ),
            array( 'regex' => '/(\d+(?:\.\d+)?)\s*lb/i', 'format' => '%s lb' ),
        );

        foreach ( $patterns as $pattern ) {
            if ( preg_match( $pattern['regex'], $text, $matches ) ) {
                $value = floatval( $matches[1] );
                if ( strpos( $pattern['format'], '%s' ) !== false ) {
                    return sprintf( $pattern['format'], $value );
                }
                return $pattern['format'];
            }
        }

        return null;
    }

    /**
     * Match a product title to a product line
     *
     * @param string $title Product title
     * @param string $brand Brand name
     * @return string|null Product line name or null
     */
    public static function match_product_line( $title, $brand ) {
        $manufacturers = self::get_manufacturers();
        
        if ( ! isset( $manufacturers[ $brand ] ) ) {
            return null;
        }

        $title_lower = strtolower( $title );
        
        foreach ( $manufacturers[ $brand ]['lines'] as $line_name => $line_data ) {
            if ( ! empty( $line_data['match_patterns'] ) ) {
                foreach ( $line_data['match_patterns'] as $pattern ) {
                    if ( preg_match( '/' . $pattern . '/i', $title_lower ) ) {
                        return $line_name;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Get essential products (priority 1-2)
     *
     * @return array
     */
    public static function get_essential_products() {
        $essentials = array();
        $manufacturers = self::get_manufacturers();

        foreach ( $manufacturers as $brand => $brand_data ) {
            foreach ( $brand_data['lines'] as $line_name => $line_data ) {
                if ( isset( $line_data['priority'] ) && $line_data['priority'] <= 2 ) {
                    $essentials[] = array(
                        'brand'       => $brand,
                        'line'        => $line_name,
                        'priority'    => $line_data['priority'],
                        'type'        => $line_data['type'] ?? 'liquid',
                        'note'        => $line_data['note'] ?? '',
                        'distributor' => $line_data['distributor'] ?? '',
                    );
                }
            }
        }

        // Sort by priority
        usort( $essentials, function( $a, $b ) {
            return $a['priority'] - $b['priority'];
        } );

        return $essentials;
    }

    /**
     * Get default manufacturers data (fallback)
     *
     * @return array
     */
    private static function get_default_manufacturers() {
        return array(
            'General Hydroponics' => array(
                'distributor' => 'Hawthorne',
                'website'     => 'https://generalhydroponics.com',
                'lines'       => array(
                    'Flora Series' => array(
                        'sizes'          => array( 'Pint', 'Quart', 'Gallon', '2.5 Gallon', '6 Gallon' ),
                        'type'           => 'liquid',
                        'priority'       => 1,
                        'note'           => 'Core 3-part - essential stock',
                        'match_patterns' => array( 'flora.*gro', 'flora.*bloom', 'flora.*micro' ),
                    ),
                    'pH Up & pH Down' => array(
                        'sizes'          => array( '8 oz', 'Pint', 'Quart', 'Gallon' ),
                        'type'           => 'liquid',
                        'priority'       => 1,
                        'note'           => 'Always stock - essential',
                        'match_patterns' => array( 'ph\s*(up|down)' ),
                    ),
                ),
            ),
            'Advanced Nutrients' => array(
                'distributor' => 'Advanced Nutrients Direct',
                'website'     => 'https://advancednutrients.com',
                'lines'       => array(
                    'Big Bud' => array(
                        'sizes'          => array( '250ml', '500ml', '1L', '4L', '10L' ),
                        'type'           => 'liquid',
                        'priority'       => 1,
                        'note'           => 'Bloom booster - top seller',
                        'match_patterns' => array( 'big\s*bud' ),
                    ),
                ),
            ),
        );
    }

    /**
     * Get default data sources (fallback)
     *
     * @return array
     */
    private static function get_default_data_sources() {
        return array(
            'woocommerce' => array(
                'name'        => 'WooCommerce Database',
                'type'        => 'database',
                'description' => 'Current product catalog',
                'record_count' => 0,
                'last_sync'   => current_time( 'mysql' ),
            ),
        );
    }

    /**
     * Clear cached data
     */
    public static function clear_cache() {
        self::$manufacturers = null;
        self::$data_sources = null;
    }
}
