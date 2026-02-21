"""Upload and run fix_seeds.php."""
import paramiko, os

HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if not HOST or not USER or not PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

sftp = ssh.open_sftp()
sftp.put(os.path.join(BASE, "outputs", "fix_seeds.php"),
         f"{SITE_DIR}/wp-content/fix_seeds.php")
sftp.close()
print("Uploaded fix_seeds.php")

stdin, stdout, stderr = ssh.exec_command(
    f"cd {SITE_DIR} && wp eval-file wp-content/fix_seeds.php",
    timeout=120)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")

print(out)
if err:
    print("STDERR:", err)

outpath = os.path.join(BASE, "outputs", "fix_seeds_output.txt")
with open(outpath, "w", encoding="utf-8") as f:
    f.write(out)
    if err:
        f.write("\nSTDERR:\n" + err)

ssh.close()
print(f"\nSaved to {outpath}")
