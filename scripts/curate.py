#!/usr/bin/env python3
"""
curate.py — Local web-based product curation dashboard for H-Moon Hydro.

Runs a Flask server at http://localhost:5111 providing:
  - Tabbed views for each gap type (images, brands, descriptions, etc.)
  - Retailer catalog search with image previews
  - One-click approve → queues change for server push
  - Batch apply approved changes via SSH

Usage:
    python scripts/curate.py              # Start dashboard
    python scripts/curate.py --refresh    # Refresh manifest from server first
"""

import json
import os
import re
import sys
import textwrap
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import paramiko
from flask import Flask, jsonify, request, send_from_directory

# ── paths ──────────────────────────────────────────────────────────────
WORKSPACE = Path(__file__).parent.parent
MANIFEST   = WORKSPACE / "outputs" / "enrichment_manifest.json"
MATCHES    = WORKSPACE / "outputs" / "scraped" / "enrichment_matches.json"
CATALOGS   = WORKSPACE / "outputs" / "scraped" / "catalogs"
QUEUE_FILE = WORKSPACE / "outputs" / "curation_queue.json"
CANDIDATES = WORKSPACE / "outputs" / "product_candidates.json"
STATIC_DIR = WORKSPACE / "scripts" / "curate_static"

# ── server credentials ─────────────────────────────────────────────────
HOST = os.getenv('HMOON_SSH_HOST')
USER = os.getenv('HMOON_SSH_USER')
PASS = os.getenv('HMOON_SSH_PASS')
SITE = os.getenv('HMOON_SITE_DIR', '~/hmoonhydro.com')

# ── Flask app ──────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

# ── caches (loaded once on startup) ────────────────────────────────────
_manifest = []
_matches  = {}       # id → enrichment_match record
_catalogs = {}       # retailer → [products]
_queue    = []        # pending changes
_brands   = set()     # known brand names
_candidates = {}      # id -> candidate data


def load_data():
    """Load manifest, matches, candidates, and retailer catalogs into memory."""
    global _manifest, _matches, _catalogs, _queue, _brands, _candidates

    # Manifest
    if MANIFEST.exists():
        _manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    print(f"  Manifest: {len(_manifest)} products")

    # Matches
    if MATCHES.exists():
        raw = json.loads(MATCHES.read_text(encoding="utf-8"))
        _matches = {r["id"]: r for r in raw if r.get("enrichment")}
    print(f"  Matches: {len(_matches)} with enrichment")

    # Retailer catalogs
    if CATALOGS.is_dir():
        for f in CATALOGS.glob("*_products.json"):
            key = f.stem.replace("_products", "")
            _catalogs[key] = json.loads(f.read_text(encoding="utf-8"))
            print(f"  Catalog {key}: {len(_catalogs[key])} products")

    # Curation queue
    if QUEUE_FILE.exists():
        _queue = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    print(f"  Queue: {len(_queue)} pending changes")

    # Extract known brands from manifest
    _brands = {p["brand"] for p in _manifest if p.get("brand")}
    _brands.discard("")
    print(f"  Known brands: {len(_brands)}")

    # Candidates
    if CANDIDATES.exists():
        _candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    print(f"  Candidates: {len(_candidates)} products with candidate data")


def save_queue():
    """Persist the curation queue."""
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE_FILE.write_text(json.dumps(_queue, indent=2, ensure_ascii=False), encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────
# API Routes
# ──────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


@app.route("/api/summary")
def api_summary():
    """Overall gap summary."""
    gaps = defaultdict(int)
    for p in _manifest:
        for m in p.get("missing", []):
            gaps[m] += 1
    return jsonify({
        "total": len(_manifest),
        "gaps": dict(gaps),
        "matched": len(_matches),
        "queued": len(_queue),
        "brands": len(_brands),
    })


@app.route("/api/products")
def api_products():
    """Products filtered by gap type.  ?gap=image&page=1&limit=50"""
    gap   = request.args.get("gap", "")
    page  = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    q     = request.args.get("q", "").lower()

    items = _manifest
    if gap:
        items = [p for p in items if gap in p.get("missing", [])]
    if q:
        items = [p for p in items if q in p["title"].lower() or q in p.get("brand", "").lower()]

    total = len(items)
    start = (page - 1) * limit
    page_items = items[start : start + limit]

    # Attach match info
    results = []
    for p in page_items:
        rec = dict(p)
        match = _matches.get(p["id"])
        if match and match.get("enrichment"):
            e = match["enrichment"]
            rec["match"] = {
                "score":  e.get("match_score", 0),
                "title":  e.get("matched_title", ""),
                "vendor": e.get("vendor", ""),
                "retailer": e.get("retailer", ""),
                "source_url": e.get("source_url", ""),
                "image":  e["images"][0]["url"] if e.get("images") else None,
                "image_count": len(e.get("images", [])),
                "has_desc": bool(e.get("description_text")),
                "has_weight": bool(e.get("weight")),
            }
        # Check if already queued
        rec["queued"] = any(c["id"] == p["id"] for c in _queue)
        results.append(rec)

    return jsonify({"products": results, "total": total, "page": page, "pages": (total + limit - 1) // limit})


@app.route("/api/product/<int:pid>")
def api_product_detail(pid):
    """Full detail for one product including all enrichment data."""
    product = next((p for p in _manifest if p["id"] == pid), None)
    if not product:
        return jsonify({"error": "not found"}), 404

    result = dict(product)
    match = _matches.get(pid)
    if match and match.get("enrichment"):
        result["enrichment"] = match["enrichment"]

    result["queued_changes"] = [c for c in _queue if c["id"] == pid]
    return jsonify(result)


@app.route("/api/search")
def api_search_catalogs():
    """Search retailer catalogs. ?q=foxfarm+big+bloom&retailer=hydrobuilder"""
    q = request.args.get("q", "").lower().split()
    retailer = request.args.get("retailer", "")
    limit = int(request.args.get("limit", 30))

    if not q:
        return jsonify({"results": []})

    results = []
    sources = {retailer: _catalogs[retailer]} if retailer and retailer in _catalogs else _catalogs

    for rkey, products in sources.items():
        for p in products:
            title_lower = p.get("title", "").lower()
            if all(tok in title_lower for tok in q):
                images = p.get("images", [])
                variants = p.get("variants", [])
                results.append({
                    "retailer": rkey,
                    "title": p["title"],
                    "handle": p.get("handle", ""),
                    "vendor": p.get("vendor", ""),
                    "product_type": p.get("product_type", ""),
                    "image": images[0]["src"] if images else None,
                    "image_count": len(images),
                    "images": [img["src"] for img in images[:6]],
                    "price": variants[0].get("price") if variants else None,
                    "weight": variants[0].get("weight") if variants else None,
                    "weight_unit": variants[0].get("weight_unit", "lb") if variants else None,
                    "tags": p.get("tags", ""),
                    "body_html_preview": (p.get("body_html") or "")[:300],
                })
            if len(results) >= limit:
                break
        if len(results) >= limit:
            break

    return jsonify({"results": results, "total": len(results)})


@app.route("/api/candidates/<int:pid>")
def api_candidates(pid):
    """Get all candidate matches for a product. Returns images, descriptions, prices from all retailers."""
    data = _candidates.get(str(pid))
    if not data:
        return jsonify({"candidates": [], "total": 0})

    # Optional filters
    retailer = request.args.get("retailer", "")
    min_score = float(request.args.get("min_score", 0))

    candidates = data.get("candidates", [])
    if retailer:
        candidates = [c for c in candidates if c["retailer"] == retailer]
    if min_score:
        candidates = [c for c in candidates if c["score"] >= min_score]

    return jsonify({
        "title": data.get("title", ""),
        "current_thumb": data.get("current_thumb", ""),
        "candidate_count": len(candidates),
        "total_images": sum(c.get("image_count", 0) for c in candidates),
        "candidates": candidates,
    })


@app.route("/api/candidates/<int:pid>/images")
def api_candidate_images(pid):
    """Get ALL images across all candidates for a product, deduped and scored."""
    data = _candidates.get(str(pid))
    if not data:
        return jsonify({"images": [], "total": 0})

    images = []
    seen = set()
    for c in data.get("candidates", []):
        for img_url in c.get("images", []):
            # Deduplicate by normalized URL (ignore size variants)
            norm = re.sub(r'_\d+x\d*\.', '.', img_url)
            if norm in seen:
                continue
            seen.add(norm)
            images.append({
                "url": img_url,
                "retailer": c["retailer"],
                "match_title": c["title"],
                "match_score": c["score"],
                "vendor": c.get("vendor", ""),
            })

    return jsonify({
        "title": data.get("title", ""),
        "current_thumb": data.get("current_thumb", ""),
        "images": images,
        "total": len(images),
    })


@app.route("/api/candidates/stats")
def api_candidate_stats():
    """Overview stats on candidate data."""
    total_products = len(_candidates)
    total_candidates = sum(d.get("candidate_count", 0) for d in _candidates.values())
    total_images = sum(
        sum(c.get("image_count", 0) for c in d.get("candidates", []))
        for d in _candidates.values()
    )
    retailers = set()
    for d in _candidates.values():
        for c in d.get("candidates", []):
            retailers.add(c.get("retailer", ""))
    return jsonify({
        "products_with_candidates": total_products,
        "total_candidates": total_candidates,
        "total_images": total_images,
        "retailers": sorted(retailers),
    })


@app.route("/api/brands")
def api_brands():
    """List all known brands, sorted by name."""
    return jsonify(sorted(_brands))


@app.route("/api/queue", methods=["GET"])
def api_queue_get():
    """Get the current curation queue."""
    return jsonify({"queue": _queue, "count": len(_queue)})


@app.route("/api/queue", methods=["POST"])
def api_queue_add():
    """Add a change to the queue.
    Body: {id, title, action, data}
    action: set_image | set_gallery | set_brand | set_short_desc | set_weight | set_description
    data: depends on action
    """
    body = request.json
    pid    = body.get("id")
    action = body.get("action")
    data   = body.get("data")

    if not pid or not action:
        return jsonify({"error": "id and action required"}), 400

    # Remove existing same action for same product
    _queue[:] = [c for c in _queue if not (c["id"] == pid and c["action"] == action)]

    _queue.append({
        "id": pid,
        "title": body.get("title", ""),
        "action": action,
        "data": data,
        "queued_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    save_queue()
    return jsonify({"ok": True, "queue_size": len(_queue)})


@app.route("/api/queue/<int:pid>", methods=["DELETE"])
def api_queue_remove(pid):
    """Remove all queued changes for a product."""
    action = request.args.get("action", "")
    if action:
        _queue[:] = [c for c in _queue if not (c["id"] == pid and c["action"] == action)]
    else:
        _queue[:] = [c for c in _queue if c["id"] != pid]
    save_queue()
    return jsonify({"ok": True, "queue_size": len(_queue)})


@app.route("/api/queue/clear", methods=["POST"])
def api_queue_clear():
    """Clear entire queue."""
    _queue.clear()
    save_queue()
    return jsonify({"ok": True})


@app.route("/api/apply", methods=["POST"])
def api_apply():
    """Generate PHP from queue, upload to server, and execute."""
    if not _queue:
        return jsonify({"error": "Queue is empty"}), 400

    dry_run = request.json.get("dry_run", True) if request.json else True

    # Build PHP script from queued changes
    php = _build_php_script(_queue, dry_run)

    # Execute on server
    try:
        result = _run_on_server(php, dry_run)
        return jsonify({"ok": True, "dry_run": dry_run, "output": result})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


@app.route("/api/apply/single", methods=["POST"])
def api_apply_single():
    """Apply a single change immediately without queuing.
    Body: {id, action, data, dry_run}"""
    body = request.json
    dry_run = body.get("dry_run", True)
    changes = [{
        "id": body["id"],
        "title": body.get("title", ""),
        "action": body["action"],
        "data": body["data"],
    }]
    php = _build_php_script(changes, dry_run)
    try:
        result = _run_on_server(php, dry_run)
        return jsonify({"ok": True, "dry_run": dry_run, "output": result})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """Re-export manifest from server and reload data."""
    try:
        _refresh_manifest()
        load_data()
        return jsonify({"ok": True, "total": len(_manifest)})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


# ──────────────────────────────────────────────────────────────────────
# PHP Generation
# ──────────────────────────────────────────────────────────────────────

def _build_php_script(changes: list, dry_run: bool) -> str:
    """Generate PHP to apply a list of changes."""
    lines = [
        "<?php",
        "wp_set_current_user(1);",
        "require_once ABSPATH . 'wp-admin/includes/media.php';",
        "require_once ABSPATH . 'wp-admin/includes/file.php';",
        "require_once ABSPATH . 'wp-admin/includes/image.php';",
        "",
        f"$dry_run = {'true' if dry_run else 'false'};",
        'echo $dry_run ? "=== DRY RUN ===\\n" : "=== LIVE ===\\n";',
        "$ok=0; $err=0;",
        "",
    ]

    for c in changes:
        pid = c["id"]
        action = c["action"]
        data = c["data"]

        if action == "set_image":
            url = _php_escape(data.get("url", ""))
            lines.append(f"// Image for #{pid}")
            lines.append(f"if (!$dry_run) {{")
            lines.append(f"  $tmp = download_url('{url}', 30);")
            lines.append(f"  if (!is_wp_error($tmp)) {{")
            lines.append(f"    $f = array('name'=>sanitize_file_name(basename(parse_url('{url}',PHP_URL_PATH))),'tmp_name'=>$tmp);")
            lines.append(f"    $att = media_handle_sideload($f, {pid});")
            lines.append(f"    if (!is_wp_error($att)) {{ set_post_thumbnail({pid}, $att); $ok++; echo \"  #{pid} image OK\\n\"; }}")
            lines.append(f"    else {{ $err++; echo \"  #{pid} image ERR: \".$att->get_error_message().\"\\n\"; }}")
            lines.append(f"  }} else {{ $err++; @unlink($tmp); echo \"  #{pid} download ERR\\n\"; }}")
            lines.append(f"}} else {{ echo \"  #{pid} [would set image]\\n\"; $ok++; }}")
            lines.append("")

        elif action == "set_gallery":
            urls = data.get("urls", [])
            lines.append(f"// Gallery for #{pid}")
            lines.append(f"if (!$dry_run) {{")
            lines.append(f"  $gids = array();")
            lines.append(f"  $existing = get_post_meta({pid}, '_product_image_gallery', true);")
            lines.append(f"  if ($existing) $gids = explode(',', $existing);")
            for u in urls[:5]:
                u_esc = _php_escape(u)
                lines.append(f"  $tmp = download_url('{u_esc}', 30);")
                lines.append(f"  if (!is_wp_error($tmp)) {{")
                lines.append(f"    $f = array('name'=>sanitize_file_name(basename(parse_url('{u_esc}',PHP_URL_PATH))),'tmp_name'=>$tmp);")
                lines.append(f"    $att = media_handle_sideload($f, {pid}); if (!is_wp_error($att)) $gids[] = $att;")
                lines.append(f"  }} else @unlink($tmp);")
            lines.append(f"  if ($gids) {{ update_post_meta({pid}, '_product_image_gallery', implode(',', array_unique($gids))); $ok++; echo \"  #{pid} gallery OK\\n\"; }}")
            lines.append(f"}} else {{ echo \"  #{pid} [would set gallery +{len(urls)}]\\n\"; $ok++; }}")
            lines.append("")

        elif action == "set_brand":
            brand = _php_escape(data.get("brand", ""))
            lines.append(f"// Brand for #{pid}")
            lines.append(f"if (!$dry_run) {{")
            lines.append(f"  $bt = get_term_by('name', '{brand}', 'pwb-brand');")
            lines.append(f"  if (!$bt) {{ $r = wp_insert_term('{brand}', 'pwb-brand'); if (!is_wp_error($r)) $bt = get_term_by('term_id', $r['term_id'], 'pwb-brand'); }}")
            lines.append(f"  if ($bt) {{ wp_set_object_terms({pid}, array($bt->term_id), 'pwb-brand', false); $ok++; echo \"  #{pid} brand='{brand}' OK\\n\"; }}")
            lines.append(f"  else {{ $err++; echo \"  #{pid} brand ERR\\n\"; }}")
            lines.append(f"}} else {{ echo \"  #{pid} [would set brand '{brand}']\\n\"; $ok++; }}")
            lines.append("")

        elif action == "set_short_desc":
            text = _php_escape(data.get("text", ""))
            lines.append(f"// Short desc for #{pid}")
            lines.append(f"if (!$dry_run) {{ wp_update_post(array('ID'=>{pid},'post_excerpt'=>'{text}')); $ok++; echo \"  #{pid} short_desc OK\\n\"; }}")
            lines.append(f"else {{ echo \"  #{pid} [would set short_desc]\\n\"; $ok++; }}")
            lines.append("")

        elif action == "set_weight":
            weight = float(data.get("weight", 0))
            lines.append(f"// Weight for #{pid}")
            lines.append(f"if (!$dry_run) {{ update_post_meta({pid}, '_weight', '{weight}'); $ok++; echo \"  #{pid} weight={weight} OK\\n\"; }}")
            lines.append(f"else {{ echo \"  #{pid} [would set weight {weight}]\\n\"; $ok++; }}")
            lines.append("")

        elif action == "set_description":
            desc = _php_escape(data.get("html", ""))
            lines.append(f"// Description for #{pid}")
            lines.append(f"if (!$dry_run) {{ wp_update_post(array('ID'=>{pid},'post_content'=>'{desc}')); $ok++; echo \"  #{pid} desc OK\\n\"; }}")
            lines.append(f"else {{ echo \"  #{pid} [would set description]\\n\"; $ok++; }}")
            lines.append("")

    lines.append('echo "\\n=== OK: $ok | ERR: $err ===\\n";')
    return "\n".join(lines)


def _php_escape(s: str) -> str:
    """Escape a string for embedding in PHP single-quoted string."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


# ──────────────────────────────────────────────────────────────────────
# SSH helpers
# ──────────────────────────────────────────────────────────────────────

def _ssh_connect():
    if not HOST or not USER or not PASS:
        raise RuntimeError("Missing SSH env vars: HMOON_SSH_HOST, HMOON_SSH_USER, HMOON_SSH_PASS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    return ssh


def _run_on_server(php_code: str, dry_run: bool) -> str:
    """Upload PHP and execute via wp eval-file."""
    ssh = _ssh_connect()
    remote = f"{SITE}/wp-content/run_script.php"

    sftp = ssh.open_sftp()
    with sftp.file(remote, "w") as f:
        f.write(php_code)
    sftp.close()

    env = "" if dry_run else "CONFIRM=1 "
    cmd = f"cd {SITE} && {env}wp eval-file {remote}"
    _, stdout, stderr = ssh.exec_command(cmd, timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    ssh.close()

    return out + ("\nSTDERR: " + err if err.strip() else "")


def _refresh_manifest():
    """Re-export manifest from server."""
    ssh = _ssh_connect()
    php_path = str(WORKSPACE / "scripts" / "export_manifest.php")
    remote = f"{SITE}/wp-content/run_script.php"

    sftp = ssh.open_sftp()
    sftp.put(php_path, remote)
    sftp.close()

    _, stdout, stderr = ssh.exec_command(f"cd {SITE} && wp eval-file {remote}", timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    ssh.close()

    idx = out.find("[")
    if idx >= 0:
        data = json.loads(out[idx:])
        MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--refresh" in sys.argv:
        print("Refreshing manifest from server...")
        _refresh_manifest()

    print("Loading data...")
    load_data()
    print(f"\nStarting curation dashboard at http://localhost:5111")
    app.run(host="127.0.0.1", port=5111, debug=False)
