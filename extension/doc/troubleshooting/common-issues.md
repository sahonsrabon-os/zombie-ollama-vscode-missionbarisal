# Troubleshooting

## Model not appearing in Copilot

1. Verify the server is running:
   ```bash
   curl http://your-server:port/v1/models
   ```
2. Check **Server URL** in settings — paste the **base URL only**
   (`http://your-server:port`). A trailing `/v1` is normalized, but a wrong host
   or port will not connect.
3. Check **API Key** — paste the key only; do **not** prefix `Bearer `.
4. Run **"ZombieCoder Mission Barisal: Test Server Connection"**.
5. Run **"ZombieCoder Mission Barisal: Refresh Models"** (or click the
   status-bar entry).
6. Inspect the **"ZombieCoder Mission Barisal"** output channel.

## Stuck on "Connecting..." or "Error"

Use **Reset All** (`Ctrl+Shift+Alt+R` / `Cmd+Shift+Alt+R`):

1. Kills any stale server processes blocking the port
2. Removes the stale UDS socket at `/tmp/zombiecoder/mcp.sock`
3. Clears temp files and extension state
4. Restarts the server
5. Reconnects

This fixes most connection issues in one step.

## Duplicate extension installed

If you see two Mission Barisal extensions in the Extensions panel (e.g.
`zombie-coder.mission-barisal` and `zombiecoder.zombiecoder-mission-barisal`),
uninstall the old one:

1. Open Extensions panel (`Ctrl+Shift+X`)
2. Search for "Mission Barisal"
3. Find the one with the older version or wrong ID (`zombie-coder.mission-barisal`)
4. Click **Uninstall**

The correct extension ID is `zombiecoder.zombiecoder-mission-barisal`.

## Model not appearing in the Agents window

1. Add the opt-in setting:
   ```jsonc
   "extensions.supportAgentsWindow": {
     "zombiecoder.zombiecoder-mission-barisal": true
   }
   ```
2. Confirm the extension is installed in your **default VS Code profile**.
3. Reload/reopen the Agents window, then re-check the language model picker.

## "Model returned empty response"

The model generated nothing. Try:

1. **Check the tool parser** — `--tool-call-parser` must match the model family
   (see README → vLLM Setup Reference).
2. **Disable tool calling** — set
   `zombiecoder.mission-barisal.enableToolCalling` to `false` to test basic chat.
3. **Reduce context** — the conversation may exceed the model's limit.

> The extension now retries **once without tools** automatically before showing
> this diagnostic, which fixes the "71 tools / empty reply" case.

## Tools described but not executed

The model writes "Using the read_file tool…" instead of calling tools.

1. Use **Qwen3-8B** or **Qwen2.5-7B-Instruct** (avoid Qwen2.5-Coder variants —
   [known vLLM parser issues](https://github.com/vllm-project/vllm/issues/10952)).
2. Set **Agent Temperature** to `0.0`.
3. Disable **Parallel Tool Calling**.
4. Ensure the server started with `--enable-auto-tool-choice`.

## Out of memory errors

- Reduce `--max-model-len` (try 8192 or 16384).
- Use a quantized model (AWQ, GPTQ, FP8).
- Choose a smaller model.

## Connection refused

- Ensure the server is running and the URL is correct.
- Check for a stray `/v1` in the URL (it is normalized automatically, but a
  wrong path may still 404).
- Check firewalls / bind address (`--host 0.0.0.0` for remote access).
- Run **Reset All** (`Ctrl+Shift+Alt+R`) to kill stale processes and restart.

## UDS socket not connecting

The extension prefers UDS for local servers but falls back to HTTP
automatically. If UDS is not working:

1. Check the socket file exists:
   ```bash
   ls -la /tmp/zombiecoder/mcp.sock
   ```
2. Restart the server to recreate the socket.
3. The extension auto-retries UDS after 5 seconds if it was unavailable
   during the initial probe.
4. If the socket is stale after a server crash, run **Reset All**.

## Slow responses

- Lower the model's context window (`modelContextWindows`) — smaller budgets are
  faster.
- Switch to a smaller / quantized model.
- Check whether inline completions are enabled and competing for server load.

## Reasoning garbage in chat

- Ensure the model is supported (see Recommended Models in the README).
- Verify the server streams `reasoning_content` / `<think>` blocks correctly.

## Diagnostic output is huge

- Disable `zombiecoder.mission-barisal.verboseLogging` — it logs full request
  bodies, which may contain conversation content. Keep it off unless debugging.
