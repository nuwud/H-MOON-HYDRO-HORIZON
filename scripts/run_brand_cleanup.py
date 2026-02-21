"""Upload and run brand_cleanup.php on WooCommerce server."""
import paramiko
import sys
import os

HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
REMOTE_DIR = f"{SITE_DIR}/wp-content"

local_php = os.path.join(os.path.dirname(__file__), "..", "outputs", "brand_cleanup.php")

if not HOST or not USER or not PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Upload PHP
sftp = ssh.open_sftp()
sftp.put(local_php, f"{REMOTE_DIR}/brand_cleanup.php")
sftp.close()
print("Uploaded brand_cleanup.php")

# Run
cmd = f"cd {SITE_DIR} && wp eval-file wp-content/brand_cleanup.php"
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")

print(out)
if err:
    print("STDERR:", err)

# Save output
outpath = os.path.join(os.path.dirname(__file__), "..", "outputs", "brand_cleanup_output.txt")
with open(outpath, "w", encoding="utf-8") as f:
    f.write(out)
    if err:
        f.write("\nSTDERR:\n" + err)

ssh.close()
print(f"\nOutput saved to {outpath}")
