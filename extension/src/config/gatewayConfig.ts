/**
 * Resolved extension configuration. Assembled by the provider's config
 * service from workspace settings, the SecretStorage cache, and any
 * framework-supplied overrides — everything downstream reads this shape
 * instead of touching `vscode.workspace.getConfiguration` directly.
 */
export interface GatewayConfig {
  serverUrl: string;
  /**
   * Phase 5 — external MCP server URL. Empty means "default server MCP only".
   * When set, the McpConnector also fetches this server's /mcp tools/list and
   * merges the normalized tools into the agent context (separate accounting).
   */
  mcpServerUrl: string;
  /**
   * Unix Domain Socket path for direct MCP connection. Empty means
   * "auto-detect" — the extension resolves to the default UDS path
   * (`/tmp/zombiecoder/mcp.sock`). When set (e.g. `/tmp/zombiecoder/mcp.sock`
   * or a keyword like `mcp`, `zombie`, `tmp`), this takes priority.
   * Smart resolution: bare names like `mcp.sock` resolve to
   * `/tmp/zombiecoder/mcp.sock`; keywords auto-expand to the correct
   * tmp folder path. Falls back to Ollama UDS if no socket is found.
   */
  udsSocketPath: string;
  /**
   * Offline fallback URL (OpenAI-compatible) used when the Mission Barisal
   * server and its UDS socket are both unreachable, so the extension can run
   * alone against a local model server (e.g. Ollama). Empty means "use the
   * Ollama default (localhost:11434, override via OLLAMA_BASE_URL env)".
   */
  offlineFallbackUrl?: string;
  apiKey?: string;
  requestTimeout: number;
  defaultMaxTokens: number;
  defaultMaxOutputTokens: number;
  enableImageInput: boolean;
  enableToolCalling: boolean;
  parallelToolCalling: boolean;
  agentTemperature: number;
  verboseLogging: boolean;
  customHeaders: Record<string, string>;
  extraModelOptions: Record<string, unknown>;
  /** Per-model chat-completion overrides keyed by model id / wildcard (issue #43). */
  perModelOptions: Record<string, unknown>;
  /**
   * Per-model context-window overrides (total tokens) keyed by model id /
   * wildcard. Wins over server-reported values — for servers that report the
   * wrong size or none at all, e.g. llama-server router mode (issue #55).
   */
  modelContextWindows: Record<string, number>;
  /**
   * Experimental inline (fill-in-the-middle) code completion settings. Powers a
   * standalone completion provider that runs alongside — not through — GitHub
   * Copilot, since VS Code does not expose BYOK models to its own inline
   * suggestions (issue #44, microsoft/vscode#318545).
   */
  enableInlineCompletion: boolean;
  inlineCompletionModel: string;
  inlineCompletionMaxTokens: number;
  inlineCompletionDebounce: number;
  inlineCompletionTimeout: number;
  inlineCompletionMaxPrefixChars: number;
  inlineCompletionMaxSuffixChars: number;
}
