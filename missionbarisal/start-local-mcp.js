#!/usr/bin/env node
// =============================================================================
// Local MCP Server Starter — Mission Barisal v3
// Auto-starts local MCP servers defined in servers.json (with "local": true)
// Called by start.js on boot. Runs as child processes in the same group.
// =============================================================================

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const FOLDER_DIR = path.resolve(__dirname, "external mcp");
const CONFIG_FILE = path.join(FOLDER_DIR, "servers.json");

function waitForServer(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const parsed = new URL(url);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: "/",
        method: "POST",
        timeout: 2000,
      }, (res) => {
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() - start < timeoutMs) {
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
      req.on("timeout", () => { req.destroy(); check(); });
      req.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
      req.end();
    };
    check();
  });
}

async function startLocalServers() {
  let servers = [];
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    servers = (data.servers || []).filter(s => s.local && s.script && s.enabled !== false);
  } catch (e) {
    console.warn("[LOCAL_MCP] Could not read servers.json:", e.message);
    return [];
  }

  if (servers.length === 0) {
    console.log("[LOCAL_MCP] No local MCP servers to start");
    return [];
  }

  const results = [];
  for (const server of servers) {
    const scriptPath = path.resolve(__dirname, server.script);
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[LOCAL_MCP] Script not found: ${scriptPath}`);
      results.push({ name: server.name, status: "error", error: "script not found" });
      continue;
    }

    console.log(`[LOCAL_MCP] Starting ${server.name} (${server.url})...`);
    const proc = spawn(process.execPath, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
      env: { ...process.env },
    });

    // Log stdout/stderr with prefix
    proc.stdout?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`  [${server.name}] ${msg}`);
    });
    proc.stderr?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) console.warn(`  [${server.name}] ${msg}`);
    });

    proc.on("exit", (code) => {
      console.log(`[LOCAL_MCP] ${server.name} exited code=${code}`);
    });

    // Wait for server to be ready
    const ready = await waitForServer(server.url, 5000);
    results.push({
      name: server.name,
      pid: proc.pid,
      url: server.url,
      status: ready ? "ready" : "timeout",
      process: proc,
    });

    if (ready) {
      console.log(`[LOCAL_MCP] ✅ ${server.name} ready (pid ${proc.pid})`);
    } else {
      console.warn(`[LOCAL_MCP] ⚠️ ${server.name} not responding yet (may still be starting)`);
    }
  }

  return results;
}

module.exports = { startLocalServers };

// If run directly
if (require.main === module) {
  startLocalServers().then((results) => {
    console.log(`\n[LOCAL_MCP] Started ${results.filter(r => r.status === "ready").length}/${results.length} servers`);
    // Keep running (don't exit)
    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
  });
}
