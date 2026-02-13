#!/usr/bin/env python3
"""Delete all WooCommerce products via SSH"""

import paramiko

# Connection details
HOST = 'dp-5ea9eff01a.dreamhostps.com'
USER = 'wp_9dm4yz'
PASS = 'Esh#yzhLT6'
SITE_DIR = '~/hmoonhydro.com'

def run_command(ssh, cmd):
    """Execute command and return output"""
    full_cmd = f"cd {SITE_DIR} && {cmd}"
    stdin, stdout, stderr = ssh.exec_command(full_cmd, timeout=300)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

def main():
    print("Connecting to DreamPress...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    print("Connected!")
    
    # Count products first
    out, _ = run_command(ssh, "wp post list --post_type=product --format=count")
    print(f"Products found: {out}")
    
    out, _ = run_command(ssh, "wp post list --post_type=product_variation --format=count")
    print(f"Variations found: {out}")
    
    # Delete variations first (children before parents)
    print("\nDeleting product variations...")
    out, err = run_command(ssh, "wp post delete $(wp post list --post_type=product_variation --format=ids) --force 2>/dev/null || echo 'No variations to delete'")
    print(out if out else "Variations deleted or none found")
    
    # Delete products
    print("\nDeleting products...")
    out, err = run_command(ssh, "wp post delete $(wp post list --post_type=product --format=ids) --force 2>/dev/null || echo 'No products to delete'")
    print(out if out else "Products deleted or none found")
    
    # Verify deletion
    print("\nVerifying deletion...")
    out, _ = run_command(ssh, "wp post list --post_type=product --format=count")
    print(f"Remaining products: {out}")
    
    out, _ = run_command(ssh, "wp post list --post_type=product_variation --format=count")
    print(f"Remaining variations: {out}")
    
    ssh.close()
    print("\nDone! Ready for fresh import.")

if __name__ == "__main__":
    main()
