#!/usr/bin/env python3
"""
fresh_scrape_pipeline.py — Full pipeline:
1. Export enrichment manifest from WooCommerce
2. Force-fetch fresh retailer catalogs
3. Match products
4. Generate enrichment PHP script
"""
import json
import os
import sys
import time
from pathlib import Path

import paramiko

WORKSPACE = Path(__file__).parent.parent
sys.path.insert(0, str(WORKSPACE / "scripts"))

from retailer_scraper import (
    CATALOG_DIR, OUTPUT_DIR, RETAILERS, MANIFEST_PATH,
    fetch_shopify_catalog, match_products, save_results
)

# Server credentials
HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
REMOTE_SCRIPT = f'{SITE_DIR}/wp-content/run_script.php'


def ssh_run(ssh, cmd):
    """Run a command via SSH and return stdout."""
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err


def step1_export_manifest():
    """Upload export_manifest.php and run it to get current product data."""
    if not HOST or not USER or not PASS:
        raise RuntimeError('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')
    print("\n" + "=" * 60)
    print("  STEP 1: EXPORT MANIFEST FROM WOOCOMMERCE")
    print("=" * 60)
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    
    # Upload PHP script
    sftp = ssh.open_sftp()
    local_php = str(WORKSPACE / "scripts" / "export_manifest.php")
    sftp.put(local_php, REMOTE_SCRIPT)
    sftp.close()
    
    # Run it
    print("  Running export on server...")
    out, err = ssh_run(ssh, f'cd {SITE_DIR} && wp eval-file {REMOTE_SCRIPT}')
    ssh.close()
    
    # Print summary from stderr
    if err:
        for line in err.strip().split('\n'):
            print(f"  {line}")
    
    # Parse JSON from stdout
    try:
        manifest = json.loads(out)
    except json.JSONDecodeError:
        # Sometimes WP outputs warnings before JSON
        # Find the JSON array start
        idx = out.find('[')
        if idx >= 0:
            manifest = json.loads(out[idx:])
        else:
            print("  ERROR: Could not parse manifest JSON")
            print(out[:500])
            return None
    
    # Save locally
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"  Manifest saved: {len(manifest)} products → {MANIFEST_PATH.name}")
    
    # Quick stats
    gaps = {}
    for p in manifest:
        for m in p.get('missing', []):
            gaps[m] = gaps.get(m, 0) + 1
    print(f"\n  Data gaps:")
    for gap, count in sorted(gaps.items(), key=lambda x: -x[1]):
        print(f"    {gap:20s}: {count:5d} / {len(manifest)}")
    
    return manifest


def step2_fetch_catalogs(force=True):
    """Fetch fresh retailer catalogs (delete old cache to force refresh)."""
    print("\n" + "=" * 60)
    print("  STEP 2: FETCH FRESH RETAILER CATALOGS")
    print("=" * 60)
    
    CATALOG_DIR.mkdir(parents=True, exist_ok=True)
    
    if force:
        # Delete old cache files to force fresh download
        for f in CATALOG_DIR.glob("*_products.json"):
            age_hours = (time.time() - os.path.getmtime(f)) / 3600
            print(f"  Removing old cache: {f.name} ({age_hours:.0f}h old)")
            f.unlink()
    
    catalogs = {}
    for key, info in RETAILERS.items():
        products = fetch_shopify_catalog(key, info)
        catalogs[key] = {'info': info, 'products': products}
    
    total = sum(len(c['products']) for c in catalogs.values())
    print(f"\n  Total retailer products fetched: {total}")
    return catalogs


def step3_match_and_save(catalogs):
    """Match our products against retailer data."""
    print("\n" + "=" * 60)
    print("  STEP 3: MATCH PRODUCTS")
    print("=" * 60)
    
    results = match_products(catalogs)
    save_results(results)
    return results


def step4_generate_enrichment_script(results):
    """Generate a PHP script to apply enrichment data to WooCommerce."""
    print("\n" + "=" * 60)
    print("  STEP 4: GENERATE ENRICHMENT SCRIPT")
    print("=" * 60)
    
    matched = [r for r in results if r.get('enrichment')]
    print(f"  Matched products: {len(matched)}")
    
    # Build enrichment data grouped by what needs to be applied
    enrichments = []
    for r in matched:
        e = r['enrichment']
        pid = r['id']
        missing = set(r.get('missing', []))
        
        enrich = {'id': pid, 'title': r['title']}
        apply_data = {}
        
        # Image (only if missing)
        if 'image' in missing and e.get('images'):
            apply_data['image_url'] = e['images'][0]['url']
        
        # Gallery (only if missing)
        if 'gallery' in missing and e.get('images') and len(e['images']) > 1:
            apply_data['gallery_urls'] = [img['url'] for img in e['images'][1:6]]  # Max 5 gallery images
        
        # Weight (only if missing)
        if 'weight' in missing and e.get('weight'):
            w = e['weight']
            unit = e.get('weight_unit', 'lb')
            # Convert to lbs if needed
            if unit == 'kg':
                w = w * 2.20462
            elif unit == 'g':
                w = w / 453.592
            elif unit == 'oz':
                w = w / 16
            apply_data['weight'] = round(w, 2)
        
        # Short description (only if missing)
        if 'short_description' in missing and e.get('description_text'):
            # First 200 chars of description
            text = e['description_text']
            if len(text) > 200:
                # Cut at sentence boundary 
                cut = text[:200].rfind('.')
                if cut > 50:
                    text = text[:cut+1]
                else:
                    text = text[:200] + '...'
            apply_data['short_description'] = text
        
        # Brand (only if missing)
        if 'brand' in missing and e.get('vendor'):
            apply_data['brand'] = e['vendor']
        
        if apply_data:
            enrich['apply'] = apply_data
            enrich['score'] = e.get('match_score', 0)
            enrichments.append(enrich)
    
    print(f"  Products with applicable enrichment: {len(enrichments)}")
    
    # Count what we can fill
    fills = {}
    for en in enrichments:
        for key in en['apply']:
            fills[key] = fills.get(key, 0) + 1
    for what, count in sorted(fills.items(), key=lambda x: -x[1]):
        print(f"    {what:25s}: {count}")
    
    # Save enrichment data as JSON for the PHP script
    enrich_path = OUTPUT_DIR / "enrichment_to_apply.json"
    with open(enrich_path, 'w', encoding='utf-8') as f:
        json.dump(enrichments, f, indent=2, ensure_ascii=False)
    print(f"\n  Enrichment data saved: {enrich_path}")
    
    return enrichments


if __name__ == '__main__':
    args = set(sys.argv[1:])
    
    if '--help' in args:
        print("Usage: python scripts/fresh_scrape_pipeline.py [options]")
        print("  --manifest   Step 1: Export manifest from WooCommerce")
        print("  --fetch      Step 2: Fetch fresh retailer catalogs")
        print("  --match      Step 3: Match products")
        print("  --generate   Step 4: Generate enrichment data")
        print("  --all        Run all steps")
        sys.exit(0)
    
    run_all = '--all' in args
    
    if run_all or '--manifest' in args:
        manifest = step1_export_manifest()
        if manifest is None:
            print("Failed to export manifest, aborting.")
            sys.exit(1)
    
    if run_all or '--fetch' in args:
        catalogs = step2_fetch_catalogs(force=True)
    
    if run_all or '--match' in args:
        # Load catalogs if not already loaded
        if 'catalogs' not in dir():
            catalogs = {}
            for key, info in RETAILERS.items():
                cache_file = CATALOG_DIR / f"{key}_products.json"
                if cache_file.exists():
                    with open(cache_file, encoding='utf-8') as f:
                        catalogs[key] = {'info': info, 'products': json.load(f)}
        results = step3_match_and_save(catalogs)
    
    if run_all or '--generate' in args:
        # Load results if not already loaded
        if 'results' not in dir():
            results_file = OUTPUT_DIR / "enrichment_matches.json"
            with open(results_file, encoding='utf-8') as f:
                results = json.load(f)
        step4_generate_enrichment_script(results)
    
    print("\n" + "=" * 60)
    print("  PIPELINE COMPLETE")
    print("=" * 60)
