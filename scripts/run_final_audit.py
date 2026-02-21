"""Upload and run final_audit.php."""
import paramiko
import os

HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
local_php = os.path.join(BASE, "outputs", "final_audit.php")

if not HOST or not USER or not PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

sftp = ssh.open_sftp()
sftp.put(local_php, f"{SITE_DIR}/wp-content/final_audit.php")
sftp.close()
print("Uploaded final_audit.php")

cmd = f"cd {SITE_DIR} && wp eval-file wp-content/final_audit.php"
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")

print(out)
if err:
    print("STDERR:", err)

ssh.close()
