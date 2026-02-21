#!/usr/bin/env python3
"""
H-Moon Hydro: Category Cleanup & Taxonomy Rationalization
=========================================================
Reduces 116 categories to ~28 clean, well-organized categories.

Phases:
  1. Delete 35 empty categories (zero risk)
  2. Merge duplicate/redundant categories (reassign products first)
  3. Move brand-as-category products to brand taxonomy
  4. Reparent orphaned sub-categories

Usage:
  python scripts/category_cleanup.py           # Dry run (default)
  python scripts/category_cleanup.py --confirm  # LIVE run
"""

import json, os, sys, time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIRM = '--confirm' in sys.argv

SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

# Phase 1: Empty categories to delete
EMPTY_DELETE_IDS = [
    1399, 1414, 1426, 1415, 1438, 1424, 1425, 1448, 1379,
    362, 270, 229, 269, 363, 329, 237, 300, 432, 693, 423,
    356, 314, 426, 355, 236, 328, 382, 347, 283, 383, 259,
    285, 385, 384, 690,
]

# Phase 2: Merge map  { keep_id: { absorb: [...], rename: "...", note: "..." } }
MERGE_MAP = {
    332: {'absorb': [1380, 1381], 'rename': 'Nutrients & Supplements',
          'note': 'Merge Nutrients & Additives + Base Nutrients into main'},
    1385: {'absorb': [354, 422, 443, 414, 361, 403], 'rename': 'Grow Lights & Ballasts',
           'note': 'Consolidate all lighting'},
    1383: {'absorb': [353, 1384, 1408], 'rename': 'Containers & Pots',
           'note': 'Merge duplicate container cats'},
    1401: {'absorb': [337], 'rename': 'Propagation & Cloning',
           'note': 'Merge propagation cats'},
    367: {'absorb': [1403, 1442], 'rename': 'Pest & Disease Control',
          'note': 'Merge pest control cats'},
    352: {'absorb': [1454, 1455], 'rename': 'Growing Media',
          'note': 'Merge and fix singular/plural'},
    380: {'absorb': [1373, 1374], 'rename': 'Water & Filtration',
          'note': 'Consolidate water categories'},
    586: {'absorb': [1420, 1422, 1434, 293], 'rename': 'Environmental Control',
          'note': 'Flatten tiny sub-cats into parent'},
    394: {'absorb': [1436, 1437], 'rename': 'Harvesting & Processing',
          'note': 'Consolidate harvesting/drying'},
    393: {'absorb': [378], 'rename': 'Air & Filtration',
          'note': 'Merge air categories'},
    1378: {'absorb': [1391, 379, 388], 'rename': 'Irrigation & Watering',
           'note': 'Consolidate water/pump/fitting cats'},
    381: {'absorb': [1404, 452], 'rename': 'Meters & Monitoring',
          'note': 'Consolidate meter categories'},
    412: {'absorb': [371], 'rename': 'Grow Tents & Room Setup',
          'note': 'Merge tent + room setup'},
}

# Phase 3: Brand-as-category dissolution
BRAND_CATS = {
    686: {'brand': 'Philips', 'move_to': 1385, 'note': 'Philips -> Grow Lights'},
    687: {'brand': 'Philips', 'move_to': 1385, 'note': 'Bulbs -> Grow Lights'},
    689: {'brand': 'Plantmax', 'move_to': 1385, 'note': 'Plantmax -> Grow Lights'},
    688: {'brand': 'Philips', 'move_to': 1385, 'note': 'Philips sub -> Grow Lights'},
    704: {'brand': 'AC Infinity', 'move_to': 586, 'note': 'AC Infinity -> Environmental'},
    723: {'brand': 'bio365', 'move_to': 352, 'note': 'bio365 -> Growing Media'},
    433: {'brand': 'Terpinator', 'move_to': 332, 'note': 'Terpinator -> Nutrients'},
    258: {'brand': 'Hygrozyme', 'move_to': 332, 'note': 'HYGROZYME -> Nutrients'},
    142: {'brand': 'Humboldt Nutrients', 'move_to': 332, 'note': 'Humboldt -> Nutrients'},
}

# Phase 4: Reparent orphaned sub-cats
REPARENT = {
    359: 1385,  # Reflectors -> under Grow Lights
    421: 1385,  # 315 CMH Ballast -> under Grow Lights
    386: 1385,  # Light Movers -> under Grow Lights
    685: 332,   # Plant Enhancements -> under Nutrients
}


def build_php(dry_run=True):
    """Generate the PHP cleanup script as a string."""
    mode = 'DRY RUN' if dry_run else 'LIVE'
    dry_val = 'true' if dry_run else 'false'

    p = []
    p.append('<?php')
    p.append('// H-Moon Hydro Category Cleanup - ' + mode)
    p.append('// Generated: ' + time.strftime("%Y-%m-%d %H:%M"))
    p.append('')
    p.append('wp_set_current_user(1);')
    p.append('$dry = ' + dry_val + ';')
    p.append('$log = [];')
    p.append('$errors = [];')
    p.append('$stats = ["deleted" => 0, "merged" => 0, "moved" => 0, "reparented" => 0, "brands_set" => 0];')
    p.append('')
    p.append('function logmsg($msg) {')
    p.append('    global $log; $log[] = $msg; echo $msg . "\\n";')
    p.append('}')

    # PHASE 1
    p.append('')
    p.append('logmsg("=== PHASE 1: DELETE EMPTY CATEGORIES ===");')
    p.append('$empty_ids = ' + json.dumps(EMPTY_DELETE_IDS) + ';')
    p.append('')
    p.append('foreach ($empty_ids as $tid) {')
    p.append('    $term = get_term($tid, \'product_cat\');')
    p.append('    if (!$term || is_wp_error($term)) {')
    p.append('        logmsg("  SKIP: term $tid not found");')
    p.append('        continue;')
    p.append('    }')
    p.append('    if ($term->count > 0) {')
    p.append('        logmsg("  SKIP: $tid has {$term->count} products");')
    p.append('        continue;')
    p.append('    }')
    p.append('    if ($dry) {')
    p.append('        logmsg("  [DRY] Would delete: $tid \\"{$term->name}\\"");')
    p.append('    } else {')
    p.append('        $r = wp_delete_term($tid, \'product_cat\');')
    p.append('        if (is_wp_error($r)) {')
    p.append('            $errors[] = "Delete $tid: " . $r->get_error_message();')
    p.append('        } else {')
    p.append('            logmsg("  DELETED: $tid \\"{$term->name}\\"");')
    p.append('            $stats["deleted"]++;')
    p.append('        }')
    p.append('    }')
    p.append('}')

    # PHASE 2
    p.append('')
    p.append('logmsg("=== PHASE 2: MERGE REDUNDANT CATEGORIES ===");')

    for keep_id, info in MERGE_MAP.items():
        p.append('')
        p.append('// ' + info['note'])
        p.append('$keep_id = ' + str(keep_id) + ';')
        p.append('$absorb_ids = ' + json.dumps(info['absorb']) + ';')
        p.append('$new_name = "' + info.get('rename', '') + '";')
        p.append('')
        p.append('$keep_term = get_term($keep_id, \'product_cat\');')
        p.append('if ($keep_term && !is_wp_error($keep_term)) {')
        p.append('    foreach ($absorb_ids as $abs_id) {')
        p.append('        $abs_term = get_term($abs_id, \'product_cat\');')
        p.append('        if (!$abs_term || is_wp_error($abs_term)) {')
        p.append('            logmsg("  SKIP merge: source $abs_id not found");')
        p.append('            continue;')
        p.append('        }')
        p.append('        $products = get_posts(array(')
        p.append('            \'post_type\' => \'product\',')
        p.append('            \'numberposts\' => -1,')
        p.append('            \'fields\' => \'ids\',')
        p.append('            \'tax_query\' => array(array(')
        p.append('                \'taxonomy\' => \'product_cat\',')
        p.append('                \'field\' => \'term_id\',')
        p.append('                \'terms\' => $abs_id,')
        p.append('            )),')
        p.append('        ));')
        p.append('        $count = count($products);')
        p.append('        logmsg("  Merge $abs_id \\"{$abs_term->name}\\" ($count) -> $keep_id \\"{$keep_term->name}\\"");')
        p.append('        if (!$dry) {')
        p.append('            foreach ($products as $pid) {')
        p.append('                wp_set_object_terms($pid, $keep_id, \'product_cat\', true);')
        p.append('                wp_remove_object_terms($pid, $abs_id, \'product_cat\');')
        p.append('                $stats["moved"]++;')
        p.append('            }')
        p.append('            wp_delete_term($abs_id, \'product_cat\');')
        p.append('            $stats["merged"]++;')
        p.append('            logmsg("    -> Moved $count products, deleted cat $abs_id");')
        p.append('        }')
        p.append('    }')
        p.append('    if ($new_name && $keep_term->name !== $new_name) {')
        p.append('        if ($dry) {')
        p.append('            logmsg("  [DRY] Would rename $keep_id -> \\"$new_name\\"");')
        p.append('        } else {')
        p.append('            wp_update_term($keep_id, \'product_cat\', array(\'name\' => $new_name));')
        p.append('            logmsg("  RENAMED $keep_id -> \\"$new_name\\"");')
        p.append('        }')
        p.append('    }')
        p.append('} else {')
        p.append('    logmsg("  ERROR: target $keep_id not found!");')
        p.append('    $errors[] = "Target ' + str(keep_id) + ' not found";')
        p.append('}')

    # PHASE 3
    p.append('')
    p.append('logmsg("=== PHASE 3: DISSOLVE BRAND CATEGORIES ===");')

    for cat_id, info in BRAND_CATS.items():
        p.append('')
        p.append('// ' + info['note'])
        p.append('$brand_cat_id = ' + str(cat_id) + ';')
        p.append('$brand_name = "' + info['brand'] + '";')
        p.append('$move_to_id = ' + str(info['move_to']) + ';')
        p.append('')
        p.append('$brand_cat = get_term($brand_cat_id, \'product_cat\');')
        p.append('$target_cat = get_term($move_to_id, \'product_cat\');')
        p.append('if ($brand_cat && !is_wp_error($brand_cat) && $target_cat && !is_wp_error($target_cat)) {')
        p.append('    $products = get_posts(array(')
        p.append('        \'post_type\' => \'product\',')
        p.append('        \'numberposts\' => -1,')
        p.append('        \'fields\' => \'ids\',')
        p.append('        \'tax_query\' => array(array(')
        p.append('            \'taxonomy\' => \'product_cat\',')
        p.append('            \'field\' => \'term_id\',')
        p.append('            \'terms\' => $brand_cat_id,')
        p.append('        )),')
        p.append('    ));')
        p.append('    $count = count($products);')
        p.append('    logmsg("  Brand $brand_cat_id \\"{$brand_cat->name}\\" ($count) -> cat $move_to_id + brand \\"$brand_name\\"");')
        p.append('    if (!$dry) {')
        p.append('        $bt = get_term_by(\'name\', $brand_name, \'pwb-brand\');')
        p.append('        if (!$bt) {')
        p.append('            $r = wp_insert_term($brand_name, \'pwb-brand\');')
        p.append('            if (!is_wp_error($r)) logmsg("    Created brand: \\"$brand_name\\"");')
        p.append('        }')
        p.append('        foreach ($products as $pid) {')
        p.append('            wp_set_object_terms($pid, $move_to_id, \'product_cat\', true);')
        p.append('            wp_remove_object_terms($pid, $brand_cat_id, \'product_cat\');')
        p.append('            wp_set_object_terms($pid, $brand_name, \'pwb-brand\', false);')
        p.append('            $stats["moved"]++;')
        p.append('            $stats["brands_set"]++;')
        p.append('        }')
        p.append('        wp_delete_term($brand_cat_id, \'product_cat\');')
        p.append('        $stats["merged"]++;')
        p.append('        logmsg("    -> Moved $count, set brand, deleted cat $brand_cat_id");')
        p.append('    }')
        p.append('} else {')
        p.append('    logmsg("  SKIP: cat $brand_cat_id or target $move_to_id not found");')
        p.append('}')

    # PHASE 4
    p.append('')
    p.append('logmsg("=== PHASE 4: REPARENT SUB-CATEGORIES ===");')

    for child_id, parent_id in REPARENT.items():
        p.append('$child = get_term(' + str(child_id) + ', "product_cat");')
        p.append('$np = get_term(' + str(parent_id) + ', "product_cat");')
        p.append('if ($child && !is_wp_error($child) && $np && !is_wp_error($np)) {')
        p.append('    logmsg("  Reparent ' + str(child_id) + ' -> under ' + str(parent_id) + '");')
        p.append('    if (!$dry) {')
        p.append('        wp_update_term(' + str(child_id) + ', "product_cat", array("parent" => ' + str(parent_id) + '));')
        p.append('        $stats["reparented"]++;')
        p.append('    }')
        p.append('}')
        p.append('')

    # SUMMARY
    p.append('logmsg("=== SUMMARY ===");')
    p.append('$mode_str = $dry ? "DRY RUN" : "LIVE";')
    p.append('logmsg("Mode: $mode_str");')
    p.append('')
    p.append('if (!$dry) {')
    p.append('    $terms = get_terms(array(\'taxonomy\' => \'product_cat\', \'hide_empty\' => false));')
    p.append('    logmsg("Categories remaining: " . count($terms));')
    p.append('    logmsg("Deleted: " . $stats["deleted"]);')
    p.append('    logmsg("Merged: " . $stats["merged"]);')
    p.append('    logmsg("Products moved: " . $stats["moved"]);')
    p.append('    logmsg("Reparented: " . $stats["reparented"]);')
    p.append('    logmsg("Brands set: " . $stats["brands_set"]);')
    p.append('    delete_transient(\'wc_term_counts\');')
    p.append('    wp_cache_flush();')
    p.append('} else {')
    p.append('    $all = get_terms(array(\'taxonomy\' => \'product_cat\', \'hide_empty\' => false));')
    p.append('    logmsg("Current categories: " . count($all));')
    p.append('    logmsg("(No changes made - dry run)");')
    p.append('}')
    p.append('')
    p.append('if (!empty($errors)) {')
    p.append('    logmsg("ERRORS:");')
    p.append('    foreach ($errors as $e) logmsg("  ! $e");')
    p.append('}')
    p.append('logmsg("Done.");')

    return '\n'.join(p)


def run():
    import paramiko

    if not SSH_HOST or not SSH_USER or not SSH_PASS:
        raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

    dry_run = not CONFIRM
    mode = 'DRY RUN' if dry_run else 'LIVE'

    print('=== Category Cleanup: ' + mode + ' ===')
    print('Phase 1: Delete ' + str(len(EMPTY_DELETE_IDS)) + ' empty categories')
    merge_count = sum(len(v['absorb']) for v in MERGE_MAP.values())
    print('Phase 2: Merge ' + str(merge_count) + ' cats into ' + str(len(MERGE_MAP)) + ' targets')
    print('Phase 3: Dissolve ' + str(len(BRAND_CATS)) + ' brand-as-category entries')
    print('Phase 4: Reparent ' + str(len(REPARENT)) + ' sub-categories')
    print()

    php_code = build_php(dry_run)

    # Save PHP locally
    php_path = os.path.join(BASE, 'outputs', 'category_cleanup.php')
    os.makedirs(os.path.dirname(php_path), exist_ok=True)
    with open(php_path, 'w', encoding='utf-8') as f:
        f.write(php_code)
    print('PHP saved: ' + php_path)

    # Connect
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

    remote_php = SITE_DIR + '/wp-content/category_cleanup.php'

    # Upload
    sftp = ssh.open_sftp()
    with sftp.open(remote_php, 'w') as f:
        f.write(php_code)
    sftp.close()
    print('Uploaded: ' + remote_php)

    # Execute
    print('\nExecuting (' + mode + ')...\n')
    cmd = 'cd ' + SITE_DIR + ' && wp eval-file wp-content/category_cleanup.php'
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)

    output = stdout.read().decode('utf-8', errors='replace')
    errors = stderr.read().decode('utf-8', errors='replace')

    # Safe print
    for line in output.split('\n'):
        print(line.encode('ascii', errors='replace').decode('ascii'))

    if errors:
        for line in errors.strip().split('\n'):
            if 'Warning' not in line and 'Notice' not in line and 'Deprecated' not in line:
                safe = line.encode('ascii', errors='replace').decode('ascii')
                print('STDERR: ' + safe)

    # Cleanup remote file
    ssh.exec_command('rm ' + remote_php)
    ssh.close()

    # Save output
    slug = mode.lower().replace(' ', '_')
    out_path = os.path.join(BASE, 'outputs', 'category_cleanup_' + slug + '_output.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(output)
    print('\nOutput saved: ' + out_path)


if __name__ == '__main__':
    run()
