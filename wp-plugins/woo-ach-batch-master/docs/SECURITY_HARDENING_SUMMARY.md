# Security Hardening Summary - woo-ach-batch

**Date:** Session continuation  
**Status:** ✅ Completed

---

## Changes Made

### Task 1: Fixed Settings API Mismatch ✅

**Problem:** Templates called `$settings->get_option()` and Admin called `$settings->update_option()`, but Settings class only had `get()`/`set()` with dot-notation.

**Solution:** Added compatibility layer to [src/Admin/Settings.php](src/Admin/Settings.php):

1. **FIELD_MAP constant** - Maps 25+ flat field names to dot-notation:
   ```php
   'sftp_host' => 'sftp.host',
   'odfi_routing' => 'nacha.immediate_destination',
   // etc.
   ```

2. **`get_option()` method** - Translates flat names → dot-notation, queries settings:
   ```php
   public function get_option( string $field, mixed $default = '' ): mixed
   ```

3. **`update_option()` method** - Translates and saves:
   ```php
   public function update_option( string $field, mixed $value ): bool
   ```

4. **`has_encrypted_value()` helper** - Safely checks if encrypted field has value without exposing data:
   ```php
   public function has_encrypted_value( string $field ): bool
   ```

---

### Task 2: Wired SecureSettings End-to-End ✅

**Problem:** Admin::handle_save_settings() used raw `$encryption->encrypt()` instead of SecureSettings wrapper, missing audit logging.

**Solution:** Updated [src/Admin/Admin.php](src/Admin/Admin.php):

1. **Sensitive fields routed through SecureSettings:**
   ```php
   $sensitive_fields = [
       'sftp_password' => 'save_sftp_password',
       'sftp_passphrase' => 'save_sftp_passphrase',
       'plaid_secret' => 'save_plaid_secret',
   ];
   ```

2. **Removed `encrypted` type from fields array** - No more inline encryption

3. **Added Plaid secret support to SecureSettings:**
   - `save_plaid_secret()` - Encrypts and saves with audit log
   - `get_plaid_secret()` - Decrypts when needed with audit log

---

### Task 3: Extended PrivateStorage for KYC ✅

**Problem:** DocumentHandler used `wp_upload_dir()` directly instead of PrivateStorage.

**Solution:** Updated [src/Kyc/DocumentHandler.php](src/Kyc/DocumentHandler.php):

1. **Added PrivateStorage dependency injection:**
   ```php
   private ?PrivateStorage $private_storage = null;
   public function set_private_storage( PrivateStorage $private_storage ): void
   ```

2. **Updated `get_storage_path()`:**
   ```php
   return $this->get_private_storage()->get_directory( PrivateStorage::STORAGE_KYC );
   ```

3. **Updated Container** to inject PrivateStorage into KYC handler

---

### Task 4: Secure KYC Download Mechanism ✅

**Problem:** No secure way to download KYC documents, potential for path traversal.

**Solution:** Added to [src/Kyc/DocumentHandler.php](src/Kyc/DocumentHandler.php):

1. **Removed unauthenticated upload endpoint:**
   ```php
   // REMOVED: add_action( 'wp_ajax_nopriv_woo_ach_upload_kyc', ... );
   ```

2. **Added secure download handler:**
   ```php
   add_action( 'wp_ajax_woo_ach_download_kyc', [ $this, 'handle_secure_download' ] );
   ```

3. **Security features:**
   - Requires `manage_woocommerce` capability
   - Validates nonce (`woo_ach_kyc_download`)
   - Prevents directory traversal with `realpath()` validation
   - Streams file without exposing filesystem path
   - Audit logs all access attempts (success and failure)

4. **Helper method for generating download URLs:**
   ```php
   public function get_download_url( int $customer_id, string $document_id ): string
   ```

---

### Task 5: Regression Checklist ✅

**Created:** [docs/SECURITY_REGRESSION_CHECKLIST.md](docs/SECURITY_REGRESSION_CHECKLIST.md)

Comprehensive checklist covering:
- Sensitive data storage verification
- File storage security
- API endpoint security
- Logging safety
- Template security
- SFTP connection testing
- Post-deployment monitoring
- Emergency procedures
- Code review guidelines

---

## Files Modified

| File | Changes |
|------|---------|
| `src/Admin/Settings.php` | Added FIELD_MAP, get_option(), update_option(), has_encrypted_value() |
| `src/Admin/Admin.php` | Rewrote handle_save_settings() to use SecureSettings |
| `src/Security/SecureSettings.php` | Added save_plaid_secret(), get_plaid_secret() |
| `src/Kyc/DocumentHandler.php` | PrivateStorage integration, secure download, removed nopriv handler |
| `src/Container.php` | Inject PrivateStorage into KYC handler |
| `templates/admin/settings.php` | Use has_encrypted_value() for password placeholders |

## Files Created

| File | Purpose |
|------|---------|
| `docs/SECURITY_REGRESSION_CHECKLIST.md` | Security verification checklist |

---

## Security Summary

| Area | Before | After |
|------|--------|-------|
| Settings API | Broken (methods missing) | ✅ Working with compatibility layer |
| SFTP Password | Raw encryption, no audit | ✅ SecureSettings with audit logging |
| Plaid Secret | Not implemented | ✅ Encrypted with audit logging |
| KYC Storage | `wp_upload_dir()` | ✅ PrivateStorage with .htaccess |
| KYC Upload | `nopriv` allowed | ✅ Auth required |
| KYC Download | Not secure | ✅ Admin-only, path validation, streaming |
| Password Display | Showed encrypted blob | ✅ Shows •••••••• placeholder |

---

## Next Steps (Recommended)

1. **Run regression checklist** against staging environment
2. **Test SFTP connection** with actual credentials
3. **Verify file permissions** on `woo-ach-batch-private/` directory
4. **Review audit log** after initial admin activity
5. **NGINX users:** Add server-level deny rules (see PrivateStorage docs)
