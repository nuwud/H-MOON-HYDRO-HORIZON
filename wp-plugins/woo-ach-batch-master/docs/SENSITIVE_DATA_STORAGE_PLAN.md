# Sensitive Data Storage Plan

## WooCommerce ACH Batch Payment Plugin — Security Architecture

> **⚠️ MANDATORY COMPLIANCE DOCUMENT**  
> This document MUST be reviewed and updated before ANY code changes that touch bank data, personally identifiable information (PII), or KYC documents.

---

## 1. Sensitive Data Inventory

| Data Element | Sensitivity Level | Data Type | Example |
|-------------|------------------|-----------|---------|
| **Bank Routing Number** | 🔴 HIGH | ABA RTN (9 digits) | `021000021` |
| **Bank Account Number** | 🔴 HIGH | Numeric (4-17 digits) | `123456789012` |
| **Account Holder Name** | 🟠 MEDIUM | String | `John Q Smith` |
| **Account Type** | 🟢 LOW | Enum | `checking`, `savings` |
| **Account Last 4** | 🟢 LOW | String (4 digits) | `9012` |
| **KYC ID Document (Front)** | 🔴 HIGH | Image (JPEG/PNG/PDF) | Driver's license photo |
| **KYC ID Document (Back)** | 🔴 HIGH | Image (JPEG/PNG/PDF) | ID barcode side |
| **Voided Check Image** | 🔴 HIGH | Image (JPEG/PNG/PDF) | Check with routing/account |
| **Bank Statement** | 🟠 MEDIUM | PDF | Account summary |
| **Customer IP Address** | 🟠 MEDIUM | IPv4/IPv6 | `192.168.1.1` |
| **Authorization Timestamp** | 🟢 LOW | DateTime | `2025-01-15 14:32:00` |
| **Plaid Access Token** | 🔴 HIGH | String (token) | `access-sandbox-xxx` |
| **NACHA File Content** | 🔴 HIGH | Text (94-char records) | Contains all bank details |
| **SFTP Credentials** | 🔴 HIGH | Password/Key | Private key material |

---

## 2. Storage Locations & Protection

### 2.1 Bank Account Details (Routing/Account Numbers)

| Attribute | Value |
|-----------|-------|
| **Storage Location** | WordPress `{prefix}_postmeta` table |
| **Meta Keys** | `_ach_routing_encrypted`, `_ach_account_encrypted` |
| **Encryption** | AES-256-GCM (authenticated encryption) |
| **Key Source** | `WOO_ACH_BATCH_ENCRYPTION_KEY` constant OR derived from WordPress salts |
| **Key Derivation** | `hash('sha256', LOGGED_IN_KEY . NONCE_KEY . 'woo-ach-batch')` |
| **Ciphertext Format** | Base64( IV[12 bytes] + AuthTag[16 bytes] + Ciphertext ) |
| **Who Can Access** | Server-side PHP only via `OrderMeta::get_bank_details()` |
| **Cleared After** | Settlement (optional via `clear_after_settlement` setting) |

**Protection Measures:**
1. ✅ Never stored in plaintext
2. ✅ Never logged to WC_Logger or debug logs
3. ✅ Never returned in REST API responses (only last4)
4. ✅ Never exposed in admin UI (only last4)
5. ✅ Encryption key NOT stored in database
6. ✅ Each encryption uses unique random IV

**Access Control:**
```php
// ALLOWED: Internal batch processing
$bank_details = $order_meta->get_bank_details($order);

// FORBIDDEN: Never do this
error_log(print_r($bank_details, true)); // ❌
$response['account_number'] = $bank_details['account']; // ❌
```

---

### 2.2 KYC Document Files

| Attribute | Value |
|-----------|-------|
| **Storage Location** | `wp-content/uploads/woo-ach-batch/kyc/` |
| **Filename Format** | `{customer_id}_{doc_type}_{uuid}.{ext}` |
| **Web Access** | **BLOCKED** by `.htaccess` |
| **File Permissions** | `0600` (owner read/write only) |
| **Metadata Storage** | `wp_usermeta` key `_woo_ach_kyc_documents` |

**Protection Measures:**
1. ✅ `.htaccess` with `Deny from all`
2. ✅ `index.php` with "Silence is golden"
3. ✅ `chmod 0600` applied after upload
4. ✅ UUID-based filenames (not predictable)
5. ✅ MIME type validation (not just extension)
6. ✅ Max file size enforced (10MB)

**Directory Structure:**
```
wp-content/uploads/woo-ach-batch/kyc/
├── .htaccess          # "Deny from all"
├── index.php          # "Silence is golden"
├── 123_id_front_a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg
├── 123_id_back_b2c3d4e5-f6a7-8901-bcde-f23456789012.jpg
└── 123_voided_check_c3d4e5f6-a7b8-9012-cdef-345678901234.pdf
```

**NGINX Configuration (if not using Apache):**
```nginx
location ~* ^/wp-content/uploads/woo-ach-batch/kyc/ {
    deny all;
    return 404;
}
```

---

### 2.3 NACHA Files

| Attribute | Value |
|-----------|-------|
| **Storage Location** | `wp-content/uploads/woo-ach-batch/nacha/` |
| **Filename Format** | `ACH_{YYYYMMDD}_{HHMMSS}_{batch_id}.ach` |
| **Web Access** | **BLOCKED** by `.htaccess` |
| **Contains** | Full routing + account numbers in NACHA format |
| **Retention** | Should be purged after successful SFTP upload + confirmation |

**Protection Measures:**
1. ✅ `.htaccess` with `Deny from all`
2. ✅ `index.php` with "Silence is golden"
3. ✅ Transient-based file lock prevents race conditions
4. 🔲 TODO: Auto-purge after 30 days (configurable)
5. 🔲 TODO: Encrypted at-rest option for highest security environments

---

### 2.4 SFTP Credentials

| Attribute | Value |
|-----------|-------|
| **Storage Location** | WordPress `wp_options` table |
| **Option Key** | `woo_ach_batch_sftp_settings` |
| **Password Encryption** | AES-256-GCM (same as bank details) |
| **Private Key Storage** | Encrypted in database OR path to server file |

**Stored Fields:**
```php
[
    'host' => 'sftp.processor.com',      // Not sensitive
    'port' => 22,                         // Not sensitive
    'username' => 'merchant123',          // Low sensitivity
    'password' => '[ENCRYPTED]',          // HIGH - encrypted
    'private_key_path' => '/path/to/key', // If using key auth
    'remote_directory' => '/incoming/',   // Not sensitive
]
```

**NEVER Store:**
- Private key contents in database (use file path + server permissions)
- Passwords in plaintext
- Credentials in version control

---

### 2.5 Plaid Tokens (If Using Instant Verification)

| Attribute | Value |
|-----------|-------|
| **Link Token** | Temporary (30 min expiry), not stored |
| **Public Token** | Temporary, exchanged immediately, not stored |
| **Access Token** | 🔴 Stored encrypted in order meta |
| **Storage Key** | `_ach_bank_token` |

**Token Lifecycle:**
```
1. Frontend requests link token → NOT STORED
2. User completes Plaid Link → public_token returned
3. Backend exchanges for access_token → ENCRYPTED & STORED
4. access_token used for account verification → then optionally cleared
```

---

### 2.6 Audit Log (What IS Logged)

| Data | Logged? | Reason |
|------|---------|--------|
| Action name | ✅ Yes | Compliance trail |
| Order ID | ✅ Yes | Entity correlation |
| Batch ID | ✅ Yes | Entity correlation |
| User ID | ✅ Yes | Who performed action |
| IP Address | ✅ Yes | Fraud detection |
| Timestamp | ✅ Yes | Timeline |
| Account Last4 | ✅ Yes | Partial reference |
| Full Account Number | ❌ **NEVER** | PCI-like compliance |
| Full Routing Number | ❌ **NEVER** | Security |
| Encryption Keys | ❌ **NEVER** | Security |

---

## 3. Data Flow Diagrams

### 3.1 Checkout Flow (Bank Details)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Customer      │     │   WordPress     │     │   Database      │
│   Browser       │     │   Server        │     │   (MySQL)       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  POST checkout form   │                       │
         │  (routing + account)  │                       │
         │──────────────────────>│                       │
         │       [HTTPS]         │                       │
         │                       │  Validate format      │
         │                       │  Encrypt with AES-256 │
         │                       │                       │
         │                       │  INSERT postmeta      │
         │                       │  (encrypted blob)     │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │  Store last4 (plain)  │
         │                       │──────────────────────>│
         │                       │                       │
         │  Show confirmation    │                       │
         │  (last4 only)         │                       │
         │<──────────────────────│                       │
         │                       │                       │
```

### 3.2 Batch Export Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cron/Manual   │     │   WordPress     │     │   SFTP Server   │
│   Trigger       │     │   Server        │     │   (Processor)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  Trigger batch run    │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  Get eligible orders  │
         │                       │  Decrypt bank details │
         │                       │  Build NACHA records  │
         │                       │                       │
         │                       │  Write .ach file      │
         │                       │  (protected directory)│
         │                       │                       │
         │                       │  Connect SFTP         │
         │                       │──────────────────────>│
         │                       │       [SSH]           │
         │                       │                       │
         │                       │  Upload .ach file     │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │  Delete local file    │
         │                       │  (optional)           │
         │                       │                       │
         │                       │  Audit log: exported  │
         │                       │                       │
```

---

## 4. Attack Surface Analysis

### 4.1 Potential Attack Vectors

| Vector | Risk | Mitigation |
|--------|------|------------|
| **SQL Injection** | HIGH | WordPress $wpdb prepared statements |
| **XSS on Admin Pages** | MEDIUM | `esc_html()`, `esc_attr()` on all output |
| **Direct File Access (KYC)** | HIGH | `.htaccess` deny, `0600` perms |
| **Encryption Key Exposure** | HIGH | Key in `wp-config.php`, not database |
| **REST API Data Leak** | HIGH | Never return full bank details |
| **Log File Disclosure** | MEDIUM | Never log sensitive data |
| **Backup Exposure** | MEDIUM | Encrypted data = encrypted in backups |
| **Memory Dump** | LOW | Clear variables after use |
| **Timing Attacks** | LOW | `hash_equals()` for comparisons |
| **Replay Attacks** | MEDIUM | Unique nonces per request |

### 4.2 Hardening Checklist

- [x] Use prepared statements for ALL database queries
- [x] Escape ALL output with appropriate function
- [x] Validate ALL input (type, length, format)
- [x] Use CSRF nonces on ALL form submissions
- [x] Capability checks on ALL admin actions
- [x] Customer can only access their own orders (REST API)
- [x] Rate limit failed operations
- [ ] **TODO:** Add IP-based rate limiting for verification attempts
- [ ] **TODO:** Add failed attempt lockout

---

## 5. Key Rotation Procedure

### When to Rotate
- Suspected key compromise
- Employee with key access leaves
- Annual security audit requirement
- After any security incident

### Rotation Steps
```php
// 1. Set new key in wp-config.php
define('WOO_ACH_BATCH_ENCRYPTION_KEY_NEW', 'new-secure-32-char-key-here!!!!');

// 2. Run rotation script (admin only)
$encryption = new Encryption();
$results = $encryption->rotate_key(
    WOO_ACH_BATCH_ENCRYPTION_KEY,     // old
    WOO_ACH_BATCH_ENCRYPTION_KEY_NEW  // new
);

// 3. Update wp-config.php - rename NEW to current
define('WOO_ACH_BATCH_ENCRYPTION_KEY', 'new-secure-32-char-key-here!!!!');
// Remove the _NEW constant

// 4. Verify all orders can be decrypted

// 5. Audit log the rotation event
```

---

## 6. Data Retention & Purging

| Data Type | Retention Period | Purge Method |
|-----------|-----------------|--------------|
| Bank details (settled) | 0 days (clear immediately) | `OrderMeta::clear_bank_details()` |
| Bank details (pending) | Until settlement | N/A |
| KYC documents | 7 years (regulatory) | Manual admin action |
| NACHA files | 30 days post-upload | Cron job purge |
| Audit logs | 7 years | Database archive |
| Failed verification attempts | 90 days | Cron job purge |

---

## 7. Compliance Notes

### NACHA Operating Rules
- Must protect account numbers during transmission and storage
- Must maintain audit trail of all ACH transactions
- Must have procedures for unauthorized entry return

### PCI DSS Applicability
- **PCI DSS does NOT directly apply** (bank accounts, not card data)
- **However**, similar principles should be followed:
  - Encryption at rest ✅
  - Encryption in transit ✅
  - Access logging ✅
  - Key management ✅

### State Privacy Laws (CCPA, etc.)
- Bank details are "personal information"
- Must honor deletion requests (after settlement obligations met)
- Must disclose data collection in privacy policy

---

## 8. Developer Checklist

Before modifying ANY code that handles sensitive data:

- [ ] Read this document completely
- [ ] Identify which sensitive data elements are involved
- [ ] Verify data will be encrypted before storage
- [ ] Verify data will NOT be logged anywhere
- [ ] Verify data will NOT be returned in API responses
- [ ] Verify data will NOT be displayed in admin (except last4)
- [ ] Add appropriate audit log entries
- [ ] Test with real-looking but fake data
- [ ] Security review by second developer

---

## 9. Emergency Response

### If Encryption Key is Compromised
1. **IMMEDIATELY** rotate key (Section 5)
2. Review audit logs for unauthorized access
3. Assess which orders may be affected
4. Notify affected customers if required by law
5. Document incident and response

### If KYC Documents are Exposed
1. Verify `.htaccess` protection is in place
2. Check for directory traversal vulnerabilities
3. Review web server access logs
4. Notify affected customers
5. Consider moving to encrypted at-rest storage

### If NACHA File is Exposed
1. Contact processor immediately
2. Determine which batch file was exposed
3. Potentially block ACH entries
4. Notify affected customers
5. Review file system permissions

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-XX | Copilot | Initial creation |

---

> **This document is a living artifact. Update it whenever data handling changes.**
