/**
 * MissionManager — orchestrates the client-side Mission Barisal system.
 *
 * On activation it silently (no user permission) creates the three-file
 * memory layout (SSOT.md + syllabus.md + memory.json), starts the workspace
 * watcher for runtime SSOT updates, and exposes the assembled Mission
 * context consumed by the Phase 2 context builder.
 *
 * Phase 1 — Mission Foundation.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { SsotManager } from './ssotManager';
import { WorkspaceWatcher } from './workspaceWatcher';
import { FootprintScanner } from './footprintScanner';
import { MemoryManager } from './memoryManager';

export interface MissionContext {
    workspaceRoot: string;
    /**
     * Stable per-workspace session id derived from the workspace root path
     * (SHA-256 of the normalized path). The same project folder always yields
     * the same id on Windows and Linux — so opening a project 10 days later
     * reuses its session, memory and syllabus on the server.
     */
    sessionId: string;
    ssot: string;
    syllabus: string;
    memorySummary: string;
    /**
     * Phase 5 — plain-text list of known MCP tools (default + external).
     * Injected into the agent system message so agents know every tool
     * instead of wandering.
     */
    mcpTools: string;
}

export interface MissionManagerDeps {
    /**
     * Resolve the current MCP tool summary. Provided by the gateway provider
     * so MissionManager stays decoupled from the McpConnector.
     */
    getMcpTools?: () => string;
}

export class MissionManager implements vscode.Disposable {
    private readonly ssot: SsotManager;
    private readonly watcher: WorkspaceWatcher;
    private readonly footprint: FootprintScanner;
    private readonly memory: MemoryManager;
    private readonly log: (message: string) => void;
    private readonly deps: MissionManagerDeps;
    private readonly sessionId: string;
    private initialized = false;

    constructor(
        context: vscode.ExtensionContext,
        log: (message: string) => void,
        deps?: MissionManagerDeps
    ) {
        this.log = log;
        this.deps = deps ?? {};
        const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.extensionUri.fsPath;
        this.sessionId = computeWorkspaceSessionId(workspaceRoot);
        this.ssot = new SsotManager(workspaceRoot, log);
        this.watcher = new WorkspaceWatcher(this.ssot, log, () => {
            // New directory/file detected → refresh the workspace footprint so
            // the syllabus's "WORKSPACE FOOTPRINT" section stays current.
            try {
                const footprint = this.footprint.scan();
                this.footprint.updateSyllabus(footprint);
                this.log(
                    `Footprint updated after new files/dirs (${footprint.languages.length} language(s))`
                );
            } catch (error) {
                this.log(
                    `Footprint update failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        });
        this.footprint = new FootprintScanner(workspaceRoot, log);
        this.memory = new MemoryManager(workspaceRoot, log);
    }

    public get workspaceRoot(): string {
        return this.ssot.rootDir;
    }

    /**
     * Stable per-workspace session id (see {@link MissionContext.sessionId}).
     * Used as the server-side `session_id` so every project folder keeps its
     * own session/memory/syllabus — no data mixing across projects.
     */
    public getSessionId(): string {
        return this.sessionId;
    }

    /**
     * Option A — register THIS workspace (and every other open workspace
     * folder, multi-root aware) with the Mission Barisal server
     * (POST /api/workspace) so the server auto-generates
     * `.zombiecoder/SSOT.md` + `syllabus.md` INSIDE each project folder and
     * scopes memory/sessions per project. Fire-and-forget: failures are
     * logged, never thrown. Only fires over http(s) — UDS-only servers still
     * get per-project context via the chat payload (Option B). No hardcoded
     * paths; works on Windows and Linux.
     */
    public async notifyServerWorkspace(serverUrl: string): Promise<void> {
        try {
            if (!/^https?:\/\//i.test(serverUrl)) {
                this.log(`Workspace register skipped (non-HTTP serverUrl: ${serverUrl})`);
                return;
            }
            // Register EVERY open workspace folder — so when the user opens
            // two (or fifty) folders, each one gets its own server-scoped
            // .zombiecoder (no data mixing, no "can't find the folder").
            const folders = vscode.workspace.workspaceFolders ?? [];
            const roots =
                folders.length > 0
                    ? folders.map((f) => f.uri.fsPath)
                    : [this.workspaceRoot];
            for (const root of roots) {
                await this.registerWorkspace(serverUrl, root);
            }
        } catch (error) {
            this.log(
                `Workspace register skipped: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private async registerWorkspace(serverUrl: string, root: string): Promise<void> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const sessionId = computeWorkspaceSessionId(root);
            const res = await fetch(
                `${serverUrl.replace(/\/+$/, '')}/api/workspace`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workspacePath: root,
                        xSessionId: sessionId,
                        source: 'extension',
                    }),
                    signal: controller.signal,
                },
            );
            if (!res.ok) {
                this.log(
                    `Workspace register failed (${root}): ${res.status} ${res.statusText}`,
                );
            } else {
                this.log(
                    `Workspace registered with server: ${root} (${sessionId})`,
                );
            }
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Create `.zombiecoder/` (SSOT + syllabus + memory) client-side. Runs once
     * per extension activation. No user permission prompt on first run.
     */
    public ensureMissionFiles(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        try {
            this.memory.ensureDirs();
            const ssotContent = this.ssot.regenerate();
            const footprint = this.footprint.scan();
            this.footprint.updateSyllabus(footprint);
            this.watcher.start();

            this.log(
                `Mission files ensured: SSOT (${ssotContent.length} chars), ${footprint.languages.length} language(s) detected`
            );
        } catch (error) {
            this.log(
                `Mission init failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Resolve the workspace folder the user is CURRENTLY working in:
     * the folder of the active text editor (multi-root aware), falling back
     * to the primary workspace root. This makes chat context follow the
     * active project instead of always using folder[0].
     */
    private resolveActiveWorkspaceRoot(): string {
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.length <= 1) {
            return this.workspaceRoot;
        }
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            if (folder) {
                return folder.uri.fsPath;
            }
        }
        return this.workspaceRoot;
    }

    /** Assemble the context block injected as the clean system message. */
    public getMissionContext(): MissionContext {
        // Multi-root aware: use the ACTIVE editor's folder so the agent
        // context follows whichever project the user is actually working on.
        const activeRoot = this.resolveActiveWorkspaceRoot();
        const activeSessionId = computeWorkspaceSessionId(activeRoot);

        let syllabus = '';
        try {
            const syllabusPath = path.join(
                activeRoot,
                '.zombiecoder',
                'agents',
                'syllabus.md'
            );
            if (fs.existsSync(syllabusPath)) {
                syllabus = fs.readFileSync(syllabusPath, 'utf8');
            }
        } catch {
            syllabus = '';
        }

        let ssot = '';
        try {
            const ssotPath = path.join(activeRoot, '.zombiecoder', 'SSOT.md');
            if (fs.existsSync(ssotPath)) {
                ssot = fs.readFileSync(ssotPath, 'utf8');
            }
        } catch {
            ssot = '';
        }

        let memorySummary = '(no session memory yet)';
        try {
            const memPath = path.join(
                activeRoot,
                '.zombiecoder',
                'agents',
                'memory.json'
            );
            if (fs.existsSync(memPath)) {
                const parsed = JSON.parse(fs.readFileSync(memPath, 'utf8')) as {
                    entries?: Array<{ timestamp?: string; agent?: string; summary?: string }>;
                };
                const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
                if (entries.length > 0) {
                    memorySummary = entries
                        .slice(-3)
                        .map(
                            (entry) =>
                                `- [${entry.timestamp ?? ''}] ${entry.agent ?? ''}: ${entry.summary ?? ''}`
                        )
                        .join('\n');
                }
            }
        } catch {
            memorySummary = '(no session memory yet)';
        }

        return {
            workspaceRoot: activeRoot,
            sessionId: activeSessionId,
            ssot: ssot || this.ssot.readSSOT(),
            syllabus,
            memorySummary,
            mcpTools: this.deps.getMcpTools?.() ?? '(MCP tools not synced yet)',
        };
    }

    /**
     * Append a memory entry after a successful chat request.
     * This ensures memory.json is populated even when the model can't call tools.
     */
    public appendMemoryEntry(agent: string, summary: string): void {
        try {
            const activeRoot = this.resolveActiveWorkspaceRoot();
            const memPath = path.join(
                activeRoot,
                '.zombiecoder',
                'agents',
                'memory.json'
            );

            // Read existing memory or create default
            let memory: Record<string, unknown> = {
                current_session: { id: null, started_at: null, message_count: 0, summary: null },
                recent_context: [],
                session_index: { last_accessed: null, total_sessions: 0, total_archived: 0 },
                entries: [],
            };

            if (fs.existsSync(memPath)) {
                try {
                    const raw = fs.readFileSync(memPath, 'utf8');
                    const parsed = JSON.parse(raw) as Record<string, unknown>;
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        memory = { ...memory, ...parsed };
                    }
                } catch {
                    // fall back to defaults
                }
            }

            const entries = Array.isArray(memory.entries) ? memory.entries : [];
            entries.push({
                timestamp: new Date().toISOString(),
                agent,
                summary,
            });

            // Keep only last 50 entries to prevent file bloat
            memory.entries = entries.slice(-50);

            // Update session index
            const sessionIndex = memory.session_index as Record<string, unknown>;
            if (sessionIndex) {
                sessionIndex.last_accessed = new Date().toISOString();
                sessionIndex.total_sessions = ((sessionIndex.total_sessions as number) || 0) + 1;
            }

            fs.mkdirSync(path.dirname(memPath), { recursive: true });
            fs.writeFileSync(memPath, JSON.stringify(memory, null, 2), 'utf8');
        } catch (error) {
            this.log(
                `Memory append failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    public dispose(): void {
        this.watcher.dispose();
    }
}

/**
 * Derive a stable, cross-platform session id from a workspace folder path.
 * The path is normalized and lowercased before hashing so the same folder
 * always yields the same id on Windows and Linux (no hardcoded separators).
 */
function computeWorkspaceSessionId(workspaceRoot: string): string {
    const normalized = path.normalize(workspaceRoot).toLowerCase();
    const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
    return 'ws-' + hash.slice(0, 16);
}
