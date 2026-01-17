---
name: Migration Task
about: Track a specific WooCommerce to Shopify migration task
title: '[MIGRATION] '
labels: migration
assignees: ''
---

## Migration Task
Brief description of what needs to be migrated.

## Source Data
- WooCommerce table(s): 
- CSV file(s): 
- Data field(s):

## Target
- Shopify field(s):
- Collection(s):
- Product attribute(s):

## Data Transformation
Describe any data transformations needed:
- Format changes?
- Unit conversions (e.g., lbs → grams)?
- SKU generation?

## Volume
- Approximate number of products affected:
- Estimated processing time:

## Dependencies
- [ ] Requires POS alignment data
- [ ] Requires WooCommerce SQL extraction
- [ ] Requires brand detection
- [ ] Requires category classification

## Validation Steps
- [ ] Dry-run completed
- [ ] Sample data verified
- [ ] Shopify import format validated (32 columns)
- [ ] No duplicate SKUs

## Rollback Plan
How to revert if migration fails.

## Related
- Related issue(s): #
- Related script(s):
