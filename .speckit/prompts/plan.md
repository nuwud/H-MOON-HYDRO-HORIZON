# Implementation Plan Template

Use this template to create step-by-step implementation plans.

## Plan: {{PLAN_NAME}}

### Prerequisites
- [ ] Backup required files
- [ ] Confirm environment variables set
- [ ] Run `@repo-archeologist` check

### Phase 1: Preparation
| Step | Command/Action | Verification |
|------|----------------|--------------|
| 1.1 | Action here | How to verify |
| 1.2 | Action here | How to verify |

### Phase 2: Implementation
| Step | Command/Action | Verification |
|------|----------------|--------------|
| 2.1 | Action here | How to verify |
| 2.2 | Action here | How to verify |

### Phase 3: Testing
| Step | Command/Action | Expected Result |
|------|----------------|-----------------|
| 3.1 | `npm run test` | All tests pass |
| 3.2 | `--dry-run` check | No errors |

### Phase 4: Deployment
| Step | Command/Action | Verification |
|------|----------------|--------------|
| 4.1 | Run with `--confirm` | Success message |
| 4.2 | Verify in Shopify admin | Data correct |

### Rollback Steps
1. If failure at Phase X: Do Y
2. Restore backups: `cp backup.csv original.csv`

### Post-Deployment Verification
- [ ] Check Shopify admin for correct data
- [ ] Verify no broken product links
- [ ] Confirm POS alignment still works
- [ ] Run health scoring

### Notes
Additional context or warnings.
