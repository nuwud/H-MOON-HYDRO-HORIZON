#!/bin/bash
# WooCommerce Store Cleanup Script
# Run via SSH on your DreamPress server
#
# Usage:
#   ssh user@dp-5ea9eff01a.dreamhostps.com
#   cd ~/hmoonhydro.com
#   bash cleanup_woo_store.sh

set -e

echo "=========================================="
echo "WooCommerce Store Cleanup"
echo "=========================================="
echo ""

# Safety check
read -p "This will DELETE ALL PRODUCTS. Type 'DELETE' to confirm: " confirm
if [ "$confirm" != "DELETE" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Counting products..."
PRODUCT_COUNT=$(wp post list --post_type=product --format=count)
VARIATION_COUNT=$(wp post list --post_type=product_variation --format=count)
echo "  Products: $PRODUCT_COUNT"
echo "  Variations: $VARIATION_COUNT"
echo ""

echo "Step 2: Deleting all product variations..."
wp post delete $(wp post list --post_type=product_variation --format=ids) --force 2>/dev/null || echo "  No variations to delete"

echo "Step 3: Deleting all products..."
wp post delete $(wp post list --post_type=product --format=ids) --force 2>/dev/null || echo "  No products to delete"

echo ""
echo "Step 4: Cleaning up orphaned data..."

# Clean up orphaned term relationships
wp db query "DELETE FROM wp_term_relationships WHERE object_id NOT IN (SELECT ID FROM wp_posts);" 2>/dev/null || true

# Clean up orphaned postmeta
wp db query "DELETE FROM wp_postmeta WHERE post_id NOT IN (SELECT ID FROM wp_posts);" 2>/dev/null || true

# Clear WooCommerce transients
wp transient delete --all 2>/dev/null || true

# Clear object cache
wp cache flush 2>/dev/null || true

echo ""
echo "=========================================="
echo "CLEANUP COMPLETE"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Go to WooCommerce > Status > Tools"
echo "2. Click 'Clear transients'"
echo "3. Click 'Regenerate product lookup tables'"
echo "4. Import your new consolidated_products.csv"
echo ""
