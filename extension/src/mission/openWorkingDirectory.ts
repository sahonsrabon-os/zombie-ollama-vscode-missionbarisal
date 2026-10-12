/**
 * openWorkingDirectory — the "Open Mission Working Directory" entry point.
 * ═══════════════════════════════════════════════════════════════════════
 * One call that, for a chosen folder:
 *
 *   1. creates the three-file mission layout the agents need:
 *        .zombiecoder/SSOT.md             (SsotManager — personas, tree, rules)
 *        .zombiecoder/agents/syllabus.md  (FootprintScanner — base + footprint)
 *        .zombiecoder/agents/memory.json  (MemoryManager — session memory)
 *   2. calls the MCP `set_working_dir` tool so the Mission Barisal server
 *      adopts the SAME folder as its working directory (it then
 *      auto-generates `.zombiecoder/SSOT.md` + `syllabus.md` server-side too)
 *   3. reports exactly what was created — no silent failures.
 *
 * Deliberately `vscode`-free (like ssotManager/evidenceGate) so the flow is
 * unit-testable and reusable from any entry point (command, activation,
 * future CLI).
 *
 * Persona/constitution source: docs/No Evidence.md + docs/SSOT Principles.md
 * (rendered into every SSOT.md by ssotManager.generateSSOT).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { SsotManager } from './ssotManager';
import { FootprintScanner } from './footprintScanner';
import { MemoryManager } from './memoryManager';

/** Outcome of one open-working-directory run. */
export interface OpenWorkingDirectoryResult {
    /** Absolute path of the folder that is now the working directory. */
    directory: string;
    /** Stable per-workspace session id (sha256 of the normalized path). */
    sessionId: string;
    /** Files that now exist inside the folder (relative to it). */
    created: string[];
    /** MCP set_working_dir outcome: ok / failed / skipped (no server given). */
    mcp: 'ok' | 'failed' | 'skipped';
    /** Human-readable MCP detail (error text or short success note). */
    mcpDetail?: string;
}

export interface OpenWorkingDirectoryOptions {
    log?: (message: string) => void;
    /**
     * MCP `set_working_dir` call against the Mission Barisal server.
     * Omit (or let it reject) and the local layout is still created — the
     * server side is a best-effort bonus, never a blocker.
     */
    callMcpSetWorkingDir?: (directory: string) => Promise<unknown>;
}

/**
 * Derive the same stable, cross-platform session id the MissionManager uses:
 * SHA-256 of the normalized (lowercased) workspace path, first 16 hex chars.
 * Kept local so this module stays dependency-light and self-contained.
 */
export function computeSessionId(workspaceRoot: string): string {
    const normalized = path.normalize(workspaceRoot).toLowerCase();
    const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
    return 'ws-' + hash.slice(0, 16);
}

/**
 * Create the mission layout inside `directory` and register it with the
 * server over MCP. Resolves even when the server is unreachable — the
 * caller gets `mcp: 'failed'` instead of an exception.
 */
export async function openWorkingDirectory(
    directory: string,
    options: OpenWorkingDirectoryOptions = {}
): Promise<OpenWorkingDirectoryResult> {
    const log = options.log ?? ((): void => undefined);

    // Validate the INPUT before resolve() — path.resolve('') silently
    // becomes process.cwd(), which would drop .zombiecoder into the caller's
    // working directory by accident.
    if (typeof directory !== 'string' || !directory.trim()) {
        throw new Error(`Invalid working directory: ${String(directory)}`);
    }
    const root = path.resolve(directory);

    // The folder must exist before any manager touches it.
    fs.mkdirSync(root, { recursive: true });

    // ── 1. Local three-file layout ────────────────────────────────────────
    const memory = new MemoryManager(root, log);
    const ssot = new SsotManager(root, log);
    const footprint = new FootprintScanner(root, log);

    memory.ensureDirs();
    const ssotContent = ssot.regenerate();
    const scan = footprint.scan();
    footprint.updateSyllabus(scan);

    const expected = ['.zombiecoder/SSOT.md', '.zombiecoder/agents/syllabus.md', '.zombiecoder/agents/memory.json'];
    const created = expected.filter((rel) => fs.existsSync(path.join(root, rel)));

    log(
        `Working directory opened: ${root} — ` +
            `${created.length}/${expected.length} mission file(s), ` +
            `${scan.languages.length} language(s), SSOT ${ssotContent.length} chars`
    );

    // ── 2. MCP set_working_dir (server adopts the same directory) ─────────
    let mcp: OpenWorkingDirectoryResult['mcp'] = 'skipped';
    let mcpDetail: string | undefined;
    if (options.callMcpSetWorkingDir) {
        try {
            const response = await options.callMcpSetWorkingDir(root);
            mcp = 'ok';
            mcpDetail =
                typeof response === 'string'
                    ? response
                    : response
                      ? JSON.stringify(response).slice(0, 300)
                      : 'set_working_dir accepted';
            log(`MCP set_working_dir OK: ${root}`);
        } catch (error) {
            mcp = 'failed';
            mcpDetail = error instanceof Error ? error.message : String(error);
            log(`MCP set_working_dir failed (local files kept): ${mcpDetail}`);
        }
    }

    return {
        directory: root,
        sessionId: computeSessionId(root),
        created,
        mcp,
        mcpDetail,
    };
}
