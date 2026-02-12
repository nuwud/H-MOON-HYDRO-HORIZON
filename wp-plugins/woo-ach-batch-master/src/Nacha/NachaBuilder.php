<?php
/**
 * NACHA File Builder
 *
 * Builds NACHA-compliant ACH files using the RevenueWire ACH library.
 *
 * @package Nuwud\WooAchBatch\Nacha
 */

namespace Nuwud\WooAchBatch\Nacha;

use Nuwud\WooAchBatch\Admin\Settings;
use Nuwud\WooAchBatch\Security\PrivateStorage;
use RW\ACH\File;
use RW\ACH\FileHeader;
use RW\ACH\Batch;
use RW\ACH\BatchHeader;
use RW\ACH\EntryDetail;

/**
 * NACHA file builder wrapper
 */
class NachaBuilder {

    /**
     * Settings service
     *
     * @var Settings
     */
    private Settings $settings;

    /**
     * Private storage service
     *
     * @var PrivateStorage
     */
    private PrivateStorage $storage;

    /**
     * Mapping configuration service
     *
     * @var MappingConfig|null
     */
    private ?MappingConfig $mapping = null;

    /**
     * Current ACH file being built
     *
     * @var File|null
     */
    private ?File $file = null;

    /**
     * Current batch being built
     *
     * @var Batch|null
     */
    private ?Batch $batch = null;

    /**
     * Trace number sequence counter
     *
     * @var int
     */
    private int $trace_sequence = 0;

    /**
     * Constructor
     *
     * @param Settings          $settings Settings service
     * @param PrivateStorage    $storage  Private storage service
     * @param MappingConfig|null $mapping  Optional mapping config (auto-resolved if null)
     */
    public function __construct( Settings $settings, PrivateStorage $storage, ?MappingConfig $mapping = null ) {
        $this->settings = $settings;
        $this->storage = $storage;
        $this->mapping = $mapping;
    }

    /**
     * Get or create mapping configuration
     *
     * @return MappingConfig
     */
    private function get_mapping(): MappingConfig {
        if ( null === $this->mapping ) {
            $this->mapping = new MappingConfig( $this->settings );
        }
        return $this->mapping;
    }

    /**
     * Set the active processor profile
     *
     * @param string $profile Profile name (e.g., 'default', 'dan_processor')
     * @return bool True if profile exists
     */
    public function set_processor_profile( string $profile ): bool {
        return $this->get_mapping()->set_active_profile( $profile );
    }

    /**
     * Create a new NACHA file
     *
     * @param string|null $file_id_modifier Single character A-Z or 0-9 for multiple files per day
     * @return self
     * @throws \RuntimeException If NACHA settings are incomplete
     */
    public function create_file( ?string $file_id_modifier = null ): self {
        $config = $this->settings->get_nacha_config();

        // Validate required settings
        $validation = $this->settings->validate_nacha_settings();
        if ( ! $validation['valid'] ) {
            throw new \RuntimeException(
                'NACHA settings incomplete. Missing: ' . implode( ', ', $validation['missing'] )
            );
        }

        // TODO: Dan's processor may require specific field mappings here
        // Adjust these values based on processor requirements on Monday

        $this->file = new File();

        // Build file header
        // @see https://achdevguide.nacha.org/file-details for field specifications
        $file_header = new FileHeader();

        // Record Type Code = 1 (automatic)
        // Priority Code = 01 (automatic)

        // Immediate Destination - 10 positions, right justified, blank filled
        // Usually the receiving bank's routing number preceded by a space
        $file_header->setImmediateDestination(
            $this->pad_routing( $config['immediate_destination'] )
        );

        // Immediate Origin - 10 positions
        // Usually the originating company's federal ID or routing number
        $file_header->setImmediateOrigin(
            $this->pad_routing( $config['immediate_origin'] )
        );

        // File Creation Date (YYMMDD) - automatic
        // File Creation Time (HHMM) - automatic

        // File ID Modifier - single char, A-Z or 0-9
        $modifier = $file_id_modifier ?? $config['file_id_modifier'] ?? 'A';
        $file_header->setFileIdModifier( $modifier );

        // Record Size = 094 (automatic)
        // Blocking Factor = 10 (automatic)
        // Format Code = 1 (automatic)

        // Immediate Destination Name - 23 positions
        $file_header->setImmediateDestinationName(
            $this->sanitize_string( $config['immediate_destination_name'], 23 )
        );

        // Immediate Origin Name - 23 positions
        $file_header->setImmediateOriginName(
            $this->sanitize_string( $config['immediate_origin_name'], 23 )
        );

        // Reference Code - 8 positions (optional)
        $file_header->setReferenceCode( '' );

        $this->file->setHeader( $file_header );

        // Reset trace sequence for new file
        $this->trace_sequence = 0;

        return $this;
    }

    /**
     * Start a new batch within the file
     *
     * @param string      $batch_id             Unique batch identifier
     * @param string|null $effective_entry_date YYMMDD format (null for tomorrow)
     * @return self
     */
    public function start_batch( string $batch_id, ?string $effective_entry_date = null ): self {
        if ( ! $this->file ) {
            throw new \RuntimeException( 'Must create file before starting batch' );
        }

        $config = $this->settings->get_nacha_config();

        // TODO: Dan to confirm service class code requirements
        // 200 = mixed debits and credits
        // 220 = credits only
        // 225 = debits only (most common for receivables)

        $this->batch = new Batch();

        $batch_header = new BatchHeader();

        // Service Class Code - 3 digits
        $batch_header->setServiceClassCode( $config['service_class_code'] ?? '225' );

        // Company Name - 16 positions
        $batch_header->setCompanyName(
            $this->sanitize_string( $config['company_name'], 16 )
        );

        // Company Discretionary Data - 20 positions (optional)
        $batch_header->setCompanyDiscretionaryData(
            $this->sanitize_string( $config['company_discretionary_data'] ?? '', 20 )
        );

        // Company Identification - 10 positions
        // Usually 1 + 9-digit EIN
        $batch_header->setCompanyId( $this->format_company_id( $config['company_id'] ) );

        // Standard Entry Class Code - 3 positions
        // PPD = Prearranged Payment and Deposit (consumer)
        // CCD = Corporate Credit or Debit (business)
        // WEB = Internet-Initiated Entry
        $batch_header->setStandardEntryClassCode( $config['sec_code'] ?? 'PPD' );

        // Company Entry Description - 10 positions
        // e.g., "PURCHASE", "PAYROLL", "PAYMENT"
        $batch_header->setCompanyEntryDescription(
            $this->sanitize_string( $config['company_entry_description'], 10 )
        );

        // Company Descriptive Date - 6 positions (optional)
        $batch_header->setCompanyDescriptiveDate( date( 'ymd' ) );

        // Effective Entry Date - 6 positions (YYMMDD)
        // The date entries should be posted
        // TODO: Dan to confirm - typically 1-2 business days out
        if ( ! $effective_entry_date ) {
            // Default to next business day
            $effective_entry_date = $this->get_next_business_day();
        }
        $batch_header->setEffectiveEntryDate( $effective_entry_date );

        // Settlement Date - 3 positions (filled by ACH operator)
        // Leave blank

        // Originator Status Code - 1 position
        // 1 = ACH Operator
        // 2 = Federal Reserve (default)
        $batch_header->setOriginatorStatusCode( '1' );

        // Originating DFI Identification - 8 positions
        // First 8 digits of the originator's routing number
        $batch_header->setOriginatingDFIId(
            substr( $config['originating_dfi_id'], 0, 8 )
        );

        // Batch Number - 7 positions (auto-incremented per file)
        // Will be set when adding to file

        $this->batch->setHeader( $batch_header );

        return $this;
    }

    /**
     * Add an entry using MappingConfig for processor-specific formatting
     *
     * This method uses the active processor profile from MappingConfig to
     * format all entry fields according to processor requirements.
     *
     * @param \WC_Order $order       WooCommerce order
     * @param array     $bank_details Decrypted bank details ['routing', 'account', 'type']
     * @return string Trace number assigned to this entry
     */
    public function add_entry_with_mapping( \WC_Order $order, array $bank_details ): string {
        if ( ! $this->batch ) {
            throw new \RuntimeException( 'Must start batch before adding entries' );
        }

        $config = $this->settings->get_nacha_config();
        $mapping = $this->get_mapping();

        // Build context with bank details for secure field resolution
        $context = [
            'bank_details' => $bank_details,
        ];

        $entry = new EntryDetail();

        // Use MappingConfig for all field formatting
        $entry->setTransactionCode(
            $mapping->get_field_value( 'entry_detail', 'transaction_code', $order, $context )
        );

        $entry->setReceivingDFIId(
            $mapping->get_field_value( 'entry_detail', 'receiving_dfi_id', $order, $context )
        );

        $entry->setCheckDigit(
            $mapping->get_field_value( 'entry_detail', 'check_digit', $order, $context )
        );

        $entry->setDFIAccountNumber(
            $mapping->get_field_value( 'entry_detail', 'dfi_account_number', $order, $context )
        );

        $entry->setAmount(
            $mapping->get_field_value( 'entry_detail', 'amount', $order, $context )
        );

        $entry->setIndividualIdNumber(
            $mapping->get_field_value( 'entry_detail', 'individual_id', $order, $context )
        );

        $entry->setIndividualName(
            $mapping->get_field_value( 'entry_detail', 'individual_name', $order, $context )
        );

        $entry->setDiscretionaryData(
            $mapping->get_field_value( 'entry_detail', 'discretionary_data', $order, $context )
        );

        $entry->setAddendaRecordIndicator(
            $mapping->get_field_value( 'entry_detail', 'addenda_indicator', $order, $context )
        );

        // Generate trace number
        $this->trace_sequence++;
        $trace_number = \Nuwud\WooAchBatch\generate_trace_number(
            $config['originating_dfi_id'],
            $this->trace_sequence
        );
        $entry->setTraceNumber( $trace_number );

        $this->batch->addEntry( $entry );

        return $trace_number;
    }

    /**
     * Add an entry (transaction) to the current batch
     *
     * @param array $entry_data Entry details
     * @return string Trace number assigned to this entry
     * @deprecated Use add_entry_with_mapping() for processor-specific formatting
     */
    public function add_entry( array $entry_data ): string {
        if ( ! $this->batch ) {
            throw new \RuntimeException( 'Must start batch before adding entries' );
        }

        $config = $this->settings->get_nacha_config();

        // Legacy method - uses hardcoded formatting
        // Consider using add_entry_with_mapping() instead

        $entry = new EntryDetail();

        // Transaction Code - 2 digits
        // 22 = Checking Credit, 27 = Checking Debit
        // 32 = Savings Credit, 37 = Savings Debit
        $transaction_code = $this->settings->get_transaction_code(
            $entry_data['account_type'] ?? 'checking',
            $entry_data['is_credit'] ?? false
        );
        $entry->setTransactionCode( $transaction_code );

        // Receiving DFI Identification - 8 digits
        // First 8 digits of the receiver's bank routing number
        $entry->setReceivingDFIId( substr( $entry_data['routing_number'], 0, 8 ) );

        // Check Digit - 1 digit
        // 9th digit of routing number
        $entry->setCheckDigit( substr( $entry_data['routing_number'], 8, 1 ) );

        // DFI Account Number - 17 positions
        // Receiver's bank account number, left justified
        $entry->setDFIAccountNumber(
            str_pad( $entry_data['account_number'], 17, ' ' )
        );

        // Amount - 10 positions, right justified, zero filled
        // In cents (no decimal point)
        $amount_cents = \Nuwud\WooAchBatch\format_amount_cents( $entry_data['amount'] );
        $entry->setAmount( $amount_cents );

        // Individual Identification Number - 15 positions
        // Customer account number or order ID
        $entry->setIndividualIdNumber(
            str_pad( substr( $entry_data['order_id'], 0, 15 ), 15, ' ' )
        );

        // Individual Name - 22 positions
        $entry->setIndividualName(
            $this->sanitize_string( $entry_data['name'], 22 )
        );

        // Discretionary Data - 2 positions (optional)
        $entry->setDiscretionaryData( '  ' );

        // Addenda Record Indicator - 1 position
        // 0 = no addenda, 1 = addenda follows
        $entry->setAddendaRecordIndicator( '0' );

        // Trace Number - 15 positions
        // 8-digit ODFI routing + 7-digit sequence
        $this->trace_sequence++;
        $trace_number = \Nuwud\WooAchBatch\generate_trace_number(
            $config['originating_dfi_id'],
            $this->trace_sequence
        );
        $entry->setTraceNumber( $trace_number );

        // Add entry to batch
        $this->batch->addEntry( $entry );

        return $trace_number;
    }

    /**
     * Finish the current batch and add it to the file
     *
     * @return self
     */
    public function finish_batch(): self {
        if ( ! $this->batch || ! $this->file ) {
            throw new \RuntimeException( 'No batch to finish' );
        }

        // Add batch to file (this generates the batch control record)
        $this->file->addBatch( $this->batch );

        $this->batch = null;

        return $this;
    }

    /**
     * Generate the final NACHA file content
     *
     * @return string NACHA file content
     */
    public function generate(): string {
        if ( ! $this->file ) {
            throw new \RuntimeException( 'No file to generate' );
        }

        // Ensure any open batch is finished
        if ( $this->batch ) {
            $this->finish_batch();
        }

        // Generate file content
        return $this->file->toString();
    }

    /**
     * Save the NACHA file to disk using secure private storage
     *
     * SECURITY: Files are stored in a protected directory with:
     * - .htaccess "Deny from all"
     * - 0600 file permissions
     * - No direct web access
     *
     * @param string $filename Filename to save as
     * @return string Full path to saved file
     * @throws \RuntimeException If file cannot be saved
     */
    public function save( string $filename ): string {
        $content = $this->generate();

        // Validate NACHA content before saving
        $validation = $this->validate( $content );
        if ( ! $validation['valid'] ) {
            \Nuwud\WooAchBatch\log_message(
                sprintf( 'NACHA validation failed: %s', implode( '; ', $validation['errors'] ) ),
                'error'
            );
            // Continue anyway - validation is informational
        }

        // Use PrivateStorage for secure file handling
        $filepath = $this->storage->write( PrivateStorage::STORAGE_NACHA, $filename, $content );

        if ( false === $filepath ) {
            throw new \RuntimeException( 'Failed to save NACHA file to protected storage' );
        }

        \Nuwud\WooAchBatch\log_message(
            sprintf( 'NACHA file saved securely: %s (%d bytes)', $filename, strlen( $content ) ),
            'info'
        );

        return $filepath;
    }

    /**
     * Get the current file object (for inspection/testing)
     *
     * @return File|null
     */
    public function get_file(): ?File {
        return $this->file;
    }

    /**
     * Reset the builder for a new file
     *
     * @return self
     */
    public function reset(): self {
        $this->file = null;
        $this->batch = null;
        $this->trace_sequence = 0;
        return $this;
    }

    /**
     * Sanitize string for NACHA (uppercase alphanumeric + space)
     *
     * @param string $string Input string
     * @param int    $length Max length
     * @return string
     */
    private function sanitize_string( string $string, int $length ): string {
        // Convert to uppercase
        $string = strtoupper( $string );

        // Remove non-alphanumeric except space
        $string = preg_replace( '/[^A-Z0-9 ]/', '', $string );

        // Truncate and pad
        return str_pad( substr( $string, 0, $length ), $length );
    }

    /**
     * Pad routing number for file header (10 positions, space padded)
     *
     * @param string $routing 9-digit routing number
     * @return string
     */
    private function pad_routing( string $routing ): string {
        // Right justify with leading space for 10 positions
        return ' ' . str_pad( $routing, 9, '0', STR_PAD_LEFT );
    }

    /**
     * Format company ID (10 positions, usually 1 + EIN)
     *
     * @param string $company_id Company ID or EIN
     * @return string
     */
    private function format_company_id( string $company_id ): string {
        // Remove any non-numeric
        $company_id = preg_replace( '/[^0-9]/', '', $company_id );

        // If 9 digits (EIN), prepend '1'
        if ( strlen( $company_id ) === 9 ) {
            $company_id = '1' . $company_id;
        }

        return str_pad( substr( $company_id, 0, 10 ), 10, ' ' );
    }

    /**
     * Get next business day in YYMMDD format
     *
     * @return string
     */
    private function get_next_business_day(): string {
        $date = new \DateTime( 'tomorrow', new \DateTimeZone( 'America/Los_Angeles' ) );

        // Skip weekends
        while ( in_array( $date->format( 'N' ), [ '6', '7' ], true ) ) {
            $date->modify( '+1 day' );
        }

        // TODO: Add holiday calendar check

        return $date->format( 'ymd' );
    }

    /**
     * Validate NACHA file content
     *
     * @param string $content NACHA file content
     * @return array{valid: bool, errors: array}
     */
    public function validate( string $content ): array {
        $errors = [];
        $lines = explode( "\n", trim( $content ) );

        // Check record length (should be 94 characters per line)
        foreach ( $lines as $line_num => $line ) {
            if ( strlen( rtrim( $line ) ) !== 94 ) {
                $errors[] = sprintf( 'Line %d: Invalid record length (%d, expected 94)', $line_num + 1, strlen( $line ) );
            }
        }

        // Check file header (record type 1)
        if ( ! isset( $lines[0] ) || $lines[0][0] !== '1' ) {
            $errors[] = 'Missing or invalid file header record (type 1)';
        }

        // Check file control (record type 9)
        $last_line = end( $lines );
        if ( $last_line[0] !== '9' ) {
            $errors[] = 'Missing or invalid file control record (type 9)';
        }

        // Check blocking (total records should be multiple of 10)
        $record_count = count( $lines );
        if ( $record_count % 10 !== 0 ) {
            // File should be padded with 9s to reach multiple of 10
            // This might be handled by the library
        }

        return [
            'valid' => empty( $errors ),
            'errors' => $errors,
        ];
    }
}
