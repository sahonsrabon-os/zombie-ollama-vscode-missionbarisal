import * as os from 'node:os';
import * as path from 'node:path';
import { GatewayConfig } from '../config/gatewayConfig';
import { TOKEN_CONSTANTS } from '../chat/tokenBudget';

export const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
/** Maximum value for setTimeout (signed 32-bit integer). */
export const MAX_REQUEST_TIMEOUT_MS = 2147483647;
export const FALLBACK_SERVER_URL = 'http://localhost:3000';

/**
 * Offline fallback URL (OpenAI-compatible) used when the Mission Barisal
 * server and its UDS socket are both unreachable. Empty by default — the
 * transport layer then falls back to Ollama's HTTP API (OLLAMA_DIRECT_URL).
 */
export const OFFLINE_FALLBACK_URL = '';

// ─── UDS Path Constants ─────────────────────────────────────
/** Default UDS socket path: /tmp/zombiecoder/mcp.sock (Linux/macOS) */
export const DEFAULT_UDS_SOCKET_PATH =
  process.env.ZOMBIECODER_UDS_PATH ||
  process.env.UDS_PATH ||
  path.join(os.tmpdir(), 'zombiecoder', 'mcp.sock');

/** Ollama direct HTTP URL (NOT a UDS path — Ollama has no named UDS socket). */
export const OLLAMA_DIRECT_URL =
  process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * Keywords that indicate the user wants the default Mission Barisal UDS path.
 * Case-insensitive matching. If the user types any of these (with or without
 * dots, with or without .sock extension), it resolves to DEFAULT_UDS_SOCKET_PATH.
 */
const UDS_KEYWORDS = new Set([
  'mcp', 'mcp.sock', 'zombie', 'zombie.sock', 'zombiecoder',
  'zombiecoder.sock', 'mcp.sock', 'tmp', 'default', 'local',
  'barisal', 'mission', 'missionbarisal',
]);

/**
 * Resolve a raw UDS path input from the user into an actual socket path.
 *
 * Resolution rules (in order):
 *   1. Empty string → DEFAULT_UDS_SOCKET_PATH (/tmp/zombiecoder/mcp.sock)
 *   2. Full absolute path ending with .sock (e.g. /run/user/1000/app.sock) → use as-is
 *   3. `unix:///path/to.sock` → extract the path
 *   4. Bare filename like `mcp.sock` → resolve to /tmp/zombiecoder/mcp.sock
 *   5. Keyword match (mcp, zombie, tmp, default, etc.) → DEFAULT_UDS_SOCKET_PATH
 *   6. Anything else ending with .sock → prepend /tmp/zombiecoder/ prefix
 *   7. Fallback → DEFAULT_UDS_SOCKET_PATH
 *
 * The function is pure — no filesystem calls, no vscode imports.
 */
export function resolveUdsPath(rawInput: string): string {
  const input = (rawInput || '').trim();

  // 1. Empty → use default
  if (!input) {
    return DEFAULT_UDS_SOCKET_PATH;
  }

  // 2. `unix:///path/to.sock` or `http+unix:///path/to.sock`
  const unixMatch = input.match(/^(?:http\+)?unix:\/\/(.+)$/i);
  if (unixMatch) {
    const sockPath = unixMatch[1].startsWith('/')
      ? unixMatch[1]
      : `/${unixMatch[1]}`;
    return sockPath;
  }

  // 3. Full absolute path ending with .sock
  if (input.startsWith('/') && input.endsWith('.sock')) {
    return input;
  }

  // 4. Keyword match (case-insensitive, strip dots and spaces)
  const normalized = input.toLowerCase().replace(/[\s._-]/g, '');
  for (const keyword of UDS_KEYWORDS) {
    const kw = keyword.replace(/[\s._-]/g, '');
    if (normalized === kw) {
      return DEFAULT_UDS_SOCKET_PATH;
    }
  }

  // 5. Bare filename (contains .sock but no path separator)
  if (input.endsWith('.sock') && !input.includes('/')) {
    return path.join(os.tmpdir(), 'zombiecoder', input);
  }

  // 6. Filename with .sock anywhere — resolve under tmp/zombiecoder/
  if (input.endsWith('.sock')) {
    return path.join(os.tmpdir(), 'zombiecoder', path.basename(input));
  }

  // 7. Looks like a partial path (has / but doesn't end with .sock)
  if (input.includes('/') && !input.endsWith('.sock')) {
    // Try appending .sock if it looks like a directory
    const withSock = input.endsWith('/') ? `${input}mcp.sock` : `${input}/mcp.sock`;
    return withSock;
  }

  // 8. Anything else — treat as a keyword and use default
  return DEFAULT_UDS_SOCKET_PATH;
}

/**
 * Accept a Server URL value for configuration. In addition to ordinary
 * `http(s)://`, `ws(s)://` and `unix://` URLs — which `new URL()` parses —
 * this also accepts a bare Unix socket path like `/tmp/zombiecoder/mcp.sock`.
 * `parseServerUrl()` in transport.ts understands that form, but `new URL()`
 * rejects it (no scheme), so validation previously reset the value to the
 * fallback URL and Linux UDS-from-path setups silently broke.
 */
export function isValidServerUrl(rawValue: string): boolean {
  const value = rawValue.trim();
  if (!value) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    // Bare Unix socket path: `/abs/path.sock` or `unix:///abs/path.sock`.
    return value.startsWith('/') && value.endsWith('.sock');
  }
}

/**
 * Problems found (and auto-corrected) while validating a raw config. The
 * config service maps these onto log lines and de-duplicated toasts; keeping
 * them as data makes the validation rules unit-testable without `vscode`.
 */
export type ConfigIssue =
  | { kind: 'invalidRequestTimeout'; value: number }
  | { kind: 'requestTimeoutClamped'; value: number }
  | { kind: 'invalidServerUrl'; url: string }
  | { kind: 'outputTokensAdjusted'; output: number; total: number; adjusted: number };

/**
 * Validate a raw config and auto-correct invalid values. Pure — returns the
 * corrected config plus the list of issues found so the caller can decide
 * how to surface them.
 */
export function validateGatewayConfig(raw: GatewayConfig): {
  config: GatewayConfig;
  issues: ConfigIssue[];
} {
  const cfg: GatewayConfig = { ...raw };
  const issues: ConfigIssue[] = [];

  if (cfg.requestTimeout <= 0) {
    issues.push({ kind: 'invalidRequestTimeout', value: cfg.requestTimeout });
    cfg.requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS;
  } else if (cfg.requestTimeout > MAX_REQUEST_TIMEOUT_MS) {
    issues.push({ kind: 'requestTimeoutClamped', value: cfg.requestTimeout });
    cfg.requestTimeout = MAX_REQUEST_TIMEOUT_MS;
  }

  if (!isValidServerUrl(cfg.serverUrl)) {
    issues.push({ kind: 'invalidServerUrl', url: cfg.serverUrl });
    cfg.serverUrl = FALLBACK_SERVER_URL;
  }

  if (cfg.defaultMaxOutputTokens >= cfg.defaultMaxTokens) {
    const adjusted = Math.max(
      TOKEN_CONSTANTS.MIN_OUTPUT_TOKENS,
      cfg.defaultMaxTokens - TOKEN_CONSTANTS.ADJUST_TOKEN_BUFFER
    );
    issues.push({
      kind: 'outputTokensAdjusted',
      output: cfg.defaultMaxOutputTokens,
      total: cfg.defaultMaxTokens,
      adjusted,
    });
    cfg.defaultMaxOutputTokens = adjusted;
  }

  // ── Offline fallback URL validation ──
  // When set, it must be a parseable URL (so the transport layer can build
  // `/v1/chat/completions` against it). An empty string is allowed — it means
  // "use the Ollama default". Invalid values are reset to empty with an issue.
  if (cfg.offlineFallbackUrl && !isValidServerUrl(cfg.offlineFallbackUrl)) {
    issues.push({ kind: 'invalidServerUrl', url: cfg.offlineFallbackUrl });
    cfg.offlineFallbackUrl = OFFLINE_FALLBACK_URL;
  }

  // ── UDS Path auto-resolution ──
  // Resolve the raw user input into an actual socket path.
  // The resolved path is stored for downstream transport/mcpConnector use.
  cfg.udsSocketPath = resolveUdsPath(cfg.udsSocketPath);

  return { config: cfg, issues };
}
