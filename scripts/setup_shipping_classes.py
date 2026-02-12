#!/usr/bin/env python3
"""
Create WooCommerce shipping classes via REST API.

Run this after setting up WooCommerce API credentials.
API keys: WooCommerce > Settings > Advanced > REST API
"""

import requests
import json
from typing import Dict, List, Optional
import sys

# ============================================================================
# CONFIGURATION - Update these before running
# ============================================================================

WOOCOMMERCE_URL = "https://hmoonhydro.com"
CONSUMER_KEY = "ck_YOUR_CONSUMER_KEY_HERE"
CONSUMER_SECRET = "cs_YOUR_CONSUMER_SECRET_HERE"

# ============================================================================
# SHIPPING CLASSES TO CREATE
# ============================================================================

SHIPPING_CLASSES = [
    {
        "name": "Small Item",
        "slug": "small-item",
        "description": "Items under 1 lb. Bottles 250ml-500ml, seeds, small tools, meters."
    },
    {
        "name": "Medium Item",
        "slug": "medium-item", 
        "description": "Items 1-10 lbs. Bottles 1L-4L, quart/gallon nutrients, small equipment."
    },
    {
        "name": "Large Item",
        "slug": "large-item",
        "description": "Items 10-50 lbs. 10L containers, grow media bags, carbon filters, fans."
    },
    {
        "name": "Oversized",
        "slug": "oversized",
        "description": "Items 50-150 lbs or large dimensions. 23L+ containers, tents, large equipment."
    },
    {
        "name": "Freight",
        "slug": "freight",
        "description": "Items over 150 lbs or pallet-required. Drums, bulk media, commercial equipment."
    },
]


def get_api_url(endpoint: str) -> str:
    """Build full API URL."""
    return f"{WOOCOMMERCE_URL}/wp-json/wc/v3/{endpoint}"


def get_existing_shipping_classes() -> List[Dict]:
    """Get current shipping classes from WooCommerce."""
    response = requests.get(
        get_api_url("products/shipping_classes"),
        auth=(CONSUMER_KEY, CONSUMER_SECRET),
        timeout=30
    )
    
    if response.status_code != 200:
        print(f"Error fetching shipping classes: {response.status_code}")
        print(response.text)
        return []
    
    return response.json()


def create_shipping_class(data: Dict) -> Optional[Dict]:
    """Create a shipping class in WooCommerce."""
    response = requests.post(
        get_api_url("products/shipping_classes"),
        auth=(CONSUMER_KEY, CONSUMER_SECRET),
        json=data,
        timeout=30
    )
    
    if response.status_code in (200, 201):
        return response.json()
    else:
        print(f"Error creating {data['name']}: {response.status_code}")
        print(response.text)
        return None


def setup_shipping_classes():
    """Create all shipping classes."""
    print("=" * 60)
    print("WOOCOMMERCE SHIPPING CLASS SETUP")
    print("=" * 60)
    
    # Check credentials
    if "YOUR_CONSUMER_KEY" in CONSUMER_KEY:
        print("\n❌ ERROR: Please configure your WooCommerce API credentials!")
        print("\nSteps:")
        print("1. Go to WooCommerce > Settings > Advanced > REST API")
        print("2. Click 'Add key'")
        print("3. Set permissions to 'Read/Write'")
        print("4. Copy the Consumer Key and Consumer Secret")
        print("5. Update CONSUMER_KEY and CONSUMER_SECRET in this script")
        return
    
    print(f"\nTarget: {WOOCOMMERCE_URL}")
    
    # Get existing classes
    print("\nFetching existing shipping classes...")
    existing = get_existing_shipping_classes()
    existing_slugs = {c['slug'] for c in existing}
    
    print(f"Found {len(existing)} existing classes: {existing_slugs}")
    
    # Create missing classes
    created = 0
    skipped = 0
    
    for shipping_class in SHIPPING_CLASSES:
        if shipping_class['slug'] in existing_slugs:
            print(f"  ⏭️  {shipping_class['name']} - already exists")
            skipped += 1
            continue
        
        print(f"  📦 Creating: {shipping_class['name']}...")
        result = create_shipping_class(shipping_class)
        
        if result:
            print(f"      ✅ Created (ID: {result['id']})")
            created += 1
        else:
            print(f"      ❌ Failed")
    
    print("\n" + "=" * 60)
    print("SHIPPING CLASS SETUP COMPLETE")
    print("=" * 60)
    print(f"Created: {created}")
    print(f"Skipped (existing): {skipped}")
    print(f"Total classes: {len(existing) + created}")
    
    # Instructions for zones
    print("\n📋 NEXT STEPS:")
    print("1. Go to WooCommerce > Settings > Shipping > Shipping Zones")
    print("2. Edit your shipping zone (e.g., 'United States')")
    print("3. Edit your shipping method (e.g., 'UPS Shipping')")
    print("4. Configure rates per shipping class:")
    print("   - Small Item: Base rate")
    print("   - Medium Item: Base + $2-5")
    print("   - Large Item: Base + $10-15")
    print("   - Oversized: Base + $25-50")
    print("   - Freight: Calculated or contact for quote")


def generate_wpcli_commands():
    """Generate WP-CLI commands for server-side execution."""
    print("\n" + "=" * 60)
    print("WP-CLI COMMANDS (run on server)")
    print("=" * 60)
    
    for sc in SHIPPING_CLASSES:
        cmd = f'wp term create product_shipping_class "{sc["name"]}" --slug="{sc["slug"]}" --description="{sc["description"]}"'
        print(cmd)
    
    print("\n# Or run all at once:")
    print("cd /path/to/wordpress")
    for sc in SHIPPING_CLASSES:
        print(f'wp term create product_shipping_class "{sc["name"]}" --slug="{sc["slug"]}" --porcelain 2>/dev/null || echo "exists"')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--wpcli':
        generate_wpcli_commands()
    else:
        setup_shipping_classes()
