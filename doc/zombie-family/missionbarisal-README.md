# 🧟 Mission Barisal — Multi-Agent AI Platform

> **"বাজারে গেলাম"** — এটাই আমাদের সিস্টেমের মূল মস্তিষ্ক।
> সবকিছু এখান থেকেই নিয়ন্ত্রিত হয়।

## 📋 সারসংক্ষেপ

| বিষয় | তথ্য |
|-------|------|
| **নাম** | Mission Barisal v3 |
| **ধরন** | Node.js Express Server |
| **কাজ** | Multi-agent AI platform — routing, tools, sessions |
| **পোর্ট** | `9999` (HTTP + WebSocket) |
| **ফাইল** | `api.js` (17,000+ lines) |
| **মালিক** | Sahon Srabon (ZombieCoder) |

## 🔗 চেইন — কেন এটা দরকার?

```
Extension (VS Code)
    ↓
Mission Barisal (api.js) ← এইখানে সব হয়
    ├─→ Provider Router (OpenCode, Groq, Gemini, Ollama)
    ├─→ Agent System (9 agents, personas)
    ├─→ MCP Tools (34+ tools)
    ├─→ Session Manager
    ├─→ Rate Limiter
    └─→ Response Normalizer
    ↓
Docker Ollama (inference)
    ↓
User gets response
```

**bazar_logic অনুযায়ী:**
- যেমন বাজারে গিয়ে সবকিছু এক জায়গায় পাওয়া যায়
- তেমনি এই সার্ভার থেকেই সব কাজ হয়
- এটা ছাড়া পুরো সিস্টেম অচল

## 📁 ফোল্ডার স্ট্রাকচার

```
zombie/ (missionbarisal)
├── api.js                    ← মূল সার্ভার (17,000+ lines!)
├── start.js                  ← Bootstrap & startup
├── .env                      ← Environment variables
├── domain-config.js          ← Domain detection & routing
├── external-mcp.js           ← External MCP integration
├── mcp-client.js             ← MCP client implementation
├── note-store.js             ← Note/session persistence
├── skills.js                 ← Skill management
├── identity.json             ← Server identity
├── acp-skills.json           ← Available skills
├── PERSONAS.md               ← Agent personas
├── Ethical.md                ← Ethical guidelines
├── .zombiecoder/
│   ├── SSOT.md               ← Single Source of Truth
│   └── agents/
│       ├── syllabus.md       ← Agent behavioral rules
│       ├── memory.json       ← Agent memory
│       └── sessions/         ← Session contexts
├── external mcp/
│   ├── servers.json          ← MCP server registry
│   ├── ocr-mcp.js            ← OCR tool (Tesseract)
│   ├── screen-recorder-mcp.js ← Screen recording
│   └── tts-mcp.js            ← Text-to-speech
├── data/                     ← Runtime data
├── cache/                    ← Cached data
├── logs/                     ← Server logs
├── doc/                      ← Documentation
├── skills/                   ← Skill files
├── frontend/                 ← Web UI
└── public/                   ← Static files
```

## 🚀 কিভাবে চালাতে হবে

```bash
cd /home/sahon/zombie

# সব একসাথে চালু করো
node start.js --start-all

# শুধু main server
node api.js

# Health check
curl http://localhost:9999/health
```

## 🔌 API Endpoints

### Health Check
```bash
curl http://localhost:9999/health
```
**Response:**
```json
{
  "healthy": true,
  "version": "3.2.1",
  "domain": "localhost",
  "agents": 9,
  "models": 136,
  "uptime": 205
}
```

### Chat Completions (OpenAI Compatible)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-r1:1.5b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### List Models
```bash
curl http://localhost:9999/api/v1/models
```

### List Agents
```bash
curl http://localhost:9999/api/agents
```

### MCP Protocol
```bash
# MCP initialize
curl -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {...}}'

# MCP tools list
curl -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list"}'
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTS                               │
│  VS Code Extension │ Web Browser │ curl │ MCP Client    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              MISSION BARISAL (api.js)                   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Rate Limit  │  │   Session    │  │   Agent      │  │
│  │   Manager    │  │   Manager    │  │   Router     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Provider   │  │  Tool        │  │  Response    │  │
│  │   Router     │  │  Executor    │  │  Normalizer  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   SSOT       │  │   Syllabus   │  │   Memory     │  │
│  │   Loader     │  │   Loader     │  │   Store      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    PROVIDERS                             │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ OpenCode │  │   Groq   │  │  Gemini  │  │ Ollama │  │
│  │ 63 mods  │  │ 14 mods  │  │ 7 mods   │  │ 1 mod  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                         │
│  Total: 136 models across 4 providers                   │
└─────────────────────────────────────────────────────────┘
```

## 🤖 Agent System

### 9 Specialist Agents
| Agent | Role | Priority |
|-------|------|----------|
| `code-guru` | Architecture & Design | 99 |
| `bug-hunter` | Debugging & Error Analysis | 98 |
| `security-hero` | Security Audit | 97 |
| `perf-wizard` | Performance Optimization | 96 |
| `doc-king` | Documentation | 95 |
| `qa-tyrant` | Code Quality | 94 |
| `data-agent` | Data Processing | 93 |
| `general` | General Purpose | 92 |
| `zombie-explorer` | Codebase Exploration | 91 |

### Agent Lifecycle
```
User Message
    ↓
Agent Router (selects best agent)
    ↓
Load SSOT (project context)
    ↓
Load Syllabus (behavioral rules)
    ↓
Load Memory (past context)
    ↓
Call Model (with tools)
    ↓
Execute Tools (if needed)
    ↓
Normalize Response
    ↓
Return to User
```

## 🔧 Tool Sanitizer (Small Model Fix)

### Problem
Small models (deepseek-r1:1.5b) produce malformed tool calls:
- JSON embedded in content text
- Trailing commas in arguments
- Single quotes instead of double quotes

### Solution
```javascript
// 4 functions added:
sanitizeToolCallResponse()    // Extract tool calls from content
cleanContentFromToolArtifacts() // Strip tool call JSON from text
normalizeSmallModelResponse()  // Handle all small-model quirks
sanitizeTools()               // Cap tools at 15 for small models
```

### Self-Healing Logic
```javascript
// 5 recovery strategies:
Case 1: JSON malformed → extract_from_content
Case 2: Tool not found → use_suggested_tool
Case 3: Arguments missing → use_default_args
Case 4: Connection timeout → retry_connection
Case 5: Unknown error → fallback_to_text
```

## 📊 MCP Tools (34+)

### File Operations
- `read_file` — Read file contents
- `write_file` — Write to files
- `list_directory` — List directory contents
- `set_working_dir` — Set project directory

### Terminal
- `terminal` — Execute shell commands

### Search
- `grep` — Search file contents
- `glob` — Find files by pattern

### System
- `system_info` — Get system information

### OCR & Media
- `ocr_image` — Extract text from images
- `ocr_screenshot` — Screenshot + OCR
- `screen_screenshot` — Take screenshot
- `screen_record_start` — Start recording
- `screen_record_stop` — Stop recording

### TTS
- `tts_generate` — Text to speech (Bengali voice)

## 🐛 Troubleshooting

### Server চালু নেই
```bash
# Check if port 9999 is in use
lsof -i :9999

# Check logs
tail -f /home/sahon/zombie/logs/server.log

# Restart
cd /home/sahon/zombie
node start.js --start-all
```

### "operation aborted" error
```bash
# This means client disconnected before response
# Check server health
curl http://localhost:9999/health

# Check model status
curl http://localhost:9999/api/v1/models
```

### Tools not working
```bash
# Check MCP connection
curl http://localhost:9999/api/mcp-clients

# Check available tools
curl -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## 🔗 সম্পর্কিত ফোল্ডার

- **`../docker_ollama/`** — Ollama inference server
- **`../extension/`** — VS Code extension

---

*Last Updated: 2026-09-01*
*Status: ✅ Production Running*
*Uptime: 200+ seconds*
*Requests: 23+ processed*
