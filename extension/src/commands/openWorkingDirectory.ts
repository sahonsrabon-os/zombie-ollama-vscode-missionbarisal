import * as vscode from 'vscode';
import { GatewayProvider } from '../provider/gatewayProvider';

/**
 * "Open Mission Working Directory" flow.
 * ═══════════════════════════════════════════════════════════════════════
 * One command that takes a folder and makes it THE mission working
 * directory, end to end:
 *
 *   1. user picks a folder (open dialog, defaults to the current workspace)
 *   2. the folder is added as a workspace folder if it isn't one already
 *      (so the context builder / status bar follow it)
 *   3. provider.openWorkingDirectory() runs the core flow:
 *        • local three-file layout: .zombiecoder/SSOT.md,
 *          agents/syllabus.md, agents/memory.json
 *        • MCP `set_working_dir` call so the Mission Barisal server adopts
 *          the SAME directory and generates its own .zombiecoder copy
 *        • server-side workspace registration (Option A, fire-and-forget)
 *   4. one status toast + output-log lines — partial failures are reported
 *      honestly (SSOT Principles §1), never hidden.
 */

export interface OpenWorkingDirectoryFlowDeps {
    provider: GatewayProvider;
    log: (message: string) => void;
}

export async function openWorkingDirectoryFlow(deps: OpenWorkingDirectoryFlowDeps): Promise<void> {
    const { provider, log } = deps;

    // ── 1. pick the folder ────────────────────────────────────────────────
    const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    const picked = await vscode.window.showOpenDialog({
        title: 'Open Mission Working Directory',
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Open as Working Directory',
        ...(defaultUri ? { defaultUri } : {}),
    });
    if (!picked || picked.length === 0) {
        log('Open working directory: cancelled by user');
        return;
    }
    const uri = picked[0];
    const dir = uri.fsPath;

    // ── 2. make it a workspace folder (our working directory) ────────────
    const folders = vscode.workspace.workspaceFolders ?? [];
    const alreadyOpen = folders.some((f) => f.uri.fsPath === dir);
    if (!alreadyOpen) {
        const accepted = vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri });
        log(
            accepted
                ? `Workspace folder added: ${dir}`
                : `Workspace folder add rejected by VS Code — continuing (MCP + local layout still run)`
        );
        if (!accepted) {
            vscode.window.showWarningMessage(
                `ZombieCoder: folder could not be added to the workspace, but mission files were still created in ${dir}.`
            );
        }
    }

    // ── 3. local layout + MCP set_working_dir + server registration ───────
    let summary: Awaited<ReturnType<GatewayProvider['openWorkingDirectory']>>;
    try {
        summary = await provider.openWorkingDirectory(dir);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Open working directory failed: ${message}`);
        vscode.window.showErrorMessage(`ZombieCoder: could not open working directory — ${message}`);
        return;
    }

    // ── 4. honest report (created files + MCP verdict) ────────────────────
    const mcpLabel =
        summary.mcp === 'ok'
            ? 'MCP set_working_dir: OK'
            : summary.mcp === 'failed'
              ? `MCP set_working_dir: failed (${summary.mcpDetail ?? 'unknown error'})`
              : 'MCP set_working_dir: skipped (no server configured)';

    log(
        `Working directory opened: ${summary.directory} | ` +
            `files ${summary.created.length}/3 (${summary.created.join(', ') || 'none'}) | ` +
            `${mcpLabel} | session ${summary.sessionId}`
    );

    const status =
        summary.mcp === 'ok'
            ? `✅ Working directory set: ${summary.directory} — ` +
              `${summary.created.length}/3 mission file(s) created · MCP synced`
            : `📁 Working directory set: ${summary.directory} — ` +
              `${summary.created.length}/3 mission file(s) created · ${mcpLabel}`;
    void vscode.window.showInformationMessage(status);
}
