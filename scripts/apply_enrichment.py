#!/usr/bin/env python3
"""
H-Moon Hydro: Apply Enrichment Data
====================================
Applies brands and descriptions from deep_enrichment.json to WooCommerce products.

What gets applied:
  - Brands (421 products) -> pwb-brand taxonomy (ALWAYS applied)
  - Descriptions (48 products) -> Only where currently empty
  - Short descriptions (72 products) -> Only where currently empty

What gets SKIPPED:
  - Images (Shopify CDN URLs won't work on WooCommerce)
  - Prices (don't overwrite with competitor pricing)

Usage:
  python scripts/apply_enrichment.py           # Dry run (default)
  python scripts/apply_enrichment.py --confirm  # LIVE run
"""

import json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIRM = '--confirm' in sys.argv

SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')


def run():
    import paramiko

    if not SSH_HOST or not SSH_USER or not SSH_PASS:
        raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

    dry_run = not CONFIRM
    mode = 'DRY RUN' if dry_run else 'LIVE'

    # Load enrichment data
    enrichment_path = os.path.join(BASE, 'outputs', 'deep_enrichment.json')
    with open(enrichment_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print('=== Apply Enrichment: ' + mode + ' ===')
    print('Total products in enrichment: ' + str(len(data)))

    # Build the enrichment payload - only what we want to apply
    payload = {}
    for pid, prod in data.items():
        entry = {}
        if prod.get('brand'):
            entry['brand'] = prod['brand']
        if prod.get('description'):
            entry['description'] = prod['description']
        if prod.get('short_description'):
            entry['short_description'] = prod['short_description']
        if entry:
            payload[pid] = entry

    brand_count = sum(1 for v in payload.values() if v.get('brand'))
    desc_count = sum(1 for v in payload.values() if v.get('description'))
    short_count = sum(1 for v in payload.values() if v.get('short_description'))

    print('Brands to set: ' + str(brand_count))
    print('Descriptions (fill empty): ' + str(desc_count))
    print('Short descriptions (fill empty): ' + str(short_count))
    print()

    # Build PHP
    dry_val = 'true' if dry_run else 'false'
    
    p = []
    p.append('<?php')
    p.append('wp_set_current_user(1);')
    p.append('$dry = ' + dry_val + ';')
    p.append('$data = json_decode(file_get_contents(__DIR__ . "/enrichment_payload.json"), true);')
    p.append('$stats = ["brands" => 0, "desc" => 0, "short_desc" => 0, "skipped" => 0, "not_found" => 0];')
    p.append('')
    p.append('echo "Processing " . count($data) . " products...\\n";')
    p.append('')
    p.append('foreach ($data as $pid => $fields) {')
    p.append('    $post = get_post($pid);')
    p.append('    if (!$post || $post->post_type !== "product") {')
    p.append('        $stats["not_found"]++;')
    p.append('        continue;')
    p.append('    }')
    p.append('')
    p.append('    // Set brand via pwb-brand taxonomy')
    p.append('    if (!empty($fields["brand"])) {')
    p.append('        $brand = $fields["brand"];')
    p.append('        if ($dry) {')
    p.append('            echo "  [DRY] $pid: set brand \\"$brand\\"\\n";')
    p.append('        } else {')
    p.append('            // Check if brand term exists, create if needed')
    p.append('            $bt = get_term_by("name", $brand, "pwb-brand");')
    p.append('            if (!$bt) {')
    p.append('                $r = wp_insert_term($brand, "pwb-brand");')
    p.append('                if (is_wp_error($r)) {')
    p.append('                    echo "  WARN: Could not create brand \\"$brand\\": " . $r->get_error_message() . "\\n";')
    p.append('                }')
    p.append('            }')
    p.append('            wp_set_object_terms($pid, $brand, "pwb-brand", false);')
    p.append('            $stats["brands"]++;')
    p.append('        }')
    p.append('    }')
    p.append('')
    p.append('    // Set description only if currently empty')
    p.append('    if (!empty($fields["description"])) {')
    p.append('        $current = $post->post_content;')
    p.append('        if (empty(trim($current))) {')
    p.append('            if ($dry) {')
    p.append('                echo "  [DRY] $pid: set description (" . strlen($fields["description"]) . " chars)\\n";')
    p.append('            } else {')
    p.append('                wp_update_post(array("ID" => $pid, "post_content" => $fields["description"]));')
    p.append('                $stats["desc"]++;')
    p.append('            }')
    p.append('        } else {')
    p.append('            $stats["skipped"]++;')
    p.append('        }')
    p.append('    }')
    p.append('')
    p.append('    // Set short description only if currently empty')
    p.append('    if (!empty($fields["short_description"])) {')
    p.append('        $current_short = $post->post_excerpt;')
    p.append('        if (empty(trim($current_short))) {')
    p.append('            if ($dry) {')
    p.append('                echo "  [DRY] $pid: set short_description (" . strlen($fields["short_description"]) . " chars)\\n";')
    p.append('            } else {')
    p.append('                wp_update_post(array("ID" => $pid, "post_excerpt" => $fields["short_description"]));')
    p.append('                $stats["short_desc"]++;')
    p.append('            }')
    p.append('        } else {')
    p.append('            $stats["skipped"]++;')
    p.append('        }')
    p.append('    }')
    p.append('}')
    p.append('')
    p.append('echo "\\n=== SUMMARY ===\\n";')
    p.append('$mode_str = $dry ? "DRY RUN" : "LIVE";')
    p.append('echo "Mode: $mode_str\\n";')
    p.append('echo "Brands set: " . $stats["brands"] . "\\n";')
    p.append('echo "Descriptions set: " . $stats["desc"] . "\\n";')
    p.append('echo "Short descriptions set: " . $stats["short_desc"] . "\\n";')
    p.append('echo "Skipped (already had content): " . $stats["skipped"] . "\\n";')
    p.append('echo "Not found: " . $stats["not_found"] . "\\n";')
    p.append('echo "Done.\\n";')

    php_code = '\n'.join(p)

    # Connect
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

    remote_dir = SITE_DIR + '/wp-content'
    remote_php = remote_dir + '/apply_enrichment.php'
    remote_json = remote_dir + '/enrichment_payload.json'

    # Upload payload JSON + PHP
    sftp = ssh.open_sftp()
    payload_str = json.dumps(payload, ensure_ascii=False)
    with sftp.open(remote_json, 'w') as f:
        f.write(payload_str)
    with sftp.open(remote_php, 'w') as f:
        f.write(php_code)
    sftp.close()

    print('Uploaded PHP + JSON payload (' + str(len(payload_str) // 1024) + ' KB)')

    # Execute
    print('Executing (' + mode + ')...\n')
    cmd = 'cd ' + SITE_DIR + ' && wp eval-file wp-content/apply_enrichment.php'
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=600)

    output = stdout.read().decode('utf-8', errors='replace')
    errors = stderr.read().decode('utf-8', errors='replace')

    # Print (truncated for dry run since lots of lines)
    lines = output.split('\n')
    if len(lines) > 60 and dry_run:
        for line in lines[:30]:
            print(line.encode('ascii', errors='replace').decode('ascii'))
        print('... (' + str(len(lines) - 60) + ' more lines) ...')
        for line in lines[-30:]:
            print(line.encode('ascii', errors='replace').decode('ascii'))
    else:
        for line in lines:
            print(line.encode('ascii', errors='replace').decode('ascii'))

    if errors:
        for line in errors.strip().split('\n'):
            if 'Warning' not in line and 'Notice' not in line and 'Deprecated' not in line:
                print('STDERR: ' + line.encode('ascii', errors='replace').decode('ascii'))

    # Cleanup
    ssh.exec_command('rm ' + remote_php + ' ' + remote_json)
    ssh.close()

    # Save output
    slug = mode.lower().replace(' ', '_')
    out_path = os.path.join(BASE, 'outputs', 'enrichment_' + slug + '_output.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(output)
    print('\nOutput saved: ' + out_path)


if __name__ == '__main__':
    run()
