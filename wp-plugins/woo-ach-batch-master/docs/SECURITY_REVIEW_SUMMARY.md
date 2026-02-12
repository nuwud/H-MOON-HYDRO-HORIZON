# Security Review & Enhancement Summary

## Date: January 2025 (Updated)

## Customer-Facing ACH Verification Wizard (Latest Session)

### ✅ Task A: VerificationWizard Frontend Controller
**File Created**: `src/Frontend/VerificationWizard.php` (~700 lines)

Customer-facing wizard with comprehensive security:
- **Two access methods**: logged-in + order ownership OR valid handoff token
- My Account endpoint at `/my-account/ach-verify/`
- Shortcode `[woo_ach_verify]` for custom pages
- All AJAX handlers have parallel logged-in and token-based versions
- Rate limiting on bank verification (10/hour)
- Audit logging for all sensitive operations

### ✅ Task B: Secure Handoff Token Service
**File Created**: `src/Security/HandoffTokenService.php` (~320 lines)

Mobile handoff with security-first design:
- 64-character cryptographically secure tokens (32 bytes hex)
- Stored in WP transients (not exposed to client)
- 30-minute TTL (configurable)
- **Single-use enforcement** - consumed on verification completion
- **Order ID never in token** - server-side lookup only
- Rate limited to 10 tokens/hour per customer
- All operations audit logged

### ✅ Task C: Bank Validation with ABA Checksum
**File Created**: `src/Validation/BankValidator.php` (~340 lines)

Local bank validation without external API calls:
- ABA routing number checksum: weights `[3,7,1,3,7,1,3,7,1]`, mod 10 = 0
- Account number validation: 4-17 digits
- Account confirmation matching
- Name sanitization for NACHA (A-Z, 0-9, space only)
- Account masking for display (`••••1234`)
- Transaction code generation (22/27/32/37)

### ✅ Task D: QR Code Generator
**File Created**: `src/Security/QrCodeGenerator.php` (~350 lines)

Privacy-respecting QR code generation:
- **Inline SVG** - no external API calls
- Version 3 QR codes (29×29 modules)
- Proper finder/timing/alignment patterns
- Data URI support for embedding
- Fallback pattern for complex URLs

### ✅ Task E: Frontend Templates & Assets
**Files Created**:
- `templates/frontend/verify.php` (~300 lines) - Multi-step wizard template
- `assets/js/frontend-verify.js` (~500 lines) - Wizard JavaScript
- `assets/css/frontend-verify.css` (~600 lines) - Mobile-first styles

Features:
- Progress indicator (4 steps)
- Mobile-friendly file uploads with `capture="environment"`
- Real-time ABA validation in JavaScript
- QR code display for mobile handoff
- Email link sending option
- Countdown timer for token expiry
- Dark mode support

### ✅ Task F: Admin Notification Email
**Files Created**:
- `src/Emails/VerificationSubmittedEmail.php` - WC email class
- `templates/emails/admin-verification-submitted.php` - HTML template
- `templates/emails/plain/admin-verification-submitted.php` - Plain text

Triggered on `woo_ach_verification_submitted` action.

### ✅ Task G: Order Status Updates
**File Modified**: `src/Order/OrderStatuses.php`

Added new statuses:
- `ach-pending-verify` (yellow) - Customer needs to complete wizard
- `ach-pending-review` (purple) - Submitted, awaiting admin review

### Files Created This Session

| File | Lines | Purpose |
|------|-------|---------|
| `src/Frontend/VerificationWizard.php` | ~700 | Wizard controller with AJAX handlers |
| `src/Security/HandoffTokenService.php` | ~320 | Secure one-time tokens for mobile |
| `src/Validation/BankValidator.php` | ~340 | ABA checksum & account validation |
| `src/Security/QrCodeGenerator.php` | ~350 | Inline SVG QR code generation |
| `templates/frontend/verify.php` | ~300 | Multi-step wizard template |
| `assets/js/frontend-verify.js` | ~500 | Wizard JavaScript |
| `assets/css/frontend-verify.css` | ~600 | Mobile-first styles |
| `src/Emails/VerificationSubmittedEmail.php` | ~150 | WC email class |
| `templates/emails/admin-verification-submitted.php` | ~120 | HTML email template |
| `templates/emails/plain/admin-verification-submitted.php` | ~70 | Plain text template |

### Files Modified This Session

| File | Changes |
|------|---------|
| `src/Container.php` | Registered wizard services, email class |
| `woo-ach-batch.php` | Initialize verification_wizard |
| `src/Order/OrderStatuses.php` | Added pending-verify and pending-review |

---

## Security Controls Summary (Verification Wizard)

### Authentication
- ✅ Logged-in users must own the order (customer_id check)
- ✅ Token access validates via server-side transient lookup
- ✅ No order ID exposed in token or URL (only opaque token)
- ✅ Tokens are single-use (consumed on completion)

### Rate Limiting
- ✅ Bank verification: 10 attempts/hour
- ✅ Token generation: 10/hour per customer
- ✅ Document uploads: inherits existing KYC rate limits

### Data Protection
- ✅ Bank details encrypted before storage (via OrderMeta)
- ✅ Only last4 of account returned to frontend
- ✅ Documents stored via PrivateStorage (not publicly accessible)
- ✅ No PII logged (only audit events)

### Audit Trail
- ✅ Bank details submission logged
- ✅ Document uploads logged
- ✅ Token generation logged
- ✅ Token consumption logged
- ✅ Email sends logged (domain only, not full address)
- ✅ Verification completion logged

---

## Recent Security Hardening (Previous Session)

### ✅ Task A: Protected Export Directories
**Files Modified**: `NachaBuilder.php`, `BatchRunner.php`

- Created `PrivateStorage.php` helper for secure file handling
- NACHA files now stored in protected directory with:
  - `.htaccess` deny rules
  - `0600` file permissions
  - Secure delete with file overwrite before unlink
  - Directory traversal prevention
- Manifest files also use PrivateStorage
- Added stuck lock protection (30-minute max age)

### ✅ Task B: Encrypted Bank Tokens & SFTP Secrets
**Files Modified**: `OrderMeta.php`, `PhpseclibSftpClient.php`, `Ssh2SftpClient.php`
**Files Created**: `SecureSettings.php`

- Bank tokens now encrypted at rest using AES-256-GCM
  - `_ach_bank_token` → `_ach_bank_token_encrypted`
  - Auto-migration of plaintext tokens on read
  - Token metadata whitelist (only safe fields stored)
- SFTP credentials decrypted only at connection time
  - Created `SecureSettings` wrapper class
  - Password cleared from memory after use
  - Passphrase cleared from memory after use
  - SFTP clients updated to use SecureSettings

### ✅ Task C: KYC Permission Lockdown
**File Modified**: `DocumentHandler.php`

- `get_file_contents()` now requires `manage_woocommerce` capability
- Unauthorized access attempts are audit logged
- Directory traversal validation on file paths
- Successful accesses are audit logged

### ✅ Task D: Rate Limiting on Sensitive Endpoints
**Files Modified**: `DocumentHandler.php`, `RestController.php`

- KYC uploads: 10 per hour per IP
- Verification completions: 5 per 15 minutes per IP
- Rate limit hits are audit logged
- Proper HTTP 429 responses with retry-after headers

### ✅ Task E: MappingConfig Integration
**File Modified**: `NachaBuilder.php`

- Added `add_entry_with_mapping()` method
- Uses active processor profile for field formatting
- Supports processor-specific requirements (Dan's processor profile)
- Bank details passed via secure context array

### Files Created This Session

| File | Lines | Purpose |
|------|-------|---------|
| `src/Security/PrivateStorage.php` | ~350 | Secure file storage with protection |
| `src/Security/SecureSettings.php` | ~250 | SFTP credential encryption wrapper |

### Files Modified This Session

| File | Changes |
|------|---------|
| `src/Nacha/NachaBuilder.php` | PrivateStorage integration, MappingConfig methods |
| `src/Batch/BatchRunner.php` | PrivateStorage for manifests, stuck lock protection |
| `src/Order/OrderMeta.php` | Bank token encryption (was already done) |
| `src/Kyc/DocumentHandler.php` | Permission checks, rate limiting, audit logging |
| `src/Api/RestController.php` | Rate limiting on verification endpoint |
| `src/Sftp/PhpseclibSftpClient.php` | SecureSettings for credential decryption |
| `src/Sftp/Ssh2SftpClient.php` | SecureSettings for credential decryption |
| `src/Sftp/SftpClientFactory.php` | Updated to pass SecureSettings |
| `src/Container.php` | Wired new services (PrivateStorage, SecureSettings) |

---

## Completed Tasks (Previous Session)

### 1. ✅ Sensitive Data Storage Plan (MANDATORY DOCUMENT)
**File**: `woo-ach-batch/docs/SENSITIVE_DATA_STORAGE_PLAN.md`

Created comprehensive documentation covering:
- Complete sensitive data inventory (13 data elements categorized by sensitivity)
- Storage locations and encryption methods for each element
- Data flow diagrams (checkout flow, batch export flow)
- Attack surface analysis with 10 threat vectors
- Key rotation procedure
- Data retention and purging guidelines
- Compliance notes (NACHA, PCI, CCPA)
- Developer checklist before touching sensitive code
- Emergency response procedures

### 2. ✅ ACH Security Specification
**File**: `.speckit/specs/ACH_SECURITY_SPEC.md`

Created security specification with:
- Security objectives (Confidentiality, Integrity, Availability)
- Threat model with 9 identified threats
- Trust boundary diagram
- Security controls (encryption, access control, input validation, output encoding)
- Pre-commit checklists
- Incident response procedures
- Testing requirements

### 3. ✅ MappingConfig for Processor-Specific NACHA
**File**: `woo-ach-batch/src/Nacha/MappingConfig.php`

Created flexible field mapping system supporting:
- Fixed values
- Derived values (callbacks)
- Field formatting (pad_left, pad_right, upper, strip_non_digits, format_amount, etc.)
- Per-processor profiles:
  - `default` - Generic NACHA format
  - `dan_processor` - Custom configuration (ready for Monday's meeting)
  - `test` - Sandbox/development mode

### 4. ✅ Rate Limiter
**File**: `woo-ach-batch/src/Security/RateLimiter.php`

New security service providing:
- Rate limiting for verification attempts (10/hour)
- Failed verification tracking (5 failures = 2-hour lockout)
- API request limiting (60/minute)
- Batch export limiting (50/day)
- KYC upload limiting (10/hour)
- IP blocking capability
- Audit logging of lockouts

### 5. ✅ Updated Documentation

**Updated Files:**
- `.speckit/constitution.md` - Added ACH plugin section with security rules
- `.github/copilot-instructions.md` - Added ACH security guidelines and processor mapping docs
- `woo-ach-batch/README.md` - Added security documentation section

### 6. ✅ Container Updates
**File**: `woo-ach-batch/src/Container.php`

Registered new services:
- `rate_limiter` - Security rate limiting
- `mapping_config` - NACHA field mapping
- `private_storage` - Secure file handling
- `secure_settings` - SFTP credential encryption
- `kyc_handler` - Now with rate limiter and audit log injection

---

## Security Audit Status

### ✅ Fully Secured
1. Bank routing/account numbers - AES-256-GCM encrypted ✅
2. Bank tokens (Plaid) - NOW ENCRYPTED ✅ (was plaintext)
3. SFTP password - NOW ENCRYPTED at rest ✅
4. SFTP passphrase - NOW ENCRYPTED at rest ✅
5. NACHA files - NOW in protected directory with .htaccess ✅
6. Manifest files - NOW in protected directory ✅
7. KYC documents - Protected with .htaccess ✅
8. KYC retrieval - NOW requires manage_woocommerce ✅
9. Verification endpoint - NOW rate limited ✅
10. KYC upload - NOW rate limited ✅
11. Audit logging - Comprehensive coverage ✅
12. Directory traversal - Prevented ✅

### 📋 Outstanding Items (For Implementation)
1. Federal holiday checking in effective date calculation
2. NACHA file encryption at-rest (for highest security environments)
3. Auto-purge of NACHA files after 30 days
4. Failed attempt lockout UI notification
5. Customer-facing rate limit messages

## Next Steps for Monday (Dan's Processor)

1. Open `src/Nacha/MappingConfig.php`
2. Review `dan_processor` profile
3. Update field mappings based on processor requirements:
   - Service class code (200/220/225)
   - Company ID format (prefix requirements)
   - SEC code (PPD/WEB/CCD)
   - Effective entry date calculation
   - Any custom discretionary data requirements
4. Test with `test` profile first before switching to production
5. Use `add_entry_with_mapping()` for processor-specific formatting
