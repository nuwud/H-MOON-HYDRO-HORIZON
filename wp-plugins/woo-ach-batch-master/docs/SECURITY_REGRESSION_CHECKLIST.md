# Security Regression Checklist

**Version:** 1.0.0  
**Last Updated:** 2025  
**Purpose:** Verify security measures after any code changes to woo-ach-batch plugin

---

## Pre-Deployment Verification

Run these checks **before** deploying any changes to production.

### 1. Sensitive Data Storage

#### ✅ SFTP Credentials
- [ ] SFTP password is stored encrypted (`sftp.password_encrypted`)
- [ ] SFTP passphrase is stored encrypted (`sftp.private_key_passphrase_encrypted`)
- [ ] No plaintext passwords in `wp_options` table

**Verification SQL:**
```sql
SELECT option_name, option_value 
FROM wp_options 
WHERE option_name LIKE '%woo_ach%' 
  AND option_value LIKE '%password%'
  AND option_value NOT LIKE '%encrypted%';
-- Should return 0 rows
```

#### ✅ Plaid API Secret
- [ ] Plaid secret is stored encrypted (`verification.plaid_secret_encrypted`)
- [ ] No plaintext API keys in settings

#### ✅ Bank Account Data
- [ ] Bank routing numbers stored via `OrderMeta::save_bank_details()` (encrypted)
- [ ] Bank account numbers stored via `OrderMeta::save_bank_details()` (encrypted)
- [ ] Bank tokens use separate encrypted meta key

**Verification:**
```php
// Check an order for plaintext bank data (should return empty)
$order_id = 123;
$meta = get_post_meta($order_id);
$sensitive_keys = ['_ach_routing', '_ach_account', '_bank_routing', '_bank_account'];
foreach ($sensitive_keys as $key) {
    if (!empty($meta[$key][0])) {
        echo "WARNING: Plaintext data found in $key\n";
    }
}
```

---

### 2. File Storage Security

#### ✅ NACHA Files
- [ ] Stored in `wp-content/uploads/woo-ach-batch-private/nacha/`
- [ ] Directory has `.htaccess` with `Deny from all`
- [ ] Files have `0600` permissions
- [ ] No direct URL access possible

**Verification:**
```bash
# Try accessing NACHA file directly (should fail)
curl -I https://yoursite.com/wp-content/uploads/woo-ach-batch-private/nacha/test.ach
# Expected: 403 Forbidden
```

#### ✅ KYC Documents
- [ ] Stored in `wp-content/uploads/woo-ach-batch-private/kyc/`
- [ ] Directory has `.htaccess` with `Deny from all`
- [ ] Files have `0600` permissions
- [ ] Downloads only via secure AJAX endpoint

**Verification:**
```bash
# Try accessing KYC file directly (should fail)
curl -I https://yoursite.com/wp-content/uploads/woo-ach-batch-private/kyc/123_id_front_abc.jpg
# Expected: 403 Forbidden
```

#### ✅ Manifest Files
- [ ] Stored in `wp-content/uploads/woo-ach-batch-private/manifest/`
- [ ] Same protection as NACHA files

---

### 3. API Endpoint Security

#### ✅ Admin AJAX Endpoints
| Endpoint | Required Capability | Nonce Action |
|----------|---------------------|--------------|
| `woo_ach_test_sftp` | `manage_woocommerce` | `woo_ach_batch_admin` |
| `woo_ach_upload_kyc` | `manage_woocommerce` | `woo_ach_kyc_upload` |
| `woo_ach_delete_kyc` | `manage_woocommerce` | `woo_ach_kyc_delete` |
| `woo_ach_download_kyc` | `manage_woocommerce` | `woo_ach_kyc_download` |

**Verification:**
```php
// Simulate unauthenticated request (should fail)
wp_set_current_user(0);
$_POST['action'] = 'woo_ach_upload_kyc';
$_POST['_wpnonce'] = 'invalid';
// Should return: {"success":false,"data":{"message":"Security check failed"}}
```

#### ✅ Removed Insecure Endpoints
- [ ] `wp_ajax_nopriv_woo_ach_upload_kyc` is NOT registered
- [ ] No `nopriv` handlers for any sensitive operations

**Verification:**
```php
// Check for nopriv handlers (should return empty)
global $wp_filter;
$nopriv_handlers = [];
foreach ($wp_filter as $hook => $handlers) {
    if (strpos($hook, 'wp_ajax_nopriv_woo_ach') !== false) {
        $nopriv_handlers[] = $hook;
    }
}
print_r($nopriv_handlers); // Should be empty array
```

---

### 4. Logging Safety

#### ✅ No Sensitive Data in Logs
Search log files for these patterns (should find NONE):

```bash
grep -rn "routing.*[0-9]\{9\}" /path/to/wp-content/debug.log
grep -rn "account.*[0-9]\{4,17\}" /path/to/wp-content/debug.log
grep -rn "password.*=" /path/to/wp-content/debug.log
grep -rn "sftp.*secret" /path/to/wp-content/debug.log
```

#### ✅ Audit Log Compliance
- [ ] Bank detail access is logged (no sensitive values)
- [ ] KYC document access is logged
- [ ] SFTP credential access is logged
- [ ] Failed authentication attempts are logged

---

### 5. Template Security

#### ✅ Password Fields Show Placeholder
- [ ] SFTP password field shows `••••••••` when value exists
- [ ] Plaid secret field shows `••••••••` when value exists
- [ ] Actual encrypted values never rendered to HTML

**Verification:**
View page source of Settings page and search for encrypted strings:
```javascript
// In browser console on settings page
document.body.innerHTML.includes('encrypted') // Should be false or only in help text
```

#### ✅ Admin Forms Use Nonces
- [ ] All forms include `wp_nonce_field()`
- [ ] All AJAX calls include nonce verification

---

### 6. SFTP Connection Test

#### ✅ Test Connection Feature Works
1. Go to WooCommerce → ACH Batch → Settings
2. Enter valid SFTP credentials
3. Click "Test Connection"
4. Verify connection succeeds
5. Verify password is stored encrypted after save

#### ✅ Key-Based Auth Works
1. Configure private key path
2. Optionally add passphrase
3. Test connection
4. Verify passphrase is stored encrypted

---

## Post-Deployment Monitoring

### Audit Log Review (Weekly)
```sql
SELECT * FROM wp_woo_ach_audit_log 
WHERE action IN (
    'sftp_password_accessed',
    'bank_details_accessed',
    'kyc_document_accessed',
    'kyc_unauthorized_access'
)
ORDER BY created_at DESC
LIMIT 100;
```

### Failed Access Attempts
```sql
SELECT action, COUNT(*) as attempts, DATE(created_at) as date
FROM wp_woo_ach_audit_log
WHERE action LIKE '%unauthorized%' OR action LIKE '%rate_limit%'
GROUP BY action, DATE(created_at)
ORDER BY date DESC;
```

---

## Emergency Procedures

### If Encryption Key is Compromised
1. **Immediately** generate new encryption key
2. Re-encrypt all sensitive data with `SecureSettings::reencrypt_all()`
3. Invalidate all stored bank tokens (force customers to re-verify)
4. Review audit logs for unauthorized access
5. Notify affected customers per PCI-DSS requirements

### If KYC Files are Exposed
1. Move files to new protected directory
2. Verify `.htaccess` is in place and working
3. Check server error logs for direct access attempts
4. Notify compliance team

---

## Code Review Checklist

When reviewing PRs, verify:

- [ ] No `echo`, `var_dump`, or `print_r` of sensitive data
- [ ] No `error_log()` with bank/credential data
- [ ] All new AJAX handlers check `manage_woocommerce` capability
- [ ] All new AJAX handlers verify nonces
- [ ] All file operations use `PrivateStorage`
- [ ] All credential storage uses `SecureSettings`
- [ ] No hardcoded credentials or test data in code

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025 | 1.0.0 | Initial security checklist |
