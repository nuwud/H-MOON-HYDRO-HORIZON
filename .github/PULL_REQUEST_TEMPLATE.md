## Pull Request

### Description
Brief description of changes.

### Type of Change
- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📝 Documentation update
- [ ] 🎨 Theme/UI change
- [ ] 🔧 Pipeline/CLI change
- [ ] 📊 Data processing change

### Component(s) Affected
- [ ] Shopify Horizon Theme
- [ ] HMoon Pipeline
- [ ] Category Builders
- [ ] POS Alignment
- [ ] Brand Detection
- [ ] Data Import/Export
- [ ] Documentation

### Changes Made
- Change 1
- Change 2
- Change 3

### Testing Performed
- [ ] Ran with `--dry-run` flag
- [ ] Tested against sample data
- [ ] Verified Shopify import format (32 columns)
- [ ] Checked for duplicate SKUs
- [ ] Ran `@shopify-compliance-auditor` agent

### Data Impact Assessment
- [ ] Does NOT affect `products_export_1.csv` or made backup
- [ ] Does NOT affect POS alignment mappings or verified compatibility
- [ ] Does NOT affect brand registry or updated accordingly
- [ ] Does NOT affect category classification or followed `CATEGORY_PRIORITY`

### Pre-Merge Checklist
- [ ] Code follows project conventions
- [ ] No console.log statements left in production code
- [ ] CLI scripts have `--dry-run` as default
- [ ] Rate limiting applied to Shopify API calls (200-500ms)
- [ ] Self-review completed
- [ ] Documentation updated if needed

### Screenshots (if applicable)
Add screenshots for UI changes.

### Related Issues
Closes #

### Additional Notes
Any other context or notes for reviewers.
