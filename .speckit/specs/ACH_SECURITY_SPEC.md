# ACH Batch Payment Plugin Security Specification

> **Last Updated**: January 2025  
> **Status**: Active  
> **Owner**: Nuwud  

---

## 1. Overview

This specification defines the security requirements, threat model, and implementation guidelines for the WooCommerce ACH Batch Payment plugin.

---

## 2. Security Objectives

### 2.1 Confidentiality
- Bank account numbers and routing numbers MUST be encrypted at rest
- KYC documents MUST NOT be accessible via web URLs
- Encryption keys MUST NOT be stored in the database

### 2.2 Integrity
- All database writes MUST use prepared statements
- NACHA files MUST be validated before upload
- Audit logs MUST be tamper-evident

### 2.3 Availability
- Concurrent batch runs MUST be prevented via locking
- Failed SFTP uploads MUST NOT lose generated files
- System MUST gracefully degrade if encryption unavailable

---

## 3. Threat Model

### 3.1 Threats

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **T1**: SQL Injection | Medium | Critical | Prepared statements everywhere |
| **T2**: Direct file access to KYC docs | Medium | Critical | `.htaccess` deny + `0600` perms |
| **T3**: Admin account compromise | Medium | High | Encryption at rest protects data |
| **T4**: Database backup exposure | Low | High | Data encrypted, key not in DB |
| **T5**: Log file disclosure | Medium | High | Never log sensitive data |
| **T6**: API endpoint abuse | Medium | Medium | Capability checks + rate limiting |
| **T7**: Encryption key theft | Low | Critical | Key in wp-config, not DB |
| **T8**: Replay attack on verification | Low | Medium | Nonces, timestamps |
| **T9**: Race condition in batch export | Low | Medium | Transient-based locking |

### 3.2 Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                       │
│  • Customer browser                                     │
│  • External APIs (Plaid)                               │
│  • Inbound webhooks                                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTPS + Input Validation
┌─────────────────────────────────────────────────────────┐
│                    SEMI-TRUSTED ZONE                    │
│  • WordPress core                                       │
│  • WooCommerce core                                     │
│  • Other plugins                                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ Capability Checks
┌─────────────────────────────────────────────────────────┐
│                     TRUSTED ZONE                        │
│  • ACH plugin admin functions                          │
│  • Batch processing                                     │
│  • SFTP upload                                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ Encryption Layer
┌─────────────────────────────────────────────────────────┐
│                   HIGH-SECURITY ZONE                    │
│  • Encryption keys (wp-config.php)                     │
│  • Decrypted bank details (memory only)               │
│  • NACHA file generation                               │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Security Controls

### 4.1 Encryption

| Requirement | Implementation |
|-------------|----------------|
| Algorithm | AES-256-GCM (authenticated encryption) |
| Key Length | 256 bits (32 bytes) |
| IV | Random 12 bytes per encryption |
| Auth Tag | 16 bytes |
| Key Storage | `WOO_ACH_BATCH_ENCRYPTION_KEY` constant |
| Key Derivation (fallback) | SHA-256 of WordPress salts |

### 4.2 Access Control

| Resource | Who Can Access | Check |
|----------|---------------|-------|
| Admin settings | `manage_woocommerce` | `current_user_can()` |
| Batch operations | `manage_woocommerce` | `current_user_can()` |
| Order bank details | Order owner or admin | Order ownership + capability |
| KYC documents | Admin only | `manage_woocommerce` |
| REST API (batches) | Admin only | `admin_permissions_check()` |
| REST API (verification) | Order owner | `customer_permissions_check()` |

### 4.3 Input Validation

| Field | Validation |
|-------|------------|
| Routing Number | Exactly 9 digits, valid checksum |
| Account Number | 4-17 digits |
| Account Type | Enum: `checking`, `savings` |
| Order ID | Positive integer, order exists |
| File Uploads | MIME type check, size limit |

### 4.4 Output Encoding

| Context | Function |
|---------|----------|
| HTML content | `esc_html()` |
| HTML attributes | `esc_attr()` |
| URLs | `esc_url()` |
| JavaScript | `wp_json_encode()` |
| SQL | `$wpdb->prepare()` |

---

## 5. Security Checklists

### 5.1 Before Adding Any Code That Handles Bank Data

- [ ] Read SENSITIVE_DATA_STORAGE_PLAN.md
- [ ] Verify data will be encrypted before storage
- [ ] Verify data will NOT appear in any logs
- [ ] Verify data will NOT be returned in API responses
- [ ] Verify data will NOT be displayed in full (only last4)
- [ ] Add audit log entry for the operation
- [ ] Consider clearing data after use

### 5.2 Before Adding Any REST API Endpoint

- [ ] Add permission_callback
- [ ] Validate all input parameters
- [ ] Sanitize with appropriate functions
- [ ] Never expose encrypted data or keys
- [ ] Rate limit sensitive operations
- [ ] Log access attempts

### 5.3 Before Adding Any File Upload Handler

- [ ] Validate MIME type (not just extension)
- [ ] Enforce file size limits
- [ ] Store outside webroot OR with `.htaccess` deny
- [ ] Set restrictive permissions (`0600`)
- [ ] Generate unpredictable filenames
- [ ] Scan for malware (if available)

### 5.4 Before Any Database Query

- [ ] Use `$wpdb->prepare()` for ALL user input
- [ ] Never concatenate user input into queries
- [ ] Validate/sanitize before query construction
- [ ] Limit result sets where appropriate

---

## 6. Incident Response

### 6.1 If Encryption Key is Suspected Compromised

1. **IMMEDIATE**: Rotate to new key (see key rotation procedure)
2. **ASSESS**: Review audit logs for unauthorized access
3. **CONTAIN**: Identify affected orders/customers
4. **NOTIFY**: Notify affected parties per legal requirements
5. **DOCUMENT**: Create incident report

### 6.2 If Unauthorized Access to KYC Documents

1. **VERIFY**: Check `.htaccess` is in place
2. **BLOCK**: Add additional server-level blocks
3. **ASSESS**: Check access logs for exposure
4. **NOTIFY**: Notify affected customers
5. **MIGRATE**: Consider encrypted at-rest storage

### 6.3 If NACHA File Leaked

1. **CONTACT**: Notify processor immediately
2. **BLOCK**: Request ACH entries be blocked if possible
3. **ASSESS**: Determine which batch was exposed
4. **NOTIFY**: Notify affected customers
5. **REVIEW**: Audit file system permissions

---

## 7. Testing Requirements

### 7.1 Security Testing

| Test Type | Frequency | Tools |
|-----------|-----------|-------|
| Input validation | Every PR | Manual review |
| SQL injection | Quarterly | sqlmap |
| XSS scanning | Quarterly | OWASP ZAP |
| File access | Every PR | Manual curl tests |
| Capability checks | Every PR | Unit tests |

### 7.2 Test Cases

- [ ] Unauthenticated user cannot access batch API
- [ ] Customer cannot access another customer's order
- [ ] Direct URL to KYC file returns 403/404
- [ ] Invalid routing number is rejected
- [ ] Encrypted data is unreadable in database
- [ ] Audit log captures all sensitive operations
- [ ] Failed verification attempts are logged
- [ ] Concurrent batch runs are prevented

---

## 8. Compliance

### 8.1 NACHA Operating Rules

- ✅ Account numbers protected during transmission and storage
- ✅ Audit trail maintained for all ACH transactions
- ✅ Procedures for unauthorized entry handling

### 8.2 Privacy Laws

- ✅ Bank details classified as "personal information"
- ✅ Support for deletion requests (after obligations met)
- ✅ Data collection disclosed in privacy policy (merchant responsibility)

---

## 9. Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-XX | Initial creation |
