/**
 * WorkspaceWatcher — runtime SSOT updates.
 *
 * Regenerates `.zombiecoder/SSOT.md` (debounced) whenever the user opens a
 * file, switches editors, or changes workspace folders, so the Single Source
 * of Truth always reflects the project the user is actually working on.
 *
 * `.zombiecoder` files are excluded from triggering a regeneration to avoid
 * an infinite write → open → regenerate loop.
 *
 * Phase 1 — Mission Foundation.
 */

import * as vscode from 'vscode';
import { SsotManager } from './ssotManager';

const SSOT_REGENERATE_DEBOUNCE_MS = 1500;

function isMissionManagedFile(fsPath: string): boolean {
    return fsPath.split(/[\\/]/).includes('.zombiecoder');
}

export class WorkspaceWatcher implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private timer: ReturnType<typeof setTimeout> | undefined;
    /** Debounced timer for footprint re-scan when a new directory/file appears. */
    private footprintTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly ssot: SsotManager,
        private readonly log: (message: string) => void,
        /**
         * Optional callback fired (debounced) when the workspace gains a new
         * directory or file, so the project footprint / syllabus can be
         * refreshed. Kept optional so callers that only need SSOT updates are
         * unaffected.
         */
        private readonly onFootprintUpdate?: () => void
    ) { }

    public start(): void {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule()),
            vscode.workspace.onDidOpenTextDocument((doc) => this.scheduleIfRelevant(doc)),
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor?.document) {
                    this.scheduleIfRelevant(editor.document);
                }
            }),
            // New directory/file created in the workspace → refresh footprint.
            vscode.workspace.onDidCreateFiles((e) => {
                if (this.onFootprintUpdate && e.files.some((uri) => this.isWithinRoot(uri.fsPath))) {
                    this.scheduleFootprint();
                }
            })
        );
        this.log('WorkspaceWatcher started — runtime SSOT + footprint updates enabled');
    }

    private scheduleIfRelevant(doc: vscode.TextDocument): void {
        if (doc.uri.scheme !== 'file') {
            return;
        }
        const fsPath = doc.uri.fsPath;
        if (isMissionManagedFile(fsPath)) {
            return;
        }
        if (!fsPath.startsWith(this.ssot.rootDir)) {
            return;
        }
        this.schedule();
    }

    private schedule(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.ssot.regenerate();
        }, SSOT_REGENERATE_DEBOUNCE_MS);
    }

    private isWithinRoot(fsPath: string): boolean {
        return fsPath.startsWith(this.ssot.rootDir);
    }

    /**
     * Debounced footprint re-scan. A new directory/file can change the
     * workspace language footprint, so re-scan and let the caller rewrite the
     * syllabus. Reuses the SSOT debounce window to avoid redundant scans.
     */
    private scheduleFootprint(): void {
        if (this.footprintTimer) {
            clearTimeout(this.footprintTimer);
        }
        this.footprintTimer = setTimeout(() => {
            this.footprintTimer = undefined;
            try {
                this.onFootprintUpdate?.();
            } catch (error) {
                this.log(
                    `Footprint update failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }, SSOT_REGENERATE_DEBOUNCE_MS);
    }

    public dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        if (this.footprintTimer) {
            clearTimeout(this.footprintTimer);
            this.footprintTimer = undefined;
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
