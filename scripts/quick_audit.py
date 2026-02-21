"""Quick audit of WooCommerce product data coverage."""
import paramiko
import json
import os

SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

PHP_CODE = r'''<?php
wp_set_current_user(1);
$products = get_posts(['post_type' => 'product', 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids']);
$total = count($products);
$has_brand = 0; $has_thumb = 0; $has_gallery = 0; $has_price = 0; $has_desc = 0; $has_short = 0; $has_weight = 0;
foreach($products as $pid) {
    $brands = wp_get_object_terms($pid, 'pwb-brand');
    if(!empty($brands)) $has_brand++;
    if(has_post_thumbnail($pid)) $has_thumb++;
    $gal = get_post_meta($pid, '_product_image_gallery', true);
    if(!empty($gal)) $has_gallery++;
    $price = get_post_meta($pid, '_regular_price', true);
    if(!empty($price)) $has_price++;
    $desc = get_post_field('post_content', $pid);
    if(!empty(trim($desc))) $has_desc++;
    $short = get_post_field('post_excerpt', $pid);
    if(!empty(trim($short))) $has_short++;
    $w = get_post_meta($pid, '_weight', true);
    if(!empty($w)) $has_weight++;
}
echo json_encode([
    'total' => $total,
    'brand' => $has_brand, 'brand_pct' => round($has_brand/$total*100,1),
    'thumb' => $has_thumb, 'thumb_pct' => round($has_thumb/$total*100,1),
    'gallery' => $has_gallery, 'gallery_pct' => round($has_gallery/$total*100,1),
    'price' => $has_price, 'price_pct' => round($has_price/$total*100,1),
    'desc' => $has_desc, 'desc_pct' => round($has_desc/$total*100,1),
    'short_desc' => $has_short, 'short_pct' => round($has_short/$total*100,1),
    'weight' => $has_weight, 'weight_pct' => round($has_weight/$total*100,1),
]);
'''

def main():
    if not SSH_HOST or not SSH_USER or not SSH_PASS:
        raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting to server...")
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

    # Upload PHP
    sftp = ssh.open_sftp()
    with sftp.file(f'{SITE_DIR}/wp-content/quick_status.php', 'w') as f:
        f.write(PHP_CODE)
    sftp.close()
    print("PHP uploaded, running audit...")

    stdin, stdout, stderr = ssh.exec_command(
        f'cd {SITE_DIR} && wp eval-file wp-content/quick_status.php',
        timeout=120
    )
    output = stdout.read().decode('utf-8', errors='replace').strip()
    errors = stderr.read().decode('utf-8', errors='replace').strip()
    ssh.close()

    if errors:
        print(f"STDERR: {errors[:500]}")

    if output:
        try:
            data = json.loads(output)
            print(f"\n{'='*50}")
            print(f"  H-MOON HYDRO - PRODUCT DATA AUDIT")
            print(f"{'='*50}")
            print(f"  Total Products: {data['total']}")
            print(f"{'='*50}")
            print(f"  {'Field':<20} {'Count':>6} {'Coverage':>10}")
            print(f"  {'-'*36}")
            for field, label in [
                ('brand', 'Brands'),
                ('thumb', 'Thumbnails'),
                ('gallery', 'Gallery'),
                ('price', 'Price'),
                ('desc', 'Description'),
                ('short_desc', 'Short Desc'),
                ('weight', 'Weight'),
            ]:
                pct_key = f"{field}_pct" if field != 'short_desc' else 'short_pct'
                count = data[field]
                pct = data[pct_key]
                bar = '#' * int(pct / 5)
                gap = data['total'] - count
                status = 'OK' if pct >= 95 else 'GOOD' if pct >= 80 else 'FAIR' if pct >= 50 else 'LOW'
                print(f"  {label:<20} {count:>6} {pct:>8.1f}%  [{bar:<20}] {status} (gap: {gap})")
            print(f"{'='*50}")
        except json.JSONDecodeError:
            print(f"Raw output: {output}")
    else:
        print("No output received!")

if __name__ == '__main__':
    main()
