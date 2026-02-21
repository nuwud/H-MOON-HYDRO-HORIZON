"""
Upload category icons to WooCommerce and assign as category thumbnails.
Uses Filled Color PNGs from the hydroponic icon sets.

Usage:
    python scripts/upload_category_icons.py          # dry-run
    python scripts/upload_category_icons.py --confirm # live run
"""
import paramiko
import sys
import os
import json

HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
REMOTE_DIR = f"{SITE_DIR}/wp-content"
UPLOAD_DIR = f"{REMOTE_DIR}/uploads/category-icons"

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Icon base paths
HYDRO_ICONS = os.path.join(BASE, "hydroponics_assets",
    "hydroponic-icons-2024-11-26-23-08-47-utc",
    "Hydroponic Icons Main File", "Hydroponic Filled Color Icons", "PNG")
GREENHOUSE = os.path.join(BASE, "hydroponics_assets",
    "greenhouse-icons-nursery-hydroponic-plant-set-2026-01-30-11-01-48-utc", "png")
PLANTS = os.path.join(BASE, "hydroponics_assets",
    "plants-growing-and-gardening-icons-2025-11-25-16-09-27-utc", "png")

def h(name):
    """Path to a hydroponic icon."""
    return os.path.join(HYDRO_ICONS, name)

def g(name):
    """Path to a greenhouse icon."""
    return os.path.join(GREENHOUSE, name)

def p(name):
    """Path to a plants-growing icon."""
    return os.path.join(PLANTS, name)

# Category ID -> (local icon path, description for filename)
CATEGORY_ICON_MAP = {
    # ─── Top-level categories ───
    332:  (h("Fertilizer.png"),       "nutrients-supplements"),
    1382: (h("Hydroponic.png"),       "hydroponic-systems"),
    1375: (h("Grow.png"),             "indoor-growing"),
    1385: (h("Light.png"),            "grow-lights-ballasts"),
    725:  (h("Seeds.png"),            "cannabis-seeds"),
    393:  (g("007-fan.png"),          "air-filtration"),
    1390: (p("013-growth.png"),       "organic-growing"),
    381:  (h("Ph meter.png"),         "meters-monitoring"),
    1376: (h("Smart Hydroponic.png"), "commercial-growing"),
    1383: (h("Pot.png"),              "containers-pots"),
    1378: (h("Drip System.png"),      "irrigation-watering"),
    1401: (p("004-seeding.png"),      "propagation-cloning"),
    380:  (h("water Pump.png"),       "water-filtration"),
    367:  (h("Spray.png"),            "pest-disease-control"),
    412:  (h("Green house.png"),      "grow-tents-room-setup"),
    365:  (g("002-co2.png"),          "odor-control"),
    352:  (h("Rockwool.png"),         "growing-media"),
    586:  (h("Hygrometer.png"),       "environmental-control"),
    394:  (h("Harvest.png"),          "harvesting-processing"),
    391:  (h("Watering Schedule.png"),"timers"),
    1433: (h("Hydroponic_1.png"),     "beginner-kits"),
    243:  (g("044-research.png"),     "books"),
    
    # ─── Sub-categories ───
    392:  (g("007-fan.png"),          "fans-blowers"),
    685:  (h("Nutrient Spray.png"),   "plant-enhancements"),
    684:  (h("Fertilizer_1.png"),     "organic-nutrients"),
    438:  (g("041-soil.png"),         "soil-additives"),
    1386: (g("046-eco light.png"),    "led-grow-lights"),
    359:  (g("036-light bulb.png"),   "reflectors"),
    1450: (g("036-light bulb.png"),   "t5-fluorescent"),
    1402: (p("007-root.png"),         "cloning-systems"),
    1387: (h("Light.png"),            "cmh-lec"),
    1427: (h("Pot.png"),              "plastic-pots"),
    421:  (h("Light.png"),            "315-cmh-ballast"),
    587:  (g("002-co2.png"),          "co2-enrichment"),
    1388: (h("Measuring Cup.png"),    "trays-saucers"),
    1430: (h("Light.png"),            "hid-lighting"),
    1431: (g("003-sun energy.png"),   "heat-mats"),
    395:  (p("017-secateurs.png"),    "trimmers"),
    386:  (h("Light.png"),            "light-movers"),
}

def main():
    confirm = "--confirm" in sys.argv
    mode = "LIVE" if confirm else "DRY-RUN"
    print(f"=== Category Icon Upload ({mode}) ===\n")
    
    # Validate all local files exist
    missing = []
    for cat_id, (path, slug) in CATEGORY_ICON_MAP.items():
        if not os.path.exists(path):
            missing.append((cat_id, slug, path))
    
    if missing:
        print("ERROR: Missing icon files:")
        for cat_id, slug, path in missing:
            print(f"  {cat_id} ({slug}): {path}")
        sys.exit(1)
    
    print(f"All {len(CATEGORY_ICON_MAP)} icon files found locally.\n")

    if not HOST or not USER or not PASS:
        raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')
    
    if not confirm:
        print("Icons to upload:")
        for cat_id, (path, slug) in sorted(CATEGORY_ICON_MAP.items(), key=lambda x: x[1][1]):
            fname = os.path.basename(path)
            print(f"  Category {cat_id} ({slug}) <- {fname}")
        print(f"\nRun with --confirm to upload and assign.")
        return
    
    # Connect
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()
    
    # Create upload directory
    try:
        sftp.mkdir(UPLOAD_DIR)
    except IOError:
        pass  # already exists
    
    # Upload all icons
    uploaded = {}
    for cat_id, (local_path, slug) in CATEGORY_ICON_MAP.items():
        remote_name = f"cat-icon-{slug}.png"
        remote_path = f"{UPLOAD_DIR}/{remote_name}"
        
        # Check if we already uploaded this exact file (dedup for shared icons)
        if local_path not in uploaded:
            sftp.put(local_path, remote_path)
            uploaded[local_path] = remote_path
            print(f"  Uploaded: {remote_name}")
        else:
            # Still need to upload with different name for this category
            sftp.put(local_path, remote_path)
            print(f"  Uploaded: {remote_name} (shared icon)")
    
    print(f"\n{len(CATEGORY_ICON_MAP)} icons uploaded to {UPLOAD_DIR}\n")
    
    # Build PHP to sideload into media library and assign as thumbnails
    php = []
    php.append("<?php")
    php.append("wp_set_current_user(1);")
    php.append("require_once(ABSPATH . 'wp-admin/includes/media.php');")
    php.append("require_once(ABSPATH . 'wp-admin/includes/file.php');")
    php.append("require_once(ABSPATH . 'wp-admin/includes/image.php');")
    php.append("")
    php.append("$stats = ['assigned' => 0, 'skipped' => 0, 'errors' => 0];")
    php.append("")
    php.append("$icon_map = array(")
    
    for cat_id, (local_path, slug) in CATEGORY_ICON_MAP.items():
        remote_name = f"cat-icon-{slug}.png"
        php.append(f"    {cat_id} => '{remote_name}',")
    
    php.append(");")
    php.append("")
    php.append("$upload_dir = wp_upload_dir();")
    php.append("$icons_dir = $upload_dir['basedir'] . '/category-icons';")
    php.append("")
    php.append("foreach ($icon_map as $term_id => $filename) {")
    php.append("    $term = get_term($term_id, 'product_cat');")
    php.append("    if (!$term || is_wp_error($term)) {")
    php.append("        echo \"SKIP: term $term_id not found\\n\";")
    php.append("        $stats['skipped']++;")
    php.append("        continue;")
    php.append("    }")
    php.append("")
    php.append("    $file_path = $icons_dir . '/' . $filename;")
    php.append("    if (!file_exists($file_path)) {")
    php.append("        echo \"ERROR: $file_path not found\\n\";")
    php.append("        $stats['errors']++;")
    php.append("        continue;")
    php.append("    }")
    php.append("")
    php.append("    // Check if already has a thumbnail")
    php.append("    $existing = get_term_meta($term_id, 'thumbnail_id', true);")
    php.append("    if ($existing) {")
    php.append("        echo \"UPDATE: {$term->name} ($term_id) - replacing existing thumbnail\\n\";")
    php.append("    }")
    php.append("")
    php.append("    // Copy to temp location for media_handle_sideload")
    php.append("    $tmp = wp_tempnam($filename);")
    php.append("    copy($file_path, $tmp);")
    php.append("")
    php.append("    $file_array = array(")
    php.append("        'name' => 'category-' . $term->slug . '.png',")
    php.append("        'tmp_name' => $tmp,")
    php.append("    );")
    php.append("")
    php.append("    $attachment_id = media_handle_sideload($file_array, 0, 'Category icon: ' . $term->name);")
    php.append("    if (is_wp_error($attachment_id)) {")
    php.append("        echo \"ERROR: {$term->name} - \" . $attachment_id->get_error_message() . \"\\n\";")
    php.append("        $stats['errors']++;")
    php.append("        @unlink($tmp);")
    php.append("        continue;")
    php.append("    }")
    php.append("")
    php.append("    update_term_meta($term_id, 'thumbnail_id', $attachment_id);")
    php.append("    echo \"OK: {$term->name} ($term_id) -> attachment $attachment_id\\n\";")
    php.append("    $stats['assigned']++;")
    php.append("}")
    php.append("")
    php.append("echo \"\\n=== SUMMARY ===\\n\";")
    php.append("echo \"Assigned: \" . $stats['assigned'] . \"\\n\";")
    php.append("echo \"Skipped: \" . $stats['skipped'] . \"\\n\";")
    php.append("echo \"Errors: \" . $stats['errors'] . \"\\n\";")
    php.append("echo \"Done.\\n\";")
    
    php_code = "\n".join(php)
    
    # Write and upload PHP
    local_php = os.path.join(BASE, "outputs", "assign_category_icons.php")
    with open(local_php, "w", encoding="utf-8") as f:
        f.write(php_code)
    
    sftp.put(local_php, f"{REMOTE_DIR}/assign_category_icons.php")
    print("Uploaded assign_category_icons.php")
    sftp.close()
    
    # Execute
    cmd = f"cd {SITE_DIR} && wp eval-file wp-content/assign_category_icons.php"
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    
    print("\n" + out)
    if err:
        print("STDERR:", err)
    
    # Save output
    outpath = os.path.join(BASE, "outputs", "category_icons_output.txt")
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(out)
        if err:
            f.write("\nSTDERR:\n" + err)
    
    ssh.close()
    print(f"Output saved to {outpath}")

if __name__ == "__main__":
    main()
