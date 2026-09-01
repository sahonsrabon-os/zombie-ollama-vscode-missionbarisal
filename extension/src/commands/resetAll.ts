/**
 * resetAll — One-shot nuclear reset command.
 *
 * Kills stale server processes, removes dead UDS sockets, cleans the
 * extension's model cache + learned contexts + transport cache, and
 * reconnects fresh. Bound to a keybinding so the user never has to
 * manually kill processes or reload VS Code again.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { GatewayProvider } from '../provider/gatewayProvider';
import { StatusBarManager } from '../status/statusBarManager';
import { DEFAULT_UDS_PATH } from '../mission/transport';

interface ResetDeps {
  provider: GatewayProvider;
  statusManager: StatusBarManager;
  refreshStatusBar: () => Promise<void>;
  outputChannel: vscode.OutputChannel;
}

/** Best-effort shell exec that never throws. */
function tryRun(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 8000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

/** Kill processes listening on port 5000 (or the configured port). */
function killServerProcesses(port: number, log: (m: string) => void): number {
  let killed = 0;
  // lsof → find PIDs on the port, skip the first line (header).
  const lsof = tryRun(`lsof -ti :${port} 2>/dev/null`);
  if (lsof) {
    const pids = lsof.split('\n').filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        killed++;
        log(`  Killed process ${pid} on port ${port}`);
      } catch { /* already dead */ }
    }
  }
  // Also kill any orphaned node/api.js processes for this project.
  const nodeProcs = tryRun(`pgrep -f "api.js|Engine/api.js" 2>/dev/null`);
  if (nodeProcs) {
    for (const pid of nodeProcs.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        killed++;
        log(`  Killed orphaned api.js process ${pid}`);
      } catch { /* already dead */ }
    }
  }
  // Kill zombie php artisan serve processes on the port.
  const phpProcs = tryRun(`pgrep -f "artisan serve" 2>/dev/null`);
  if (phpProcs) {
    for (const pid of phpProcs.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        killed++;
        log(`  Killed artisan serve process ${pid}`);
      } catch { /* already dead */ }
    }
  }
  return killed;
}

/** Remove the stale UDS socket file if it exists. */
function removeStaleSocket(log: (m: string) => void): boolean {
  if (fs.existsSync(DEFAULT_UDS_PATH)) {
    try {
      fs.unlinkSync(DEFAULT_UDS_PATH);
      log(`  Removed stale UDS socket: ${DEFAULT_UDS_PATH}`);
      return true;
    } catch {
      log(`  Could not remove UDS socket: ${DEFAULT_UDS_PATH}`);
    }
  }
  return false;
}

/** Clean any stale temp files (old session dumps, cached transcripts). */
function cleanTempFiles(log: (m: string) => void): number {
  let cleaned = 0;
  const tmpDir = os.tmpdir();
  const zombieTmp = path.join(tmpDir, 'zombiecoder');
  if (fs.existsSync(zombieTmp)) {
    try {
      const entries = fs.readdirSync(zombieTmp);
      for (const entry of entries) {
        if (entry === 'mcp.sock') { continue; } // socket managed separately
        const entryPath = path.join(zombieTmp, entry);
        try {
          const stat = fs.statSync(entryPath);
          // Remove files older than 1 hour.
          if (stat.isFile() && Date.now() - stat.mtimeMs > 3600000) {
            fs.unlinkSync(entryPath);
            cleaned++;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  if (cleaned > 0) { log(`  Cleaned ${cleaned} stale temp file(s)`); }
  return cleaned;
}

/**
 * Main reset command handler.
 *
 * Flow:
 *   1. Kill stale server processes (port 5000 + orphaned node/php)
 *   2. Remove dead UDS socket
 *   3. Clean stale temp files
 *   4. Reset extension state (model cache, learned contexts, transport)
 *   5. Wait for server to come back (if we killed it)
 *   6. Reconnect — fetch models + refresh status bar
 */
export async function resetAllCommand(deps: ResetDeps): Promise<void> {
  const { provider, refreshStatusBar, outputChannel } = deps;
  const log = (m: string) => outputChannel.appendLine(m);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'ZombieCoder Mission Barisal — Resetting...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Killing stale processes...' });
      log('=== RESET ALL ===');

      // Extract port from server URL.
      const config = vscode.workspace.getConfiguration('zombiecoder.mission-barisal');
      const serverUrl = config.get<string>('serverUrl', 'http://localhost:9999');
      let port = 5000;
      try {
        const url = new URL(serverUrl);
        if (url.port) { port = Number(url.port); }
      } catch { /* use default */ }

      // Step 1: Kill stale processes.
      const killed = killServerProcesses(port, log);
      if (killed > 0) {
        progress.report({ message: `Killed ${killed} stale process(es)...` });
        // Give the OS a moment to release the port.
        await sleep(1500);
      }

      // Step 2: Remove stale UDS socket.
      progress.report({ message: 'Removing stale socket...' });
      removeStaleSocket(log);

      // Step 3: Clean stale temp files.
      cleanTempFiles(log);

      // Step 4: Reset extension state.
      progress.report({ message: 'Clearing extension cache...' });
      provider.invalidateModelCache();
      provider.clearAllState?.();
      log('  Extension cache invalidated (model catalog + learned contexts + transport)');

      // Step 5: Wait for port to be free, then restart server.
      progress.report({ message: 'Waiting for server...' });
      const serverReady = await waitForPort(port, 5000);
      if (!serverReady) {
        progress.report({ message: 'Starting server...' });
        await startServer(serverUrl, log);
        // Give the server time to initialize.
        const serverUp = await waitForPort(port, 10000);
        if (!serverUp) {
          vscode.window.showErrorMessage(
            'ZombieCoder Mission Barisal: Could not start server. Please start it manually.'
          );
          log('  ERROR: Server did not come back up');
          return;
        }
      }

      // Step 6: Reconnect.
      progress.report({ message: 'Reconnecting...' });
      await refreshStatusBar();
      log('=== RESET COMPLETE ===');

      vscode.window.showInformationMessage(
        `ZombieCoder Mission Barisal: Reset complete! ${killed} process(es) killed, fresh session started.`
      );
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = tryRun(`lsof -ti :${port} 2>/dev/null`);
    if (result) { return true; } // something is listening
    await sleep(500);
  }
  return false;
}

async function startServer(_serverUrl: string, log: (m: string) => void): Promise<void> {
  // Determine if it's a PHP or Node server.
  const engineDir = path.join(os.homedir(), 'dev', 'Engine');
  const apiJs = path.join(engineDir, 'api.js');
  const artisanPhp = path.join(engineDir, 'artisan');

  if (fs.existsSync(artisanPhp)) {
    // PHP artisan serve — start in background.
    log('  Starting php artisan serve...');
    tryRun(`cd "${engineDir}" && nohup php artisan serve > /dev/null 2>&1 &`);
  } else if (fs.existsSync(apiJs)) {
    // Plain Node.js server.
    log('  Starting node api.js...');
    tryRun(`cd "${engineDir}" && nohup node api.js > /dev/null 2>&1 &`);
  } else {
    log(`  Could not find server in ${engineDir}`);
  }
}
