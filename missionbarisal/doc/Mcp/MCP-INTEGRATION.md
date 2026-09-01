# MCP (Model Context Protocol) Integration

## How Mission Barisal Connects with VS Code, Cursor, and Other Clients

This document explains how MCP works, how to detect connections,
and how to send all necessary data to agents.

---

## What is MCP?

MCP (Model Context Protocol) is a standard for AI tools to communicate
with editors like VS Code and Cursor. Mission Barisal implements MCP
so you can use AI agents directly in your editor.

---

## How Connection Detection Works

### When a Client Connects

1. Client sends `initialize` request with project roots
2. Server detects client name, version, and project directory
3. Server auto-generates SSOT.md for the project
4. Server stores client metadata in session

### Detection Headers

```javascript
// Server reads these from incoming requests
const clientName = req.headers['x-mcp-client-name'];  // "vscode"
const clientDir = req.headers['x-mcp-client-dir'];     // "/home/user/project"

// Or from MCP initialize params
params.clientInfo.name;     // "vscode"
params.clientInfo.version;  // "1.92.0"
params.roots[0].uri;        // "file:///home/user/project"
```

### What Gets Stored

```json
{
  "name": "vscode-abc123",
  "version": "1.92.0",
  "protocolVersion": "2024-11-05",
  "connected_at": "2026-07-14T10:00:00Z",
  "working_dir": "/home/user/project",
  "detected_dir": "/home/user/project",
  "session_id": "abc123",
  "tools_used": 5,
  "anonymous": false
}
```

---

## What Data Gets Sent to Agents

### 1. Session Metadata (from headers)

Every request sends these to the agent:

```json
{
  "agent_id": "code-guru",
  "user_agent": "Mozilla/5.0...",
  "device_info": "VSCode-Linux",
  "editor_version": "1.92.0",
  "os_platform": "linux",
  "client_version": "3.2.1",
  "session_source": "mcp"
}
```

### 2. System Identity (English)

The agent receives its identity in English:

```
You are Code Guru - Monu, a Mission Barisal Agent.
Your role: architecture
Your expertise: code review, refactoring, best practices, system design
Server: Mission Barisal v3.2.1 | Domain: localhost
```

### 3. SSOT (Single Source of Truth)

Auto-generated from project files:

```
PROJECT SSOT:
- Project: my-app
- Type: node
- Language: javascript
- Main files: index.js, server.js, package.json
- Dependencies: express, mongoose
- Structure: src/, tests/, config/
```

### 4. Syllabus (Learned Knowledge)

Auto-updated from project analysis:

```
SYLLABUS:
- Last analyzed: 2026-07-14
- Known issues: None detected
- User patterns: Uses Express.js REST API
- Version: Node.js 20.x
- Database: MongoDB
```

### 5. Memory (Session History)

Recent conversation context:

```
MEMORY:
- Session abc123: "Reviewed code for security issues"
- Session def456: "Fixed SQL injection vulnerability"
- Session ghi789: "Optimized database queries"
```

---

## Complete MCP Flow

```
VS Code Extension
       |
       |--- initialize ---> Mission Barisal Server
       |                         |
       |<-- capabilities ---     |--- Auto-generate SSOT.md
       |                         |--- Store client metadata
       |                         |--- Load personas
       |                         |
       |--- tools/call --->      |
       |   (read_file)           |--- Read project file
       |                         |--- Inject into agent context
       |<-- result ---           |--- Agent processes with full context
       |                         |
       |--- tools/call --->      |
       |   (web_search)          |--- Search web for info
       |                         |--- Inject results
       |<-- result ---           |--- Agent responds
       |                         |
       |--- chat/message --->    |
       |                         |--- Full mission execution
       |<-- response ---         |--- Agent uses all context
```

---

## SSOT Auto-Generation

### How It Works

When a client connects, the server:

1. Reads project directory structure
2. Scans for package.json, requirements.txt, etc.
3. Detects language, framework, dependencies
4. Generates SSOT.md with project metadata
5. Stores it in `.zombiecoder/SSOT.md`

### What SSOT Contains

```markdown
# Project: my-app

## Basic Info
- Type: node
- Language: javascript
- Framework: express

## Structure
- src/ — Source code
- tests/ — Test files
- config/ — Configuration

## Dependencies
- express@4.18.2
- mongoose@7.6.0

## Scripts
- start: node server.js
- test: jest
- build: webpack
```

### When SSOT Updates

- On client connect (initialize)
- On workspace change notification
- On `set_working_dir` tool call
- After mission completion (auto-refresh)

---

## Syllabus Auto-Generation

### How It Works

The syllabus is automatically updated based on:

1. **Project files** — What files exist, what they contain
2. **Log files** — What errors occur, what users do
3. **Web search** — Current best practices
4. **User patterns** — How the developer works

### Syllabus Sections (Auto-Created)

```markdown
# Syllabus: my-app

## Project Health
- Last checked: 2026-07-14
- Issues found: 0
- Warnings: 2

## Known Issues
- None detected

## User Patterns
- Working hours: 10am-6pm
- Primary language: Bengali
- Code style: Functional

## Version Info
- Node.js: 20.x
- npm: 10.x
- Package manager: npm

## Database
- Type: MongoDB
- Version: 7.0
- Status: Connected

## Security
- Last audit: 2026-07-14
- Vulnerabilities: 0
- Warnings: 1 (deprecated dependency)
```

### Auto-Update Triggers

1. **File changes** — When project files are modified
2. **Error logs** — When errors are logged
3. **User feedback** — When user reports issues
4. **Web search** — When new best practices are found
5. **Time-based** — Periodic re-analysis

---

## MCP Tool Access

### Available Tools

Agents can use these tools via MCP:

| Tool | Description | When Used |
|------|-------------|-----------|
| `read_file` | Read file contents | User asks about code |
| `write_file` | Write to file | User asks to create/modify |
| `list_directory` | List folder contents | User asks about structure |
| `set_working_dir` | Set project directory | First connection |
| `get_working_dir` | Get current directory | Any time |
| `web_search` | Search the web | Need current info |
| `open_browser` | Open URL/file | User asks to open |

### Tool Execution Flow

```
1. User asks: "Read main.js"
2. Agent decides to use read_file tool
3. Agent sends tool_call with path
4. Server executes tool (reads file)
5. Server returns file content to agent
6. Agent processes content
7. Agent responds to user
```

---

## Client Data Sending

### What Gets Sent

Every request to the agent includes:

```json
{
  "system": "Agent persona + identity + rules",
  "ssot": "Project metadata from SSOT.md",
  "syllabus": "Learned knowledge from analysis",
  "memory": "Recent session history",
  "session_metadata": {
    "agent_id": "code-guru",
    "device_info": "VSCode-Linux",
    "editor_version": "1.92.0",
    "os_platform": "linux"
  },
  "user_input": "What the user typed"
}
```

### Why This Matters

The agent knows:
- **Who it is** — Its persona and role
- **Where it is** — The project context
- **What happened before** — Session history
- **What the user wants** — The current request
- **What device** — How to format responses

---

## MCP Configuration for Clients

### VS Code Settings

```json
{
  "mcpServers": {
    "mission-barisal": {
      "url": "http://localhost:8080/mcp",
      "headers": {
        "X-Device-Info": "VSCode",
        "X-OS-Platform": "${os.platform}"
      }
    }
  }
}
```

### Cursor Settings

```json
{
  "mcpServers": {
    "mission-barisal": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "http://localhost:8080/mcp",
        "-H", "Content-Type: application/json"
      ]
    }
  }
}
```

---

## Troubleshooting

### Problem: SSOT not generated

**Solution:** Check if client sends roots in initialize:

```javascript
// Client must send roots
params.roots = [{
  uri: "file:///home/user/project",
  name: "My Project"
}];
```

### Problem: Agent doesn't know project

**Solution:** Verify SSOT exists:

```bash
cat .zombiecoder/SSOT.md
```

If missing, call `set_working_dir` tool:

```json
{
  "tool": "set_working_dir",
  "args": { "directory": "/home/user/project" }
}
```

### Problem: Session metadata missing

**Solution:** Send headers with request:

```javascript
headers: {
  'X-Agent-Id': 'code-guru',
  'X-Device-Info': 'MyApp',
  'X-Editor-Version': '1.0.0'
}
```

---

## Summary

1. MCP detects client connections automatically
2. SSOT is generated from project files
3. Syllabus is auto-updated from analysis
4. Memory tracks conversation history
5. All data is sent to agents with every request
6. Agents use tools to read/write files
7. No manual setup needed — it just works

The system knows everything it needs to help you effectively.
