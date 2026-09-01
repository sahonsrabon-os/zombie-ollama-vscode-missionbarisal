import * as vscode from 'vscode';
import {
  convertMessage,
  flattenToolResultContent,
  NormalizedMessage,
  NormalizedPart,
  NormalizedRole,
} from '../chat/messageConverter';
import { estimateTextTokens } from '../chat/tokenBudget';
import { OpenAIMessage } from '../api/types';

type Logger = (message: string) => void;

/**
 * Adapter between VS Code's `LanguageModelChat*` object model and the plain
 * data shapes used by the pure chat modules. Everything vscode-class-specific
 * (instanceof checks, duck typing for older hosts) lives here so the rest of
 * the provider stays testable.
 */

export function convertAllMessages(
  messages: readonly vscode.LanguageModelChatMessage[],
  enableImageInput: boolean,
  log: Logger
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];
  for (const [i, msg] of messages.entries()) {
    // Debug: show what VS Code actually sent for each message
    const contentInfo = describeVSCodeContent(msg.content);
    log(`  [debug] VS Code msg[${i}]: role=${mapRole(msg.role)}, content.length=${msg.content.length}, ${contentInfo}`);

    const normalized: NormalizedMessage = {
      role: mapRole(msg.role),
      parts: msg.content.map((part) => classifyPart(part, log)),
    };

    const converted = convertMessage(normalized, { enableImageInput }, log);
    log(`  [debug] Converted msg[${i}]: ${converted.length} OpenAI message(s) produced`);

    result.push(...converted);
  }
  return result;
}

export function mapRole(role: vscode.LanguageModelChatMessageRole): NormalizedRole {
  if (role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }
  return 'user';
}

/**
 * Produce a one-line human-readable description of a VS Code content array
 * for debug logging. Shows the type and rough size of each part so we can
 * trace exactly what the host is sending.
 */
function describeVSCodeContent(
  content: ReadonlyArray<unknown>
): string {
  const parts = content.map((part) => {
    if (part instanceof vscode.LanguageModelTextPart) {
      const len = part.value.length;
      return `text(${len}chars)`;
    }
    if (part instanceof vscode.LanguageModelToolResultPart) {
      return `toolResult(callId=${part.callId})`;
    }
    if (part instanceof vscode.LanguageModelToolCallPart) {
      return `toolCall(name=${part.name},callId=${part.callId})`;
    }
    if (part instanceof vscode.LanguageModelDataPart) {
      return `data(${part.mimeType})`;
    }
    // Duck-typed fallback
    const anyPart = part as Record<string, unknown>;
    if (typeof anyPart.value === 'string') {
      return `duckText(${anyPart.value.length}chars)`;
    }
    if ('callId' in anyPart) {
      return `duckTool(callId=${anyPart.callId})`;
    }
    return `unknown(${JSON.stringify(Object.keys(anyPart)).slice(0, 60)})`;
  });
  return `parts=[${parts.join(', ')}]`;
}

/**
 * Translate a vscode LanguageModel*Part into the plain data shape used by
 * messageConverter. Falls back to duck typing for older VS Code versions
 * where the constructors may not match.
 */
export function classifyPart(part: unknown, log: Logger): NormalizedPart {
  if (part instanceof vscode.LanguageModelTextPart) {
    return { kind: 'text', value: part.value };
  }
  if (part instanceof vscode.LanguageModelToolResultPart) {
    return {
      kind: 'toolResult',
      callId: part.callId,
      content: flattenToolResultContent(part.content),
    };
  }
  if (part instanceof vscode.LanguageModelToolCallPart) {
    return {
      kind: 'toolCall',
      callId: part.callId,
      name: part.name,
      input: part.input,
    };
  }
  if (part instanceof vscode.LanguageModelDataPart) {
    return { kind: 'image', mimeType: part.mimeType, data: part.data };
  }
  return classifyPartDuckTyped(part, log);
}

function classifyPartDuckTyped(part: unknown, log: Logger): NormalizedPart {
  if (typeof part !== 'object' || part === null) {
    log(`  [warn] classifyPart: non-object part (type=${typeof part}) — dropping as unknown`);
    return { kind: 'unknown' };
  }
  const anyPart = part as Record<string, unknown>;

  // Duck-typed LanguageModelTextPart: `{ value: '...' }`. The instanceof
  // check can fail when a part crosses the RPC boundary (or on hosts where
  // the class identity differs), and dropping it silently blanked the whole
  // user message. A plain string `value` with no tool markers is text.
  if (typeof anyPart.value === 'string' && !('callId' in anyPart)) {
    return { kind: 'text', value: anyPart.value };
  }

  if ('callId' in anyPart && 'content' in anyPart && !('name' in anyPart)) {
    log(`  Found tool result (duck-typed): callId=${anyPart.callId}`);
    return {
      kind: 'toolResult',
      callId: String(anyPart.callId),
      content: flattenToolResultContent(anyPart.content),
    };
  }
  if ('callId' in anyPart && 'name' in anyPart && 'input' in anyPart) {
    log(`  Found tool call (duck-typed): callId=${anyPart.callId}, name=${anyPart.name}`);
    return {
      kind: 'toolCall',
      callId: String(anyPart.callId),
      name: String(anyPart.name),
      input: anyPart.input,
    };
  }
  log(`  [warn] classifyPart: unrecognized duck-typed part keys=[${Object.keys(anyPart).join(',')}] — dropping as unknown`);
  return { kind: 'unknown' };
}

/**
 * Rough token estimate for a full chat message (char/4 approximation).
 *
 * Non-text parts contribute too: tool calls / tool results are serialized
 * and counted, and each image contributes a conservative fixed overhead so
 * we don't undercount multimodal conversations (otherwise the output-token
 * budget overshoots the real context window).
 */
export function countMessageTokens(message: vscode.LanguageModelChatMessage): number {
  let tokens = 0;
  for (const part of message.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      tokens += estimateTextTokens(part.value);
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      tokens += estimateTextTokens(part.name + JSON.stringify(part.input ?? {}));
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      const body = flattenToolResultContent(part.content);
      tokens += estimateTextTokens(body);
    } else if (part instanceof vscode.LanguageModelDataPart) {
      // Images don't map cleanly to tokens — reserve a conservative fixed
      // overhead so multimodal requests aren't massively undercounted.
      tokens += 800;
    }
  }
  return tokens;
}
