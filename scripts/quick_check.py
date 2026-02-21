"""Quick check of product counts on server."""
import os
import paramiko

SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

if not SSH_HOST or not SSH_USER or not SSH_PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

# Simple count query - no heavy PHP
stdin, stdout, stderr = ssh.exec_command(
    f'cd {SITE_DIR} && wp post list --post_type=product --post_status=publish --format=count',
    timeout=60
)
count = stdout.read().decode().strip()
errors = stderr.read().decode().strip()
print(f"Products: {count}")
if errors:
    print(f"Stderr: {errors[:200]}")

# Quick brand count
stdin, stdout, stderr = ssh.exec_command(
    f'cd {SITE_DIR} && wp term list pwb-brand --format=count',
    timeout=60
)
brand_count = stdout.read().decode().strip()
print(f"Brand terms: {brand_count}")

# Check if any wp-cron or background process is running
stdin, stdout, stderr = ssh.exec_command(
    'ps aux | grep "[w]p" | head -5',
    timeout=30
)
procs = stdout.read().decode().strip()
if procs:
    print(f"\nRunning WP processes:\n{procs}")
else:
    print("\nNo WP processes running")

ssh.close()
