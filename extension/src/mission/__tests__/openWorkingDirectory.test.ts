import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { openWorkingDirectory, computeSessionId } from '../openWorkingDirectory';

const tempDirs: string[] = [];

function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-wd-'));
    tempDirs.push(dir);
    return dir;
}

after(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe('openWorkingDirectory — mission layout + MCP set_working_dir', () => {
    test('creates SSOT.md, syllabus.md and memory.json in a fresh folder', async () => {
        const dir = makeTempDir();
        const result = await openWorkingDirectory(dir);

        assert.equal(result.directory, path.resolve(dir));
        assert.deepEqual(
            result.created,
            [
                '.zombiecoder/SSOT.md',
                '.zombiecoder/agents/syllabus.md',
                '.zombiecoder/agents/memory.json',
            ]
        );
        for (const rel of result.created) {
            assert.equal(fs.existsSync(path.join(dir, rel)), true, `${rel} must exist`);
        }
        // No MCP callback given → honest 'skipped', not a fake success.
        assert.equal(result.mcp, 'skipped');
    });

    test('creates missing nested folders and yields a stable session id', async () => {
        const dir = path.join(makeTempDir(), 'brand', 'new', 'project');
        tempDirs.push(dir);
        const first = await openWorkingDirectory(dir);
        const again = await openWorkingDirectory(dir);

        assert.equal(fs.existsSync(path.join(dir, '.zombiecoder/SSOT.md')), true);
        assert.match(first.sessionId, /^ws-[0-9a-f]{16}$/);
        assert.equal(first.sessionId, again.sessionId);
        assert.equal(first.sessionId, computeSessionId(dir));
    });

    test('generated SSOT carries the updated personas and mission principles', async () => {
        const dir = makeTempDir();
        // A real source file so the footprint scanner has something to detect
        // (footprint section is skipped for language-less folders by design).
        fs.mkdirSync(path.join(dir, 'src'));
        fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'export const x = 1;\n');
        await openWorkingDirectory(dir);
        const ssot = fs.readFileSync(path.join(dir, '.zombiecoder', 'SSOT.md'), 'utf8');

        for (const marker of [
            '## Agent Personas',
            'The Builder',
            'The Judge',
            'Hallucination Minimization',
            'Dual Validation',
            '## System Identity',
        ]) {
            assert.equal(ssot.includes(marker), true, `SSOT must contain: ${marker}`);
        }
        // Syllabus gets the footprint section, memory gets the full structure.
        const syllabus = fs.readFileSync(path.join(dir, '.zombiecoder', 'agents', 'syllabus.md'), 'utf8');
        assert.match(syllabus, /Workspace Footprint/i);
        const memory = JSON.parse(
            fs.readFileSync(path.join(dir, '.zombiecoder', 'agents', 'memory.json'), 'utf8')
        ) as { entries?: unknown[] };
        assert.equal(Array.isArray(memory.entries), true);
    });

    test('calls MCP set_working_dir with the resolved directory', async () => {
        const dir = makeTempDir();
        const seen: string[] = [];
        const result = await openWorkingDirectory(dir, {
            callMcpSetWorkingDir: async (directory) => {
                seen.push(directory);
                return { ok: true, generated: ['.zombiecoder/SSOT.md'] };
            },
        });

        assert.deepEqual(seen, [path.resolve(dir)]);
        assert.equal(result.mcp, 'ok');
        assert.equal(typeof result.mcpDetail, 'string');
    });

    test('MCP failure never blocks the local layout (truthful failure)', async () => {
        const dir = makeTempDir();
        const result = await openWorkingDirectory(dir, {
            callMcpSetWorkingDir: async () => {
                throw new Error('server unreachable: ECONNREFUSED 127.0.0.1:5050');
            },
        });

        assert.equal(result.mcp, 'failed');
        assert.match(String(result.mcpDetail), /ECONNREFUSED/);
        // Local files were created first — they must survive the MCP failure.
        assert.equal(result.created.length, 3);
        assert.equal(fs.existsSync(path.join(dir, '.zombiecoder', 'SSOT.md')), true);
    });

    test('rejects an invalid directory', async () => {
        await assert.rejects(openWorkingDirectory(''), /Invalid working directory/);
    });
});
