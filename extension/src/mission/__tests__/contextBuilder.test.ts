import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMissionSystemMessage, buildSystemMessage } from '../contextBuilder';
import { MissionContext } from '../missionManager';

function makeContext(overrides?: Partial<MissionContext>): MissionContext {
    return {
        workspaceRoot: '/tmp/ws',
        sessionId: 'ws-test-session',
        ssot: '# SSOT\nproject: demo',
        syllabus: '# Syllabus\nrules here',
        memorySummary: '- [2026-08-05] agent: summary',
        mcpTools: '**Default MCP (Mission Barisal server):**\n- `read_file` — Read a file',
        ...overrides,
    };
}

describe('contextBuilder — minimal system prompt', () => {
    test('system message contains identity persona', () => {
        const message = buildMissionSystemMessage(makeContext());
        assert.ok(message.includes('Mission Barisal agent'));
        assert.ok(message.includes('ZombieCoder'));
    });

    test('system message contains constraints section', () => {
        const message = buildMissionSystemMessage(makeContext());
        assert.ok(message.includes('## CONSTRAINTS'));
        assert.ok(message.includes('Bengali'));
    });

    test('system message does NOT include SSOT, Memory, or MCP tools', () => {
        const message = buildMissionSystemMessage(makeContext());
        assert.ok(!message.includes('## TOOLS'));
        assert.ok(!message.includes('## MEMORY'));
        assert.ok(!message.includes('## RULES'));
        assert.ok(!message.includes('read_file'));
    });

    test('buildSystemMessage returns undefined without a mission context', () => {
        assert.equal(buildSystemMessage(undefined), undefined);
    });

    test('buildSystemMessage wraps the message as a system role', () => {
        const msg = buildSystemMessage(makeContext());
        assert.ok(msg);
        assert.equal(msg?.role, 'system');
        assert.equal(typeof msg?.content, 'string');
        assert.ok(String(msg?.content).includes('Mission Barisal agent'));
    });

    test('custom persona is used when provided', () => {
        const msg = buildSystemMessage(makeContext(), { persona: 'Custom agent persona' });
        assert.ok(msg);
        assert.ok(String(msg?.content).includes('Custom agent persona'));
    });
});
