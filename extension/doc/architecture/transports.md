# Transports: UDS / SSE / HTTP / WebSocket

Mission Barisal talks to your inference server over multiple transports, picked
automatically by priority and environment.

## Priority order

```
UDS (Unix Domain Socket)  →  HTTP  →  SSE  →  WebSocket
```

- **UDS** — used first **only when the server is local** (`localhost` / `127.0.0.1`).
  Sockets live in `/tmp/zombiecoder/mcp.sock` and avoid TCP overhead entirely.
- **HTTP** — plain `POST /v1/chat/completions`.
- **SSE** — server-sent events streaming for token-by-token output.
- **WebSocket** — fallback for servers that only expose a WS endpoint.

On cPanel / LiteSpeed hosts the UDS probe is auto-bypassed and only HTTP is used.

## Automatic fallback chain

If the preferred transport fails at **request time** (not just probe time), the
extension transparently falls back:

1. **UDS → HTTP/SSE**: If the UDS socket times out or is unreachable during a
   chat request, the extension catches the error and retries over HTTP/SSE
   without crashing. This handles cases where the server restarts mid-session
   or the socket becomes stale.

2. **Transport cache retry**: The extension caches the detected transport. If
   UDS was preferred but unavailable during probe (e.g. server still starting),
   the cache auto-expires after 5 seconds so the next request re-probes UDS.
   This prevents the "UDS never connects" bug where a single failed probe
   permanently locks the extension to HTTP.

## UDS probe

The UDS probe verifies the socket is alive by performing a JSON-RPC
`tools/list` round-trip. This is more reliable than checking file existence
alone — the socket file may exist but the server may have crashed. The probe
also falls back to an HTTP-over-socket check if the JSON-RPC call fails (for
servers that mount HTTP on the socket).

## URL normalization

Pasting a server URL "just works":

| You type                         | Normalized to                       |
| -------------------------------- | ----------------------------------- |
| `http://localhost:9999`          | `http://localhost:9999`             |
| `http://localhost:9999/v1`       | `http://localhost:9999`             |
| `http://localhost:9999/v1/`      | `http://localhost:9999`             |

Implementation: `api/client.ts` → `normalizeBaseUrl()` trims a trailing `/v1` (and
slash) before re-appending it, so both forms hit the correct endpoint. The same
file probes `/v1/models` first, then falls back to `/models` for servers that do
not use the `/v1` prefix.

## Model metadata

`/v1/models` responses are parsed across server dialects:

| Server          | Context field                          |
| --------------- | -------------------------------------- |
| vLLM, LiteLLM   | `max_model_len`                        |
| Ollama, LocalAI | `context_length`                       |
| LM Studio       | `context_length` / `context_window`    |
| llama.cpp       | `meta.n_ctx` / `meta.n_ctx_train`      |

If a server cannot report context size, the extension uses `defaultMaxTokens`
and can learn the real limit from a context-overflow error and retry once.
