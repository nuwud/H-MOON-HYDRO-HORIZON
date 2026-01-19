# WooCommerce ACH Batch Payment Plugin

A production-grade WordPress plugin for WooCommerce that supports ACH payments via a 'collect → verify → batch → NACHA file → SFTP upload → reconcile' workflow.

## Requirements

- WordPress 6.0+
- WooCommerce 8.0+
- PHP 8.0+
- Composer

## Installation

1. Clone or copy the plugin to `wp-content/plugins/woo-ach-batch/`

2. Install dependencies:
   ```bash
   cd wp-content/plugins/woo-ach-batch
   composer install
   ```

3. Activate the plugin in WordPress admin

4. Configure settings under **ACH Batches → Settings**

## Features

### Payment Gateway
- Custom WooCommerce payment gateway for ACH payments
- Secure checkout fields for routing/account numbers
- Customer authorization checkbox
- Bank account type selection (checking/savings)

### Security
- AES-256-GCM encryption for sensitive data
- Bank details never stored in plaintext
- Secure file storage with .htaccess protection
- Comprehensive audit logging
- Rate limiting for failed verification attempts
- IP blocking for suspicious activity
- Full threat model documented

### Processor Mapping
- Flexible field mapping via `MappingConfig`
- Per-processor profiles (default, dan_processor, test)
- Support for fixed values, derived values (callbacks), field formatting
- Easy addition of new processor configurations

### Verification Methods
- **Manual Review**: Admin approves bank details
- **Micro-Deposits**: Send two small amounts, customer confirms
- **Plaid**: Instant verification via Plaid API (optional)

### Batch Processing
- Automated batch exports at 1:00 PM and 12:00 AM Pacific
- Manual batch trigger from admin
- NACHA file generation using RevenueWire ACH library
- SFTP upload to processor

### Reconciliation
- Return file processing (stub - awaiting processor spec)
- ACH return codes tracking
- Order status updates for returned payments

### Admin Interface
- Batch history with statistics
- Pending verification queue
- Returns tracking
- Audit log viewer
- Comprehensive settings

### REST API
- `/woo-ach-batch/v1/batches` - List batches
- `/woo-ach-batch/v1/batches/{id}` - Get batch details
- `/woo-ach-batch/v1/batches/run` - Trigger manual batch
- `/woo-ach-batch/v1/statistics` - Get statistics
- `/woo-ach-batch/v1/verification/{order_id}` - Verification status
- `/woo-ach-batch/v1/returns` - List returns

## Custom Order Statuses

| Status | Description |
|--------|-------------|
| `wc-pending-ach` | Awaiting ACH verification |
| `wc-ach-verified` | Bank account verified, ready for batch |
| `wc-ach-exported` | Included in NACHA batch, sent to processor |
| `wc-ach-returned` | Payment returned by bank |

## Configuration

### NACHA Settings
- Immediate Destination (ODFI routing number)
- Immediate Origin (Company ID)
- Company Name
- Entry Description

### SFTP Settings
- Host, port, username
- Password or private key authentication
- Remote upload path

### Schedule Settings
- Export times (default: 1:00 PM and 12:00 AM)
- Timezone (default: America/Los_Angeles)

## Development

### Directory Structure
```
woo-ach-batch/
├── assets/
│   ├── css/
│   └── js/
├── docs/
│   └── SENSITIVE_DATA_STORAGE_PLAN.md  ← MANDATORY READING
├── src/
│   ├── Admin/
│   ├── Api/
│   ├── Batch/
│   ├── Cron/
│   ├── Gateway/
│   ├── Install/
│   ├── Kyc/
│   ├── Nacha/
│   │   ├── NachaBuilder.php
│   │   └── MappingConfig.php   ← Processor field mappings
│   ├── Order/
│   ├── Reconciliation/
│   ├── Security/
│   │   ├── Encryption.php
│   │   ├── AuditLog.php
│   │   └── RateLimiter.php
│   ├── Sftp/
│   └── Verification/
├── templates/
│   └── admin/
├── composer.json
└── woo-ach-batch.php
```

## ⚠️ Security Documentation

**MANDATORY: Read these documents before modifying any code that handles sensitive data:**

1. [Sensitive Data Storage Plan](docs/SENSITIVE_DATA_STORAGE_PLAN.md) - Complete inventory of all sensitive data with storage/encryption details
2. [ACH Security Spec](../.speckit/specs/ACH_SECURITY_SPEC.md) - Threat model and security controls

### Quick Security Rules

```php
// ❌ NEVER DO THESE
error_log($routing_number);                    // Don't log bank data
$response['account'] = $bank_details['account']; // Don't expose in API
echo $routing_number;                          // Don't display full numbers

// ✅ ALWAYS DO THESE  
$encrypted = $encryption->encrypt($routing_number);  // Encrypt first
return ['last4' => $bank_details['last4']];          // Only expose last4
$audit_log->log('action', 'order', $order_id);       // Audit log actions
```

## Processor Mapping Configuration

The `MappingConfig` class provides flexible field mapping for different ACH processors:

```php
// Get mapping service
$mapping = \Nuwud\WooAchBatch\service('mapping_config');

// Switch to a specific processor profile
$mapping->set_active_profile('dan_processor');

// Get a formatted field value
$account_field = $mapping->get_field_value('entry_detail', 'dfi_account_number', $order, [
    'bank_details' => $bank_details, // Decrypted bank details
]);

// Available profiles
$profiles = $mapping->get_available_profiles();
// Returns: ['default' => 'Generic NACHA', 'dan_processor' => "Dan's Processor", 'test' => 'Test/Sandbox']
```

### Adding a Custom Processor Profile

```php
$mapping->add_profile('new_processor', [
    'name' => 'New Processor',
    'file_header' => [
        'immediate_destination' => [
            'source' => 'setting',
            'key' => 'immediate_destination',
            'format' => ['pad_left', 10, ' '],
        ],
        // ... other fields
    ],
    'batch_header' => [ /* ... */ ],
    'entry_detail' => [ /* ... */ ],
]);
```

### Hooks

**Actions:**
- `woo_ach_batch_before_export` - Before batch export
- `woo_ach_batch_after_export` - After batch export
- `woo_ach_batch_return_processed` - When return is processed
- `woo_ach_batch_register_verifiers` - Register custom verifiers

**Filters:**
- `woo_ach_batch_nacha_header` - Modify NACHA file header
- `woo_ach_batch_nacha_entry` - Modify NACHA entry data
- `woo_ach_batch_eligible_orders` - Filter orders for batch

## TODO

- [ ] Complete NACHA builder based on Dan's processor spec
- [ ] Implement actual return file parsing
- [ ] Add micro-deposit sending functionality
- [ ] Complete Plaid integration with real credentials
- [ ] Add customer-facing verification UI
- [ ] Implement KYC document verification workflow
- [ ] Add WooCommerce email notifications

## License

GPL v2 or later
