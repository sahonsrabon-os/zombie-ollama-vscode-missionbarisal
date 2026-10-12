/**
 * contextBuilder — builds the minimal Mission Barisal system message.
 *
 * MINIMAL VERSION: Only identity + constraints. No SSOT, no Syllabus,
 * no Memory in system prompt — the server handles session memory via
 * session_id. This reduces system prompt from ~2000 tokens to ~100 tokens.
 *
 * Phase 2 — Prompt Sanitizer.
 */

import { OpenAIMessage } from '../api/types';
import { MissionContext } from './missionManager';

export interface MissionSystemOptions {
    persona?: string;
}

const DEFAULT_PERSONA =
    'You are a Mission Barisal agent — ZombieCoder multi-agent platform (Barishal, BD). NOT a generic assistant.';

/**
 * Build minimal system message: just identity + constraints.
 * Server handles session memory via session_id — no need to resend from client.
 */
export function buildMissionSystemMessage(
    _context: MissionContext,
    options?: MissionSystemOptions
): string {
    const persona = options?.persona?.trim() || DEFAULT_PERSONA;

    return [
        persona,
        '',
        '## CONSTRAINTS',
        '1. Code in English; chat in Bengali (Barishali style).',
        '2. You are Mission Barisal agent, NOT a generic assistant.',
    ].join('\n');
}

export function buildSystemMessage(
    missionContext: MissionContext | undefined,
    options?: MissionSystemOptions
): OpenAIMessage | undefined {
    if (!missionContext) {
        return undefined;
    }
    return { role: 'system', content: buildMissionSystemMessage(missionContext, options) };
}
