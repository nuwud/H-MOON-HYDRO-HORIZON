#!/usr/bin/env python3
"""Refresh product manifest from WooCommerce server."""
import os
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
WP_CONTENT_DIR = f"{SITE_DIR}/wp-content"

if not SSH_HOST or not SSH_USER or not SSH_PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

php = r"""<?php
wp_set_current_user(1);
$products = get_posts(['post_type'=>'product','post_status'=>'publish','posts_per_page'=>-1,'fields'=>'ids']);
$data = [];
foreach($products as $pid) {
    $p = wc_get_product($pid);
    if(!($p instanceof WC_Product)) continue;
    $thumb_id = get_post_thumbnail_id($pid);
    $gallery = $p->get_gallery_image_ids();
    $brands = wp_get_object_terms($pid, 'pwb-brand', ['fields'=>'names']);
    $cats = wp_get_object_terms($pid, 'product_cat', ['fields'=>'names']);
    $has_brand = !empty($brands) ? $brands[0] : '';
    $data[] = [
        'id' => $pid,
        'title' => $p->get_name(),
        'sku' => $p->get_sku(),
        'price' => $p->get_regular_price(),
        'sale_price' => $p->get_sale_price(),
        'desc' => strlen($p->get_description()) > 0 ? 'has' : '',
        'short_desc' => strlen($p->get_short_description()) > 0 ? 'has' : '',
        'weight' => $p->get_weight(),
        'thumb' => $thumb_id ? wp_get_attachment_url($thumb_id) : '',
        'gallery_count' => count($gallery),
        'brand' => $has_brand,
        'categories' => implode(' | ', $cats),
        'url' => get_permalink($pid),
        'slug' => $p->get_slug(),
    ];
}
echo json_encode($data);
"""

sftp = ssh.open_sftp()
with sftp.file(f'{WP_CONTENT_DIR}/run_script.php', 'w') as f:
    f.write(php)
sftp.close()

stdin, stdout, stderr = ssh.exec_command(f'cd {SITE_DIR} && wp eval-file wp-content/run_script.php', timeout=300)
output = stdout.read().decode('utf-8', errors='replace')
errors = stderr.read().decode('utf-8', errors='replace')

data = json.loads(output)
with open('outputs/fresh_manifest.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

# Summary
no_thumb = [p for p in data if not p.get('thumb')]
no_brand = [p for p in data if not p.get('brand')]
no_gallery = [p for p in data if p.get('gallery_count', 0) == 0]
no_price = [p for p in data if not p.get('price')]
no_desc = [p for p in data if p.get('desc') != 'has']
no_short = [p for p in data if p.get('short_desc') != 'has']
print(f'Total: {len(data)}')
print(f'No thumbnail: {len(no_thumb)}')
print(f'No brand: {len(no_brand)}')
print(f'No gallery: {len(no_gallery)}')
print(f'No price: {len(no_price)}')
print(f'No description: {len(no_desc)}')
print(f'No short desc: {len(no_short)}')
print()
print('--- Missing thumbnails ---')
for p in no_thumb[:60]:
    print(f"  {p['id']}: {p['title']}  brand=[{p.get('brand','')}]  cat=[{p.get('categories','')}]")
print()
print('--- Missing brands (sample 60) ---')
for p in no_brand[:60]:
    print(f"  {p['id']}: {p['title']}  cat=[{p.get('categories','')}]")
print()
print('--- Missing price ---')
for p in no_price[:30]:
    print(f"  {p['id']}: {p['title']}  brand=[{p.get('brand','')}]")
print()
print('--- Missing description (sample 30) ---')
for p in no_desc[:30]:
    print(f"  {p['id']}: {p['title']}  brand=[{p.get('brand','')}]")

ssh.close()
