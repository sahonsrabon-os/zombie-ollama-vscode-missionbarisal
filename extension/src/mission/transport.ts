/**
 * transport — Phase 4. Multi-transport client core.
 *
 * The extension connects to a Mission Barisal server over ANY of these
 * transports (syllabus 8.1 / 7):
 *   - HTTP        — `http(s)://host:port`            (default, always works)
 *   - SSE         — same base URL, `text/event-stream` (rides HTTP)
 *   - WebSocket   — `ws(s)://host:port`
 *   - Unix socket — `unix:///path/to.sock` or `/abs/path.sock`
 *
 * `buildTransportChain()` turns the user's Server URL into an ordered list of
 * transport targets (primary first). `probeTransport()` checks availability
 * without aborting the request, and `udsRequest()` performs a real request
 * over a Unix domain socket, returning a fetch-compatible `Response` so the
 * existing SSE chunk reader in `GatewayClient` works unchanged.
 *
 * Core is dependency-free except Node builtins — fully unit-testable.
 */

import * as fs from 'fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';

export type TransportKind = 'http' | 'sse' | 'websocket' | 'uds';

export interface TransportTarget {
    kind: TransportKind;
    /**
     * Base URL WITHOUT trailing slash — used to build `/v1/models` etc.
     * Empty for pure-UDS targets (the socket path replaces the authority).
     */
    baseUrl: string;
    /** Unix socket path — set when `kind === 'uds'`. */
    socketPath?: string;
    /** Where the UDS socket mounts HTTP paths, e.g. `/zombiecoder/mcp.sock`. */
    httpPathBase?: string;
}

/**
 * Fallback UDS location used by the server when no path is configured.
 *
 * Per syllabus: the socket lives in the OS temp directory (not `/zombiecoder`)
 * so ANY server copy — `~/dev/Engine`, `~/dev/sahon`, a remote box — can
 * start on a different port/location yet still be discoverable at one stable
 * path per OS. Override via `ZOMBIECODER_UDS_PATH`.
 *   - POSIX (Linux/macOS): `<tmpdir>/zombiecoder/mcp.sock`
 *   - Windows:             `%TEMP%\zombiecoder\mcp.sock`
 */
export const DEFAULT_UDS_PATH =
    process.env.ZOMBIECODER_UDS_PATH ||
    process.env.UDS_PATH ||
    path.join(os.tmpdir(), 'zombiecoder', 'mcp.sock');

/**
 * Ollama direct HTTP fallback URL. Ollama uses anonymous (pathless) UDS
 * sockets internally for llama-server IPC — there is NO filesystem-path UDS
 * we can connect to. Instead, fall back to Ollama's HTTP API directly.
 */
export const OLLAMA_DIRECT_URL =
    process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * Default HTTP fallback used when the primary target is a bare UDS socket
 * path (no HTTP authority to fall back to). This is the Mission Barisal
 * server's conventional default port; it is only a fallback and the actual
 * server URL is always preferred when one is configured.
 */
export const FALLBACK_HTTP_URL = 'http://localhost:3000';

export interface TransportProbeOptions {
    /** Timeout (ms) for a single availability probe. Default 1500. */
    probeTimeoutMs?: number;
    /**
     * Prefer the Unix socket when the server URL points at the local machine
     * (syllabus 7: UDS → HTTP → WS). Without this, an always-reachable local
     * HTTP server wins the chain and the socket is never probed.
     */
    preferUds?: boolean;
    /**
     * Override the fallback UDS socket path probed for localhost URLs.
     * Defaults to `DEFAULT_UDS_PATH`. Tests inject a temp path so they never
     * touch the real `/tmp/zombiecoder/mcp.sock` (hermetic, CI-safe).
     */
    udsPath?: string;
    /**
     * Custom UDS socket path from extension settings (zombiecoder.mission-barisal.udsSocketPath).
     * Takes priority over `udsPath` and `DEFAULT_UDS_PATH`. Resolved by
     * `resolveUdsPath()` in configValidation.ts before reaching here.
     */
    customUdsPath?: string;
    /**
     * Offline fallback URL (OpenAI-compatible) used when neither the Mission
     * Barisal server nor its UDS socket is reachable — so the extension can
     * run alone against a local model server (e.g. Ollama). Sourced from the
     * `offlineFallbackUrl` extension setting; falls back to `OLLAMA_DIRECT_URL`
     * when unset. This replaces the previously hard-coded `localhost:11434`.
     */
    offlineFallbackUrl?: string;
}

export type TransportLogger = (message: string) => void;

/* ------------------------------------------------------------------ */
/* URL parsing                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse a raw Server URL into a primary transport target.
 *
 * Accepts:
 *   - `http://host:port` / `https://host:port`  → HTTP
 *   - `ws://host:port` / `wss://host:port`      → WebSocket
 *   - `unix:///abs/path.sock`                   → UDS
 *   - `/abs/path.sock` (starts with /, ends .sock) → UDS
 *   - `http+unix:///abs/path.sock`              → UDS proxying HTTP
 *
 * Anything else is treated as an HTTP host (e.g. `localhost:9999`).
 */
export function parseServerUrl(rawUrl: string): TransportTarget {
    const url = rawUrl.trim();
    if (!url) {
        return { kind: 'http', baseUrl: '' };
    }

    // unix:///path.sock or http+unix:///path.sock
    const unixMatch = url.match(/^(?:http\+)?unix:\/\/(.+)$/i);
    if (unixMatch) {
        const socketPath = unixMatch[1].startsWith('/')
            ? unixMatch[1]
            : `/${unixMatch[1]}`;
        return {
            kind: 'uds',
            baseUrl: '',
            socketPath,
            httpPathBase: '/',
        };
    }

    // ws:// or wss://
    if (/^wss?:\/\//i.test(url)) {
        const httpUrl = url.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
        return { kind: 'websocket', baseUrl: httpUrl.replace(/\/+$/, '') };
    }

    // /abs/path.sock — bare Unix socket path
    if (url.startsWith('/') && url.endsWith('.sock')) {
        return { kind: 'uds', baseUrl: '', socketPath: url, httpPathBase: '/' };
    }

    // http(s):// — default
    const httpUrl = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    return { kind: 'http', baseUrl: httpUrl.replace(/\/+$/, '') };
}

/**
 * Build the ordered transport fallback chain for a Server URL (syllabus 8.1:
 * HTTP → SSE → WebSocket → UDS, adapted to the URL the user actually gave).
 *
 * - HTTP(S) URL  → [http, sse, websocket, uds(default socket), ollama-http]
 * - WS(S) URL    → [websocket, http, sse, ollama-http]
 * - UDS path     → [uds, http(localhost:9999), sse, ollama-http]
 *
 * When `customUdsPath` is provided (from settings), it takes priority over
 * the default. Ollama HTTP direct is always the LAST fallback so if neither
 * Mission Barisal server nor its UDS is reachable, we connect to Ollama
 * directly at localhost:11434.
 */
export function buildTransportChain(
    serverUrl: string,
    udsPath: string = DEFAULT_UDS_PATH,
    customUdsPath?: string,
    offlineFallbackUrl?: string
): TransportTarget[] {
    const primary = parseServerUrl(serverUrl);
    const chain: TransportTarget[] = [primary];

    // Determine the primary UDS socket: custom (settings) > provided > default
    const primaryUds = customUdsPath || udsPath;

    switch (primary.kind) {
        case 'http':
            chain.push(
                { kind: 'sse', baseUrl: primary.baseUrl },
                { kind: 'websocket', baseUrl: primary.baseUrl },
                { kind: 'uds', baseUrl: '', socketPath: primaryUds, httpPathBase: '/' }
            );
            break;
        case 'websocket':
            chain.push(
                { kind: 'http', baseUrl: primary.baseUrl },
                { kind: 'sse', baseUrl: primary.baseUrl }
            );
            break;
        case 'uds':
            chain.push(
                { kind: 'http', baseUrl: FALLBACK_HTTP_URL },
                { kind: 'sse', baseUrl: FALLBACK_HTTP_URL }
            );
            break;
        default:
            break;
    }

    // ALWAYS append the offline OpenAI-compatible fallback as the LAST resort.
    // When the Mission Barisal server AND its UDS socket are both unreachable,
    // the extension runs alone against this URL (e.g. a local Ollama). The URL
    // comes from settings (`offlineFallbackUrl`); when unset it defaults to
    // Ollama's HTTP API at localhost:11434 (override via OLLAMA_BASE_URL env).
    const offlineUrl = offlineFallbackUrl || OLLAMA_DIRECT_URL;
    if (!primary.baseUrl.includes('localhost:11434') &&
        !primary.baseUrl.includes('127.0.0.1:11434') &&
        !primary.baseUrl.includes(offlineUrl)) {
        chain.push({
            kind: 'http',
            baseUrl: offlineUrl,
        });
    }

    return chain;
}

/* ------------------------------------------------------------------ */
/* Probing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Check whether a transport target is currently usable.
 *
 *   - UDS  → socket file exists (cheap, synchronous, no side effects)
 *   - HTTP → short GET on `/v1/models`; ANY HTTP status (even 401/404)
 *            proves the server is reachable — only network failure fails
 *   - SSE  → same as HTTP (SSE rides HTTP)
 *   - WS   → true when a global WebSocket implementation exists
 *            (Node 22+); the real handshake happens at connect time
 */
export async function probeTransport(
    target: TransportTarget,
    log?: TransportLogger,
    options?: TransportProbeOptions
): Promise<boolean> {
    const timeoutMs = options?.probeTimeoutMs ?? 1500;
    const logger = log ?? (() => { /* no-op */ });

    switch (target.kind) {
        case 'uds':
            if (!target.socketPath) {
                return false;
            }
            try {
                if (!fs.existsSync(target.socketPath)) {
                    return false;
                }
            } catch {
                return false;
            }
            // The Mission Barisal MCP socket speaks newline-delimited JSON-RPC
            // (not HTTP), so verify availability with a real JSON-RPC
            // `tools/list` round-trip. Any HTTP-status probe would reject the
            // socket and the client would silently fall back to HTTP — exactly
            // the "UDS never connects" bug from syllabus 8.1/7.
            try {
                const response = await udsJsonRpcRequest({
                    socketPath: target.socketPath,
                    method: 'tools/list',
                    params: {},
                    timeoutMs: Math.min(timeoutMs, 1500),
                });
                const tools = (response?.result as { tools?: unknown } | undefined)?.tools;
                if (Array.isArray(tools)) {
                    logger(
                        `transport probe: UDS ${target.socketPath} speaks JSON-RPC (${tools.length} tools)`
                    );
                    return true;
                }
                logger(
                    `transport probe: UDS ${target.socketPath} answered but had no tools`
                );
                return false;
            } catch {
                // Not a JSON-RPC socket — fall back to the HTTP-over-socket
                // probe so servers that DO mount HTTP on the socket still work.
                try {
                    const response = await udsRequest({
                        socketPath: target.socketPath,
                        path: '/v1/models',
                        method: 'GET',
                        timeoutMs: Math.min(timeoutMs, 1500),
                    });
                    logger(
                        `transport probe: UDS ${target.socketPath} speaks HTTP (${response.status})`
                    );
                    return true;
                } catch (error) {
                    logger(
                        `transport probe: UDS ${target.socketPath} not usable (${error instanceof Error ? error.message : String(error)})`
                    );
                    return false;
                }
            }

        case 'http':
        case 'sse':
            if (!target.baseUrl) {
                return false;
            }
            return probeHttp(target.baseUrl, timeoutMs, logger);

        case 'websocket':
            return typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function';

        default:
            return false;
    }
}

async function probeHttp(
    baseUrl: string,
    timeoutMs: number,
    log: TransportLogger
): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            signal: controller.signal,
        });
        log(`transport probe: ${baseUrl} reachable (HTTP ${response.status})`);
        return true;
    } catch (error) {
        log(
            `transport probe: ${baseUrl} unreachable (${error instanceof Error ? error.message : String(error)})`
        );
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Walk the chain and return the first available target. When nothing is
 * reachable, returns the PRIMARY target so the real request surfaces the
 * genuine connection error instead of a confusing "no transport available".
 */
export async function resolveActiveTransport(
    serverUrl: string,
    log?: TransportLogger,
    options?: TransportProbeOptions
): Promise<TransportTarget> {
    const chain = buildTransportChain(
        serverUrl,
        options?.udsPath,
        options?.customUdsPath,
        options?.offlineFallbackUrl
    );

    // Local server (or explicit socket URL) → probe the Unix socket FIRST
    // (syllabus 7: UDS → HTTP → WS). The socket is the fastest path and
    // immune to port collisions; fall back to the normal chain if absent.
    if (options?.preferUds) {
        const uds = chain.find((t) => t.kind === 'uds');
        if (uds && (await probeTransport(uds, log, options))) {
            return uds;
        }
    }

    for (const target of chain) {
        if (await probeTransport(target, log, options)) {
            return target;
        }
    }
    return chain[0];
}

/* ------------------------------------------------------------------ */
/* Unix domain socket request                                          */
/* ------------------------------------------------------------------ */

export interface UdsRequestOptions {
    socketPath: string;
    /** Request path, e.g. `/v1/chat/completions`. */
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}

/**
 * Perform an HTTP request over a Unix domain socket using Node's
 * `http.request({ socketPath })`. Returns a fetch-compatible `Response` whose
 * body is a web `ReadableStream` (via `Readable.toWeb`), so downstream code
 * that reads `response.body` for SSE chunks — or calls `json()` / `text()` —
 * works identically to a normal `fetch` response.
 */
export function udsRequest(options: UdsRequestOptions): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        const request = http.request(
            {
                socketPath: options.socketPath,
                path: options.path,
                method: options.method ?? 'GET',
                headers: options.headers,
                timeout: options.timeoutMs,
            },
            (response) => {
                const status = response.statusCode ?? 500;
                const statusText = response.statusMessage ?? '';
                const headers = new Headers();
                for (const [name, value] of Object.entries(response.headers)) {
                    if (typeof value === 'string') {
                        headers.set(name, value);
                    } else if (Array.isArray(value)) {
                        for (const v of value) {
                            headers.append(name, v);
                        }
                    }
                }
                const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
                resolve(new Response(body, { status, statusText, headers }));
            }
        );

        request.on('timeout', () => {
            request.destroy(new Error(`UDS request timed out after ${options.timeoutMs ?? 'default'}ms`));
        });
        request.on('error', (error) => {
            reject(error);
        });

        if (options.body !== undefined) {
            request.write(options.body);
        }
        request.end();
    });
}

/* ------------------------------------------------------------------ */
/* JSON-RPC over Unix domain socket (MCP protocol)                     */
/* ------------------------------------------------------------------ */

export interface UdsJsonRpcRequestOptions {
    socketPath: string;
    /** JSON-RPC method, e.g. `tools/list` or `initialize`. */
    method: string;
    params?: Record<string, unknown>;
    id?: number | string;
    timeoutMs?: number;
}

/**
 * Send a newline-delimited JSON-RPC 2.0 request over a Unix domain socket and
 * resolve with the parsed response object.
 *
 * The Mission Barisal MCP socket (`/tmp/zombiecoder/mcp.sock`) does NOT speak
 * HTTP — it speaks newline-delimited JSON-RPC, exactly like a streamable MCP
 * transport. `udsRequest` (HTTP-over-socket) cannot talk to it, so MCP
 * operations (`tools/list`, `initialize`, ...) must use this primitive.
 *
 * Protocol: write `{jsonrpc,id,method,params}\n`, read newline-terminated
 * JSON lines until the response with a matching `id` arrives (or the first
 * valid JSON-RPC line if the server does not echo ids).
 */
export function udsJsonRpcRequest(options: UdsJsonRpcRequestOptions): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
        const socket = net.createConnection(options.socketPath);
        const chunks: Buffer[] = [];
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                socket.destroy();
                reject(new Error(`UDS JSON-RPC request timed out after ${options.timeoutMs ?? 'default'}ms`));
            }
        }, options.timeoutMs ?? 5000);

        socket.on('connect', () => {
            const payload = JSON.stringify({
                jsonrpc: '2.0',
                id: options.id ?? 1,
                method: options.method,
                params: options.params ?? {},
            });
            socket.write(`${payload}\n`);
        });

        socket.on('data', (data) => {
            chunks.push(Buffer.from(data));
            const buffer = Buffer.concat(chunks);
            const text = buffer.toString('utf8');

            // A response may be split across chunks, so only parse once a
            // complete newline-terminated line has arrived.
            if (!text.includes('\n')) {
                return;
            }

            for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) {
                    continue;
                }
                try {
                    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
                    if (parsed && typeof parsed === 'object' && !settled) {
                        settled = true;
                        clearTimeout(timer);
                        socket.destroy();
                        resolve(parsed);
                        return;
                    }
                } catch {
                    // Incomplete / trailing fragment — keep waiting.
                }
            }
        });

        socket.on('error', (error) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(error);
            }
        });

        socket.on('close', () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(new Error('UDS JSON-RPC socket closed before a response arrived'));
            }
        });
    });
}

/* ------------------------------------------------------------------ */
/* Chat over Unix domain socket (Mission Barisal message protocol)     */
/* ------------------------------------------------------------------ */

export interface UdsChatRequestOptions {
    socketPath: string;
    /** Messages to send — OpenAI-style `{role, content}` array. */
    messages: unknown[];
    /** Session id forwarded to the server (string, NOT a transport object). */
    sessionId: string;
    /** Agent id, e.g. `code-guru` (defaults to `code-guru` server-side). */
    agentId?: string;
    /** Extra `params` merged into the chat message (e.g. `{stream: true}`). */
    params?: Record<string, unknown>;
    /** Total request timeout (ms). Default 120000. */
    timeoutMs?: number;
    /**
     * Workspace folder path — forwarded as `context.workspace` so the server
     * scopes SSOT/syllabus/memory to THIS project (per-project isolation).
     */
    workspace?: string;
}

export interface UdsChatResult {
    content: string;
    /** Every event the server streamed before `response_done`/`error`. */
    events: Array<Record<string, unknown>>;
    /** Raw `response_done` event (when the server completed normally). */
    done?: Record<string, unknown>;
    /** Error message when the server replied with `{type: 'error'}`. */
    error?: string;
    elapsedMs: number;
}

/** Maximum number of retries for transient UDS connection errors. */
const UDS_CHAT_MAX_RETRIES = 2;

/** Delay between retries (ms) — short pause so the server can recycle the socket. */
const UDS_CHAT_RETRY_DELAY_MS = 500;

/**
 * Check whether an error is a transient UDS connection failure that is safe
 * to retry.  These typically happen when the server re-cycles its UDS socket
 * (e.g. during a reload) or the OS resets a half-open connection.
 */
function isRetryableUdsError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const msg = error.message.toLowerCase();
    return (
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('socket closed') ||
        msg.includes('eof') ||
        msg.includes('epipe')
    );
}

/** Wait for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a Mission Barisal `{type: 'chat'}` message over a Unix domain socket
 * and stream back every newline-delimited JSON event until `response_done`
 * (success) or `{type: 'error'}` (failure).
 *
 * The server's UDS socket does NOT speak HTTP — it speaks newline-delimited
 * JSON (see `handleMessage` in the server's api.js). The `handleMessage`
 * pipeline emits `context_injecting` → `type_safety_passed` → `goal_set` →
 * `routing` → cross-verify/compiler events → finally `response_done` with
 * `data.content`. We collect the events so callers can optionally surface
 * progress; the final content lives in `response_done.data.content`.
 *
 * Transient connection errors (ECONNRESET, socket closed, EPIPE) are
 * retried up to {@link UDS_CHAT_MAX_RETRIES} times with a short delay,
 * because VS Code's Copilot Chat host occasionally re-cycles the UDS socket
 * during reloads and the server may take a moment to accept new connections.
 */
export function udsChatRequest(
    options: UdsChatRequestOptions,
    _retryCount = 0
): Promise<UdsChatResult> {
    const startedAt = Date.now();
    return new Promise<UdsChatResult>((resolve, reject) => {
        const socket = net.createConnection(options.socketPath);
        let buffer = '';
        const events: Array<Record<string, unknown>> = [];
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                socket.destroy();
                reject(new Error(`UDS chat request timed out after ${options.timeoutMs ?? 120000}ms`));
            }
        }, options.timeoutMs ?? 120000);

        const finish = (result: UdsChatResult): void => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                socket.destroy();
                resolve(result);
            }
        };

        socket.on('connect', () => {
            const payload = JSON.stringify({
                type: 'chat',
                session_id: options.sessionId,
                agent_id: options.agentId ?? 'code-guru',
                messages: options.messages,
                params: { stream: true, ...(options.params ?? {}) },
                ...(options.workspace
                    ? { context: { workspace: options.workspace } }
                    : {}),
            });
            socket.write(`${payload}\n`);
        });

        socket.on('data', (data) => {
            buffer += data.toString();
            let idx: number;
            while ((idx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, idx).trim();
                buffer = buffer.slice(idx + 1);
                if (!line) {
                    continue;
                }
                let event: Record<string, unknown>;
                try {
                    event = JSON.parse(line) as Record<string, unknown>;
                } catch {
                    // Incomplete / trailing fragment — keep waiting.
                    continue;
                }
                events.push(event);
                if (event.type === 'response_done') {
                    const dataObj = (event.data ?? {}) as { content?: unknown };
                    finish({
                        content: typeof dataObj.content === 'string' ? dataObj.content : '',
                        events,
                        done: event,
                        elapsedMs: Date.now() - startedAt,
                    });
                    return;
                }
                if (event.type === 'error') {
                    finish({
                        content: '',
                        events,
                        error: typeof event.error === 'string' ? event.error : 'UDS chat error',
                        elapsedMs: Date.now() - startedAt,
                    });
                    return;
                }
            }
        });

        socket.on('error', (error) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(error);
            }
        });

        socket.on('close', () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(new Error('UDS chat socket closed before response_done arrived'));
            }
        });
    }).catch(async (error) => {
        // Retry transient connection errors (ECONNRESET, socket closed, EPIPE).
        // The server's UDS socket is occasionally recycled during VS Code
        // reloads, causing the first connection attempt to fail.  A short
        // pause lets the server accept new connections.
        if (_retryCount < UDS_CHAT_MAX_RETRIES && isRetryableUdsError(error)) {
            await sleep(UDS_CHAT_RETRY_DELAY_MS * (_retryCount + 1));
            return udsChatRequest(options, _retryCount + 1);
        }
        throw error;
    });
}
