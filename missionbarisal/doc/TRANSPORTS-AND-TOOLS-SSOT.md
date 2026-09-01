# Mission Barisal — Transports, Tools & Response Contract (SSOT)

> **Status: ULTIMATE TRUTH (Single Source of Truth)**
> This document defines how every transport, tool, and provider response MUST behave.
> If a provider (especially `llama.cpp` / `custom_3`) emits a response that violates this
> contract, the fix belongs at the **source (the model server)** — NOT by patching our API
> server. Our server only normalizes; it does not compensate for malformed upstream output.
>
> Evidence base: `api.js` (Mission Barisal v3). All `file:line` refs are from the current tree.

---

## 1. Transports

### 1.1 Server-inbound (client → our gateway)
Our gateway accepts connections on these transports (see syllabus §7 "Universal Socket Architecture"):

| Transport | Path / Port | Evidence | Used for |
|-----------|-------------|----------|----------|
| HTTP/REST | `:8080` (PORT) | `start.js:98` | `/v1/chat/completions`, `/api/mission`, `/api/sessions`, `/mcp` |
| SSE | `text/event-stream` | `public/index.html:592` (handleStream) | Streaming agent replies |
| WebSocket | `ws-*` sessions | `data/ws-*` dirs | Realtime agent sockets |
| UDS | `:5100` (UDS_PORT) / `ZOMBIECODER_UDS_PATH` | `start.js:52`, `domain-config.js` | Local high-speed IPC (cPanel/LiteSpeed falls back to HTTP) |

Priority (auto-detected): **UDS → HTTP → WS**. Outbound provider calls are plain TCP (see §1.2).

### 1.2 Provider-outbound (our gateway → model provider)
Every provider is called over **plain TCP http/https** (hostname+port from `baseUrl`).
UDS/WS/SSE are NOT used for outbound provider calls.

| Provider ID | Env | baseUrl | Type | Evidence |
|-------------|-----|---------|------|----------|
| `opencode` | `OPENCODE_*` | `https://opencode.ai/zen/v1` | openai | `api.js:735` |
| `groq` | `GROQ_*` | `https://api.groq.com/openai/v1` | openai | `api.js:746` |
| `gemini` | `GEMINI_*` | `https://generativelanguage.googleapis.com/v1beta` | gemini (special) | `api.js:757` |
| `ollama` | `OLLAMA_*` | `http://localhost:5010/v1` | openai | `api.js:772` (added) |
| `custom_3` | `CUSTOM_PROVIDER_3_*` | `http://127.0.0.1:8007/v1` | openai | `.env` (llama.cpp) |

`PROVIDER_CONFIG` is built once at startup from env (`api.js:732`). `loadCustomProviders()`
scans `CUSTOM_PROVIDER_N_*` (`api.js:773`). **Env vars are the single source of truth.**

> **llama.cpp / custom_3 note:** The server at `:8007` is the model server we manage.
> When it returns non-conforming output, we fix the **llama.cpp launch / config**, not `api.js`.
> See §4.

---

## 2. Tools (MCP_TOOLS)

All agents **share the same tool registry** — there is no per-agent tool set.

- Registry: `const MCP_TOOLS = { ... }` — `api.js:8707`
- Shared at call site: `tools, // All agents share the same tools` — `api.js:6022`
- Streaming endpoint builds from it: `const toolsForStream = ...` — `api.js:13891`

### 2.1 Current tool list (from `MCP_TOOLS`)
| Tool | Purpose |
|------|---------|
| `read_file` | Read a file from filesystem |
| `write_file` | Write/create file |
| `set_working_dir` | Set MCP working dir |
| `get_working_dir` | Get current MCP working dir |
| *(+ all skills/external MCP tools registered at runtime)* | — |

External MCP tools are merged in at runtime (`external mcp/`, `external tools/`). Tool count
is reported in `/health` (`mcpToolCalls`).

### 2.2 Tool-call handling
- Non-stream tool loop: `api.js:5540+` (ZOMBIE FIX: never force `tool_choice:"required"` for
  OpenCode free models — they 400 on it).
- Stream path: tools passed to `callModelStream` (`api.js:13891`); on empty response it retries
  **without tools** (`EMPTY_RESPONSE_RETRY`, `api.js:13939`).
- **Important:** a provider/model that cannot do tool calls should return a normal text reply
  (not 0 chars). 0 chars + tools = treated as failure → fallback chain.

---

## 3. Response Contract (OpenAI-compatible) — THE ULTIMATE TRUTH

Every provider, including `llama.cpp`, MUST emit responses in **OpenAI Chat Completions**
format. Our normalizer ("Haq Mawla") converts provider output to this unified shape
(`api.js:4249` comment: "Converts any provider response to unified OpenAI-compatible format").

### 3.1 Non-streaming — MUST be exactly:
```json
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion",
  "created": 1690000000,
  "model": "<api-model-name>",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "<text>" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```
- `object` MUST be `"chat.completion"`.
- `choices[0].message.role` MUST be `"assistant"`.
- `choices[0].message.content` MUST be a string (may be `""` only if `tool_calls` present).
- `finish_reason` ∈ `stop` | `length` | `tool_calls` | `content_filter`.
- Tool calls (if any): `choices[0].message.tool_calls: [{ id, type:"function", function:{name, arguments} }]`.

### 3.2 Streaming (SSE) — MUST be exactly:
```
data: {"id":"chatcmpl-<uuid>","object":"chat.completion.chunk","created":...,"model":"<m>","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-<uuid>","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-<uuid>","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```
- Each event line prefixed `data: `, separated by `\n\n`.
- Terminal event: `data: [DONE]`.
- Chunks use `choices[0].delta` (NOT `message`).
- `reasoning_content` / `reasoning` (Mimo/North Mini/Nemotron) is mapped to `content` by the
  normalizer (`api.js:4884`) — providers may emit it; the gateway handles it.

### 3.3 Error contract (MUST, not silent)
A provider MUST NOT return HTTP 200 with an empty body to signal an error. Correct forms:
- HTTP **429** + `{"error":{"message":"...rate limit...","type":"rate_limit_exceeded"}}`
  → our `callModel` detects 429 and runs fallback (`api.js:5322`).
- HTTP **4xx/5xx** with `{"error":{...}}` body.
- **Anti-pattern (DO NOT):** OpenCode free-tier returns HTTP 200 + `{"type":"error",
  "error":{"type":"FreeUsageLimitError",...}}` or `: keep-alive` + empty content. This is now
  detected in `callModelStream` (`STREAM_RATE_LIMIT_FALLBACK`, `api.js:4905`) and routed to
  fallback — but the correct fix is at the provider (return 429).

---

## 4. Managing llama.cpp (custom_3) responses — SOURCE-FIXED

**Principle (user directive):** "For llama.cpp we will NOT keep changing our API server; we
manage responses from the source." Therefore:

1. `custom_3` is the **model server we control** (`http://127.0.0.1:8007/v1`, `MODEL_SERVER_PORT`
   env `api.js:15839`, default 8007).
2. If llama.cpp output violates §3, fix the **llama.cpp launch flags / config**, e.g.:
   - Run `llama-server` (or `ollama`/compatible) with `--api-key`, ensuring it speaks
     OpenAI `/v1/chat/completions`.
   - Ensure it emits `object:"chat.completion"` / `chat.completion.chunk` and `data: [DONE]`.
   - Ensure tool/function calling is either supported or cleanly absent (text reply, not 0 chars).
3. Our server's job: **normalize + route + fallback**. It must NOT special-case llama.cpp
   quirks in `api.js`.
4. This document (§3) is the contract llama.cpp MUST satisfy. If it complies, it "just works"
   and is binding.

> Current state: `custom_3` returns `ECONNREFUSED 127.0.0.1:8007` (server not running). Start the
> llama.cpp/llama-server on :8007 to activate. No `api.js` change required.

---

## 5. Sessions & Memory (for reference)

- Session created: `createSession()` `api.js:3852`. Stored in `data/sessions.json`
  (`SESSIONS_FILE` `api.js:3758`) + in-memory `activeSessions` Map.
- Endpoint that creates from `public/index.html`: single-agent → `POST /v1/chat/completions`
  (`public/index.html:574`); if no `session_id`, `createSession` at `api.js:13365`.
- Old conversation remembered: `data/mem-<sessionId>.json` via `saveAgentMemory`
  (`api.js:4016`) / `saveMemory` (`api.js:4040`); read via `getAgentMemory` (`api.js:4029`).
- Session reuse: same client+editor reuses active session (`api.js:3858`).

---

## 6. Agent Fallback Models (design note)

Current fallback is **global + priority-based**, NOT per-agent:
- `getFallbackModel(model)` `api.js:1237` picks the next model by provider priority.
- Used in stream (`api.js:4963`) and non-stream (`api.js:5022`, `5518`) paths.
- Template/placeholder models replaced from primary provider's models (`api.js:13675`).

**Proposed per-agent override (env-driven, matches existing "env = source of truth" pattern):**
```
AGENT_<agentId>_FALLBACK=model-a,model-b
```
Resolution order: env override → global `getFallbackModel`. This keeps code clean (no DB
migration) and is consistent with how providers are already env-driven. A DB column is an
alternative but heavier (migration + read path). See discussion before implementing.

---

*Generated from code evidence (api.js). This SSOT overrides ad-hoc assumptions. Update here
first, then code.*
