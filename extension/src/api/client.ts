import * as vscode from 'vscode';
import {
  OpenAIChatCompletionRequest,
  OpenAICompletionRequest,
  OpenAICompletionResponse,
  OpenAIModelsResponse,
  OpenAIUsage,
} from './types';
import { GatewayConfig } from '../config/gatewayConfig';
import {
  resolveActiveTransport,
  TransportTarget,
  udsChatRequest,
  udsRequest,
} from '../mission/transport';
import {
  AccumulatedToolCall,
  LegacyFunctionCall,
  ToolCallAccumulator,
  ToolCallDelta,
} from './toolCallAccumulator';

/**
 * Trim trailing slashes and a trailing `/v1` (or `/openai/v1`) segment so the
 * client can safely append `/v1/models` / `/v1/chat/completions` regardless of
 * how the user typed their Server URL in settings.
 */
export function normalizeBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  while (url.endsWith('/')) { url = url.slice(0, -1); }
  url = url.replace(/\/(openai\/)?v1$/i, '');
  return url;
}

/**
 * Strip a leading `Bearer ` (case-insensitive) from the configured API key
 * and trim whitespace. The client always prepends `Bearer`, so users who
 * paste their full `Authorization: Bearer …` header would otherwise send
 * `Bearer Bearer …` and get 401s.
 */
export function normalizeApiKey(rawKey: string | undefined): string {
  if (!rawKey) { return ''; }
  return rawKey.trim().replace(/^Bearer\s+/i, '');
}

/**
 * Build the request header set for the inference server. Authorization is
 * applied first so user-configured `customHeaders` can override it for
 * backends that need a non-Bearer auth scheme (e.g. Azure's `api-key`).
 * Empty/non-string values and empty header names are dropped.
 */
export function buildHeaders(
  apiKey: string | undefined,
  customHeaders: Record<string, string> | undefined
): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = normalizeApiKey(apiKey);
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  if (customHeaders) {
    for (const [name, value] of Object.entries(customHeaders)) {
      if (typeof value === 'string' && name.length > 0) {
        headers[name] = value;
      }
    }
  }
  return headers;
}

/**
 * Wire-format chat-completion chunk that downstream consumers see.
 *
 * `usage` is set only on the final chunk of a stream (OpenAI's convention
 * when the request was sent with `stream_options.include_usage: true`).
 * Older or stripped servers may omit it entirely — we surface it when
 * present so VS Code's chat context-window widget can render running
 * token counts (issue #24).
 */
export interface GatewayStreamChunk {
  content: string;
  reasoning_content: string;
  tool_calls: AccumulatedToolCall[];
  finished_tool_calls: AccumulatedToolCall[];
  usage?: OpenAIUsage;
  /** Server-side verification metadata from the anti-dote chain. */
  verification?: {
    typeSafe?: boolean;
    crossVerified?: boolean;
    compilerChecked?: boolean;
    checks?: string[];
  };
}

/**
 * Re-export so existing imports of `StreamingToolCall` from this module keep
 * working without churn.
 */
export type StreamingToolCall = AccumulatedToolCall;

/**
 * Shape of an OpenAI streaming/non-streaming choice payload that we know
 * how to read. Kept loose; servers vary.
 */
interface ParsedChunk {
  delta?: {
    content?: string;
    reasoning_content?: string;
    // Ollama's OpenAI-compatible endpoint streams thinking as `reasoning`
    // rather than `reasoning_content` (issue #59).
    reasoning?: string;
    tool_calls?: ToolCallDelta[];
    function_call?: LegacyFunctionCall;
  };
  message?: {
    content?: string;
    reasoning_content?: string;
    reasoning?: string;
    text?: string;
    tool_calls?: ToolCallDelta[];
    function_call?: LegacyFunctionCall;
  };
  finishReason?: string;
  id?: string;
}

interface ServerErrorPayload {
  error: { message?: string } | string;
}

export type GatewayLogger = (message: string) => void;

/**
 * Timeout for the one-shot Ollama `GET /api/version` detection probe. Kept
 * well below `requestTimeout` so a non-Ollama server that hangs on unknown
 * paths delays model discovery by at most a few seconds, once.
 */
const DISCOVERY_PROBE_TIMEOUT_MS = 3000;

/**
 * Timeout for a `POST /api/show` metadata fetch. Only issued after the server
 * is confirmed to be Ollama, where `/api/show` is a fast metadata read — but
 * these calls gate the model list, so they must not inherit the 60s default.
 */
const DISCOVERY_SHOW_TIMEOUT_MS = 5000;

const SSE_DATA_PREFIX = 'data: ';
const SSE_DONE_LINE = 'data: [DONE]';
const ERROR_PREFIX = 'Inference server reported an error mid-stream: ';

/**
 * Lifecycle handles for the AbortController + the two timers used by a
 * streaming chat-completion request. Returned by `createStreamTimers` so the
 * main streaming function doesn't have to track them inline.
 */
interface StreamTimers {
  readonly controller: AbortController;
  readonly resetInactivity: () => void;
  /** Called once response headers arrive — switches to the inactivity timer. */
  readonly onHeadersReceived: () => void;
  /** Clears every outstanding timer + cancellation subscription. */
  readonly dispose: () => void;
}

/**
 * Throw a descriptive error for a failed chat-completion response, including
 * the response body when the server provided one. Pulled out of
 * `streamChatCompletion` so the main function stays under the
 * cognitive-complexity budget.
 */
async function assertChatStreamResponseOk(response: Response): Promise<void> {
  if (response.ok && response.body) { return; }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat completion failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  throw new Error('Response body is null');
}

/**
 * Node's `fetch` (undici) throws an opaque `TypeError: fetch failed` and stashes
 * the real reason — DNS failure (`ENOTFOUND`), connection refused
 * (`ECONNREFUSED`), timeout (`ETIMEDOUT`), TLS error, etc. — on `error.cause`.
 * Surface that cause so users see *why* the connection failed instead of a bare
 * "fetch failed".
 */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && !error.message.includes(cause.message)) {
    return `${error.message}: ${cause.message}`;
  }
  return error.message;
}

/**
 * HTTP-level failure from `/v1/completions`. Carries the raw status and
 * response body so callers can react to specific server limitations — e.g.
 * vLLM's `400 "suffix is not currently supported"` — instead of string-matching
 * the human-facing message.
 */
export class CompletionHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = 'CompletionHttpError';
  }
}

export class GatewayClient {
  private config: GatewayConfig;
  private readonly log: GatewayLogger;
  /** Phase 4 — memoized active transport, keyed by server URL. */
  private transportCache: { key: string; target: TransportTarget } | undefined;

  constructor(config: GatewayConfig, logger?: GatewayLogger) {
    this.config = config;
    this.log = logger ?? (() => { /* no-op */ });
  }

  public updateConfig(config: GatewayConfig): void {
    this.config = config;
    this.transportCache = undefined;
  }

  /**
   * Reset the memoized active transport so the next request re-probes
   * the fallback chain. Used by the `resetAll` command.
   */
  public clearTransportCache(): void {
    this.transportCache = undefined;
  }

  /**
   * Phase 4 — resolve the active transport for the configured server URL,
   * probing the fallback chain once per URL change (HTTP → SSE → WebSocket
   * → UDS, adapted to the URL shape). Memoized so per-request probing does
   * not add latency.
   */
  private async resolveTransport(): Promise<TransportTarget> {
    const serverUrl = this.config.serverUrl;
    const cached = this.transportCache;
    if (cached && cached.key === serverUrl) {
      return cached.target;
    }
    // Syllabus 7: UDS → HTTP → WS. When the server URL targets the local
    // machine (or is an explicit socket), probe the Unix socket FIRST — it is
    // port-independent and survives server location/port changes.
    //
    // IMPORTANT: If the UDS probe fails (e.g. server starting up, stale
    // socket), we cache the fallback (HTTP) but invalidate the cache on
    // the NEXT request so we retry UDS. This prevents the "UDS never
    // connects" bug where a single failed probe permanently locks us to HTTP.
    const trimmed = serverUrl.trim();
    const isLocal =
      /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?$/i.test(trimmed) ||
      /^unix:\/\//i.test(trimmed) ||
      /\.sock$/i.test(trimmed);
    const target = await resolveActiveTransport(serverUrl, (message) => this.log(message), {
      preferUds: isLocal,
      offlineFallbackUrl: this.config.offlineFallbackUrl,
    });
    this.transportCache = { key: serverUrl, target };

    // If UDS was preferred but we got HTTP/SSE/WS, the socket may have
    // been unavailable during probe. Schedule a re-probe on the next
    // request so we don't permanently skip UDS.
    if (isLocal && target.kind !== 'uds') {
      this.log(`  [transport] UDS unavailable during probe, will retry on next request`);
      // Clear cache after a delay so the next request re-probes
      setTimeout(() => {
        if (this.transportCache?.key === serverUrl && this.transportCache.target.kind !== 'uds') {
          this.transportCache = undefined;
        }
      }, 5000);
    }

    return target;
  }

  /**
   * Fetch available models from the server's models endpoint.
   *
   * Tries `/v1/models` first and falls back to `/models` so the client works
   * against servers that mount the OpenAI API at the root.
   */
  public async fetchModels(cancellationToken?: vscode.CancellationToken): Promise<OpenAIModelsResponse> {
    const target = await this.resolveTransport();

    // Phase 4 — Unix domain socket transport: request straight off the socket.
    if (target.kind === 'uds' && target.socketPath) {
      return this.fetchModelsOverUds(target.socketPath, cancellationToken);
    }

    const base = normalizeBaseUrl(target.baseUrl || this.config.serverUrl);
    const candidates = [`${base}/v1/models`, `${base}/models`];
    let lastError: Error | undefined;

    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      const isLast = i === candidates.length - 1;
      try {
        const result = await this.tryFetchModels(url, isLast, cancellationToken);
        if (result) { return result; }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isLast) { break; }
      }
    }

    const message = lastError ? describeFetchError(lastError) : 'unknown error';
    throw new Error(`Failed to connect to inference server at ${base}: ${message}`);
  }

  /** Phase 4 — fetch the model list over a Unix domain socket. */
  private async fetchModelsOverUds(
    socketPath: string,
    cancellationToken?: vscode.CancellationToken
  ): Promise<OpenAIModelsResponse> {
    const candidates = ['/v1/models', '/models'];
    let lastError: Error | undefined;

    for (const path of candidates) {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error('Request cancelled');
      }
      try {
        const response = await udsRequest({
          socketPath,
          path,
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: this.config.requestTimeout,
        });
        if (response.ok) {
          return await response.json();
        }
        if (response.status === 404) {
          this.log(`Models endpoint not found at ${path} (UDS), trying fallback...`);
          continue;
        }
        const bodyText = await response.text().catch(() => '');
        const truncated = bodyText.length > 200 ? bodyText.slice(0, 200) + '...' : bodyText;
        const suffix = truncated ? ' — ' + truncated : '';
        throw new Error(
          `Failed to fetch models from ${path} (UDS): ${response.status} ${response.statusText}${suffix}`
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // Mission Barisal UDS socket speaks JSON-RPC (MCP) — it has NO HTTP
    // /v1/models endpoint. When the socket can't serve the model list,
    // return an empty list instead of falling back to HTTP. This prevents
    // header polling over HTTP when UDS is the active transport.
    if (this.config.serverUrl) {
      this.log(`UDS cannot serve models — returning empty list (no HTTP fallback)`);
    }

    const message = lastError ? describeFetchError(lastError) : 'unknown error';
    throw new Error(`Failed to connect to inference server at UDS socket ${socketPath}: ${message}`);
  }

  /**
   * Attempt a single model-fetch against `url`. Returns the parsed response
   * on success, `undefined` if the endpoint returned 404 and `allowFallback`
   * is true, or throws on any other failure.
   */
  private async tryFetchModels(
    url: string,
    isLast: boolean,
    cancellationToken?: vscode.CancellationToken
  ): Promise<OpenAIModelsResponse | undefined> {
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.getHeaders(),
    }, cancellationToken);

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 404 && !isLast) {
      this.log(`Models endpoint not found at ${url}, trying fallback...`);
      return undefined;
    }

    const bodyText = await response.text().catch(() => '');
    const truncated = bodyText.length > 200 ? bodyText.slice(0, 200) + '...' : bodyText;
    const suffix = truncated ? ' — ' + truncated : '';
    throw new Error(
      `Failed to fetch models from ${url}: ${response.status} ${response.statusText}${suffix}`
    );
  }

  /**
   * Stream chat completions from `/v1/chat/completions`. Tool calls are
   * accumulated by index across chunks (their `id` may arrive later than
   * their name/arguments). Manages two timers explicitly:
   *   - the configured `requestTimeout` applies until headers arrive,
   *   - then a per-read inactivity timer of the same duration is reset on
   *     each chunk so long generations aren't aborted mid-stream.
   */
  public async *streamChatCompletion(
    request: OpenAIChatCompletionRequest,
    cancellationToken: vscode.CancellationToken
  ): AsyncGenerator<GatewayStreamChunk, void, unknown> {
    const target = await this.resolveTransport();
    const accumulator = new ToolCallAccumulator();
    const timers = this.createStreamTimers(cancellationToken);

    try {
      // Phase 4 — Unix domain socket transport: the Mission Barisal socket
      // speaks newline-delimited JSON (MCP + `{type:'chat'}` messages), NOT
      // HTTP. Send the chat message over the socket and collect the events;
      // the final content arrives in `response_done.data.content`.
      //
      // FALLBACK: If UDS fails (timeout, connection refused, server down),
      // we transparently fall back to HTTP/SSE instead of crashing.
      let response: Response;
      if (target.kind === 'uds' && target.socketPath) {
        try {
          const chatResult = await udsChatRequest({
            socketPath: target.socketPath,
            messages: request.messages,
            sessionId: typeof request.session_id === 'string' ? request.session_id : 'default',
            agentId: typeof request.agent_id === 'string' ? request.agent_id : request.model,
            params: { model: request.model, temperature: request.temperature },
            timeoutMs: this.config.requestTimeout,
            workspace: typeof request.workspace === 'string' ? request.workspace : undefined,
          });
          timers.onHeadersReceived();

          // ─── Transparent: surface ALL server events to the user ───
          // The server's anti-dote chain streams: context_injecting →
          // type_safety_passed → cross_verify_check → compiler_check →
          // response_done. These events carry verification metadata that
          // the user deserves to see — not silently discarded.
          const verificationParts: string[] = [];
          for (const evt of chatResult.events) {
            const evtType = evt.type as string | undefined;
            if (!evtType || evtType === 'response_done' || evtType === 'error') { continue; }
            // Log every event for transparency.
            this.log(`  [server] ${evtType}: ${JSON.stringify(evt).substring(0, 200)}`);
            // Extract verification summary for reasoning display.
            if (evtType === 'type_safety_passed') {
              verificationParts.push(`✓ Input validated (schema + proof + consent)`);
            } else if (evtType === 'cross_verify_check') {
              const check = evt.check as string | undefined;
              const status = evt.status as string | undefined;
              if (check) {
                verificationParts.push(`${status === 'PASSED' ? '✓' : '✗'} Cross-verify: ${check}`);
              }
            } else if (evtType === 'compiler_check') {
              const passed = evt.passed as boolean | undefined;
              verificationParts.push(`${passed !== false ? '✓' : '✗'} Compiler check`);
            } else if (evtType === 'routing') {
              const to = evt.to as string | undefined;
              if (to) { verificationParts.push(`→ Routing: ${to}`); }
            } else if (evtType === 'type_safety_error') {
              const step = evt.step as string | undefined;
              verificationParts.push(`✗ Type safety failed: ${step}`);
            }
          }

          if (chatResult.error) {
            throw new Error(`${ERROR_PREFIX}${chatResult.error}`);
          }

          // If the server performed verification, surface it as thinking
          // blocks so the user sees the anti-dote chain in action.
          if (verificationParts.length > 0) {
            const verificationText = `[Anti-dote Verification]\n${verificationParts.join('\n')}`;
            yield {
              content: '',
              reasoning_content: verificationText,
              tool_calls: [],
              finished_tool_calls: [],
            };
          }

          // The UDS chat path returns the full content at the end.  We split it
          // into small chunks and yield them with micro-delays so VS Code's
          // Copilot Chat UI renders a streaming effect (progressive text
          // appearance, thinking blocks, etc.) instead of showing the entire
          // response all at once.
          const content = chatResult.content || '';
          const usage: OpenAIUsage | undefined = extractUsage(
            (chatResult.done?.usage ?? {}) as Record<string, unknown>
          );
          if (content) {
            // Check if the content has reasoning/thinking blocks. If so, emit
            // them as reasoning_content chunks first, then the visible text.
            const reasoningChunks = extractReasoningChunks(content);

            if (reasoningChunks.length > 0) {
              // Emit thinking blocks as reasoning_content
              for (const rc of reasoningChunks) {
                yield {
                  content: '',
                  reasoning_content: rc,
                  tool_calls: [],
                  finished_tool_calls: [],
                };
              }
              // Emit the visible (non-thinking) content as streaming text
              const visibleContent = stripThinkingBlocks(content);
              if (visibleContent) {
                yield* streamTextInChunks(visibleContent, usage);
              }
            } else {
              // No thinking blocks — stream the entire content as text chunks
              yield* streamTextInChunks(content, usage);
            }
          }

          const remaining = accumulator.drain(true);
          // Extract verification metadata from the server's response_done event.
          const doneVerification = chatResult.done?.verification as Record<string, unknown> | undefined;
          const verification = doneVerification ? {
            typeSafe: typeof doneVerification.type_safe === 'boolean' ? doneVerification.type_safe : undefined,
            crossVerified: typeof doneVerification.cross_verified === 'boolean' ? doneVerification.cross_verified : undefined,
            compilerChecked: typeof doneVerification.compiler_checked === 'boolean' ? doneVerification.compiler_checked : undefined,
            checks: verificationParts,
          } : (verificationParts.length > 0 ? { checks: verificationParts } : undefined);
          if (remaining.length > 0) {
            yield { content: '', reasoning_content: '', tool_calls: [], finished_tool_calls: remaining, verification };
          } else if (verification) {
            // Even if no tool calls, emit verification metadata in the final chunk.
            yield { content: '', reasoning_content: '', tool_calls: [], finished_tool_calls: [], verification };
          }
          return;
        } catch (udsError) {
          // UDS failed — log the error and fall through to HTTP/SSE.
          // This is the "fallback mechanism" the user expects: if the
          // socket path fails, try HTTP, don't just crash.
          this.log(`  [transport] UDS failed (${udsError instanceof Error ? udsError.message : String(udsError)}), falling back to HTTP/SSE`);
        }
      }

      // ─── HTTP/SSE fallback ───────────────────────────────
      // Either UDS was not available, or it failed. Try HTTP streaming.
      // Use the RESOLVED transport target's baseUrl when available (handles
      // Ollama-direct fallback), otherwise fall back to the configured serverUrl.
      // Always normalize to strip /v1 and trailing slashes to avoid double paths.
      {
        const rawBase = target.baseUrl || this.config.serverUrl;
        const baseUrl = normalizeBaseUrl(rawBase);
        const url = `${baseUrl}/v1/chat/completions`;
        response = await fetch(url, {
          method: 'POST',
          headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
          // `stream_options.include_usage` tells OpenAI-compatible servers to
          // emit a final SSE chunk containing `usage` totals once the model
          // finishes. We forward that to VS Code's chat context-window widget
          // (issue #24). Servers that don't recognise the option simply
          // ignore it; servers behind aggressive proxies may strip it.
          body: JSON.stringify({
            ...request,
            stream: true,
            stream_options: { ...(request.stream_options as object | undefined), include_usage: true },
          }),
          signal: timers.controller.signal,
        });

        // Headers received — switch from the request-deadline timer to the
        // per-chunk inactivity timer so long generations aren't aborted.
        timers.onHeadersReceived();
      }

      await assertChatStreamResponseOk(response);

      yield* this.readChatStreamChunks(response.body!, accumulator, cancellationToken, timers.resetInactivity);

      const remaining = accumulator.drain(true);
      if (remaining.length > 0) {
        yield { content: '', reasoning_content: '', tool_calls: [], finished_tool_calls: remaining };
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Chat completion request failed: ${describeFetchError(error)}`);
      }
      throw error;
    } finally {
      timers.dispose();
    }
  }

  /**
   * Read SSE chunks off the response body until done or cancelled, parsing
   * each line through {@link processSSELine}. Split out of
   * `streamChatCompletion` so the parent function stays under SonarCloud's
   * cognitive-complexity budget.
   */
  private async *readChatStreamChunks(
    body: ReadableStream<Uint8Array>,
    accumulator: ToolCallAccumulator,
    cancellationToken: vscode.CancellationToken,
    resetInactivity: () => void
  ): AsyncGenerator<GatewayStreamChunk, void, unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (cancellationToken.isCancellationRequested) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) { return; }

      resetInactivity();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const result = this.processSSELine(line, accumulator);
        if (result) { yield result; }
      }
    }
  }

  /**
   * Wire up the AbortController, request-deadline timer, and per-chunk
   * inactivity timer used by the streaming request. The two timers run
   * sequentially: the request timer fires until headers arrive, then the
   * inactivity timer takes over and is reset on each chunk.
   */
  private createStreamTimers(cancellationToken: vscode.CancellationToken): StreamTimers {
    const controller = new AbortController();
    const cancelSub = cancellationToken.onCancellationRequested(() => controller.abort());
    const headerTimeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
    let inactivityTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const resetInactivity = (): void => {
      if (inactivityTimeoutId) { clearTimeout(inactivityTimeoutId); }
      inactivityTimeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
    };
    return {
      controller,
      resetInactivity,
      onHeadersReceived: () => {
        clearTimeout(headerTimeoutId);
        resetInactivity();
      },
      dispose: () => {
        clearTimeout(headerTimeoutId);
        if (inactivityTimeoutId) { clearTimeout(inactivityTimeoutId); }
        cancelSub.dispose();
      },
    };
  }

  /**
   * Process one SSE line. Returns a chunk to yield, or null if there's
   * nothing to emit. Throws if the server sent an inline error payload —
   * the caller can then surface a real error instead of an empty stream.
   */
  private processSSELine(line: string, accumulator: ToolCallAccumulator): GatewayStreamChunk | null {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === SSE_DONE_LINE) { return null; }
    if (trimmed.startsWith('event:')) { return null; }
    if (!trimmed.startsWith(SSE_DATA_PREFIX)) { return null; }

    const data = trimmed.slice(SSE_DATA_PREFIX.length);

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.log(`Failed to parse SSE chunk: ${data}`);
      return null;
    }
    if (!parsed || typeof parsed !== 'object') { return null; }

    const obj = parsed as Record<string, unknown>;

    // Inline error payload: `{ "error": { "message": "..." } }`. Distinguished
    // from a normal chunk (which has `choices`).
    if ('error' in obj && !('choices' in obj)) {
      const message = extractServerErrorMessage(obj as unknown as ServerErrorPayload);
      throw new Error(`${ERROR_PREFIX}${message}`);
    }

    return this.dispatchParsedChunk(obj, accumulator);
  }

  private dispatchParsedChunk(
    obj: Record<string, unknown>,
    accumulator: ToolCallAccumulator
  ): GatewayStreamChunk | null {
    const usage = extractUsage(obj.usage);
    const choices = Array.isArray(obj.choices) ? obj.choices : undefined;
    const choice = choices?.[0] as Record<string, unknown> | undefined;

    // OpenAI's stream-with-include_usage convention puts the totals on a
    // trailing chunk with an empty `choices` array — surface it as a
    // usage-only stream chunk so the provider can forward it to the chat
    // context-window widget (issue #24).
    if (!choice) {
      if (!usage) { return null; }
      return {
        content: '',
        reasoning_content: '',
        tool_calls: [],
        finished_tool_calls: [],
        usage,
      };
    }

    const chunk: ParsedChunk = {
      delta: choice.delta as ParsedChunk['delta'],
      message: choice.message as ParsedChunk['message'],
      finishReason: choice.finish_reason as string | undefined,
      id: typeof obj.id === 'string' ? obj.id : undefined,
    };

    if (chunk.delta) {
      const { content, reasoningContent, finishedToolCalls } = this.applyDeltaChoice(chunk, accumulator);
      return {
        content,
        reasoning_content: reasoningContent,
        tool_calls: [],
        finished_tool_calls: finishedToolCalls,
        ...(usage ? { usage } : {}),
      };
    }
    if (chunk.message) {
      const { content, reasoningContent, finishedToolCalls } = this.applyMessageChoice(chunk, accumulator);
      return {
        content,
        reasoning_content: reasoningContent,
        tool_calls: [],
        finished_tool_calls: finishedToolCalls,
        ...(usage ? { usage } : {}),
      };
    }
    return null;
  }

  private applyDeltaChoice(
    parsed: ParsedChunk,
    accumulator: ToolCallAccumulator
  ): { content: string; reasoningContent: string; finishedToolCalls: AccumulatedToolCall[] } {
    const delta = parsed.delta!;
    const finishedToolCalls: AccumulatedToolCall[] = [];

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        accumulator.applyDelta(tc);
      }
    }

    if (delta.function_call) {
      accumulator.applyLegacy(delta.function_call, parsed.id ?? '');
    }

    if (parsed.finishReason === 'tool_calls' || parsed.finishReason === 'function_call') {
      finishedToolCalls.push(...accumulator.drain());
    }

    return {
      content: delta.content ?? '',
      reasoningContent: delta.reasoning_content ?? delta.reasoning ?? '',
      finishedToolCalls,
    };
  }

  private applyMessageChoice(
    parsed: ParsedChunk,
    accumulator: ToolCallAccumulator
  ): { content: string; reasoningContent: string; finishedToolCalls: AccumulatedToolCall[] } {
    const message = parsed.message!;
    const finishedToolCalls: AccumulatedToolCall[] = [];

    if (Array.isArray(message.tool_calls)) {
      finishedToolCalls.push(...accumulator.applyComplete(message.tool_calls));
    }

    if (message.function_call) {
      const completed = accumulator.applyComplete([
        { index: 0, id: parsed.id, function: message.function_call },
      ]);
      finishedToolCalls.push(...completed);
    }

    return {
      content: message.content ?? message.text ?? '',
      reasoningContent: message.reasoning_content ?? message.reasoning ?? '',
      finishedToolCalls,
    };
  }

  /**
   * Fetch a single non-streaming completion from `/v1/completions`. Used by the
   * experimental inline-completion provider for fill-in-the-middle. Takes its
   * own `timeoutMs` because completions need a much tighter latency budget than
   * the chat `requestTimeout` default.
   */
  public async fetchCompletion(
    request: OpenAICompletionRequest,
    cancellationToken: vscode.CancellationToken,
    timeoutMs: number
  ): Promise<OpenAICompletionResponse> {
    const url = `${normalizeBaseUrl(this.config.serverUrl)}/v1/completions`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: false }),
      },
      cancellationToken,
      timeoutMs
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const truncated = bodyText.length > 200 ? bodyText.slice(0, 200) + '...' : bodyText;
      const suffix = truncated ? ' — ' + truncated : '';
      throw new CompletionHttpError(
        `Completion failed: ${response.status} ${response.statusText}${suffix}`,
        response.status,
        bodyText
      );
    }
    return await response.json();
  }

  /**
   * Probe whether the server is Ollama via its native `GET /api/version`
   * endpoint. Uses a short timeout so a foreign server that hangs on unknown
   * paths can't stall model discovery — this runs once per config generation
   * (cached by `OllamaDiscovery`), not per model.
   */
  public async probeOllama(cancellationToken?: vscode.CancellationToken): Promise<boolean> {
    const base = normalizeBaseUrl(this.config.serverUrl);
    try {
      const response = await this.fetchWithTimeout(
        `${base}/api/version`,
        { method: 'GET', headers: this.getHeaders() },
        cancellationToken,
        DISCOVERY_PROBE_TIMEOUT_MS
      );
      if (!response.ok) { return false; }
      const body: unknown = await response.json();
      return (
        typeof body === 'object' && body !== null &&
        typeof (body as { version?: unknown }).version === 'string'
      );
    } catch {
      return false;
    }
  }

  /**
   * Fetch Ollama-specific model metadata via the native `POST /api/show`
   * endpoint (context window, Modelfile sampler params, capabilities).
   * Returns the raw JSON body — parsing lives in `discovery/ollamaDiscovery`
   * — or `undefined` on any failure.
   */
  public async showModel(
    modelId: string,
    cancellationToken?: vscode.CancellationToken
  ): Promise<unknown> {
    const base = normalizeBaseUrl(this.config.serverUrl);
    try {
      const response = await this.fetchWithTimeout(
        `${base}/api/show`,
        {
          method: 'POST',
          headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId }),
        },
        cancellationToken,
        DISCOVERY_SHOW_TIMEOUT_MS
      );
      if (!response.ok) { return undefined; }
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private getHeaders(): Record<string, string> {
    return buildHeaders(this.config.apiKey, this.config.customHeaders);
  }

  /**
   * Fetch wrapper with a total-request timeout (the configured
   * `requestTimeout`, or `timeoutMs` when the caller needs a tighter budget)
   * and optional cancellation-token wiring. Used for non-streaming requests
   * like the model list and inline completions. Streaming requests manage
   * their own timers in `streamChatCompletion`.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    cancellationToken?: vscode.CancellationToken,
    timeoutMs?: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs ?? this.config.requestTimeout
    );
    const cancelSub = cancellationToken?.onCancellationRequested(() => controller.abort());

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      cancelSub?.dispose();
    }
  }
}

/**
 * Validate and shape a raw `usage` payload from the inference server. Coerces
 * NaN/missing fields to 0 and clamps negative sentinel values (some servers
 * emit -1 when totals aren't yet available) so VS Code's chat context-window
 * widget doesn't render nonsensical numbers (issue #24).
 */
export function extractUsage(raw: unknown): OpenAIUsage | undefined {
  if (!raw || typeof raw !== 'object') { return undefined; }
  const obj = raw as Record<string, unknown>;
  const prompt = toNonNegativeNumber(obj.prompt_tokens);
  const completion = toNonNegativeNumber(obj.completion_tokens);
  const total = toNonNegativeNumber(obj.total_tokens, prompt + completion);

  // Some servers omit `prompt_tokens` and `completion_tokens` entirely.
  // Require at least one signal so we don't emit an all-zero usage frame
  // that would briefly reset the context-window widget to 0% mid-stream.
  if (obj.prompt_tokens === undefined && obj.completion_tokens === undefined && obj.total_tokens === undefined) {
    return undefined;
  }

  const detailsRaw = obj.prompt_tokens_details;
  const cached = detailsRaw && typeof detailsRaw === 'object'
    ? toNonNegativeNumber((detailsRaw as Record<string, unknown>).cached_tokens)
    : 0;

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    prompt_tokens_details: { cached_tokens: cached },
  };
}

function toNonNegativeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) { return fallback; }
  return value < 0 ? 0 : value;
}

function extractServerErrorMessage(payload: ServerErrorPayload): string {
  const err = payload.error;
  if (typeof err === 'string') { return err; }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return JSON.stringify(err);
}

/* ------------------------------------------------------------------ */
/* Pseudo-streaming helpers for UDS chat responses                     */
/* ------------------------------------------------------------------ */

/**
 * Extract `<thinking>…</thinking>` or `<think>…</think>` blocks from content
 * and return them as an array of strings.  Used to emit thinking blocks
 * as `reasoning_content` chunks before the visible text.
 */
function extractReasoningChunks(content: string): string[] {
  const chunks: string[] = [];
  const regex = /<(?:thinking|think)>([\s\S]*?)<\/(?:thinking|think)>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1].trim()) {
      chunks.push(match[1]);
    }
  }
  return chunks;
}

/**
 * Strip `<thinking>…</thinking>` and `<think>…</think>` blocks from content,
 * returning only the visible (non-thinking) text.
 */
function stripThinkingBlocks(content: string): string {
  return content
    .replace(/<(?:thinking|think)>[\s\S]*?<\/(?:thinking|think)>/gi, '')
    .trim();
}

/**
 * Yield a string as multiple small streaming chunks with micro-delays,
 * simulating real-time token-by-token output for VS Code's chat UI.
 *
 * Each chunk is roughly `CHUNK_SIZE` characters.  The last chunk carries
 * the `usage` frame so VS Code's context-window widget updates.
 */
const STREAM_CHUNK_SIZE = 80; // characters per pseudo-chunk
const STREAM_CHUNK_DELAY_MS = 10; // ms delay between chunks

async function* streamTextInChunks(
  text: string,
  usage?: OpenAIUsage
): AsyncGenerator<GatewayStreamChunk, void, unknown> {
  if (!text) { return; }
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + STREAM_CHUNK_SIZE, text.length);
    const chunk = text.slice(offset, end);
    offset = end;
    const isLast = offset >= text.length;
    yield {
      content: chunk,
      reasoning_content: '',
      tool_calls: [],
      finished_tool_calls: [],
      // Attach usage only on the final chunk
      ...(isLast && usage ? { usage } : {}),
    };
    if (!isLast) {
      await new Promise((r) => setTimeout(r, STREAM_CHUNK_DELAY_MS));
    }
  }
}
