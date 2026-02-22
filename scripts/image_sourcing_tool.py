#!/usr/bin/env python3
"""
image_sourcing_tool.py

WYSIWYG drag-and-drop image sourcing tool.
Open two browser windows side by side:
  - Left : this tool at http://localhost:5001
  - Right: Google Images (or any image source)

Drag any image from the right window onto a product card on the left.
The server will automatically: download → rename → SFTP → wp media import → assign.

Usage:
  pip install flask paramiko python-dotenv Pillow requests
  python scripts/image_sourcing_tool.py

Options:
  --port 5001        Port to listen on (default: 5001)
  --csv <path>       CSV file with products to source (default: outputs/audit/images_needing_sourcing.csv)
  --all-products     Show ALL products (not just flagged/placeholder ones)
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import logging
import os
import re
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent

try:
    from flask import Flask, jsonify, render_template_string, request, send_from_directory
    from dotenv import load_dotenv
    import paramiko
except ImportError:
    print("Missing dependencies. Run:")
    print("  pip install flask paramiko python-dotenv")
    sys.exit(1)

load_dotenv(WORKSPACE / ".env")

# ── Config ────────────────────────────────────────────────────────────────────
SSH_HOST = os.getenv("HMOON_SSH_HOST", "dp-5ea9eff01a.dreamhostps.com")
SSH_USER = os.getenv("HMOON_SSH_USER", "wp_9dm4yz")
SSH_PASS = os.getenv("HMOON_SSH_PASS", "")
SITE_DIR = "/home/wp_9dm4yz/hmoonhydro.com"

DEFAULT_CSV    = WORKSPACE / "outputs" / "audit" / "images_needing_sourcing.csv"
STATE_FILE     = WORKSPACE / "outputs" / "audit" / "image_sourcing_state.json"
UPLOAD_CACHE   = WORKSPACE / "outputs" / "audit" / "_img_cache"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sourcing_tool")

UPLOAD_CACHE.mkdir(parents=True, exist_ok=True)

# ── Filename → local path index (built on startup for O(1) image serving) ────────────
_THUMB_INDEX: dict[str, Path] = {}

def _build_thumb_index():
    uploads = WORKSPACE / "hmoonhydro.com" / "wp-content" / "uploads"
    if not uploads.exists():
        return
    count = 0
    for p in uploads.rglob("*"):
        if p.is_file():
            _THUMB_INDEX.setdefault(p.name, p)  # first match wins (prefer parent over thumbnails)
            count += 1
    log.info(f"Thumb index: {count} files indexed, {len(_THUMB_INDEX)} unique names")

# ── Thread-safe state ─────────────────────────────────────────────────────────
_state_lock = threading.Lock()
_state: dict[str, dict] = {}   # keyed by sku: {status, attachment_id, applied_url, ts}

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}

def save_state():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(_state, indent=2))

# ── SSH helpers ───────────────────────────────────────────────────────────────
_ssh_pool: list[paramiko.SSHClient] = []
_ssh_lock = threading.Lock()

def get_ssh() -> paramiko.SSHClient:
    with _ssh_lock:
        while _ssh_pool:
            client = _ssh_pool.pop()
            try:
                client.exec_command("echo ok", timeout=5)
                return client
            except Exception:
                pass
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS, timeout=30,
                   banner_timeout=60)
    return client

def release_ssh(client: paramiko.SSHClient):
    with _ssh_lock:
        _ssh_pool.append(client)

def run_remote(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> str:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if err and not out:
        return f"ERR: {err}"
    return out

# ── Image processing ──────────────────────────────────────────────────────────
FAKE_BROWSER = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/121.0.0.0 Safari/537.36"),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}

def download_url(url: str, dest: str) -> tuple[bool, str]:
    """Download image from URL to dest path. Returns (ok, error_msg)."""
    try:
        req = urllib.request.Request(url, headers=FAKE_BROWSER)
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        if len(data) < 500:
            return False, f"Too small ({len(data)} bytes) — probably not an image"
        with open(dest, "wb") as f:
            f.write(data)
        return True, ""
    except Exception as e:
        return False, str(e)

def save_base64_image(data_url: str, dest: str) -> tuple[bool, str]:
    """Decode a data: URL and save to dest."""
    try:
        header, encoded = data_url.split(",", 1)
        data = base64.b64decode(encoded)
        if len(data) < 500:
            return False, f"Decoded image too small ({len(data)} bytes)"
        with open(dest, "wb") as f:
            f.write(data)
        return True, ""
    except Exception as e:
        return False, str(e)

def sftp_upload_and_assign(product_id: str, sku: str, local_file: str,
                            remote_name: str) -> tuple[str, str]:
    """SFTP upload → wp media import → featured image. Returns (status, detail)."""
    remote_tmp = f"/tmp/hmoon_img_{remote_name}"
    ssh = get_ssh()
    try:
        sftp = ssh.open_sftp()
        sftp.put(local_file, remote_tmp)
        sftp.close()

        result = run_remote(
            ssh,
            f"cd {SITE_DIR} && wp media import {remote_tmp} "
            f"--post_id={product_id} --featured_image --porcelain --allow-root 2>&1"
        )
        run_remote(ssh, f"rm -f {remote_tmp}")

        if result.strip().isdigit():
            att_id = result.strip()
            # Flush object cache
            run_remote(ssh, f"cd {SITE_DIR} && wp cache flush --allow-root 2>/dev/null")
            return "OK", att_id
        return "ERROR", result[:300]
    finally:
        release_ssh(ssh)

def extract_url_from_html(html: str) -> str | None:
    """Extract first <img src> URL from drag-transferred HTML."""
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE)
    return m.group(1) if m else None

def safe_filename(product_name: str, sku: str, ext: str) -> str:
    base = sku.lower() if sku else re.sub(r"[^a-z0-9]", "_", product_name.lower())[:40]
    base = re.sub(r"_+", "_", base).strip("_")
    return f"{base}{ext}"

# ── Products loader ───────────────────────────────────────────────────────────
import html as _html

def load_products(csv_path: Path) -> list[dict]:
    products = []
    if not csv_path.exists():
        return products
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Decode HTML entities left over from WooCommerce export (&amp; etc.)
            clean = {k: _html.unescape(v) for k, v in row.items()}
            products.append(clean)
    return products

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB upload limit

PRODUCTS: list[dict] = []
CSV_PATH: Path = DEFAULT_CSV

@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route("/api/products")
def api_products():
    with _state_lock:
        result = []
        for p in PRODUCTS:
            sku = p.get("sku", "")
            s = _state.get(sku, {})
            result.append({
                **p,
                "status": s.get("status", "pending"),
                "attachment_id": s.get("attachment_id", ""),
                "applied_url": s.get("applied_url", ""),
                "ts": s.get("ts", ""),
            })
    return jsonify(result)

@app.route("/api/apply-image", methods=["POST"])
def api_apply_image():
    """Accept an image via URL or file upload, process and assign to product."""
    product_id = request.form.get("product_id", "").strip()
    sku        = request.form.get("sku", "").strip()
    name       = request.form.get("product_name", "").strip()
    image_url  = request.form.get("image_url", "").strip()
    data_url   = request.form.get("data_url", "").strip()

    if not product_id:
        return jsonify({"ok": False, "error": "Missing product_id"}), 400

    # Mark as processing
    with _state_lock:
        _state[sku] = {"status": "processing", "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}
        save_state()

    def _process():
        try:
            # ── Figure out extension ───────────────────────────────────────────
            if "file" in request.files:
                f = request.files["file"]
                fname = f.filename or "upload.jpg"
                ext = Path(fname).suffix or ".jpg"
                local_path = str(UPLOAD_CACHE / safe_filename(name, sku, ext))
                f.save(local_path)
                source_url = f"file:{fname}"
            elif data_url.startswith("data:"):
                # Detect extension from mime type
                mime = data_url.split(";")[0].split(":")[1]
                ext = {"image/jpeg": ".jpg", "image/png": ".png",
                       "image/webp": ".webp", "image/gif": ".gif"}.get(mime, ".jpg")
                local_path = str(UPLOAD_CACHE / safe_filename(name, sku, ext))
                ok, err = save_base64_image(data_url, local_path)
                source_url = "(base64)"
                if not ok:
                    return {"ok": False, "error": f"Base64 decode failed: {err}"}
            elif image_url:
                ext_guess = Path(re.sub(r"\?.*", "", image_url).split("/")[-1]).suffix
                ext = ext_guess if ext_guess in (".jpg", ".jpeg", ".png", ".webp", ".gif") else ".jpg"
                local_path = str(UPLOAD_CACHE / safe_filename(name, sku, ext))
                ok, err = download_url(image_url, local_path)
                source_url = image_url
                if not ok:
                    return {"ok": False, "error": f"Download failed: {err}"}
            else:
                return {"ok": False, "error": "No image source provided"}

            # ── Upload and assign ──────────────────────────────────────────────
            remote_name = safe_filename(name, sku, ext)
            status, detail = sftp_upload_and_assign(product_id, sku, local_path, remote_name)

            if status == "OK":
                with _state_lock:
                    _state[sku] = {
                        "status": "done",
                        "attachment_id": detail,
                        "applied_url": source_url,
                        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    }
                    save_state()
                return {"ok": True, "attachment_id": detail}
            else:
                with _state_lock:
                    _state[sku] = {"status": "error", "error": detail,
                                   "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}
                    save_state()
                return {"ok": False, "error": detail}

        except Exception as e:
            log.exception("Error processing image")
            with _state_lock:
                _state[sku] = {"status": "error", "error": str(e),
                               "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}
                save_state()
            return {"ok": False, "error": str(e)}

    # Run synchronously (we need the request files before returning)
    result = _process()
    return jsonify(result)

@app.route("/api/reset/<sku>", methods=["POST"])
def api_reset(sku: str):
    with _state_lock:
        if sku in _state:
            del _state[sku]
            save_state()
    return jsonify({"ok": True})

@app.route("/api/stats")
def api_stats():
    with _state_lock:
        total = len(PRODUCTS)
        done = sum(1 for s in _state.values() if s.get("status") == "done")
        errors = sum(1 for s in _state.values() if s.get("status") == "error")
        pending = total - done - errors
    return jsonify({"total": total, "done": done, "errors": errors, "pending": pending})

# ── HTML Template ─────────────────────────────────────────────────────────────
HTML_TEMPLATE = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>H-Moon Image Sourcing Tool</title>
<style>
  #chrome-notice {
    background: linear-gradient(135deg, #1e3a8a, #312e81);
    border-bottom: 1px solid #3730a3;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.82rem;
    flex-wrap: wrap;
  }
  #chrome-notice.hidden { display: none; }
  #chrome-notice b { color: #a5b4fc; }
  #chrome-notice .cn-url {
    background: #1e3a8a;
    border: 1px solid #3730a3;
    color: #93c5fd;
    padding: 2px 10px;
    border-radius: 6px;
    font-family: monospace;
    cursor: pointer;
    font-size: 0.82rem;
  }
  #chrome-notice .cn-url:hover { background: #1d4ed8; }
  #chrome-notice .cn-close {
    margin-left: auto;
    background: none;
    border: 1px solid #3730a3;
    color: #64748b;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 0.72rem;
  }
  .url-row {
    display: flex;
    gap: 5px;
    margin: 0 10px 10px;
    align-items: stretch;
  }
  .url-row input[type=url] {
    flex: 1;
    background: #22263a;
    border: 1px solid #2e3350;
    color: #e2e8f0;
    padding: 5px 9px;
    border-radius: 6px;
    font-size: 0.72rem;
    outline: none;
    min-width: 0;
  }
  .url-row input[type=url]:focus { border-color: #4f8ef7; }
  .url-row input[type=url]::placeholder { color: #64748b; }
  .url-apply {
    background: var(--accent);
    border: none;
    color: #fff;
    border-radius: 6px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .url-apply:hover { filter: brightness(1.15); }
  .file-lbl {
    background: #22263a;
    border: 1px solid #2e3350;
    color: #64748b;
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    font-size: 0.72rem;
  }
  .file-lbl:hover { border-color: #4f8ef7; color: #e2e8f0; }
</style>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #22263a;
    --border: #2e3350;
    --accent: #4f8ef7;
    --accent2: #7c3aed;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #f59e0b;
    --text: #e2e8f0;
    --muted: #64748b;
    --card-w: 260px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh;
  }
  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  header h1 { font-size: 1.1rem; font-weight: 600; }
  .progress-wrap {
    flex: 1;
    background: var(--surface2);
    border-radius: 6px;
    height: 8px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--green));
    transition: width 0.4s;
    border-radius: 6px;
  }
  .stats { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
  .stats b { color: var(--text); }

  .toolbar {
    padding: 14px 24px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .filter-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 5px 14px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.82rem;
    transition: all .15s;
  }
  .filter-btn.active, .filter-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .search-box {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 0.82rem;
    width: 200px;
    outline: none;
  }
  .search-box:focus { border-color: var(--accent); }
  .hint {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--muted);
    font-style: italic;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr));
    gap: 16px;
    padding: 20px 24px;
  }

  .card {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color .2s, transform .1s;
    position: relative;
  }
  .card:hover { border-color: var(--accent); }
  .card.done { border-color: var(--green); }
  .card.error { border-color: var(--red); }
  .card.processing { border-color: var(--yellow); animation: pulse .8s infinite; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .card-img {
    width: 100%;
    height: 160px;
    object-fit: contain;
    display: block;
    background: var(--surface2);
    padding: 8px;
    cursor: pointer;
  }
  .card-img.wrong {
    filter: sepia(0.3) hue-rotate(320deg) saturate(0.5);
    opacity: 0.6;
  }
  .card-img-placeholder {
    width: 100%;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface2);
    color: var(--muted);
    font-size: 0.75rem;
  }

  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: 8px;
    margin: 10px;
    padding: 16px 10px;
    text-align: center;
    cursor: pointer;
    transition: all .2s;
    position: relative;
    min-height: 70px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .drop-zone:hover {
    border-color: var(--accent2);
    background: rgba(124, 58, 237, 0.08);
  }
  .drop-zone.dragover {
    border-color: var(--accent);
    background: rgba(79, 142, 247, 0.15);
    transform: scale(1.02);
  }
  .drop-zone.done-zone {
    border-color: var(--green);
    background: rgba(34, 197, 94, 0.08);
  }
  .drop-icon { font-size: 1.6rem; }
  .drop-text { font-size: 0.72rem; color: var(--muted); line-height: 1.4; }
  .done-text { font-size: 0.75rem; color: var(--green); font-weight: 500; }

  .card-body { padding: 0 12px 12px; }
  .card-name {
    font-size: 0.82rem;
    font-weight: 600;
    margin-bottom: 3px;
    line-height: 1.3;
    cursor: pointer;
  }
  .card-name:hover { color: var(--accent); }
  .card-sku { font-size: 0.72rem; color: var(--muted); margin-bottom: 4px; }
  .card-cats { font-size: 0.68rem; color: var(--accent2); }

  .badge {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    pointer-events: none;
  }
  .badge-pending { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .badge-processing { background: var(--yellow); color: #000; }
  .badge-done { background: var(--green); color: #000; }
  .badge-error { background: var(--red); color: #fff; }

  .reset-btn {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0,0,0,0.6);
    border: none;
    color: var(--muted);
    font-size: 0.6rem;
    padding: 2px 5px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity .15s;
  }
  .card:hover .reset-btn { opacity: 1; }
  .reset-btn:hover { color: var(--red); }

  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 999;
  }
  .toast {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 0.82rem;
    max-width: 320px;
    animation: slideIn .2s ease;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .toast.ok { border-color: var(--green); }
  .toast.err { border-color: var(--red); }
  .toast .toast-title { font-weight: 600; margin-bottom: 3px; }
  .toast .toast-body { color: var(--muted); line-height: 1.4; }
  @keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--muted);
  }
  .empty-state h2 { font-size: 1.5rem; margin-bottom: 10px; }

  #drop-anywhere {
    position: fixed;
    inset: 0;
    background: rgba(79,142,247,0.15);
    border: 4px dashed var(--accent);
    z-index: 500;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    color: var(--accent);
    pointer-events: none;
  }
  #drop-anywhere.visible { display: flex; }
</style>
</head>
<body>

<div id="chrome-notice">
  <span>⚠ <b>Open in Chrome or Edge</b> for drag-and-drop between windows to work.</span>
  <button class="cn-url" onclick="navigator.clipboard.writeText('http://localhost:5001');this.textContent='Copied!';setTimeout(()=>this.textContent='http://localhost:5001',1500)">http://localhost:5001</button>
  <span style="color:#64748b">You can also paste URLs directly into the box below each card, or use 📁 to pick a local file.</span>
  <button class="cn-close" onclick="this.closest('#chrome-notice').classList.add('hidden');localStorage.setItem('cnDismissed','1')">✕</button>
</div>
<script>if(localStorage.getItem('cnDismissed'))document.getElementById('chrome-notice').classList.add('hidden');</script>

<header>
  <h1>🌿 H-Moon Image Sourcing</h1>
  <div class="progress-wrap">
    <div class="progress-bar" id="progress-bar" style="width:0%"></div>
  </div>
  <div class="stats" id="stats">Loading…</div>
</header>

<div class="toolbar">
  <button class="filter-btn active" onclick="setFilter('all', this)">All</button>
  <button class="filter-btn" onclick="setFilter('pending', this)">Pending</button>
  <button class="filter-btn" onclick="setFilter('done', this)">Done ✓</button>
  <button class="filter-btn" onclick="setFilter('error', this)">Error ⚠</button>
  <input class="search-box" id="search" placeholder="Search products…" oninput="renderGrid()">
  <span class="hint">💡 Drag any image from another browser window onto a product card</span>
</div>

<div class="grid" id="grid"></div>
<div class="toast-container" id="toasts"></div>
<div id="drop-anywhere">Drop image on a product card →</div>

<script>
let products = [];
let filter = 'all';
let highlighted = null;  // sku of card being dragged over window

async function loadProducts() {
  const res = await fetch('/api/products');
  products = await res.json();
  renderGrid();
  updateStats();
}

function updateStats() {
  const total = products.length;
  const done = products.filter(p => p.status === 'done').length;
  const errors = products.filter(p => p.status === 'error').length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('stats').innerHTML =
    `<b>${done}</b>/${total} done ${errors > 0 ? `· <span style="color:var(--red)">${errors} errors</span>` : ''}`;
}

function setFilter(f, btn) {
  filter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}

function renderGrid() {
  const q = document.getElementById('search').value.toLowerCase();
  const grid = document.getElementById('grid');
  const filtered = products.filter(p => {
    const matchFilter = filter === 'all' || p.status === filter ||
                        (filter === 'pending' && (p.status === 'pending' || p.status === 'processing'));
    const matchSearch = !q ||
      (p.product_name || p.name || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.categories || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <h2>${filter === 'done' ? '🎉 Nothing here yet' : '🔍 No products match'}</h2>
      <p>${filter === 'pending' ? 'All done!' : 'Try a different filter or search term'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => cardHTML(p)).join('');

  // Attach drop handlers to all drop zones
  grid.querySelectorAll('.drop-zone').forEach(zone => {
    const sku = zone.dataset.sku;
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('dragover');
      highlighted = sku;
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
      highlighted = null;
    });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleDrop(e, sku);
    });
    // Click to open Google Images
    zone.addEventListener('click', () => {
      const p = products.find(x => x.sku === sku);
      if (p) {
        const q = encodeURIComponent(p.product_name || p.name || sku);
        window.open(`https://www.google.com/search?tbm=isch&q=${q}+hydroponics`, '_blank');
      }
    });
  });

  // Reset buttons
  grid.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const sku = btn.dataset.sku;
      await fetch(`/api/reset/${encodeURIComponent(sku)}`, {method: 'POST'});
      const p = products.find(x => x.sku === sku);
      if (p) { p.status = 'pending'; p.attachment_id = ''; }
      renderGrid(); updateStats();
    });
  });
}

function cardHTML(p) {
  const sku = p.sku || '';
  const name = p.product_name || p.name || sku;
  const cats = p.categories || '';
  const status = p.status || 'pending';
  const wrongImg = p.current_wrong_image || '';
  const imgUrl = wrongImg ? `/api/wrong-image?img=${encodeURIComponent(wrongImg)}` : '';

  let badgeClass = 'badge-' + status;
  let cardClass = status === 'done' ? 'card done' :
                  status === 'error' ? 'card error' :
                  status === 'processing' ? 'card processing' : 'card';
  let badgeLabel = status === 'pending' ? '📷 Needs image' :
                   status === 'processing' ? '⏳ uploading…' :
                   status === 'done' ? `✓ done${p.attachment_id ? ' #'+p.attachment_id : ''}` :
                   '⚠ error';

  let dropContent = '';
  if (status === 'done') {
    dropContent = `<div class="done-text">✓ Image assigned</div>
      <div class="drop-text">Drag again to replace</div>`;
  } else if (status === 'error') {
    const err = (p.error || '').slice(0, 80);
    dropContent = `<div class="drop-icon">⚠️</div>
      <div class="drop-text" style="color:var(--red)">${err}</div>
      <div class="drop-text">Drag to retry</div>`;
  } else if (status === 'processing') {
    dropContent = `<div class="drop-icon">⏳</div><div class="drop-text">Uploading…</div>`;
  } else {
    dropContent = `<div class="drop-icon">🖼</div>
      <div class="drop-text">Drag image here<br>or click to Google search</div>`;
  }

  const imgTag = imgUrl
    ? `<img class="card-img wrong" src="${imgUrl}" alt="${name}" onerror="this.parentNode.innerHTML='<div class=card-img-placeholder>current: ${escHtml(wrongImg.split('/').pop())}</div>'">`
    : `<div class="card-img-placeholder">No current image</div>`;

  const urlInputId = 'url-' + sku.replace(/[^a-z0-9]/gi,'_');

  return `<div class="${cardClass}" id="card-${sku}">
    <span class="badge ${badgeClass}">${badgeLabel}</span>
    <button class="reset-btn" data-sku="${sku}" title="Reset to pending">↺</button>
    ${imgTag}
    <div class="drop-zone ${status === 'done' ? 'done-zone' : ''}" data-sku="${sku}">
      ${dropContent}
    </div>
    <div style="display:flex;gap:5px;margin:0 10px 10px;align-items:stretch">
      <input id="${urlInputId}" type="url" placeholder="Paste image URL here…"
        style="flex:1;background:#22263a;border:1px solid #2e3350;color:#e2e8f0;
               padding:5px 9px;border-radius:6px;font-size:0.72rem;outline:none;min-width:0"
        onkeydown="if(event.key==='Enter'){applyUrlInput('${escJs(sku)}','${urlInputId}')}">
      <button onclick="applyUrlInput('${escJs(sku)}','${urlInputId}')"
        style="background:var(--accent);border:none;color:#fff;border-radius:6px;
               padding:5px 10px;cursor:pointer;font-size:0.72rem;font-weight:600;white-space:nowrap">Apply</button>
      <label title="Browse local file"
        style="background:#22263a;border:1px solid #2e3350;color:#64748b;
               border-radius:6px;padding:5px 8px;cursor:pointer;font-size:0.72rem">
        📁<input type="file" accept="image/*" style="display:none"
            onchange="applyFileInput('${escJs(sku)}',this)">
      </label>
    </div>
    <div class="card-body">
      <div class="card-name" onclick="openSearch('${escJs(name)}')">${escHtml(name)}</div>
      <div class="card-sku">${escHtml(sku)} · ID ${escHtml(p.product_id || '')}</div>
      <div class="card-cats">${escHtml(cats.split('|').slice(0,2).join(' › '))}</div>
    </div>
  </div>`;
}

function openSearch(name) {
  const q = encodeURIComponent(name + ' hydroponics');
  window.open(`https://www.google.com/search?tbm=isch&q=${q}`, '_blank');
}

function applyUrlInput(sku, inputId) {
  const input = document.getElementById(inputId);
  const url = (input && input.value || '').trim();
  if (!url) { toast('⚠ Paste a URL first', 'Right-click image → "Copy image address", then paste in the box', false); return; }
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  p.status = 'processing';
  renderGrid(); updateStats();
  const fd = new FormData();
  fd.append('product_id', p.product_id || '');
  fd.append('sku', sku);
  fd.append('product_name', p.product_name || p.name || sku);
  fd.append('image_url', url);
  submitImage(fd, p);
}

function applyFileInput(sku, fileInput) {
  if (!fileInput.files || !fileInput.files[0]) return;
  const file = fileInput.files[0];
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  p.status = 'processing';
  renderGrid(); updateStats();
  const fd = new FormData();
  fd.append('product_id', p.product_id || '');
  fd.append('sku', sku);
  fd.append('product_name', p.product_name || p.name || sku);
  fd.append('file', file);
  submitImage(fd, p);
}

async function submitImage(fd, p) {
  try {
    const res = await fetch('/api/apply-image', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
      p.status = 'done'; p.attachment_id = data.attachment_id;
      toast(`✓ ${p.product_name || p.sku}`, `Attachment #${data.attachment_id}`, true);
    } else {
      p.status = 'error'; p.error = data.error || 'Unknown error';
      toast(`⚠ ${p.product_name || p.sku}`, p.error.slice(0, 120), false);
    }
  } catch(e) {
    p.status = 'error'; p.error = e.message;
    toast('⚠ Network error', e.message, false);
  }
  renderGrid(); updateStats();
}

async function handleDrop(e, sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;

  // Mark processing immediately
  p.status = 'processing';
  renderGrid(); updateStats();

  const dt = e.dataTransfer;
  const fd = new FormData();
  fd.append('product_id', p.product_id || '');
  fd.append('sku', sku);
  fd.append('product_name', p.product_name || p.name || sku);

  // Priority: 1) file, 2) data: URL from html, 3) text/uri-list, 4) text/html img src
  if (dt.files && dt.files.length > 0) {
    fd.append('file', dt.files[0]);
  } else {
    // Try to extract image URL from various drag types
    let url = '';

    const uriList = dt.getData('text/uri-list');
    if (uriList && uriList.startsWith('http')) {
      url = uriList.split('\n')[0].trim();
    }

    if (!url) {
      const html = dt.getData('text/html');
      if (html) {
        const m = html.match(/src=["']([^"']+)["']/i);
        if (m) url = m[1];
      }
    }

    if (!url) {
      const plain = dt.getData('text/plain');
      if (plain && plain.startsWith('http')) url = plain.trim();
    }

    if (url && url.startsWith('data:')) {
      fd.append('data_url', url);
    } else if (url) {
      fd.append('image_url', url);
    } else {
      toast('⚠ Could not extract image URL from drop',
            'Try: right-click image → "Copy image address" → paste in the URL box below the card', false);
      p.status = 'pending';
      renderGrid(); updateStats();
      return;
    }
  }

  submitImage(fd, p);
}

function toast(title, body, ok) {
  const c = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${ok ? 'ok' : 'err'}`;
  el.innerHTML = `<div class="toast-title">${escHtml(title)}</div>
    ${body ? `<div class="toast-body">${escHtml(body)}</div>` : ''}`;
  c.appendChild(el);
  setTimeout(() => el.remove(), ok ? 4000 : 8000);
}

// Global drag tracking for "drop anywhere" overlay guidance
let globalDragActive = false;
document.addEventListener('dragenter', e => {
  if (e.dataTransfer.types.includes('text/uri-list') ||
      e.dataTransfer.types.includes('Files') ||
      e.dataTransfer.types.includes('text/html')) {
    document.getElementById('drop-anywhere').classList.add('visible');
    globalDragActive = true;
  }
});
document.addEventListener('dragleave', e => {
  if (e.relatedTarget === null) {
    document.getElementById('drop-anywhere').classList.remove('visible');
    globalDragActive = false;
  }
});
document.addEventListener('drop', e => {
  document.getElementById('drop-anywhere').classList.remove('visible');
  globalDragActive = false;
});
document.addEventListener('dragend', () => {
  document.getElementById('drop-anywhere').classList.remove('visible');
  globalDragActive = false;
});

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJs(s) {
  return (s||'').replace(/'/g,"\\'").replace(/\\/g,'\\\\');
}

// Poll every 15 s; pause when tab is hidden to avoid flooding 404s
let _pollTimer;
function startPoll() { clearInterval(_pollTimer); _pollTimer = setInterval(loadProducts, 15000); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(_pollTimer); } else { loadProducts(); startPoll(); }
});
startPoll();
loadProducts();
</script>
</body>
</html>
"""

# ── Serve wrong-image thumbnails: local-first, then live site proxy ────────────
LIVE_SITE = "https://hmoonhydro.com"

@app.route("/api/wrong-image")
def wrong_image_proxy():
    """Proxy the product's current (wrong) image: checks local uploads, then fetches from live site."""
    img_name = request.args.get("img", "").strip()
    if not img_name or "/" in img_name or ".." in img_name:
        return ("", 404)

    # 1. Fast O(1) lookup in pre-built index
    if img_name in _THUMB_INDEX:
        from flask import send_file
        return send_file(str(_THUMB_INDEX[img_name]))

    # 2. Cached live-site fetch
    cached = UPLOAD_CACHE / ("proxy__" + re.sub(r'[^a-z0-9._-]', '_', img_name.lower()))
    if cached.exists():
        from flask import send_file
        return send_file(str(cached))

    # 3. Fetch from live site — try year/month paths (recent first) + bare path
    import datetime
    now = datetime.date.today()
    year_months = []
    for delta in range(0, 18):  # last 18 months
        d = datetime.date(now.year, now.month, 1)
        for _ in range(delta):
            if d.month == 1:
                d = datetime.date(d.year - 1, 12, 1)
            else:
                d = datetime.date(d.year, d.month - 1, 1)
        year_months.append(f"{d.year}/{d.month:02d}")

    live_urls = [f"{LIVE_SITE}/wp-content/uploads/{ym}/{img_name}" for ym in year_months]
    live_urls.append(f"{LIVE_SITE}/wp-content/uploads/{img_name}")

    for live_url in live_urls:
        try:
            req = urllib.request.Request(live_url,
                headers={"User-Agent": "Mozilla/5.0", "Referer": LIVE_SITE})
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status != 200:
                    continue
                data = resp.read()
            if len(data) > 200:
                cached.write_bytes(data)
                mime = resp.headers.get("Content-Type", "image/png").split(";")[0]
                from flask import Response
                return Response(data, mimetype=mime)
        except Exception:
            continue

    return ("", 404)


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    global PRODUCTS, CSV_PATH, _state

    parser = argparse.ArgumentParser(description="H-Moon Image Sourcing Tool")
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--host", default="127.0.0.1",
                        help="Host to bind (use 0.0.0.0 for LAN access)")
    args = parser.parse_args()

    CSV_PATH = Path(args.csv)
    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found: {CSV_PATH}")
        print(f"  Run: python scripts/audit_image_mismatches.py first")
        sys.exit(1)

    PRODUCTS = load_products(CSV_PATH)
    _state = load_state()

    print(f"\n  🌿 H-Moon Image Sourcing Tool")
    print(f"  ─────────────────────────────")
    print(f"  Building local image index…", flush=True, end="")
    _build_thumb_index()
    print(f" done ({len(_THUMB_INDEX)} files)")

    done = sum(1 for s in _state.values() if s.get("status") == "done")
    print(f"  Products : {len(PRODUCTS)}  |  Done : {done}  |  Remaining : {len(PRODUCTS) - done}")
    print(f"\n  ⚠  Open in Chrome/Edge — NOT VS Code Simple Browser:")
    print(f"     http://localhost:{args.port}")
    print(f"     (drag images onto cards, or paste URLs into the box below each card)\n")

    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
