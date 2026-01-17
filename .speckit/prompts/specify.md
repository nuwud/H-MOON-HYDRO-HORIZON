# Specification Template

Use this template when creating specs for new features or changes.

## Feature: {{FEATURE_NAME}}

### Overview
Brief description of what this feature does.

### Motivation
Why is this feature needed? What problem does it solve?

### User Stories
- As a [user type], I want to [action] so that [benefit]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Technical Approach

#### Files to Modify
| File | Changes |
|------|---------|
| `path/to/file` | Description of changes |

#### Files to Create
| File | Purpose |
|------|---------|
| `path/to/new/file` | Purpose of new file |

#### Dependencies
- List any new npm packages
- List any API integrations

### Edge Cases
- Edge case 1: How to handle
- Edge case 2: How to handle

### Testing Plan
- [ ] Unit tests for...
- [ ] Integration tests for...
- [ ] Manual testing for...

### H-Moon Hydro Specific Considerations

#### Agent Consultation
- [ ] Run `@repo-archeologist` — Does similar functionality exist?
- [ ] Check `@category-classifier` — Any category conflicts?
- [ ] Validate with `@shopify-compliance-auditor` — Safe to deploy?

#### Data Impact
- [ ] Does this affect `products_export_1.csv`? → Backup required
- [ ] Does this touch Shopify API? → Needs `--dry-run` mode
- [ ] Does this change POS alignment? → Test against current mappings

#### Brand/Category Rules
- Does this interact with brand detection? Use `brandRegistry.ts`
- Does this affect categorization? Follow `CATEGORY_PRIORITY`

### Rollback Plan
How to revert if something goes wrong.
