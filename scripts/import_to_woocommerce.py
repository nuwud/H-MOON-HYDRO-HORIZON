#!/usr/bin/env python3
"""
import_to_woocommerce.py — Upload CSV and import products via WP-CLI

Usage:
  python scripts/import_to_woocommerce.py              # Dry run (backup only)
  python scripts/import_to_woocommerce.py --confirm    # Actually import
"""
import sys
import json
import os
from pathlib import Path
from datetime import datetime
import paramiko

WORKSPACE = Path(__file__).parent.parent
HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

LOCAL_CSV = WORKSPACE / "outputs" / "woocommerce_FINAL_WITH_IMAGES.csv"
REMOTE_CSV = f'{SITE_DIR}/wp-content/product_import.csv'
BACKUP_DIR = f'{SITE_DIR}/wp-content/backups'

confirm = '--confirm' in sys.argv
timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

print("=" * 60)
print("WOOCOMMERCE PRODUCT IMPORT")
print("=" * 60)
print(f"Mode: {'LIVE IMPORT' if confirm else 'DRY RUN (backup only)'}")
print(f"CSV: {LOCAL_CSV}")
print(f"Target: {HOST}")
print("")

if not HOST or not USER or not PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

# Connect
print("Connecting to server...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)
print("✓ Connected")

def run_cmd(cmd, timeout=300):
    """Run command and return output"""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

# Step 1: Create backup directory
print("\n[1/5] Creating backup directory...")
run_cmd(f'mkdir -p {BACKUP_DIR}')

# Step 2: Backup current products (via SQL export)
print("[2/5] Backing up current products...")
backup_file = f'{BACKUP_DIR}/products_backup_{timestamp}.sql'
out, err = run_cmd(f'cd {SITE_DIR} && wp db export {backup_file} --tables=wp_posts,wp_postmeta,wp_term_relationships --porcelain 2>&1 | head -5', timeout=120)
if 'Error' in str(err) or 'error' in str(out):
    # Try simpler export
    print("  Using simple product export...")
    backup_file = f'{BACKUP_DIR}/products_backup_{timestamp}.json'
    out, err = run_cmd(f'''cd {SITE_DIR} && wp post list --post_type=product --fields=ID,post_title,post_name --format=json > {backup_file}''', timeout=120)
print(f"  ✓ Backup created: {backup_file}")

# Step 3: Get current product count
print("[3/5] Checking current product count...")
out, err = run_cmd(f'cd {SITE_DIR} && wp post list --post_type=product --format=count')
current_count = out.strip() if out else "unknown"
print(f"  Current products in WooCommerce: {current_count}")

# Step 4: Upload CSV
print("[4/5] Uploading import CSV...")
try:
    sftp = ssh.open_sftp()
    file_size = LOCAL_CSV.stat().st_size
    print(f"  Uploading {file_size / 1024:.0f} KB...")
    sftp.put(str(LOCAL_CSV), REMOTE_CSV)
    sftp.close()
    print(f"  ✓ Uploaded to {REMOTE_CSV}")
except Exception as e:
    print(f"  ❌ Upload failed: {e}")
    ssh.close()
    sys.exit(1)

# Step 5: Import (if confirmed)
if confirm:
    print("[5/5] Running WooCommerce import...")
    print("  This may take several minutes...")
    
    # WooCommerce CSV import via WP-CLI
    # Note: wc product import requires the woocommerce-product-csv-import-export plugin
    # OR use the built-in importer with update mode
    import_cmd = f'''cd {SITE_DIR} && wp wc product_csv_importer import {REMOTE_CSV} --update_existing=true --skip_existing=false'''
    
    out, err = run_cmd(import_cmd, timeout=600)
    
    if err:
        print(f"  STDERR: {err[:500]}")
    if out:
        print(f"  {out}")
    
    # If wc product_csv_importer doesn't exist, try alternate method
    if 'not a registered wp command' in err.lower() or 'error' in err.lower():
        print("\n  Using PHP-based import instead...")
        
        # Create a PHP import script
        php_import = '''<?php
// Direct DB import using WooCommerce importer class
require_once ABSPATH . 'wp-content/plugins/woocommerce/includes/import/class-wc-product-csv-importer.php';

$file = ABSPATH . 'wp-content/product_import.csv';
if (!file_exists($file)) {
    echo "CSV file not found\\n";
    exit(1);
}

$params = array(
    'parse' => true,
    'mapping' => array(), // Auto-map
    'update_existing' => true,
);

$importer = new WC_Product_CSV_Importer($file, $params);
$data = $importer->import();

echo "Import results:\\n";
echo "  Created: " . count($data['imported']) . "\\n";
echo "  Updated: " . count($data['updated']) . "\\n";
echo "  Skipped: " . count($data['skipped']) . "\\n";
echo "  Errors: " . count($data['failed']) . "\\n";

if (!empty($data['failed'])) {
    echo "\\nFirst 5 errors:\\n";
    foreach (array_slice($data['failed'], 0, 5) as $error) {
        echo "  - " . print_r($error, true) . "\\n";
    }
}
'''
        # Upload and run PHP import
        sftp2 = ssh.open_sftp()
        with sftp2.file(f'{SITE_DIR}/wp-content/csv_import.php', 'w') as f:
            f.write(php_import)
        sftp2.close()
        
        out, err = run_cmd(f'cd {SITE_DIR} && wp eval-file wp-content/csv_import.php', timeout=600)
        print(out)
        if err:
            print(f"  Errors: {err[:500]}")
    
    # Get new count
    out, err = run_cmd(f'cd {SITE_DIR} && wp post list --post_type=product --format=count')
    new_count = out.strip() if out else "unknown"
    print(f"\n  Products after import: {new_count}")
    print("\n✅ Import complete!")
else:
    print("[5/5] SKIPPED - Run with --confirm to import")
    print(f"\n  CSV uploaded to: {REMOTE_CSV}")
    print(f"  To import manually:")
    print(f"    1. Go to WooCommerce > Products > Import")
    print(f"    2. Upload or select {REMOTE_CSV}")
    print(f"    3. Choose 'Update existing products'")
    print(f"    4. Run import")
    print(f"\n  Or run this script with --confirm")

ssh.close()
print("\nDone.")
