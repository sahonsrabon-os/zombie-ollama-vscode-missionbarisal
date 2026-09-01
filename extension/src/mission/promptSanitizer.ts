import { OpenAIMessage } from '../api/types';

type Logger = (message: string) => void;

// Static sets for O(1) direct lookup - Zero Object Re-creation
const INSTRUCTION_TAGS = new Set([
    'instructions', 'toolUseInstructions', 'notebookInstructions',
    'outputFormatting', 'memoryInstructions', 'skills', 'agents',
    'modeInstructions', 'context', 'reminderInstructions'
]);

const BOILERPLATE_KEYWORDS = [
    'GitHub Copilot', 'Microsoft content polic', 'expert AI programming assistant',
    'Follow Microsoft', 'When asked for your name', 'violates copyrights',
    'highly sophisticated automated coding agent', 'notebookInstructions',
    'toolUseInstructions', 'modeInstructions'
];

/** Fast text extractor without intermediate array joining overhead */
export function getMessageText(message: OpenAIMessage): string {
    const content = message.content;
    if (typeof content === 'string') return content;
    if (!content) return '';
    
    if (Array.isArray(content)) {
        let text = '';
        for (let i = 0; i < content.length; i++) {
            const part = content[i];
            if (typeof part === 'string') text += part;
            else if (part && typeof part === 'object' && 'text' in part) {
                text += (part as { text: string }).text;
            }
        }
        return text;
    }
    return '';
}

/** Fast Boilerplate Detection — Direct String Searching without Regex Engines */
export function isCopilotBoilerplate(text: string): boolean {
    if (text.length < 300) return false;
    
    let hits = 0;
    const lower = text.toLowerCase();
    
    for (let i = 0; i < BOILERPLATE_KEYWORDS.length; i++) {
        if (lower.includes(BOILERPLATE_KEYWORDS[i].toLowerCase())) {
            hits++;
            if (hits >= 2) return true; // Lightning Fast Early Exit!
        }
    }
    return false;
}

/** Non-backtracking Fast Tag Stripper using Index Boundaries */
export function stripInstructionBlocksFast(text: string): string {
    if (!text || text.indexOf('<') === -1) return text; // Fast-path: Skip parsing if no XML tags exist!

    let result = text;
    for (const tag of INSTRUCTION_TAGS) {
        const openTag = `<${tag}`;
        const closeTag = `</${tag}>`;
        
        let startIdx = result.indexOf(openTag);
        while (startIdx !== -1) {
            const endIdx = result.indexOf(closeTag, startIdx);
            if (endIdx !== -1) {
                // Cut the whole block <tag>...</tag>
                result = result.slice(0, startIdx) + result.slice(endIdx + closeTag.length);
            } else {
                // If closing tag is missing, cut till closing bracket '>' of the opening tag
                const tagCloseIdx = result.indexOf('>', startIdx);
                if (tagCloseIdx !== -1) {
                    result = result.slice(0, startIdx) + result.slice(tagCloseIdx + 1);
                } else break;
            }
            startIdx = result.indexOf(openTag);
        }
    }
    return result.trim();
}

/**
 * Ultra-Fast Single-Pass Pipeline Optimized for UDS Stream IPC
 */
export function sanitizeMessages(
    messages: readonly OpenAIMessage[],
    log?: Logger
): OpenAIMessage[] {
    const len = messages.length;
    if (len === 0) return [];

    const out: OpenAIMessage[] = [];
    const validToolIds = new Set<string>();

    for (let i = 0; i < len; i++) {
        const msg = messages[i];
        const text = getMessageText(msg);

        // 1. Drop Copilot Boilerplate (O(N) Fast Search)
        if (isCopilotBoilerplate(text)) {
            log?.(` [uds-core] Dropped middleman boilerplate`);
            continue;
        }

        // 2. Strip instructions fast (Skips entirely if no '<' found)
        const cleanedText = stripInstructionBlocksFast(text);

        // Check content validity inline
        const hasTools = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
        if (!cleanedText && !hasTools && msg.role !== 'system') {
            continue; // Empty payload drop
        }

        // Create sanitized payload reference
        let activeMsg: OpenAIMessage = (cleanedText !== text) 
            ? { ...msg, content: cleanedText } 
            : msg;

        // Track tool_calls IDs for orphan matching
        if (hasTools && msg.tool_calls) {
            const toolCalls = msg.tool_calls as Array<{ id?: string }>;
            for (let j = 0; j < toolCalls.length; j++) {
                const toolCall = toolCalls[j];
                if (toolCall && 'id' in toolCall && toolCall.id) validToolIds.add(toolCall.id);
            }
        }

        // 3. Orphan Tool Validation (Instant Drop)
        if (activeMsg.role === 'tool') {
            const toolId = (activeMsg as any).tool_call_id;
            if (!toolId || !validToolIds.has(toolId)) {
                log?.(` [uds-core] Dropped orphaned tool: ${toolId}`);
                continue;
            }
        }

        // 4. Smart Merge consecutive user messages inline (No separate Loop)
        const lastIdx = out.length - 1;
        if (activeMsg.role === 'user' && lastIdx >= 0 && out[lastIdx].role === 'user') {
            const prevText = getMessageText(out[lastIdx]);
            out[lastIdx] = {
                ...out[lastIdx],
                content: prevText ? `${prevText}\n${cleanedText}` : cleanedText
            };
            log?.(` [uds-core] Inline merged user context`);
            continue;
        }

        out.push(activeMsg);
    }

    return out;
}