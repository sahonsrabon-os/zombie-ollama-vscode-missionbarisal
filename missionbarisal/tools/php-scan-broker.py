#!/usr/bin/env python3
"""
php-scan-broker.py — Mission Barisal PHP → JSON Broker Scanner
=============================================================
Scans the PHP codebase (frontend UI + PHP backend) and extracts
ALL variables, body context, key constants, and the exact wire
format required by the dalali (broker) protocol.

Output: <out>/php-scan-broker.json  (one clean JSON)

Usage:
  python3 tools/php-scan-broker.py \
      --ui frontend/allindex.live.php \
      --backend index.live.php \
      --out /tmp/php-scan-broker.json
"""
import argparse
import json
import os
import re
import sys

# ─── Regex patterns ───
PHP_VAR = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)\s*=")          # $var =
PHP_DEFINE = re.compile(r"define\(\s*['\"]([A-Z_][A-Z0-9_]*)['\"]\s*,\s*(.*?)\s*\)", re.S)
PHP_FUNC = re.compile(r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
PHP_CASE = re.compile(r"case\s+['\"]([a-z_]+)['\"]\s*:")          # case 'projects_list':
JS_VAR = re.compile(r"\b(?:var|let|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=")
JS_FUNC = re.compile(r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
AJAX_URL = re.compile(r"(?:url\s*[:=]\s*|api\(')([^'\"]*index\.live\.php[^'\"]*)")
ENDPOINT = re.compile(r"['\"](/api/[A-Za-z0-9_/\-{}\.]+)['\"]")

def scan_php(path):
    """Extract PHP variables, defines, functions, cases from a PHP file."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        src = f.read()
    out = {
        "file": path,
        "size_bytes": os.path.getsize(path),
        "lines": src.count("\n") + 1,
        "php_vars": sorted(set(PHP_VAR.findall(src))),
        "php_defines": [],
        "php_functions": sorted(set(PHP_FUNC.findall(src))),
        "ai_php_api_cases": sorted(set(PHP_CASE.findall(src))),
        "api_endpoints": sorted(set(ENDPOINT.findall(src))),
    }
    for name, val in PHP_DEFINE.findall(src):
        out["php_defines"].append({"name": name, "value": val.strip()[:200]})
    return out

def scan_js(ui_path):
    """Extract JS variables, functions, and the api() wire format from the UI."""
    with open(ui_path, "r", encoding="utf-8", errors="replace") as f:
        src = f.read()
    out = {
        "file": ui_path,
        "size_bytes": os.path.getsize(ui_path),
        "lines": src.count("\n") + 1,
        "js_vars": sorted(set(JS_VAR.findall(src))),
        "js_functions": sorted(set(JS_FUNC.findall(src))),
        "index_live_urls": sorted(set(AJAX_URL.findall(src))),
        "api_endpoints": sorted(set(ENDPOINT.findall(src))),
    }
    # Extract the hardcoded A/SP/HD/PID line (line ~872)
    for i, line in enumerate(src.split("\n"), 1):
        if "project_id=" in line and "SP=" in line:
            out["hardcoded_state_line"] = {"line": i, "text": line.strip()[:400]}
            break
    # Extract api() function signature if present
    m = re.search(r"function\s+api\s*\(([^)]*)\)", src)
    if m:
        out["api_function_signature"] = m.group(1).strip()
    return out

def scan_public(public_dir):
    """List static assets in the public/ folder."""
    out = {"files": [], "total_bytes": 0}
    if not os.path.isdir(public_dir):
        return out
    for root, _dirs, files in os.walk(public_dir):
        for fn in sorted(files):
            p = os.path.join(root, fn)
            rel = os.path.relpath(p, public_dir)
            out["files"].append({"path": rel, "size": os.path.getsize(p)})
            out["total_bytes"] += os.path.getsize(p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ui", required=True, help="UI file (allindex.live.php)")
    ap.add_argument("--backend", required=True, help="PHP backend (index.live.php)")
    ap.add_argument("--public", default="", help="public/ static assets dir")
    ap.add_argument("--out", required=True, help="Output JSON path")
    args = ap.parse_args()

    result = {
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "scanner": "php-scan-broker.py v1.1 (Mission Barisal)",
        "ui": scan_js(args.ui),
        "backend": scan_php(args.backend),
    }
    if args.public:
        result["public_assets"] = scan_public(args.public)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print("OK → " + args.out)
    print("UI vars: %d | UI funcs: %d | backend vars: %d | backend funcs: %d | ai_php_api: %d" % (
        len(result["ui"]["js_vars"]),
        len(result["ui"]["js_functions"]),
        len(result["backend"]["php_vars"]),
        len(result["backend"]["php_functions"]),
        len(result["backend"]["ai_php_api_cases"]),
    ))
    if "public_assets" in result:
        print("public assets: %d files, %d bytes" % (
            len(result["public_assets"]["files"]),
            result["public_assets"]["total_bytes"],
        ))

if __name__ == "__main__":
    main()
