# Command Palette Commands

All commands are prefixed **"ZombieCoder Mission Barisal"** and are available from
the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command                                            | Description                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| **ZombieCoder Mission Barisal: Configure Server**  | Set the server URL and API key (also opened from "Add Models…").    |
| **ZombieCoder Mission Barisal: Test Server Connection** | Probe connectivity and list available models.                   |
| **ZombieCoder Mission Barisal: Refresh Models**    | Re-probe the inference server and refresh the model picker.         |
| **ZombieCoder Mission Barisal: Edit Custom Headers** | Add, edit, or remove custom HTTP headers (stored in secret storage). |
| **ZombieCoder Mission Barisal: Show Output Log**   | Open the extension's output channel.                                 |
| **ZombieCoder Mission Barisal: Reset All (Kill Processes + Restart + Reconnect)** | Nuclear option: kills stale server processes, removes stale UDS socket, clears temp files, resets extension state, restarts the server, and reconnects. |

## Command IDs

| Command                                   | ID                                                        |
| ----------------------------------------- | --------------------------------------------------------- |
| Configure Server                          | `zombiecoder.mission-barisal.manage`                      |
| Test Server Connection                    | `zombiecoder.mission-barisal.testConnection`              |
| Refresh Models                            | `zombiecoder.mission-barisal.refreshModels`               |
| Edit Custom Headers                       | `zombiecoder.mission-barisal.editCustomHeaders`           |
| Show Output Log                           | `zombiecoder.mission-barisal.showOutput`                  |
| Reset All                                 | `zombiecoder.mission-barisal.resetAll`                    |

## Keyboard Shortcuts

| Command       | Windows / Linux       | macOS                 |
| ------------- | --------------------- | --------------------- |
| Reset All     | `Ctrl+Shift+Alt+R`   | `Cmd+Shift+Alt+R`    |

## When to use Reset All

Use **Reset All** when:

- The status bar shows "Error" or "Connecting" for an extended period
- Stale server processes are blocking the port
- A stale UDS socket prevents reconnection
- You changed server settings and need a clean restart
- The extension is in a broken state after a server crash

> **Note:** `zombiecoder.mission-barisal.manage` is also wired as the provider's
> `managementCommand`, so it opens automatically when you click **Manage Models...**
> in the Copilot model picker.

## Related VS Code commands

- **Chat: Manage Language Models** — built-in model manager where Mission Barisal
  appears as a provider.
- **Extensions: Install from VSIX...** — install the `.vsix` build.
