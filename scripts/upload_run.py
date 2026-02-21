import sys
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
ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS)

local_file = sys.argv[1] if len(sys.argv) > 1 else 'outputs/test_tax.php'
remote_name = local_file.split('/')[-1].split('\\')[-1]
remote_path = f'{SITE_DIR}/wp-content/{remote_name}'

sftp = ssh.open_sftp()
sftp.put(local_file, remote_path)
sftp.close()
print(f'Uploaded {remote_name}')

stdin, stdout, stderr = ssh.exec_command(
    f'cd {SITE_DIR} && wp eval-file wp-content/{remote_name}',
    timeout=600
)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err:
    print('STDERR:', err[:1000])
ssh.close()
