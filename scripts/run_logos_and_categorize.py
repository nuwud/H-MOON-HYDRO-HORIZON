"""Upload and run brand_logo_assign.php + auto_categorize.php sequentially."""
import paramiko, os, sys

HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE_DIR = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')
REMOTE_DIR = f"{SITE_DIR}/wp-content"
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if not HOST or not USER or not PASS:
    raise SystemExit('Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

scripts = ["brand_logo_assign.php", "auto_categorize.php"]

for script in scripts:
    local = os.path.join(BASE, "outputs", script)
    remote = f"{REMOTE_DIR}/{script}"
    
    sftp.put(local, remote)
    print(f"Uploaded {script}")
    
    cmd = f"cd {SITE_DIR} && wp eval-file wp-content/{script}"
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    
    print(out)
    if err:
        print("STDERR:", err)
    
    # Save output
    outpath = os.path.join(BASE, "outputs", script.replace(".php", "_output.txt"))
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(out)
        if err:
            f.write("\nSTDERR:\n" + err)
    print(f"Saved to {outpath}\n{'='*60}\n")

sftp.close()
ssh.close()
