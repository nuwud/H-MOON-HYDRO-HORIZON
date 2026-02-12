<?php
/**
 * NACHA Field Mapping Configuration
 *
 * Provides flexible field mapping for different ACH processors.
 * Supports fixed values, derived values (callbacks), and field formatting.
 *
 * @package Nuwud\WooAchBatch\Nacha
 */

namespace Nuwud\WooAchBatch\Nacha;

use WC_Order;
use Nuwud\WooAchBatch\Admin\Settings;

/**
 * Processor-specific NACHA field mapping configuration
 */
class MappingConfig {

    /**
     * Active processor profile name
     *
     * @var string
     */
    private string $active_profile;

    /**
     * All configured profiles
     *
     * @var array<string, array>
     */
    private array $profiles;

    /**
     * Settings service
     *
     * @var Settings
     */
    private Settings $settings;

    /**
     * Field formatting callbacks
     *
     * @var array<string, callable>
     */
    private array $formatters;

    /**
     * Constructor
     *
     * @param Settings $settings Settings service
     */
    public function __construct( Settings $settings ) {
        $this->settings = $settings;
        $profile = $this->settings->get( 'nacha.processor_profile', 'default' );
        $this->active_profile = is_string( $profile ) ? $profile : 'default';
        $this->profiles = $this->load_profiles();
        $this->formatters = $this->register_formatters();
    }

    /**
     * Load processor profiles from settings and defaults
     *
     * @return array<string, array>
     */
    private function load_profiles(): array {
        $default_profiles = $this->get_default_profiles();
        $custom_profiles = $this->settings->get( 'nacha_profiles', [] );

        return array_merge( $default_profiles, $custom_profiles );
    }

    /**
     * Get default processor profiles
     *
     * Each profile defines field mappings for a specific processor.
     *
     * @return array<string, array>
     */
    private function get_default_profiles(): array {
        return [
            /**
             * Default/Generic NACHA Profile
             * Standard NACHA format compatible with most processors
             */
            'default' => [
                'name' => 'Generic NACHA',
                'description' => 'Standard NACHA format',
                'file_header' => [
                    'immediate_destination' => [
                        'source' => 'setting',
                        'key' => 'immediate_destination',
                        'format' => ['pad_left', 10, ' '],
                    ],
                    'immediate_origin' => [
                        'source' => 'setting',
                        'key' => 'immediate_origin',
                        'format' => ['pad_left', 10, ' '],
                    ],
                    'immediate_destination_name' => [
                        'source' => 'setting',
                        'key' => 'immediate_destination_name',
                        'format' => ['pad_right', 23, ' ', 'upper'],
                    ],
                    'immediate_origin_name' => [
                        'source' => 'setting',
                        'key' => 'immediate_origin_name',
                        'format' => ['pad_right', 23, ' ', 'upper'],
                    ],
                    'file_id_modifier' => [
                        'source' => 'callback',
                        'callback' => 'generate_file_id_modifier',
                    ],
                ],
                'batch_header' => [
                    'service_class_code' => [
                        'source' => 'fixed',
                        'value' => '225', // Debits only
                    ],
                    'company_name' => [
                        'source' => 'setting',
                        'key' => 'company_name',
                        'format' => ['pad_right', 16, ' ', 'upper'],
                    ],
                    'company_discretionary_data' => [
                        'source' => 'setting',
                        'key' => 'company_discretionary_data',
                        'format' => ['pad_right', 20, ' '],
                        'default' => '',
                    ],
                    'company_id' => [
                        'source' => 'setting',
                        'key' => 'company_id',
                        'format' => ['format_company_id'],
                    ],
                    'sec_code' => [
                        'source' => 'setting',
                        'key' => 'sec_code',
                        'default' => 'PPD',
                    ],
                    'company_entry_description' => [
                        'source' => 'setting',
                        'key' => 'company_entry_description',
                        'format' => ['pad_right', 10, ' ', 'upper'],
                        'default' => 'PURCHASE',
                    ],
                    'effective_entry_date' => [
                        'source' => 'callback',
                        'callback' => 'calculate_effective_date',
                    ],
                    'originating_dfi_id' => [
                        'source' => 'setting',
                        'key' => 'originating_dfi_id',
                        'format' => ['substr', 0, 8],
                    ],
                ],
                'entry_detail' => [
                    'transaction_code' => [
                        'source' => 'callback',
                        'callback' => 'determine_transaction_code',
                    ],
                    'receiving_dfi_id' => [
                        'source' => 'order',
                        'key' => 'routing_number',
                        'format' => ['substr', 0, 8],
                    ],
                    'check_digit' => [
                        'source' => 'callback',
                        'callback' => 'calculate_check_digit',
                    ],
                    'dfi_account_number' => [
                        'source' => 'order',
                        'key' => 'account_number',
                        'format' => ['pad_right', 17, ' ', 'strip_non_digits'],
                    ],
                    'amount' => [
                        'source' => 'order',
                        'key' => 'total',
                        'format' => ['format_amount'],
                    ],
                    'individual_id' => [
                        'source' => 'callback',
                        'callback' => 'generate_individual_id',
                    ],
                    'individual_name' => [
                        'source' => 'order',
                        'key' => 'billing_name',
                        'format' => ['pad_right', 22, ' ', 'upper', 'alpha_only'],
                    ],
                    'discretionary_data' => [
                        'source' => 'fixed',
                        'value' => '  ', // 2 spaces
                    ],
                    'addenda_indicator' => [
                        'source' => 'fixed',
                        'value' => '0',
                    ],
                ],
            ],

            /**
             * Dan's Processor Profile
             * Custom field mappings for Monday implementation
             * TODO: Confirm exact requirements with Dan
             */
            'dan_processor' => [
                'name' => "Dan's Processor",
                'description' => 'Custom processor configuration - update after Monday meeting',
                'file_header' => [
                    'immediate_destination' => [
                        'source' => 'setting',
                        'key' => 'immediate_destination',
                        'format' => ['pad_left', 10, ' '],
                    ],
                    'immediate_origin' => [
                        'source' => 'setting',
                        'key' => 'immediate_origin',
                        'format' => ['format_origin_with_prefix'],
                        // Some processors want "1" prefix before routing
                    ],
                    'immediate_destination_name' => [
                        'source' => 'setting',
                        'key' => 'immediate_destination_name',
                        'format' => ['pad_right', 23, ' '],
                    ],
                    'immediate_origin_name' => [
                        'source' => 'setting',
                        'key' => 'immediate_origin_name',
                        'format' => ['pad_right', 23, ' '],
                    ],
                    'file_id_modifier' => [
                        'source' => 'callback',
                        'callback' => 'generate_file_id_modifier',
                    ],
                    'reference_code' => [
                        'source' => 'setting',
                        'key' => 'reference_code',
                        'format' => ['pad_right', 8, ' '],
                        'default' => '',
                    ],
                ],
                'batch_header' => [
                    'service_class_code' => [
                        'source' => 'callback',
                        'callback' => 'determine_service_class',
                        // 200=mixed, 220=credits, 225=debits
                    ],
                    'company_name' => [
                        'source' => 'setting',
                        'key' => 'company_name',
                        'format' => ['pad_right', 16, ' ', 'upper'],
                    ],
                    'company_discretionary_data' => [
                        'source' => 'callback',
                        'callback' => 'generate_batch_reference',
                    ],
                    'company_id' => [
                        'source' => 'setting',
                        'key' => 'company_id',
                        'format' => ['format_company_id_with_prefix'],
                        // Format: 1 + 9-digit EIN
                    ],
                    'sec_code' => [
                        'source' => 'callback',
                        'callback' => 'determine_sec_code',
                        // PPD for consumer, WEB for internet, CCD for business
                    ],
                    'company_entry_description' => [
                        'source' => 'setting',
                        'key' => 'company_entry_description',
                        'format' => ['pad_right', 10, ' ', 'upper'],
                    ],
                    'company_descriptive_date' => [
                        'source' => 'callback',
                        'callback' => 'format_descriptive_date',
                    ],
                    'effective_entry_date' => [
                        'source' => 'callback',
                        'callback' => 'calculate_effective_date',
                    ],
                    'originator_status_code' => [
                        'source' => 'fixed',
                        'value' => '1',
                    ],
                    'originating_dfi_id' => [
                        'source' => 'setting',
                        'key' => 'originating_dfi_id',
                        'format' => ['substr', 0, 8],
                    ],
                ],
                'entry_detail' => [
                    'transaction_code' => [
                        'source' => 'callback',
                        'callback' => 'determine_transaction_code',
                    ],
                    'receiving_dfi_id' => [
                        'source' => 'order',
                        'key' => 'routing_number',
                        'format' => ['substr', 0, 8],
                    ],
                    'check_digit' => [
                        'source' => 'callback',
                        'callback' => 'calculate_check_digit',
                    ],
                    'dfi_account_number' => [
                        'source' => 'order',
                        'key' => 'account_number',
                        'format' => ['pad_right', 17, ' '],
                    ],
                    'amount' => [
                        'source' => 'order',
                        'key' => 'total',
                        'format' => ['format_amount'],
                    ],
                    'individual_id' => [
                        'source' => 'order',
                        'key' => 'order_id',
                        'format' => ['pad_right', 15, ' '],
                    ],
                    'individual_name' => [
                        'source' => 'order',
                        'key' => 'billing_name',
                        'format' => ['pad_right', 22, ' ', 'upper'],
                    ],
                    'discretionary_data' => [
                        'source' => 'fixed',
                        'value' => '  ',
                    ],
                    'addenda_indicator' => [
                        'source' => 'fixed',
                        'value' => '0',
                    ],
                ],
                'custom_options' => [
                    'zero_dollar_prenotes' => true,
                    'require_addenda_for_returns' => false,
                    'settlement_delay_days' => 1,
                ],
            ],

            /**
             * Test/Sandbox Profile
             * For development and testing
             */
            'test' => [
                'name' => 'Test/Sandbox',
                'description' => 'For development and testing with fake data',
                'file_header' => [
                    'immediate_destination' => [
                        'source' => 'fixed',
                        'value' => ' 091000019', // Test routing
                    ],
                    'immediate_origin' => [
                        'source' => 'fixed',
                        'value' => ' 121042882', // Test routing
                    ],
                    'immediate_destination_name' => [
                        'source' => 'fixed',
                        'value' => 'TEST BANK              ',
                    ],
                    'immediate_origin_name' => [
                        'source' => 'fixed',
                        'value' => 'TEST COMPANY           ',
                    ],
                    'file_id_modifier' => [
                        'source' => 'fixed',
                        'value' => 'T',
                    ],
                ],
                'batch_header' => [
                    'service_class_code' => [
                        'source' => 'fixed',
                        'value' => '225',
                    ],
                    'company_name' => [
                        'source' => 'fixed',
                        'value' => 'TEST COMPANY    ',
                    ],
                    'company_discretionary_data' => [
                        'source' => 'fixed',
                        'value' => '                    ',
                    ],
                    'company_id' => [
                        'source' => 'fixed',
                        'value' => '1123456789',
                    ],
                    'sec_code' => [
                        'source' => 'fixed',
                        'value' => 'PPD',
                    ],
                    'company_entry_description' => [
                        'source' => 'fixed',
                        'value' => 'TEST      ',
                    ],
                    'effective_entry_date' => [
                        'source' => 'callback',
                        'callback' => 'calculate_effective_date',
                    ],
                    'originating_dfi_id' => [
                        'source' => 'fixed',
                        'value' => '12104288',
                    ],
                ],
                'entry_detail' => [
                    'transaction_code' => [
                        'source' => 'callback',
                        'callback' => 'determine_transaction_code',
                    ],
                    'receiving_dfi_id' => [
                        'source' => 'order',
                        'key' => 'routing_number',
                        'format' => ['substr', 0, 8],
                    ],
                    'check_digit' => [
                        'source' => 'callback',
                        'callback' => 'calculate_check_digit',
                    ],
                    'dfi_account_number' => [
                        'source' => 'order',
                        'key' => 'account_number',
                        'format' => ['pad_right', 17, ' '],
                    ],
                    'amount' => [
                        'source' => 'order',
                        'key' => 'total',
                        'format' => ['format_amount'],
                    ],
                    'individual_id' => [
                        'source' => 'order',
                        'key' => 'order_id',
                        'format' => ['pad_right', 15, ' '],
                    ],
                    'individual_name' => [
                        'source' => 'order',
                        'key' => 'billing_name',
                        'format' => ['pad_right', 22, ' ', 'upper'],
                    ],
                    'discretionary_data' => [
                        'source' => 'fixed',
                        'value' => '  ',
                    ],
                    'addenda_indicator' => [
                        'source' => 'fixed',
                        'value' => '0',
                    ],
                ],
            ],
        ];
    }

    /**
     * Register field formatters
     *
     * @return array<string, callable>
     */
    private function register_formatters(): array {
        return [
            /**
             * Pad string on left side
             * @param string $value
             * @param int $length
             * @param string $pad_char
             * @return string
             */
            'pad_left' => fn( string $value, int $length, string $pad_char = ' ' ): string =>
                str_pad( substr( $value, 0, $length ), $length, $pad_char, STR_PAD_LEFT ),

            /**
             * Pad string on right side
             * @param string $value
             * @param int $length
             * @param string $pad_char
             * @return string
             */
            'pad_right' => fn( string $value, int $length, string $pad_char = ' ' ): string =>
                str_pad( substr( $value, 0, $length ), $length, $pad_char, STR_PAD_RIGHT ),

            /**
             * Convert to uppercase
             */
            'upper' => fn( string $value ): string => strtoupper( $value ),

            /**
             * Strip non-digit characters
             */
            'strip_non_digits' => fn( string $value ): string => preg_replace( '/[^0-9]/', '', $value ),

            /**
             * Strip non-alphanumeric characters
             */
            'alpha_only' => fn( string $value ): string => preg_replace( '/[^A-Za-z0-9 ]/', '', $value ),

            /**
             * Trim whitespace
             */
            'trim' => fn( string $value ): string => trim( $value ),

            /**
             * Substring
             * @param string $value
             * @param int $start
             * @param int|null $length
             * @return string
             */
            'substr' => fn( string $value, int $start, ?int $length = null ): string =>
                $length !== null ? substr( $value, $start, $length ) : substr( $value, $start ),

            /**
             * Format amount as cents (no decimal)
             * e.g., 123.45 => "0000012345"
             */
            'format_amount' => function( $value ): string {
                $cents = (int) round( (float) $value * 100 );
                return str_pad( (string) $cents, 10, '0', STR_PAD_LEFT );
            },

            /**
             * Format company ID with "1" prefix (1 + 9-digit EIN)
             */
            'format_company_id' => function( string $value ): string {
                $digits = preg_replace( '/[^0-9]/', '', $value );
                if ( strlen( $digits ) === 9 ) {
                    return '1' . $digits;
                }
                return str_pad( substr( $digits, 0, 10 ), 10, ' ', STR_PAD_LEFT );
            },

            /**
             * Format company ID with prefix option
             */
            'format_company_id_with_prefix' => function( string $value ): string {
                $digits = preg_replace( '/[^0-9]/', '', $value );
                // Ensure 10 characters: 1 + 9-digit EIN
                return '1' . str_pad( substr( $digits, 0, 9 ), 9, '0', STR_PAD_LEFT );
            },

            /**
             * Format origin with leading space or "1" based on processor
             */
            'format_origin_with_prefix' => function( string $value ): string {
                $digits = preg_replace( '/[^0-9]/', '', $value );
                return ' ' . str_pad( $digits, 9, '0', STR_PAD_LEFT );
            },
        ];
    }

    /**
     * Get active profile configuration
     *
     * @return array
     */
    public function get_active_profile(): array {
        if ( ! isset( $this->profiles[ $this->active_profile ] ) ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'Profile "%s" not found, using default', $this->active_profile ),
                'warning'
            );
            return $this->profiles['default'];
        }

        return $this->profiles[ $this->active_profile ];
    }

    /**
     * Set active profile
     *
     * @param string $profile_name Profile name
     * @return bool True if profile exists
     */
    public function set_active_profile( string $profile_name ): bool {
        if ( ! isset( $this->profiles[ $profile_name ] ) ) {
            return false;
        }
        $this->active_profile = $profile_name;
        return true;
    }

    /**
     * Get list of available profiles
     *
     * @return array<string, string> Profile name => description
     */
    public function get_available_profiles(): array {
        $result = [];
        foreach ( $this->profiles as $name => $config ) {
            $result[ $name ] = $config['name'] ?? $name;
        }
        return $result;
    }

    /**
     * Get mapped value for a field
     *
     * @param string        $record_type 'file_header', 'batch_header', 'entry_detail'
     * @param string        $field_name  Field name in the mapping
     * @param WC_Order|null $order       Order object (for entry_detail fields)
     * @param array         $context     Additional context data
     * @return string Formatted field value
     */
    public function get_field_value( string $record_type, string $field_name, ?WC_Order $order = null, array $context = [] ): string {
        $profile = $this->get_active_profile();

        if ( ! isset( $profile[ $record_type ][ $field_name ] ) ) {
            throw new \InvalidArgumentException(
                sprintf( 'Field "%s.%s" not defined in profile "%s"', $record_type, $field_name, $this->active_profile )
            );
        }

        $field_config = $profile[ $record_type ][ $field_name ];
        $raw_value = $this->resolve_value( $field_config, $order, $context );

        // Apply formatting
        if ( isset( $field_config['format'] ) ) {
            $raw_value = $this->apply_format( $raw_value, $field_config['format'] );
        }

        return $raw_value;
    }

    /**
     * Resolve the raw value based on source type
     *
     * @param array         $field_config Field configuration
     * @param WC_Order|null $order        Order object
     * @param array         $context      Additional context
     * @return string
     */
    private function resolve_value( array $field_config, ?WC_Order $order, array $context ): string {
        $source = $field_config['source'] ?? 'fixed';

        switch ( $source ) {
            case 'fixed':
                return (string) ( $field_config['value'] ?? '' );

            case 'setting':
                $key = $field_config['key'] ?? '';
                $value = $this->settings->get_nacha_config()[ $key ] ?? '';
                return $value ?: ( $field_config['default'] ?? '' );

            case 'order':
                if ( ! $order ) {
                    throw new \RuntimeException( 'Order required for order-sourced fields' );
                }
                return $this->get_order_value( $order, $field_config['key'] ?? '', $context );

            case 'callback':
                $callback = $field_config['callback'] ?? '';
                return $this->execute_callback( $callback, $order, $context );

            case 'context':
                $key = $field_config['key'] ?? '';
                return (string) ( $context[ $key ] ?? $field_config['default'] ?? '' );

            default:
                throw new \InvalidArgumentException( "Unknown source type: {$source}" );
        }
    }

    /**
     * Get value from order object
     *
     * @param WC_Order $order Order object
     * @param string   $key   Field key
     * @param array    $context Context data (may contain decrypted bank details)
     * @return string
     */
    private function get_order_value( WC_Order $order, string $key, array $context ): string {
        switch ( $key ) {
            case 'order_id':
                return (string) $order->get_id();

            case 'total':
                return (string) $order->get_total();

            case 'billing_name':
                return trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() );

            case 'billing_email':
                return $order->get_billing_email();

            case 'routing_number':
                // Must be provided in context (decrypted separately for security)
                if ( ! isset( $context['bank_details']['routing'] ) ) {
                    throw new \RuntimeException( 'Routing number not provided in context' );
                }
                return $context['bank_details']['routing'];

            case 'account_number':
                // Must be provided in context (decrypted separately for security)
                if ( ! isset( $context['bank_details']['account'] ) ) {
                    throw new \RuntimeException( 'Account number not provided in context' );
                }
                return $context['bank_details']['account'];

            case 'account_type':
                return $context['bank_details']['type'] ?? 'checking';

            default:
                // Try order meta
                $meta_value = $order->get_meta( $key );
                return is_string( $meta_value ) ? $meta_value : '';
        }
    }

    /**
     * Execute a callback to generate a value
     *
     * @param string        $callback_name Callback identifier
     * @param WC_Order|null $order         Order object
     * @param array         $context       Additional context
     * @return string
     */
    private function execute_callback( string $callback_name, ?WC_Order $order, array $context ): string {
        switch ( $callback_name ) {
            case 'generate_file_id_modifier':
                // A-Z based on file count for the day, or from context
                return $context['file_id_modifier'] ?? 'A';

            case 'calculate_effective_date':
                // Next business day in YYMMDD format
                return $this->calculate_next_business_day();

            case 'determine_transaction_code':
                // 27 = checking debit, 37 = savings debit
                // 22 = checking credit, 32 = savings credit
                $account_type = $context['bank_details']['type'] ?? 'checking';
                $is_credit = $context['is_credit'] ?? false;

                if ( $account_type === 'savings' ) {
                    return $is_credit ? '32' : '37';
                }
                return $is_credit ? '22' : '27';

            case 'calculate_check_digit':
                // Calculate check digit for routing number
                $routing = $context['bank_details']['routing'] ?? '';
                return $this->calculate_routing_check_digit( $routing );

            case 'generate_individual_id':
                // Use order ID or customer ID, formatted
                if ( $order ) {
                    return str_pad( (string) $order->get_id(), 15, ' ', STR_PAD_RIGHT );
                }
                return str_repeat( ' ', 15 );

            case 'determine_service_class':
                // 200 = mixed, 220 = credits, 225 = debits
                $has_credits = $context['has_credits'] ?? false;
                $has_debits = $context['has_debits'] ?? true;

                if ( $has_credits && $has_debits ) {
                    return '200';
                }
                return $has_credits ? '220' : '225';

            case 'determine_sec_code':
                // PPD = consumer, WEB = internet, CCD = business
                // Default to WEB for e-commerce
                return $context['sec_code'] ?? 'WEB';

            case 'format_descriptive_date':
                // MMDDYY or other format based on processor
                return date( 'ymd' );

            case 'generate_batch_reference':
                // Batch-level reference data
                $batch_id = $context['batch_id'] ?? '';
                return str_pad( $batch_id, 20, ' ', STR_PAD_RIGHT );

            default:
                throw new \InvalidArgumentException( "Unknown callback: {$callback_name}" );
        }
    }

    /**
     * Apply formatting rules to a value
     *
     * @param string       $value  Raw value
     * @param array|string $format Format specification
     * @return string
     */
    private function apply_format( string $value, $format ): string {
        // If format is a string, it's a single formatter name
        if ( is_string( $format ) ) {
            $format = [ $format ];
        }

        // First element is the formatter name, rest are arguments
        $formatter_name = array_shift( $format );

        // Check for chained formatters (e.g., ['pad_right', 10, ' ', 'upper'])
        // Arguments after length/char might be additional formatters
        $extra_formatters = [];
        $formatter_args = [];

        foreach ( $format as $arg ) {
            if ( is_string( $arg ) && isset( $this->formatters[ $arg ] ) ) {
                $extra_formatters[] = $arg;
            } else {
                $formatter_args[] = $arg;
            }
        }

        // Apply primary formatter
        if ( isset( $this->formatters[ $formatter_name ] ) ) {
            $value = $this->formatters[ $formatter_name ]( $value, ...$formatter_args );
        } elseif ( is_callable( $formatter_name ) ) {
            $value = $formatter_name( $value, ...$formatter_args );
        }

        // Apply additional formatters
        foreach ( $extra_formatters as $extra ) {
            if ( isset( $this->formatters[ $extra ] ) ) {
                $value = $this->formatters[ $extra ]( $value );
            }
        }

        return $value;
    }

    /**
     * Calculate next business day in YYMMDD format
     *
     * @param int $days_ahead Minimum days ahead
     * @return string
     */
    private function calculate_next_business_day( int $days_ahead = 1 ): string {
        $date = new \DateTime( 'now', new \DateTimeZone( 'America/Los_Angeles' ) );
        $days_added = 0;

        while ( $days_added < $days_ahead ) {
            $date->modify( '+1 day' );

            // Skip weekends
            $day_of_week = (int) $date->format( 'N' );
            if ( $day_of_week < 6 ) {
                $days_added++;
            }
        }

        // Skip if landing on weekend
        while ( (int) $date->format( 'N' ) >= 6 ) {
            $date->modify( '+1 day' );
        }

        // TODO: Add federal holiday checking
        return $date->format( 'ymd' );
    }

    /**
     * Calculate check digit for ABA routing number
     *
     * @param string $routing 9-digit routing number
     * @return string Single digit
     */
    private function calculate_routing_check_digit( string $routing ): string {
        if ( strlen( $routing ) < 9 ) {
            return '0';
        }

        // The 9th digit IS the check digit
        return substr( $routing, 8, 1 );
    }

    /**
     * Add a custom profile programmatically
     *
     * @param string $name   Profile name (slug)
     * @param array  $config Profile configuration
     * @return bool
     */
    public function add_profile( string $name, array $config ): bool {
        if ( ! isset( $config['file_header'] ) || ! isset( $config['batch_header'] ) || ! isset( $config['entry_detail'] ) ) {
            return false;
        }

        $this->profiles[ $name ] = $config;

        // Persist to settings if needed
        $custom_profiles = $this->settings->get( 'nacha_profiles', [] );
        $custom_profiles[ $name ] = $config;
        $this->settings->update( 'nacha_profiles', $custom_profiles );

        return true;
    }

    /**
     * Register a custom formatter
     *
     * @param string   $name     Formatter name
     * @param callable $callback Formatter callback
     */
    public function add_formatter( string $name, callable $callback ): void {
        $this->formatters[ $name ] = $callback;
    }

    /**
     * Validate a profile configuration
     *
     * @param array $config Profile configuration
     * @return array{valid: bool, errors: array}
     */
    public function validate_profile( array $config ): array {
        $errors = [];
        $required_sections = [ 'file_header', 'batch_header', 'entry_detail' ];

        foreach ( $required_sections as $section ) {
            if ( ! isset( $config[ $section ] ) ) {
                $errors[] = "Missing required section: {$section}";
            }
        }

        // Validate file_header required fields
        $required_file_header = [ 'immediate_destination', 'immediate_origin' ];
        foreach ( $required_file_header as $field ) {
            if ( ! isset( $config['file_header'][ $field ] ) ) {
                $errors[] = "Missing file_header field: {$field}";
            }
        }

        // Validate entry_detail required fields
        $required_entry = [ 'transaction_code', 'receiving_dfi_id', 'dfi_account_number', 'amount' ];
        foreach ( $required_entry as $field ) {
            if ( ! isset( $config['entry_detail'][ $field ] ) ) {
                $errors[] = "Missing entry_detail field: {$field}";
            }
        }

        return [
            'valid' => empty( $errors ),
            'errors' => $errors,
        ];
    }

    /**
     * Get all field mappings for a record type (for documentation/debugging)
     *
     * @param string $record_type Record type
     * @return array
     */
    public function get_field_mappings( string $record_type ): array {
        $profile = $this->get_active_profile();
        return $profile[ $record_type ] ?? [];
    }
}
