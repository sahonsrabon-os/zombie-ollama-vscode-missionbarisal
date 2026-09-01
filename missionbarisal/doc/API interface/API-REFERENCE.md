# Mission Barisal API Reference

## Plain Text API Documentation

This is a friendly, non-scary API reference. Every endpoint explained
with examples. No jargon, no intimidation.

---

## Base URL

```
http://localhost:8080
```

---

## Endpoints Overview

| Method | Path | What It Does |
|--------|------|--------------|
| GET | `/health` | Check if server is alive |
| GET | `/identity` | Server identity and version |
| GET | `/v1/models` | List available agents |
| POST | `/v1/chat/completions` | Send a message to an agent |
| POST | `/api/mission` | Full multi-agent debate |
| POST | `/api/v1/anti-dote` | Safety-checked execution |
| POST | `/mcp` | MCP protocol endpoint |
| GET | `/api/config` | View server configuration |
| POST | `/api/config` | Update server configuration |
| GET | `/api/domain` | Domain detection info |

---

## 1. Health Check

### Request

```
GET /health
```

### Response

```json
{
  "healthy": true,
  "version": "3.2.1",
  "domain": "localhost",
  "serverType": "development",
  "agents": 6,
  "models": 23,
  "pusher": true,
  "hasFrontend": false,
  "maxRateLimit": 808099,
  "uptime": 42,
  "session_count": 5,
  "rate_limit": {
    "limited": false,
    "domain": "localhost"
  }
}
```

### What Each Field Means

- `healthy` — Is the server running? (true = yes)
- `version` — Server version number
- `domain` — Which domain this server serves
- `serverType` — "production" or "development"
- `agents` — How many AI agents are loaded
- `models` — How many AI models are available
- `uptime` — How many seconds the server has been running
- `session_count` — How many active chat sessions

---

## 2. Chat Completions (Main Endpoint)

This is the main endpoint for building chat applications.

### Request

```
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "mission",
  "messages": [
    { "role": "user", "content": "Your message here" }
  ],
  "stream": false,
  "temperature": 0.7,
  "session_id": "optional-session-id"
}
```

### Request Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `model` | Yes | string | Use "mission" for multi-agent |
| `messages` | Yes | array | Array of message objects |
| `stream` | No | boolean | true for SSE streaming |
| `temperature` | No | number | 0.0-1.0, creativity level |
| `session_id` | No | string | Continue a previous session |

### Message Object

```json
{
  "role": "user",
  "content": "What is Node.js?"
}
```

Roles:
- `user` — The human's message
- `assistant` — The agent's previous response
- `system` — Instructions (usually server-side)

### Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1783976573,
  "model": "mission",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Node.js is a JavaScript runtime..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 100,
    "total_tokens": 150
  },
  "session_id": "abc123-...",
  "conversation_id": "abc123-..."
}
```

### Headers You Can Send

| Header | Description | Example |
|--------|-------------|---------|
| `X-Agent-Id` | Force a specific agent | `code-guru` |
| `X-Device-Info` | Client device info | `VSCode-Linux` |
| `X-Editor-Version` | Editor version | `1.92.0` |
| `X-OS-Platform` | Operating system | `linux` |
| `X-Client-Version` | Your app version | `1.0.0` |

---

## 3. List Models/Agents

### Request

```
GET /v1/models
```

### Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "code-guru",
      "object": "model",
      "name": "Code Guru - Monu",
      "role": "architecture",
      "ready": true
    },
    {
      "id": "bug-hunter",
      "object": "model",
      "name": "Bug Hunter - Jewel",
      "role": "debugging",
      "ready": true
    }
  ]
}
```

---

## 4. Mission (Multi-Agent Debate)

For complex tasks that need multiple agents to discuss and debate.

### Request

```
POST /api/mission
Content-Type: application/json

{
  "input": "Review this code for security issues",
  "context": "optional project context",
  "session_id": "optional"
}
```

### Response

```json
{
  "success": true,
  "combined": "Final answer from all agents...",
  "agents": [
    {
      "name": "Security Hero - Bristi",
      "role": "security",
      "model": "deepseek-r1:1.5b"
    }
  ],
  "verification": {
    "verified": true,
    "rounds": 1,
    "challenges": 2
  },
  "stats": {
    "totalAgents": 6,
    "responded": 4,
    "failed": 0
  },
  "timing": {
    "elapsed": 15000
  },
  "session_id": "abc123-..."
}
```

---

## 5. Anti-Dote (Safety Checked Execution)

Six-step safety chain before executing dangerous operations.

### Request

```
POST /api/v1/anti-dote
Content-Type: application/json

{
  "input": "Delete the temp folder",
  "session_id": "optional"
}
```

### Response

```json
{
  "success": true,
  "verified": true,
  "combined": "Operation completed safely...",
  "contract": {
    "goal": {
      "type": "destructive",
      "successCriteria": ["Folder deleted", "No data loss"]
    },
    "proof": {
      "complexity": "medium"
    },
    "verification": {
      "score": 85,
      "passed": true
    }
  },
  "antiDote": {
    "applied": true,
    "version": "1.0.0"
  }
}
```

---

## 6. MCP Protocol

For VS Code, Cursor, and other MCP-compatible clients.

### Request

```
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "vscode",
      "version": "1.92.0"
    },
    "protocolVersion": "2024-11-05",
    "roots": [
      {
        "uri": "file:///home/user/project",
        "name": "My Project"
      }
    ]
  }
}
```

### Available MCP Methods

| Method | Description |
|--------|-------------|
| `initialize` | Start MCP connection |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `set_working_dir` | Set project directory |
| `get_working_dir` | Get current directory |
| `read_file` | Read a file |
| `write_file` | Write a file |
| `list_directory` | List directory contents |
| `web_search` | Search the web |
| `open_browser` | Open URL in browser |

---

## 7. Configuration

### View Config

```
GET /api/config
```

### Update Config

```
POST /api/config
Content-Type: application/json

{
  "maxRateLimit": 1000,
  "sessionTtl": 86400000
}
```

---

## 8. Domain Detection

### Request

```
GET /api/domain
```

### Response

```json
{
  "domain": "localhost",
  "type": "development",
  "version": "3.2.1",
  "config": {
    "hasFrontend": false,
    "pusherEnabled": true
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "message": "Description of what went wrong",
    "code": 400
  }
}
```

### Common Errors

| Code | Meaning | What To Do |
|------|---------|------------|
| 400 | Bad request | Check your JSON syntax |
| 429 | Rate limited | Wait a few seconds, retry |
| 500 | Server error | Check server logs |

---

## Rate Limits

Default: 999,999 requests per minute (essentially unlimited in development).

In production, configure via environment variable:

```bash
RATE_LIMIT_PER_MINUTE=100
```

---

## Session Behavior

- Sessions auto-expire after 24 hours
- Same client + editor = session reuse
- Each session tracks message count and metadata
- Sessions are archived after mission completion

---

## Quick Start Code

### cURL

```bash
# Health check
curl http://localhost:8080/health

# Send a message
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mission",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Python

```python
import requests

response = requests.post(
    'http://localhost:8080/v1/chat/completions',
    json={
        'model': 'mission',
        'messages': [{'role': 'user', 'content': 'Hello!'}]
    }
)

data = response.json()
print(data['choices'][0]['message']['content'])
```

### JavaScript (Node.js)

```javascript
const response = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'mission',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

---

This is all you need. No scary jargon, no complicated setup.
Just HTTP requests and JSON responses. Happy coding!
