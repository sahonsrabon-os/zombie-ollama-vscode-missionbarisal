/**
 * autoToolCall — Detect and execute tool calls from model text responses.
 *
 * When a model doesn't natively support the `tools` parameter, it may still
 * output tool calls as JSON in its text response. This module:
 *   1. Detects JSON tool call patterns in text
 *   2. Parses the tool name + arguments
 *   3. Returns structured tool call objects for execution
 *
 * Supported formats:
 *   - {"tool": "read_file", "args": {"filePath": "..."}}
 *   - {"name": "read_file", "arguments": {"filePath": "..."}}
 *   - {"function": "read_file", "parameters": {"filePath": "..."}}
 *   - ```json\n{"tool": "...", "args": {...}}\n```
 */

export interface DetectedToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * Patterns that indicate the model is trying to call a tool.
 * Each pattern captures: (1) tool name, (2) arguments JSON string.
 */
const TOOL_CALL_PATTERNS: RegExp[] = [
    // Pattern 1: {"tool": "name", "args": {...}}
    /\{[\s]*"tool"[\s]*:[\s]*"([^"]+)"[\s]*,[\s]*"args"[\s]*:[\s]*(\{[^}]*\})[\s]*\}/g,
    // Pattern 2: {"name": "name", "arguments": {...}}
    /\{[\s]*"name"[\s]*:[\s]*"([^"]+)"[\s]*,[\s]*"arguments"[\s]*:[\s]*(\{[^}]*\})[\s]*\}/g,
    // Pattern 3: {"function": "name", "parameters": {...}}
    /\{[\s]*"function"[\s]*:[\s]*"([^"]+)"[\s]*,[\s]*"parameters"[\s]*:[\s]*(\{[^}]*\})[\s]*\}/g,
    // Pattern 4: In code blocks ```json\n{...}\n```
    /```json\s*\n?\{[\s]*"(?:tool|name|function)"[\s]*:[\s]*"([^"]+)"[\s]*,[\s]*"(?:args|arguments|parameters)"[\s]*:[\s]*(\{[^}]*\})[\s]*\}\s*\n?```/g,
];

/**
 * Tool names that are commonly available in coding assistants.
 * Used to increase confidence that a detected JSON is a tool call.
 */
const KNOWN_TOOL_NAMES = new Set([
    'read_file', 'write_file', 'edit_file', 'search_files', 'list_files',
    'run_terminal', 'execute_command', 'web_search', 'browse_web',
    'create_file', 'delete_file', 'rename_file', 'copy_file',
    'read_directory', 'search_code', 'grep', 'glob', 'find',
    'agent_mission', 'call_agent', 'delegate_task',
    'memory_store', 'memory_retrieve', 'memory_search',
]);

/**
 * Detect tool calls embedded in the model's text response.
 * Returns an array of detected tool calls, or empty if none found.
 */
export function detectToolCallsFromText(text: string): DetectedToolCall[] {
    if (!text || text.length < 10) return [];

    const results: DetectedToolCall[] = [];
    const seen = new Set<string>();

    for (const pattern of TOOL_CALL_PATTERNS) {
        // Reset regex state
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(text)) !== null) {
            const toolName = match[1];
            const argsJson = match[2];

            if (!toolName || !argsJson) continue;

            // Skip if we already detected this tool call
            const key = `${toolName}:${argsJson}`;
            if (seen.has(key)) continue;
            seen.add(key);

            try {
                const args = JSON.parse(argsJson) as Record<string, unknown>;

                // Generate a unique ID
                const id = `auto_${toolName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                results.push({
                    id,
                    name: toolName,
                    arguments: args,
                });
            } catch {
                // JSON parse failed — skip this match
                continue;
            }
        }
    }

    return results;
}

/**
 * Check if a text response looks like it contains tool calls.
 * Quick check without full parsing.
 */
export function looksLikeToolCall(text: string): boolean {
    if (!text || text.length < 20) return false;

    // Quick heuristic: look for tool-calling JSON patterns
    const indicators = [
        '"tool":',
        '"name":',
        '"function":',
        '"args":',
        '"arguments":',
        '"parameters":',
    ];

    let matches = 0;
    for (const indicator of indicators) {
        if (text.includes(indicator)) {
            matches++;
        }
    }

    // Need at least 2 indicators (e.g., "tool" + "args")
    if (matches < 2) return false;

    // Check if it starts with { or ```json
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('```json')) {
        return false;
    }

    return true;
}

/**
 * Format tool call results for re-injection into the conversation.
 * Returns a user message with the tool results.
 */
export function formatToolResults(toolCalls: DetectedToolCall[], results: unknown[]): string {
    const parts: string[] = [];

    for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const result = results[i];

        parts.push(
            `[Tool Result: ${tc.name}]\n` +
            `Arguments: ${JSON.stringify(tc.arguments)}\n` +
            `Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`
        );
    }

    return parts.join('\n\n');
}
