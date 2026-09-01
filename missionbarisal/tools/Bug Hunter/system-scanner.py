#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================
  Mission Barisal v3 - System Scanner (Bug Hunter - Jewel)
=============================================================
  Purpose: Map all server variables, contacts, data points
           and create a comprehensive system health map.
  Author : Bug Hunter - Jewel
  Date   : 2026-08-25
=============================================================
"""

import os
import sys
import json
import socket
import subprocess
import sqlite3
from pathlib import Path
from datetime import datetime

# ============================================================
# Configuration
# ============================================================
PROJECT_ROOT = Path("/home/sahon/ai")
DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = PROJECT_ROOT / "cache"
LOGS_DIR = PROJECT_ROOT / "logs"
DOC_DIR = PROJECT_ROOT / "doc"
TOOLS_DIR = PROJECT_ROOT / "tools"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
EXTERNAL_MCP_DIR = PROJECT_ROOT / "external mcp"
EXTERNAL_TOOLS_DIR = PROJECT_ROOT / "external tools"
SKILLS_DIR = PROJECT_ROOT / "skills"
ZOMBIE_DIR = PROJECT_ROOT / ".zombiecoder"

KNOWN_PORTS = {
    "main_server": 9999,
    "broker_server": 9998,
    "mcp_tcp_fallback": 10000,
    "mcp_uds": "/tmp/zombiecoder/mcp.sock",
    "ollama_default": 11434,
    "ollama_custom": 5000,
}

KNOWN_PROVIDERS = ["opencode", "groq", "gemini", "cloudflare", "ollama", "custom_2"]

KNOWN_AGENTS = [
    "code-guru", "bug-hunter", "security-hero",
    "perf-wizard", "doc-king", "qa-tyrant",
    "team-heart", "customer-experience-specialist",
    "ecommerce-operations-analyst"
]

SENSITIVE = ["KEY", "SECRET", "PASSWORD", "TOKEN", "AUTH"]


def mask(val):
    if val is None:
        return None
    val = str(val)
    if len(val) > 8:
        return val[:4] + "..." + val[-4:]
    return "***"


def check_port(host, port):
    result = {"host": host, "port": port, "open": False, "pid": None}
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            result["open"] = (s.connect_ex((host, port)) == 0)
    except Exception as e:
        result["error"] = str(e)
    try:
        r = subprocess.run(["lsof", "-i", f":{port}", "-t"],
                            capture_output=True, text=True, timeout=5)
        if r.stdout.strip():
            result["pid"] = r.stdout.strip().split("\n")[0]
    except Exception:
        pass
    return result


def check_socket(path):
    p = Path(path)
    result = {"path": path, "exists": p.exists(), "accessible": False,
              "size": None, "mode": None}
    if p.exists():
        try:
            st = p.stat()
            result["size"] = st.st_size
            result["mode"] = oct(st.st_mode)
            result["accessible"] = True
        except Exception as e:
            result["error"] = str(e)
    return result


def read_env_file(path):
    p = Path(path)
    if not p.exists():
        return {"_error": f"File not found: {path}"}
    data = {}
    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if any(s in k.upper() for s in SENSITIVE) and v:
                    data[k] = mask(v)
                else:
                    data[k] = v
    except Exception as e:
        data["_error"] = str(e)
    return data


def read_json_file(path):
    p = Path(path)
    if not p.exists():
        return {"_error": f"File not found: {path}"}
    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        return {"_error": f"JSON parse error: {e}"}
    except Exception as e:
        return {"_error": str(e)}


def read_db_tables(db_path):
    p = Path(db_path)
    result = {"path": str(db_path), "exists": p.exists(),
              "size_mb": None, "tables": {}, "error": None}
    if not p.exists():
        result["error"] = "Database file not found"
        return result
    result["size_mb"] = round(p.stat().st_size / (1024 * 1024), 2)
    try:
        conn = sqlite3.connect(str(p))
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        for (t,) in cur.fetchall():
            cur.execute(f"SELECT COUNT(*) FROM [{t}]")
            result["tables"][t] = cur.fetchone()[0]
        conn.close()
    except Exception as e:
        result["error"] = str(e)
    return result


def scan_system():
    scan_time = datetime.now().isoformat()
    report = {
        "scan_time": scan_time,
        "scanner": "Bug Hunter - Jewel (system-scanner.py)",
        "project_root": str(PROJECT_ROOT),
        "sections": {},
    }

    # 1. Environment Variables
    print("\n[1/12] Scanning Environment Variables...")
    env_section = {"system_env": {}, "project_env": {}, "custom_providers": []}
    interesting = [
        "HOME", "USER", "SHELL", "PATH", "LANG",
        "NODE_VERSION", "NPM_VERSION", "PYTHON_VERSION",
        "DB_TYPE", "DB_HOST", "DB_PORT", "DB_USER", "DB_NAME",
        "DB_SQLITE_PATH", "DB_PASSWORD",
        "OLLAMA_HOST", "OLLAMA_MODELS",
        "EXEC_SHELL_WIN", "EXEC_SHELL_LINUX",
        "HTTP_TIMEOUT", "EXEC_TIMEOUT", "EXEC_MAX_BUFFER",
    ]
    for k in interesting:
        v = os.environ.get(k)
        if v:
            env_section["system_env"][k] = mask(v) if any(
                s in k.upper() for s in SENSITIVE) else v

    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        env_section["project_env"] = read_env_file(str(env_file))
    else:
        env_section["project_env"]["_error"] = ".env file not found"

    for i in range(1, 10):
        pre = f"CUSTOM_PROVIDER_{i}"
        name = os.environ.get(f"{pre}_NAME")
        url = os.environ.get(f"{pre}_URL")
        if name or url:
            env_section["custom_providers"].append({
                "index": i, "name": name, "url": url,
                "key_set": bool(os.environ.get(f"{pre}_KEY")),
                "models": os.environ.get(f"{pre}_MODELS"),
                "priority": os.environ.get(f"{pre}_PRIORITY"),
                "type": os.environ.get(f"{pre}_TYPE"),
            })
    report["sections"]["environment"] = env_section
    print(f"   system_env={len(env_section['system_env'])} "
          f"project_env={len(env_section['project_env'])} "
          f"custom_providers={len(env_section['custom_providers'])}")

    # 2. Ports
    print("\n[2/12] Checking Ports...")
    ports = {}
    for name, port in KNOWN_PORTS.items():
        if isinstance(port, int):
            ports[name] = check_port("127.0.0.1", port)
        else:
            ports[name] = check_socket(port)
    report["sections"]["ports"] = ports
    for name, info in ports.items():
        status = "OPEN" if (info.get("open") or info.get("exists")) else "CLOSED"
        print(f"   [{status}] {name}: {info.get('port', info.get('path'))}")

    # 3. Providers
    print("\n[3/12] Checking Providers...")
    prov = {"known_providers": KNOWN_PROVIDERS,
            "from_config": {}, "models_db": {}}
    startup = read_json_file(str(DATA_DIR / "startup-config.json"))
    if isinstance(startup, dict) and "providers" in startup:
        prov["from_config"] = startup["providers"]
    prov["models_db"] = read_db_tables(str(DATA_DIR / "models.db"))
    report["sections"]["providers"] = prov
    print(f"   known={len(KNOWN_PROVIDERS)} "
          f"db_tables={list(prov['models_db'].get('tables', {}).keys())}")

    # 4. Agents
    print("\n[4/12] Checking Agents...")
    agents = {"known_agents": KNOWN_AGENTS,
              "agent_count": len(KNOWN_AGENTS),
              "skill_files": [], "sessions": {}}
    for aid in KNOWN_AGENTS:
        sf = SKILLS_DIR / f"{aid}.md"
        agents["skill_files"].append({
            "agent": aid, "exists": sf.exists(),
            "size": sf.stat().st_size if sf.exists() else 0})
    sess = DATA_DIR / "sessions.json"
    if sess.exists():
        agents["sessions"] = read_json_file(str(sess))
    report["sections"]["agents"] = agents
    for sf in agents["skill_files"]:
        print(f"   [{'OK' if sf['exists'] else 'MISS'}] {sf['agent']}")

    # 5. MCP
    print("\n[5/12] Checking MCP...")
    mcp = {"local_mcp": {}, "external_mcp": {}, "mcp_clients": {}}
    mcp["local_mcp"] = {
        "http_endpoint": "http://localhost:9999/mcp",
        "sse_endpoint": "http://localhost:9999/mcp (SSE)",
        "uds_path": KNOWN_PORTS["mcp_uds"],
        "uds_exists": Path(KNOWN_PORTS["mcp_uds"]).exists()}
    mcf = DATA_DIR / "mcp-clients.json"
    if mcf.exists():
        mcp["mcp_clients"] = read_json_file(str(mcf))
    esf = EXTERNAL_MCP_DIR / "servers.json"
    if esf.exists():
        mcp["external_mcp"]["servers_config"] = read_json_file(str(esf))
    report["sections"]["mcp"] = mcp
    print(f"   uds={'exists' if mcp['local_mcp']['uds_exists'] else 'missing'}")

    # 6. Database
    print("\n[6/12] Checking Databases...")
    db = {"models_db": read_db_tables(str(DATA_DIR / "models.db")),
          "mcp_clients_file": read_json_file(str(DATA_DIR / "mcp-clients.json"))}
    report["sections"]["databases"] = db
    print(f"   models_db={db['models_db'].get('size_mb')} MB")

    # 7. File Structure
    print("\n[7/12] Mapping File Structure...")
    fs = {}
    key_files = ["api.js", "start.js", "skills.js", "mcp-client.js",
                 "external-mcp.js", "note-store.js", "domain-config.js",
                 "identity.json", "acp-skills.json", "PERSONAS.md",
                 "Ethical.md", "README.md"]
    for fn in key_files:
        fp = PROJECT_ROOT / fn
        fs[fn] = {"exists": fp.exists(),
                  "size": fp.stat().st_size if fp.exists() else 0}
    for dn in ["cache", "data", "doc", "logs", "frontend", "public",
               "skills", "tools", "external mcp", "external tools"]:
        dp = PROJECT_ROOT / dn
        fs[f"[DIR] {dn}"] = {
            "exists": dp.exists(),
            "file_count": len(list(dp.glob('*'))) if dp.exists() else 0}
    report["sections"]["file_structure"] = fs
    print(f"   checked={len(fs)} "
          f"found={sum(1 for v in fs.values() if v.get('exists'))}")

    # 8. Skills & Tools
    print("\n[8/12] Checking Skills & Tools...")
    st = {"skills": {}, "tools": {}, "doc_files": {}}
    if SKILLS_DIR.exists():
        sf = list(SKILLS_DIR.glob("*.md"))
        st["skills"] = {"count": len(sf), "files": [f.name for f in sf]}
    if TOOLS_DIR.exists():
        tf = list(TOOLS_DIR.glob("*.*"))
        st["tools"] = {"count": len(tf), "files": [
            {"name": f.name, "size": f.stat().st_size} for f in tf]}
    if DOC_DIR.exists():
        df = list(DOC_DIR.glob("**/*.md"))
        st["doc_files"] = {"count": len(df), "files": [
            str(f.relative_to(PROJECT_ROOT)) for f in df]}
    report["sections"]["skills_tools"] = st
    print(f"   skills={st['skills'].get('count')} "
          f"tools={st['tools'].get('count')} "
          f"docs={st['doc_files'].get('count')}")

    # 9. Memory & Cache
    print("\n[9/12] Checking Memory & Cache...")
    mem = {"cache": {}, "memories": {}, "notes": {}}
    if CACHE_DIR.exists():
        cf = list(CACHE_DIR.glob("*"))
        mem["cache"] = {"count": len(cf), "files": [f.name for f in cf]}
    mdir = PROJECT_ROOT / "memories"
    if mdir.exists():
        mf = list(mdir.glob("**/*.json"))
        mem["memories"] = {"count": len(mf), "files": [
            str(f.relative_to(PROJECT_ROOT)) for f in mf]}
    nf = DATA_DIR / "notes.json"
    if nf.exists():
        mem["notes"] = read_json_file(str(nf))
    report["sections"]["memory"] = mem
    print(f"   cache={mem['cache'].get('count')} "
          f"memories={mem['memories'].get('count')}")

    # 10. Domain & Identity
    print("\n[10/12] Checking Domain & Identity...")
    dom = {"identity": read_json_file(str(PROJECT_ROOT / "identity.json")),
           "domain_config": {}}
    dcp = PROJECT_ROOT / "domain-config.js"
    if dcp.exists():
        try:
            with open(dcp, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read()
            dom["domain_config"] = {"size": len(c),
                                    "preview": c[:300]}
        except Exception as e:
            dom["domain_config"] = {"_error": str(e)}
    report["sections"]["domain"] = dom
    print(f"   identity_loaded={isinstance(dom['identity'], dict)}")

    # 11. Logs
    print("\n[11/12] Checking Logs...")
    logs = {"log_files": [], "recent": []}
    if LOGS_DIR.exists():
        lfs = sorted(LOGS_DIR.glob("*.log"), reverse=True)[:5]
        logs["log_files"] = [{
            "name": f.name, "size_mb": round(
                f.stat().st_size / (1024 * 1024), 2),
            "modified": datetime.fromtimestamp(
                f.stat().st_mtime).isoformat()} for f in lfs]
    report["sections"]["logs"] = logs
    print(f"   log_files={len(logs['log_files'])}")

    # 12. Health Summary
    print("\n[12/12] Generating Health Summary...")
    hs = {"timestamp": scan_time, "project": "Mission Barisal v3",
          "owner": "Sahon Srabon (ZombieCoder)", "total_checks": 0,
          "passed": 0, "failed": 0, "issues": []}
    checks = [
        ("api.js exists", (PROJECT_ROOT / "api.js").exists()),
        ("start.js exists", (PROJECT_ROOT / "start.js").exists()),
        ("models.db exists", (DATA_DIR / "models.db").exists()),
        ("UDS parent exists",
         Path(KNOWN_PORTS["mcp_uds"]).parent.exists()),
        ("providers configured", len(KNOWN_PROVIDERS) > 0),
        ("agents defined", len(KNOWN_AGENTS) > 0),
        ("skills populated",
         len(list(SKILLS_DIR.glob('*.md'))) > 0 if SKILLS_DIR.exists() else False),
        ("tools populated",
         len(list(TOOLS_DIR.glob('*'))) > 0 if TOOLS_DIR.exists() else False),
        (".env exists", (PROJECT_ROOT / ".env").exists()),
        ("cache exists", CACHE_DIR.exists()),
    ]
    for name, res in checks:
        hs["total_checks"] += 1
        if res:
            hs["passed"] += 1
        else:
            hs["failed"] += 1
            hs["issues"].append(name)
    hs["health_score"] = f"{round(hs['passed']/hs['total_checks']*100)}%"
    report["sections"]["health_summary"] = hs
    print(f"   health_score={hs['health_score']} "
          f"passed={hs['passed']}/{hs['total_checks']}")

    report["_meta"] = {"generated_by": "Bug Hunter - Jewel",
                       "version": "1.0.0",
                       "purpose": "System map for Mission Barisal v3"}
    return report


def main():
    print("=" * 60)
    print("  Bug Hunter - Jewel | System Scanner")
    print("  Mission Barisal v3 - Full System Map")
    print("=" * 60)
    try:
        report = scan_system()
        out = TOOLS_DIR / "Bug Hunter" / "system-map.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False, default=str)
        print("\n" + "=" * 60)
        print(f"  Report saved: {out}")
        print(f"  Size: {out.stat().st_size} bytes")
        print("=" * 60)
        for sn, sd in report["sections"].items():
            n = len(sd) if isinstance(sd, (dict, list)) else 0
            print(f"  [OK] {sn}: {n} items")
        hs = report["sections"]["health_summary"]
        print(f"\n  Health: {hs['health_score']} "
              f"({hs['passed']}/{hs['total_checks']})")
        if hs["issues"]:
            print(f"  Issues: {hs['issues']}")
        print("=" * 60)
        return 0
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
