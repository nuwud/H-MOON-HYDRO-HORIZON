import os
import sys
import paramiko

script = sys.argv[1] if len(sys.argv) > 1 else 'scripts/full_audit.php'
confirm = '--confirm' in sys.argv

SSH_HOST = os.getenv('HMOON_SSH_HOST')
SSH_USER = os.getenv('HMOON_SSH_USER')
SSH_PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

if not SSH_HOST or not SSH_USER or not SSH_PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

# Upload the PHP file
remote_path = f'{SITE_DIR}/wp-content/run_script.php'
sftp = ssh.open_sftp()
sftp.put(script, remote_path)
sftp.close()

env = 'CONFIRM=1 ' if confirm else ''
cmd = f'cd {SITE_DIR} && {env}wp eval-file wp-content/run_script.php'
print(f"Running: {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=600)
output = stdout.read().decode('utf-8', errors='replace')
errors = stderr.read().decode('utf-8', errors='replace')
print(output)
if errors:
    print('STDERR:', errors[:2000])
ssh.close()
