# VS Code Extension Integration

## How to Connect Mission Barisal with VS Code

This document explains how to set up and use Mission Barisal
as an AI assistant in Visual Studio Code.

---

## Installation

### 1. Install the Extension

```bash
# From VS Code marketplace
code --install-extension zombiecoder.mission-barisal

# Or manually copy to ~/.vscode/extensions/
```

### 2. Configure Settings

Open VS Code Settings (Ctrl+,) and add:

```json
{
  "missionBarisal.serverUrl": "http://localhost:8080",
  "missionBarisal.agentId": "code-guru",
  "missionBarisal.autoConnect": true,
  "missionBarisal.showThinking": true,
  "missionBarisal.enableStreaming": true
}
```

### 3. Start the Server

```bash
cd /home/sahon/Desktop/api
PORT=5000 node hamba.js
```

---

## Features

### Chat Panel

1. Open Command Palette (Ctrl+Shift+P)
2. Type "Mission Barisal: Open Chat"
3. Start chatting with agents

### Code Actions

Select code, right-click, and choose:
- "Review Code" — Get code review
- "Fix Bug" — Find and fix bugs
- "Explain Code" — Get explanation
- "Write Tests" — Generate test cases

### Inline Suggestions

The extension provides AI-powered suggestions as you type.
Press Tab to accept, Esc to dismiss.

---

## MCP Configuration

### Automatic Setup

The extension automatically configures MCP when you open a project:

```json
{
  "mcpServers": {
    "mission-barisal": {
      "url": "http://localhost:8080/mcp",
      "headers": {
        "X-Agent-Id": "code-guru",
        "X-Device-Info": "VSCode",
        "X-Editor-Version": "${version}",
        "X-OS-Platform": "${os.platform}"
      }
    }
  }
}
```

### Manual Setup

If automatic setup doesn't work, create `.vscode/mcp.json`:

```json
{
  "servers": {
    "mission-barisal": {
      "type": "http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

---

## How It Works

### Connection Flow

```
1. VS Code starts
2. Extension reads settings
3. Extension sends initialize to server
4. Server detects project directory
5. Server generates SSOT.md
6. Server stores client metadata
7. Extension is ready to use
```

### Data Sent to Server

Every request includes:

```json
{
  "clientInfo": {
    "name": "vscode",
    "version": "1.92.0"
  },
  "headers": {
    "X-Agent-Id": "code-guru",
    "X-Device-Info": "VSCode-Linux",
    "X-Editor-Version": "1.92.0",
    "X-OS-Platform": "linux"
  },
  "roots": [{
    "uri": "file:///home/user/project",
    "name": "My Project"
  }]
}
```

### What the Agent Receives

```json
{
  "persona": "You are Code Guru - Monu...",
  "identity": "Mission Barisal Agent v3.2.1",
  "ssot": "Project: my-app, Type: node...",
  "syllabus": "Known issues: None...",
  "memory": "Recent sessions: [...]",
  "session_metadata": {
    "device": "VSCode-Linux",
    "editor": "1.92.0",
    "os": "linux"
  }
}
```

---

## Agent Selection

### Choose Agent for Task

```javascript
// In extension settings
{
  "missionBarisal.defaultAgent": "code-guru",  // For code review
  "missionBarisal.debugAgent": "bug-hunter",   // For debugging
  "missionBarisal.securityAgent": "security-hero"  // For security
}
```

### Auto Agent Selection

The server automatically selects agents based on your request:
- Code review → code-guru
- Bug fix → bug-hunter
- Security check → security-hero
- Performance → perf-wizard
- Documentation → doc-king
- Testing → qa-tyrant

---

## Streaming Responses

### Enable Streaming

```json
{
  "missionBarisal.enableStreaming": true
}
```

### How Streaming Works

1. You type a message
2. Server starts processing
3. Response chunks arrive in real-time
4. Text appears character by character
5. Thinking process shows in collapsible section

### Visual Indicators

- **Typing indicator** — Agent is processing
- **Thinking section** — Agent's reasoning process
- **Tool calls** — Agent is using tools (reading files, etc.)
- **Complete** — Response is finished

---

## Tool Usage

### What Tools Are Available

The agent can use these tools in VS Code:

| Tool | What It Does |
|------|--------------|
| `read_file` | Read any file in your project |
| `write_file` | Create or modify files |
| `list_directory` | Browse folder structure |
| `set_working_dir` | Set project root |
| `get_working_dir` | Get current directory |
| `web_search` | Search the internet |
| `open_browser` | Open files in browser |

### Tool Execution

When the agent uses a tool:
1. Tool call appears in chat
2. Extension executes the tool
3. Result is sent back to agent
4. Agent continues processing

---

## Bengali Text Support

### How It Works

The extension preserves Bengali characters:
- ZWNJ (Zero-Width Non-Joiner) — ক\u200Cষ
- ZWJ (Zero-Width Joiner) — Conjunct characters
- All Unicode Bengali characters

### Test Bengali

1. Type in Bengali: `বাংলায় লিখুন`
2. Agent responds in Bengali
3. Characters are preserved correctly
4. No breaking or mangling

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Open Command Palette |
| `Ctrl+Shift+M` | Open Chat Panel |
| `Ctrl+Enter` | Send Message |
| `Ctrl+Shift+R` | Review Selected Code |
| `Ctrl+Shift+F` | Fix Bug in Selection |
| `Ctrl+Shift+E` | Explain Selection |

---

## Troubleshooting

### Problem: Extension not connecting

**Check:**
1. Server is running on port 5000
2. No firewall blocking
3. Correct URL in settings

```bash
curl http://localhost:8080/health
```

### Problem: SSOT not generated

**Check:**
1. Project folder is open in VS Code
2. Extension has folder access
3. `.zombiecoder/` folder exists

```bash
ls -la .zombiecoder/
```

### Problem: Agent doesn't know project

**Solution:**
1. Open Command Palette
2. Type "Mission Barisal: Refresh SSOT"
3. Wait for regeneration

### Problem: Bengali text broken

**Check:**
1. File encoding is UTF-8
2. Extension settings have Bengali support
3. Server has ZWNJ fix applied

---

## Advanced Configuration

### Custom System Prompt

```json
{
  "missionBarisal.systemPrompt": "You are a helpful coding assistant. Always respond in Bengali."
}
```

### Model Selection

```json
{
  "missionBarisal.model": "mission"
}
```

### Temperature Control

```json
{
  "missionBarisal.temperature": 0.7
}
```

### Max Tokens

```json
{
  "missionBarisal.maxTokens": 4096
}
```

---

## Summary

1. Install extension from marketplace
2. Configure server URL and agent
3. Open a project folder
4. Extension auto-connects via MCP
5. SSOT is generated automatically
6. Start chatting with agents
7. Agents know your project context
8. Bengali text works perfectly

No complicated setup. Just install, configure, and code!
