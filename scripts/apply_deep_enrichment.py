#!/usr/bin/env python3
"""
Apply deep enrichment to WooCommerce.
Uploads enrichment data and PHP script, then runs on server.
Usage:
  python scripts/apply_deep_enrichment.py          # dry run
  python scripts/apply_deep_enrichment.py --confirm # live
"""
import paramiko, json, sys, os, tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DRY_RUN = '--confirm' not in sys.argv
SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
WP_CONTENT_DIR = f"{SITE_DIR}/wp-content"

def main():
    # Load enrichment
    with open(BASE / 'outputs' / 'deep_enrichment.json', 'r', encoding='utf-8') as f:
        enrichment = json.load(f)

    # Filter out internal keys and empty entries
    clean = {}
    for pid, data in enrichment.items():
        filtered = {k: v for k, v in data.items() if not k.startswith('_')}
        if filtered:
            clean[pid] = filtered

    print(f"Products to enrich: {len(clean)}")
    print(f"Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")

    # Build summary
    has = {}
    for data in clean.values():
        for k in data:
            has[k] = has.get(k, 0) + 1
    for k, v in sorted(has.items()):
        print(f"  {k}: {v}")

    # Build PHP script
    php_data = json.dumps(clean, ensure_ascii=False)

    php_script = r'''<?php
wp_set_current_user(1);
$dry_run = DRY_RUN_FLAG;
$data_json = file_get_contents('DATA_JSON_PATH');
$data = json_decode($data_json, true);
if (!$data) { echo "ERROR: Could not load enrichment data\n"; exit(1); }

$stats = ['brand'=>0, 'image'=>0, 'gallery'=>0, 'price'=>0, 'description'=>0, 'short_description'=>0, 'errors'=>0];

foreach ($data as $pid => $fields) {
    $product = wc_get_product((int)$pid);
    if (!$product) {
        echo "SKIP: Product $pid not found\n";
        continue;
    }
    $name = $product->get_name();
    $changes = [];

    // Brand
    if (!empty($fields['brand'])) {
        $brand_name = trim($fields['brand']);
        if ($brand_name) {
            $existing = wp_get_object_terms((int)$pid, 'pwb-brand', ['fields'=>'names']);
            if (empty($existing)) {
                if (!$dry_run) {
                    $term = term_exists($brand_name, 'pwb-brand');
                    if (!$term) {
                        $slug = sanitize_title($brand_name);
                        $term = wp_insert_term($brand_name, 'pwb-brand', ['slug'=>$slug]);
                    }
                    if (!is_wp_error($term)) {
                        $term_id = is_array($term) ? $term['term_id'] : $term;
                        wp_set_object_terms((int)$pid, [(int)$term_id], 'pwb-brand');
                        $changes[] = "brand=$brand_name";
                        $stats['brand']++;
                    } else {
                        echo "ERR: brand $brand_name for $pid: " . $term->get_error_message() . "\n";
                        $stats['errors']++;
                    }
                } else {
                    $changes[] = "brand=$brand_name";
                    $stats['brand']++;
                }
            }
        }
    }

    // Image (thumbnail)
    if (!empty($fields['image'])) {
        $existing_thumb = get_post_thumbnail_id((int)$pid);
        if (!$existing_thumb) {
            $img_url = $fields['image'];
            if (!$dry_run) {
                $attach_id = hmh_sideload_image($img_url, (int)$pid, $name);
                if ($attach_id && !is_wp_error($attach_id)) {
                    set_post_thumbnail((int)$pid, $attach_id);
                    $changes[] = "image";
                    $stats['image']++;
                } else {
                    $stats['errors']++;
                }
            } else {
                $changes[] = "image";
                $stats['image']++;
            }
        }
    }

    // Gallery
    if (!empty($fields['gallery']) && is_array($fields['gallery'])) {
        $existing_gallery = $product->get_gallery_image_ids();
        if (empty($existing_gallery)) {
            if (!$dry_run) {
                $gallery_ids = [];
                foreach (array_slice($fields['gallery'], 0, 5) as $gurl) {
                    $attach_id = hmh_sideload_image($gurl, (int)$pid, $name . ' gallery');
                    if ($attach_id && !is_wp_error($attach_id)) {
                        $gallery_ids[] = $attach_id;
                    }
                }
                if ($gallery_ids) {
                    $product->set_gallery_image_ids($gallery_ids);
                    $product->save();
                    $changes[] = "gallery=" . count($gallery_ids);
                    $stats['gallery']++;
                }
            } else {
                $changes[] = "gallery=" . count($fields['gallery']);
                $stats['gallery']++;
            }
        }
    }

    // Price
    if (!empty($fields['price'])) {
        $current_price = $product->get_regular_price();
        if (empty($current_price) || $current_price == '' || $current_price == '0') {
            $price = floatval($fields['price']);
            if ($price > 0) {
                if (!$dry_run) {
                    $product->set_regular_price(number_format($price, 2, '.', ''));
                    $product->save();
                    $changes[] = "price=$price";
                    $stats['price']++;
                } else {
                    $changes[] = "price=$price";
                    $stats['price']++;
                }
            }
        }
    }

    // Description
    if (!empty($fields['description'])) {
        $current = $product->get_description();
        if (empty(trim($current))) {
            if (!$dry_run) {
                $product->set_description($fields['description']);
                $product->save();
                $changes[] = "description";
                $stats['description']++;
            } else {
                $changes[] = "description";
                $stats['description']++;
            }
        }
    }

    // Short description
    if (!empty($fields['short_description'])) {
        $current = $product->get_short_description();
        if (empty(trim($current))) {
            if (!$dry_run) {
                $product->set_short_description($fields['short_description']);
                $product->save();
                $changes[] = "short_desc";
                $stats['short_description']++;
            } else {
                $changes[] = "short_desc";
                $stats['short_description']++;
            }
        }
    }

    if ($changes) {
        echo "$pid ($name): " . implode(', ', $changes) . "\n";
    }
}

echo "\n=== RESULTS ===\n";
echo "Mode: " . ($dry_run ? "DRY RUN" : "LIVE") . "\n";
foreach ($stats as $k => $v) {
    echo "  $k: $v\n";
}

function hmh_sideload_image($url, $post_id, $desc = '') {
    require_once(ABSPATH . 'wp-admin/includes/media.php');
    require_once(ABSPATH . 'wp-admin/includes/file.php');
    require_once(ABSPATH . 'wp-admin/includes/image.php');

    $tmp = download_url($url, 30);
    if (is_wp_error($tmp)) return $tmp;

    $file_array = [
        'name' => basename(parse_url($url, PHP_URL_PATH)),
        'tmp_name' => $tmp,
    ];

    $id = media_handle_sideload($file_array, $post_id, $desc);
    if (is_wp_error($id)) {
        @unlink($tmp);
    }
    return $id;
}
'''

    php_script = php_script.replace('DRY_RUN_FLAG', 'true' if DRY_RUN else 'false')
    data_path = f'{WP_CONTENT_DIR}/deep_enrichment_data.json'
    script_path = f'{WP_CONTENT_DIR}/run_script.php'
    php_script = php_script.replace('DATA_JSON_PATH', data_path)

    if not SSH_HOST or not SSH_USER or not SSH_PASS:
        raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

    # Connect and upload
    print("\nConnecting to server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

    sftp = ssh.open_sftp()

    # Upload data JSON
    with sftp.file(data_path, 'w') as f:
        f.write(json.dumps(clean, ensure_ascii=False))
    print(f"Uploaded enrichment data ({len(clean)} products)")

    # Upload PHP script
    with sftp.file(script_path, 'w') as f:
        f.write(php_script)
    print("Uploaded PHP script")
    sftp.close()

    # Execute
    print(f"\nRunning {'DRY RUN' if DRY_RUN else 'LIVE APPLY'}...")
    timeout = 600 if not DRY_RUN else 120  # 10 min for live (image downloads take time)
    stdin, stdout, stderr = ssh.exec_command(
        f'cd {SITE_DIR} && wp eval-file wp-content/run_script.php',
        timeout=timeout
    )
    output = stdout.read().decode('utf-8', errors='replace')
    errors = stderr.read().decode('utf-8', errors='replace')
    
    # Safely print on Windows (replace unencodable chars)
    safe_output = output.encode('ascii', errors='replace').decode('ascii')
    print(safe_output)
    if errors:
        # Filter out common WP notices
        real_errors = [l for l in errors.split('\n') if l.strip() and 'Deprecated' not in l and 'Notice' not in l]
        if real_errors:
            print("STDERR:", '\n'.join(real_errors[:10]))

    # Cleanup
    try:
        sftp2 = ssh.open_sftp()
        sftp2.remove(data_path)
        sftp2.remove(script_path)
        sftp2.close()
    except:
        pass

    ssh.close()
    print("\nDone!")
    if DRY_RUN:
        print("Run with --confirm to apply changes live.")


if __name__ == '__main__':
    main()
