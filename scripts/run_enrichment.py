#!/usr/bin/env python3
"""
run_enrichment.py — Upload enrichment data + PHP script to server and run
"""
import json
import sys
import os
from pathlib import Path
import paramiko

WORKSPACE = Path(__file__).parent.parent
HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
REMOTE_SCRIPT = f'{SITE_DIR}/wp-content/run_script.php'
REMOTE_JSON = f'{SITE_DIR}/wp-content/enrichment_to_apply.json'

confirm = '--confirm' in sys.argv

print(f"Mode: {'LIVE' if confirm else 'DRY RUN'}")

if not HOST or not USER or not PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Upload JSON data
sftp = ssh.open_sftp()
json_local = str(WORKSPACE / "outputs" / "scraped" / "enrichment_to_apply.json")
print(f"Uploading enrichment data ({Path(json_local).stat().st_size / 1024:.0f} KB)...")
sftp.put(json_local, REMOTE_JSON)

# Upload PHP script
php_local = str(WORKSPACE / "scripts" / "apply_enrichment.php")
sftp.put(php_local, REMOTE_SCRIPT)
sftp.close()

# Run it
cmd = f'cd {SITE_DIR} && '
if confirm:
    cmd += f'CONFIRM=1 '
cmd += f'wp eval-file {REMOTE_SCRIPT}'

print(f"Running on server...")
_, stdout, stderr = ssh.exec_command(cmd, timeout=600)  # 10 min timeout for image downloads
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
if err:
    print(err)
print(out)

# Cleanup
try:
    sftp2 = ssh.open_sftp()
    sftp2.remove(REMOTE_JSON)
    sftp2.close()
except:
    pass

ssh.close()
