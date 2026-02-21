#!/usr/bin/env python3
"""
apply_grouped_wave_by_sku.py — Apply grouped-product child relationships by SKU via SSH + WP-CLI

Usage:
    python scripts/apply_grouped_wave_by_sku.py
    python scripts/apply_grouped_wave_by_sku.py --csv outputs/woo_grouping_waves/grouping_wave_air_filtration_20260221_164842.csv --label air_filtration_wave1
    python scripts/apply_grouped_wave_by_sku.py --confirm
"""

import argparse
import json
import os
import re
import shlex
import sys
from datetime import datetime
from pathlib import Path

import paramiko

WORKSPACE = Path(__file__).parent.parent


def load_env_file(env_path: Path) -> None:
    """Load KEY=VALUE pairs from a .env file into process env if unset."""
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(WORKSPACE / '.env')

HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Apply grouped-product child relationships by SKU')
    parser.add_argument(
        '--csv',
        default=str(
            WORKSPACE
            / 'outputs'
            / 'woo_grouping_waves'
            / 'grouping_wave_air_filtration_20260221_164842.csv'
        ),
        help='Local grouping wave CSV path (columns: SKU, Grouped products, optional ID)',
    )
    parser.add_argument(
        '--label',
        default='',
        help='Optional short label appended to remote filenames (e.g. air_filtration_wave1)',
    )
    parser.add_argument(
        '--confirm',
        action='store_true',
        help='Actually update _children + grouped product_type. Without this flag, runs dry-run only.',
    )
    return parser.parse_args()


def sanitize_label(value: str) -> str:
    value = value.strip().replace(' ', '_')
    value = re.sub(r'[^A-Za-z0-9._-]+', '_', value)
    return value.strip('_')


def looks_like_windows_path(value: str) -> bool:
    return bool(re.match(r'^[A-Za-z]:[\\/]', value or ''))


def require_non_placeholder_env(host: str, user: str, password: str, site_dir: str) -> None:
    placeholder_tokens = (
        'example.com',
        'your-ssh-host',
        'your-ssh-user',
        'your-ssh-pass',
        'changeme',
    )

    if any(token in (host or '').lower() for token in placeholder_tokens):
        raise SystemExit('HMOON_SSH_HOST appears to be a placeholder in .env. Set a real server host before running.')
    if any(token in (user or '').lower() for token in placeholder_tokens):
        raise SystemExit('HMOON_SSH_USER appears to be a placeholder in .env. Set a real SSH username before running.')
    if any(token in (password or '').lower() for token in placeholder_tokens):
        raise SystemExit('HMOON_SSH_PASS appears to be a placeholder in .env. Set a real SSH password before running.')
    if any(token in (site_dir or '').lower() for token in placeholder_tokens):
        raise SystemExit('HMOON_SITE_DIR appears to be a placeholder in .env. Set a real remote site path before running.')


def q(value: str) -> str:
    """Shell-quote helper for remote commands."""
    return shlex.quote(value)


def run_cmd(ssh: paramiko.SSHClient, cmd: str, timeout: int = 300) -> tuple[int, str, str]:
    """Run a command on remote host and return (exit_code, stdout, stderr)."""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err


def resolve_site_dir(ssh: paramiko.SSHClient, site_dir: str) -> str:
    """Resolve remote ~ prefix to absolute home path for SFTP compatibility."""
    if not site_dir.startswith('~'):
        return site_dir

    code, out, err = run_cmd(ssh, 'printf "%s" "$HOME"', timeout=30)
    if code != 0 or not out.strip():
        raise RuntimeError(f'Unable to resolve remote home directory for SITE_DIR. stderr={err.strip()}')
    return site_dir.replace('~', out.strip(), 1)


def build_remote_php_script() -> str:
    """Create remote PHP script that applies grouped children by SKU."""
    return r'''<?php
/**
 * Apply grouped children by parent SKU from CSV.
 *
 * Args:
 *   argv[1] = absolute CSV path
 *   argv[2] = mode: dry-run | confirm
 */

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Must run via WP-CLI eval-file.\n");
    exit(1);
}

$positional_args = array();
if (isset($args) && is_array($args) && !empty($args)) {
    $positional_args = array_values($args);
} elseif (isset($argv) && is_array($argv)) {
    // For eval-file, argv[0] is script path; positional args start at index 1.
    $positional_args = array_slice($argv, 1);
}

if (!empty($positional_args) && $positional_args[0] === '--') {
    $positional_args = array_slice($positional_args, 1);
}

$csv_path = isset($positional_args[0]) ? trim((string)$positional_args[0]) : '';
$mode = isset($positional_args[1]) ? strtolower(trim((string)$positional_args[1])) : 'dry-run';
$confirm = ($mode === 'confirm');

if ($csv_path === '') {
    fwrite(STDERR, "Missing CSV path argument.\n");
    exit(1);
}
if (!file_exists($csv_path)) {
    fwrite(STDERR, "CSV file not found: {$csv_path}\n");
    exit(1);
}

function normalize_header($value) {
    return strtolower(trim((string)$value));
}

function find_product_id_by_sku($sku) {
    global $wpdb;
    $sku = trim((string)$sku);
    if ($sku === '') {
        return 0;
    }

    $sql = "
        SELECT p.ID
        FROM {$wpdb->posts} p
        INNER JOIN {$wpdb->postmeta} pm
            ON pm.post_id = p.ID
           AND pm.meta_key = '_sku'
        WHERE pm.meta_value = %s
          AND p.post_type = 'product'
          AND p.post_status NOT IN ('trash', 'auto-draft')
        ORDER BY p.ID ASC
        LIMIT 1
    ";

    $result = $wpdb->get_var($wpdb->prepare($sql, $sku));
    return $result ? (int)$result : 0;
}

function find_product_id_by_id($id) {
    global $wpdb;
    $id = (int)$id;
    if ($id <= 0) {
        return 0;
    }

    $sql = "
        SELECT p.ID
        FROM {$wpdb->posts} p
        WHERE p.ID = %d
          AND p.post_type = 'product'
          AND p.post_status NOT IN ('trash', 'auto-draft')
        LIMIT 1
    ";

    $result = $wpdb->get_var($wpdb->prepare($sql, $id));
    return $result ? (int)$result : 0;
}

function parse_child_skus($raw) {
    $raw = trim((string)$raw);
    if ($raw === '') {
        return array();
    }
    $parts = array_map('trim', explode(',', $raw));
    $parts = array_filter($parts, function ($v) {
        return $v !== '';
    });
    return array_values(array_unique($parts));
}

function normalize_id_list($value) {
    if (empty($value)) {
        return array();
    }
    if (!is_array($value)) {
        $value = (array)$value;
    }
    $ids = array_map('intval', $value);
    $ids = array_values(array_filter($ids, function ($v) {
        return $v > 0;
    }));
    return $ids;
}

$summary = array(
    'mode' => $confirm ? 'confirm' : 'dry-run',
    'rows_processed' => 0,
    'parents_matched' => 0,
    'parents_missing' => 0,
    'child_refs_resolved' => 0,
    'child_refs_missing' => 0,
    'parents_changed' => 0,
);

$fh = fopen($csv_path, 'r');
if ($fh === false) {
    fwrite(STDERR, "Unable to open CSV: {$csv_path}\n");
    exit(1);
}

$headers = fgetcsv($fh);
if ($headers === false) {
    fclose($fh);
    fwrite(STDERR, "CSV is empty: {$csv_path}\n");
    exit(1);
}

$header_map = array();
foreach ($headers as $idx => $name) {
    $header_map[normalize_header($name)] = $idx;
}

if (!array_key_exists('sku', $header_map)) {
    fclose($fh);
    fwrite(STDERR, "CSV missing required header: SKU\n");
    exit(1);
}
if (!array_key_exists('grouped products', $header_map)) {
    fclose($fh);
    fwrite(STDERR, "CSV missing required header: Grouped products\n");
    exit(1);
}

$idx_sku = $header_map['sku'];
$idx_grouped = $header_map['grouped products'];
$idx_id = array_key_exists('id', $header_map) ? $header_map['id'] : null;

$row_num = 1; // header row
while (($row = fgetcsv($fh)) !== false) {
    $row_num++;
    $summary['rows_processed']++;

    $parent_sku = isset($row[$idx_sku]) ? trim((string)$row[$idx_sku]) : '';
    $children_raw = isset($row[$idx_grouped]) ? (string)$row[$idx_grouped] : '';
    $csv_id = ($idx_id !== null && isset($row[$idx_id])) ? trim((string)$row[$idx_id]) : '';

    if ($parent_sku === '') {
        $summary['parents_missing']++;
        echo "[ROW {$row_num}] Parent SKU empty; skipping.\n";
        continue;
    }

    $parent_match = 'sku';
    $parent_id = find_product_id_by_sku($parent_sku);
    if ($parent_id <= 0 && $csv_id !== '' && ctype_digit($csv_id)) {
        $parent_id = find_product_id_by_id((int)$csv_id);
        if ($parent_id > 0) {
            $parent_match = 'id_fallback';
        }
    }

    if ($parent_id <= 0) {
        $summary['parents_missing']++;
        echo "[ROW {$row_num}] Parent SKU not found: {$parent_sku}\n";
        continue;
    }

    $summary['parents_matched']++;

    $before_children = normalize_id_list(get_post_meta($parent_id, '_children', true));

    $child_skus = parse_child_skus($children_raw);
    $resolved_child_ids = array();
    $missing_child_skus = array();

    foreach ($child_skus as $child_sku) {
        $child_id = find_product_id_by_sku($child_sku);
        if ($child_id > 0) {
            $resolved_child_ids[] = $child_id;
            $summary['child_refs_resolved']++;
        } else {
            $missing_child_skus[] = $child_sku;
            $summary['child_refs_missing']++;
        }
    }

    $resolved_child_ids = array_values(array_unique(array_map('intval', $resolved_child_ids)));

    $would_change = ($before_children !== $resolved_child_ids);

    if ($confirm) {
        if ($would_change) {
            update_post_meta($parent_id, '_children', $resolved_child_ids);
            $summary['parents_changed']++;
        }

        $terms = wp_get_object_terms($parent_id, 'product_type', array('fields' => 'slugs'));
        if (!is_wp_error($terms) && !in_array('grouped', $terms, true)) {
            wp_set_object_terms($parent_id, 'grouped', 'product_type', true);
        }
    }

    $after_children = $confirm
        ? normalize_id_list(get_post_meta($parent_id, '_children', true))
        : $resolved_child_ids;

    $before_count = count($before_children);
    $after_count = count($after_children);

    $status = $confirm ? ($would_change ? 'UPDATED' : 'UNCHANGED') : ($would_change ? 'WOULD_UPDATE' : 'NO_CHANGE');

    $line = "[ROW {$row_num}] {$status} parent_sku={$parent_sku} parent_id={$parent_id} parent_match={$parent_match}";
    $line .= " before_children={$before_count} after_children={$after_count}";
    $line .= " child_missing=" . count($missing_child_skus);

    if ($csv_id !== '' && ctype_digit($csv_id) && (int)$csv_id !== $parent_id) {
        $line .= " csv_id={$csv_id} csv_id_mismatch=1";
    }

    echo $line . "\n";

    if (!empty($missing_child_skus)) {
        echo "  Missing child SKUs: " . implode(', ', $missing_child_skus) . "\n";
    }
}

fclose($fh);

echo "\n=== GROUPED WAVE SUMMARY ===\n";
echo "Mode: " . $summary['mode'] . "\n";
echo "Rows processed: " . $summary['rows_processed'] . "\n";
echo "Parents matched: " . $summary['parents_matched'] . "\n";
echo "Parents missing: " . $summary['parents_missing'] . "\n";
echo "Child refs resolved: " . $summary['child_refs_resolved'] . "\n";
echo "Child refs missing: " . $summary['child_refs_missing'] . "\n";
echo "Parents changed: " . $summary['parents_changed'] . "\n";

echo "SUMMARY_JSON " . wp_json_encode($summary) . "\n";
'''


def main() -> int:
    args = parse_args()
    confirm = args.confirm
    label = sanitize_label(args.label)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    local_csv = Path(args.csv).resolve()
    if not local_csv.exists():
        raise SystemExit(f'CSV file not found: {local_csv}')

    if not HOST or not USER or not PASS:
        raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

    site_dir = (SITE_DIR or '').strip() or '~/hmoonhydro.com'
    require_non_placeholder_env(HOST, USER, PASS, site_dir)

    if looks_like_windows_path(site_dir):
        print(f"⚠️  HMOON_SITE_DIR looks like a local Windows path ({site_dir}). Falling back to '~/hmoonhydro.com'.")
        site_dir = '~/hmoonhydro.com'

    remote_stub = f'grouped_wave_{label}_{timestamp}' if label else f'grouped_wave_{timestamp}'

    print('=' * 72)
    print('APPLY GROUPED WAVE BY SKU')
    print('=' * 72)
    print(f"Mode: {'CONFIRM (writes enabled)' if confirm else 'DRY RUN (no writes)'}")
    print(f'CSV: {local_csv}')
    if label:
        print(f'Label: {label}')
    print(f'Target host: {HOST}')
    print('')

    print('[1/7] Connecting to server...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    except Exception as exc:
        print(f'❌ SSH connection failed: {exc}')
        return 1

    print('  ✓ Connected')

    try:
        resolved_site_dir = resolve_site_dir(ssh, site_dir)
    except Exception as exc:
        print(f'❌ Failed to resolve HMOON_SITE_DIR: {exc}')
        ssh.close()
        return 1

    wp_config_path = f'{resolved_site_dir}/wp-config.php'
    code, out, err = run_cmd(ssh, f'test -f {q(wp_config_path)} && echo OK || echo MISSING', timeout=30)
    if 'OK' not in out:
        home_code, home_out, home_err = run_cmd(ssh, 'printf "%s" "$HOME"', timeout=30)
        candidate_site_dir = ''
        if home_code == 0 and home_out.strip():
            candidate_site_dir = f"{home_out.strip()}/hmoonhydro.com"
            candidate_wp_config = f'{candidate_site_dir}/wp-config.php'
            c_code, c_out, c_err = run_cmd(ssh, f'test -f {q(candidate_wp_config)} && echo OK || echo MISSING', timeout=30)
            if 'OK' in c_out:
                print(f"⚠️  HMOON_SITE_DIR did not contain a WordPress install. Auto-correcting to: {candidate_site_dir}")
                resolved_site_dir = candidate_site_dir

    wp_config_path = f'{resolved_site_dir}/wp-config.php'
    code, out, err = run_cmd(ssh, f'test -f {q(wp_config_path)} && echo OK || echo MISSING', timeout=30)
    if 'OK' not in out:
        print('❌ Could not locate wp-config.php under resolved site directory.')
        print(f'  Checked: {resolved_site_dir}')
        print('  Update HMOON_SITE_DIR in .env to your remote WordPress root (e.g. ~/hmoonhydro.com).')
        ssh.close()
        return 1

    backup_dir = f'{resolved_site_dir}/wp-content/backups'
    remote_csv = f'{resolved_site_dir}/wp-content/{remote_stub}.csv'
    remote_php = f'{resolved_site_dir}/wp-content/{remote_stub}.php'
    backup_label_suffix = f'_{label}' if label else ''
    db_backup_file = f'{backup_dir}/grouped_wave_backup_{timestamp}{backup_label_suffix}.sql'

    print(f'[2/7] Resolved site dir: {resolved_site_dir}')

    print('[3/7] Creating backup directory...')
    code, out, err = run_cmd(ssh, f'mkdir -p {q(backup_dir)}', timeout=60)
    if code != 0:
        print('❌ Failed to create backup directory')
        if out.strip():
            print(out.strip())
        if err.strip():
            print(err.strip())
        ssh.close()
        return 1
    print('  ✓ Backup directory ready')

    print('[4/7] Creating DB backup before grouped update...')
    backup_cmd = (
        f'cd {q(resolved_site_dir)} && '
        f'wp db export {q(db_backup_file)} '
        '--tables=wp_posts,wp_postmeta,wp_term_relationships,wp_term_taxonomy --porcelain'
    )
    code, out, err = run_cmd(ssh, backup_cmd, timeout=180)
    if code != 0:
        print('  ⚠️ Targeted table backup failed; trying full DB backup...')
        fallback_backup = f'{backup_dir}/grouped_wave_backup_full_{timestamp}{backup_label_suffix}.sql'
        fallback_cmd = f'cd {q(resolved_site_dir)} && wp db export {q(fallback_backup)} --porcelain'
        code2, out2, err2 = run_cmd(ssh, fallback_cmd, timeout=180)
        if code2 != 0:
            print('❌ Database backup failed. Aborting for safety.')
            if out.strip():
                print(out.strip())
            if err.strip():
                print(err.strip())
            if out2.strip():
                print(out2.strip())
            if err2.strip():
                print(err2.strip())
            ssh.close()
            return 1
        db_backup_file = fallback_backup
    print(f'  ✓ DB backup created: {db_backup_file}')

    print('[5/7] Uploading grouped wave CSV + remote runner script...')
    php_script = build_remote_php_script()
    try:
        sftp = ssh.open_sftp()
        sftp.put(str(local_csv), remote_csv)
        with sftp.file(remote_php, 'w') as handle:
            handle.write(php_script)
        sftp.close()
    except Exception as exc:
        print(f'❌ Upload failed: {exc}')
        ssh.close()
        return 1
    print(f'  ✓ CSV uploaded: {remote_csv}')
    print(f'  ✓ PHP runner uploaded: {remote_php}')

    print('[6/7] Running grouped wave apply via wp eval-file...')
    mode = 'confirm' if confirm else 'dry-run'
    apply_cmd = (
        f'cd {q(resolved_site_dir)} && '
        f'wp eval-file {q(remote_php)} -- {q(remote_csv)} {q(mode)}'
    )
    code, out, err = run_cmd(ssh, apply_cmd, timeout=900)

    if out.strip():
        print('\n--- Remote output ---')
        print(out.strip())
    if err.strip():
        print('\n--- Remote errors ---')
        print(err.strip())

    if code != 0:
        print('\n❌ Remote grouped wave execution failed.')
        print(f'Exit code: {code}')
        print('Keeping uploaded files for troubleshooting.')
        ssh.close()
        return 1

    summary = None
    summary_match = re.search(r'^SUMMARY_JSON\s+(\{.*\})\s*$', out, flags=re.MULTILINE)
    if summary_match:
        try:
            summary = json.loads(summary_match.group(1))
        except json.JSONDecodeError:
            summary = None

    print('[7/7] Cleaning up remote PHP runner...')
    run_cmd(ssh, f'rm -f {q(remote_php)}', timeout=30)

    ssh.close()

    print('\n' + '=' * 72)
    print('FINAL SUMMARY')
    print('=' * 72)
    print(f'Mode: {mode}')
    print(f'CSV: {local_csv}')
    print(f'Remote CSV: {remote_csv}')
    print(f'DB backup: {db_backup_file}')

    if summary:
        print(f"Rows processed: {summary.get('rows_processed', 'n/a')}")
        print(f"Parents matched: {summary.get('parents_matched', 'n/a')}")
        print(f"Parents missing: {summary.get('parents_missing', 'n/a')}")
        print(f"Child refs resolved: {summary.get('child_refs_resolved', 'n/a')}")
        print(f"Child refs missing: {summary.get('child_refs_missing', 'n/a')}")
        print(f"Parents changed: {summary.get('parents_changed', 'n/a')}")
    else:
        print('Summary parse: unavailable (remote output did not include SUMMARY_JSON).')

    if confirm:
        print('\n✅ Grouped wave apply complete (confirm mode).')
    else:
        print('\n✅ Dry run complete. Re-run with --confirm to apply _children updates.')

    return 0


if __name__ == '__main__':
    sys.exit(main())
