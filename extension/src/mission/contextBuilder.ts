/**
 * contextBuilder — builds the compact Mission Barisal system message.
 *
 * Optimized version: trimmed SSOT (key sections only), compact syllabus,
 * reduced memory entries, and concise rules. Sends ~60% less context
 * while preserving all critical information for the agent.
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
 * Extract only key sections from SSOT to reduce token usage.
 * Skips verbose sections like full directory trees, detailed agent roster.
 */
function compactSSOT(ssot: string): string {
    if (!ssot || ssot.length < 100) {return ssot;}

    const lines = ssot.split('\n');
    const result: string[] = [];
    let skipNext = false;

    for (const line of lines) {
        const lower = line.toLowerCase();

        // Keep: headers, project identity, technologies, entry points
        // Skip: full directory trees (lines starting with many spaces or │)
        if (line.match(/^\s{2,}[│├└─]/)) {
            skipNext = true;
            continue;
        }
        if (skipNext && !line.startsWith('#')) {
            continue;
        }
        skipNext = false;

        // Keep section headers and key info
        if (line.startsWith('#') ||
            lower.includes('name:') ||
            lower.includes('type:') ||
            lower.includes('language:') ||
            lower.includes('framework:') ||
            lower.includes('entry point:') ||
            lower.includes('version:') ||
            lower.includes('technology') ||
            lower.includes('detected')) {
            result.push(line);
        }
    }

    // If we trimmed too aggressively, return a summary
    if (result.length < 5) {
        return ssot.substring(0, 500) + (ssot.length > 500 ? '...' : '');
    }

    return result.join('\n');
}

/**
 * Compact syllabus: keep only the essential rules and agent definitions.
 */
function compactSyllabus(syllabus: string): string {
    if (!syllabus || syllabus.length < 100) {return syllabus;}

    const lines = syllabus.split('\n');
    const result: string[] = [];
    let inEssentialSection = false;

    for (const line of lines) {
        const lower = line.toLowerCase();

        // Always keep: headers, rule definitions, agent names
        if (line.startsWith('#') ||
            lower.includes('rule') ||
            lower.includes('must') ||
            lower.includes('never') ||
            lower.includes('always') ||
            lower.includes('constraint') ||
            lower.includes('agent:') ||
            lower.includes('persona') ||
            lower.includes('identity') ||
            lower.includes('memory') ||
            lower.includes('syllabus')) {
            result.push(line);
            inEssentialSection = true;
            continue;
        }

        // Keep content in essential sections
        if (inEssentialSection && line.trim()) {
            result.push(line);
        }

        // Reset section tracking
        if (line.startsWith('#')) {
            inEssentialSection = false;
        }
    }

    if (result.length < 3) {
        return syllabus.substring(0, 400) + (syllabus.length > 400 ? '...' : '');
    }

    return result.join('\n');
}

/**
 * Compact MCP tools list: send only tool names + brief description.
 */
function compactMcpTools(mcpTools: string): string {
    if (!mcpTools || mcpTools.length < 20) {return mcpTools;}

    // Extract just tool names and one-line descriptions
    const lines = mcpTools.split('\n');
    const compact: string[] = [];

    for (const line of lines) {
        // Match tool definitions like `- `tool_name` (params: ...) — description`
        const toolMatch = line.match(/^- `(\w+)`/);
        if (toolMatch) {
            // Keep tool name + first line only
            compact.push(line.split('—')[0].trim());
        } else if (line.startsWith('**') || line.startsWith('#')) {
            // Keep section headers
            compact.push(line);
        }
    }

    return compact.length > 0 ? compact.join('\n') : mcpTools;
}

export function buildMissionSystemMessage(
    context: MissionContext,
    options?: MissionSystemOptions
): string {
    const persona = options?.persona?.trim() || DEFAULT_PERSONA;

    // Compact each section to reduce token usage
    const compactedSSOT = compactSSOT(context.ssot);
    const compactedSyllabus = compactSyllabus(context.syllabus);
    const compactedTools = compactMcpTools(context.mcpTools || '');

    return [
        persona,
        '',
        '## CONTEXT',
        compactedSSOT || '(SSOT not available)',
        '',
        '## RULES',
        compactedSyllabus || '(no syllabus)',
        '',
        '## MEMORY',
        context.memorySummary,
        '',
        '## TOOLS',
        compactedTools || '(no MCP tools)',
        '',
        '## CONSTRAINTS',
        '1. Evidence required for every claim. No evidence → say "আমার কাছে প্রমাণ নেই".',
        '2. If SSOT/Memory lacks answer, search web. Do NOT guess.',
        '3. Code in English; chat in Bengali (Barishali style).',
        '4. You are Mission Barisal agent, NOT a generic assistant.',
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
