<div align="center">

# Mission Barisal

### Zero-Dependency Multi-Agent AI System

**6 Specialized Bengali AI Agents | Real-time Web Search | 3-Phase Debate | MCP Tools**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Deps](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)](#)
[![Free Models](https://img.shields.io/badge/Models-Free-orange.svg)](#)

```
Barisal's playful chaos meets code discipline!
Shawon Bhai knows everything — misbehave and you'll be caught!
```

</div>

---

## What is Mission Barisal?

Mission Barisal is a **zero-dependency multi-agent AI system** built in pure Node.js. It runs **6 specialized AI agents** — each with a unique Bengali persona and expertise — that collaborate through a **3-phase debate pipeline** to provide comprehensive, evidence-based answers.

### Key Features

- **6 Specialized Agents** — Architecture, Debugging, Security, Performance, Documentation, QA
- **3-Phase Debate Pipeline** — Initial Response → Cross-Verify → Combined Output
- **Real-time Web Search** — Agents search the web for current data before answering
- **MCP Tools** — File I/O, web search, browser automation, memory system
- **Provider Fallback Chain** — OpenCode → Groq → Gemini (automatic failover)
- **Zero Dependencies** — Pure Node.js, no frameworks, no npm bloat
- **Free Models** — Uses OpenCode free models (DeepSeek, MiMo, BigPickle)
- **Identity Protection** — Agents never reveal their underlying model
- **Session Management** — Persistent sessions with memory and metadata
- **cPanel Ready** — Deploy on any cPanel hosting with Node.js support

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT REQUEST                           │
│               POST /v1/chat/completions                         │
│         { model: "mission", messages: [...] }                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MISSION HANDLER                              │
│                                                                 │
│   1. classifyInput() — Detect intent & complexity               │
│   2. selectAgents() — Choose relevant agents                    │
│   3. routeToPipeline() — Start 3-phase debate                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              3-PHASE MISSION PIPELINE                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 1: Initial Response (parallel)                    │    │
│  │                                                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ code-guru│ │bug-hunter│ │ security │ │  perf    │  │    │
│  │  │ (মনু)    │ │ (জুয়েল) │ │ (বৃষ্টি) │ │ (রাশেদ) │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       │             │             │             │        │    │
│  │       ▼             ▼             ▼             ▼        │    │
│  │  ┌──────────┐ ┌──────────┐                               │    │
│  │  │doc-king  │ │qa-tyrant │                               │    │
│  │  │ (হালিম)  │ │ (মজনু)   │                               │    │
│  │  └────┬─────┘ └────┬─────┘                               │    │
│  └───────┼─────────────┼────────────────────────────────────┘    │
│          │             │                                         │
│          ▼             ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 2: Cross-Verification (debate)                    │    │
│  │                                                         │    │
│  │  Each agent reviews others' responses:                  │    │
│  │  • Verify factual claims                                │    │
│  │  • Check code examples                                  │    │
│  │  • Flag missing evidence                                │    │
│  │  • Suggest improvements                                 │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                        │
│                         ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 3: Combined Output (final answer)                 │    │
│  │                                                         │    │
│  │  • Merge all agent perspectives                         │    │
│  │  • Resolve contradictions                               │    │
│  │  • Verify goal completion                               │    │
│  │  • Apply identity masking                               │    │
│  │  • Return unified Bengali response                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PROVIDER FALLBACK CHAIN                          │
│                                                                 │
│   Priority 1 ──► Priority 2 ──► Priority 3                     │
│   OpenCode      Groq            Gemini                          │
│   (Free)        (Paid, fast)    (Paid, fast)                    │
│                                                                 │
│   Rate limit on P1? → Falls back to P2                          │
│   P2 fails? → Falls back to P3                                  │
│   All fail? → User-friendly error                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agents

Each agent is a specialized AI with a unique Bengali persona, expertise, and assigned model.

| Agent ID | Name | Role | Model | Expertise |
|----------|------|------|-------|-----------|
| `code-guru` | কোড গুরু - মনু | Architecture | `deepseek-v4-flash-free` | System design, patterns, clean code |
| `bug-hunter` | বাগ হান্টার - জুয়েল | Debugging | `mimo-v2.5-free` | Bug detection, error analysis, root cause |
| `security-hero` | সিকিউরিটি হিরো - বৃষ্টি | Security | `deepseek-v4-flash-free` | Security audit, OWASP, vulnerabilities |
| `perf-wizard` | পারফরম্যান্স উইজার্ড - রাশেদ | Performance | `mimo-v2.5-free` | Optimization, caching, profiling |
| `doc-king` | ডকুমেন্টেশন রাজা - হালিম | Documentation | `big-pickle` | API docs, README, technical writing |
| `qa-tyrant` | কোয়ালিটি তস্কর - মজনু | Quality | `big-pickle` | Testing, QA, code quality, consensus |
| `team-heart` | টিম হার্ট - জারা | Team Heart | `deepseek-v4-flash-free` | Harmony, morale, delivery, team coordination |
| `customer-experience-specialist` | Customer Experience Specialist | Customer Experience | `deepseek-v4-flash-free` | Omnichannel support, retention, complaint resolution |
| `ecommerce-operations-analyst` | E-Commerce Operations Analyst | E-Commerce | `deepseek-v4-flash-free` | Ad copy, catalog optimization, analytics, strategy |

> **Note:** The last 3 agents load dynamically — `team-heart` from `PERSONAS.md`, and the 2 custom agents from either `.zombiecoder/agents/*.md` (local, YAML frontmatter, git-ignored) or `PERSONAS.md` (deployed, git-tracked). Custom `.zombiecoder/agents/*.md` files override same-id `PERSONAS.md` entries.

### Agent Rules

1. **Evidence-Based** — Every claim requires proof
2. **SSOT First** — Always check Single Source of Truth
3. **Web Search** — Use real-time search for current data
4. **No Fabrication** — Say "I don't know" if unsure
5. **No Model Identity** — Agents never reveal their underlying model
6. **No Platform Identity** — Agents never say "ZombieCoder Dev Agent"

---

## MCP Tools

Each agent has access to 10 MCP tools:

| Tool | Description |
|------|-------------|
| `read_file` | Read a file from the filesystem |
| `write_file` | Write content to a file (creates directories) |
| `set_working_dir` | Set MCP working directory |
| `get_working_dir` | Get current MCP working directory |
| `web_search` | Search the web for real-time information |
| `agent_mission` | Execute a mission with all 6 agents in parallel |
| `agent_single` | Execute with a single agent |
| `get_memory` | Retrieve session memory |
| `read_ssot` | Read the Single Source of Truth file |
| `list_directory` | List contents of a directory |
| `open_browser` | Open a file or URL in the default browser |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check with agent/provider status |
| `GET` | `/identity` | System identity and branding |
| `GET` | `/v1/models` | List available agents (OpenAI format) |
| `GET` | `/api/v1/models` | List all provider models (with fallback info) |
| `POST` | `/v1/chat/completions` | Agent or mission chat (OpenAI-compatible) |
| `POST` | `/api/mission` | Full 3-phase debate mission |
| `POST` | `/api/v1/anti-dote` | Anti-Dote Type Safety (6-step chain) |
| `GET` | `/api/mcp-clients` | Connected MCP clients |
| `POST` | `/mcp` | MCP JSON-RPC 2.0 endpoint |
| `POST` | `/api/rate-limit/reset` | Reset rate limits |
| `GET` | `/api/rate-limit` | Check rate limit status || `WS` | `ws://<host>:<port>/` | WebSocket transport (RFC 6455 compliant handshake) |
| `WS` | `ws://<host>:<port>/mcp` | MCP JSON-RPC 2.0 over WebSocket |
| `SSE` | `POST /mcp` (Accept: text/event-stream) | MCP JSON-RPC 2.0 over SSE |

> **Transports:** HTTP · SSE · WebSocket (RFC 6455) · Unix Domain Socket (UDS, port 5100).
> Priority: UDS → HTTP → WS (auto-detected). All ports are env-driven — see Environment Variables.
---

## Project Structure

```
api/
├── api.js                # Main server (zero deps, ~13K lines)
├── start.js              # Entry point (loads .env + config, starts api.js)
├── bridge.js             # Optional proxy (forwards BRIDGE_PORT → engine)
├── align-server.js       # Server alignment utility
├── domain-config.js      # Domain detection & configuration
├── PERSONAS.md           # Agent persona definitions
├── .env.example          # Environment variable reference (copy to .env)
├── .gitignore            # Git ignore rules
├── .zombiecoder/
│   ├── SSOT.md           # Auto-generated Single Source of Truth
│   └── agents/
│       ├── memory.json   # Agent memory & recent context
│       ├── syllabus.md   # Auto-generated syllabus
│       └── sessions/     # Session archives
├── data/
│   └── sessions.json     # Active sessions
├── doc/
│   ├── SYSTEM-DOCUMENTATION.md
│   ├── cPanel Deployment/
│   │   └── CPANEL-DEPLOYMENT.md
│   ├── Chat completion/
│   │   └── HOW-TO-BUILD-CHAT-SYSTEM.md
│   ├── API interface/
│   │   ├── API-REFERENCE.md
│   │   └── HOW-IT-WORKS.md
│   ├── Browser Test/
│   │   ├── PLAYWRIGHT-TESTING.md
│   │   ├── UX-TESTING-GUIDE.md
│   │   └── test-chat.js
│   ├── Extensions/
│   │   └── VSCODE-EXTENSION.md
│   └── Mcp/
│       ├── MCP-INTEGRATION.md
│       ├── MICROSOFT-COPILOT-SOLUTION.md
│       ├── SYLLABUS-AUTO-GENERATION.md
│       ├── SYSTEM-IDENTITY-ENGLISH.md
│       └── AGENT-INDEPENDENCE.md
```

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- OpenCode API key (free) — [Get one here](https://opencode.ai)
- **No npm install needed** — zero external dependencies!

### 1. Clone the Repository

```bash
git clone https://github.com/missionbarishal3/Mission-Barisal
cd s
```

### 2. Configure Environment

Create a `.env` file (copy from example):

```bash
cat > .env << 'EOF'
PORT=9999
NODE_ENV=development

# API Keys (required for agent responses)
OPENCODE_API_KEY=your_opencode_api_key_here

# Optional: Fallback providers
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Real-time updates
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster
EOF
```

### 3. Start the Server

```bash
node start.js
```

**That's it!** No `npm install` needed — Mission Barisal uses **zero external dependencies**. Pure Node.js only.

### 5. Verify

```bash
curl http://localhost:9999/health
```

---

## Test Commands

### LOCAL SERVER (http://localhost:9999)

#### Health Check
```bash
curl http://localhost:9999/health
```

#### List All Agents
```bash
curl http://localhost:9999/v1/models
```

#### List All Provider Models
```bash
curl http://localhost:9999/api/v1/models
```

#### Chat with code-guru (Architecture)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "code-guru",
    "messages": [
      {"role": "user", "content": "একটা Express.js সার্ভারের ফোল্ডার স্ট্রাকচার দাও।"}
    ],
    "stream": false
  }'
```

#### Chat with bug-hunter (Debugging)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bug-hunter",
    "messages": [
      {"role": "user", "content": "JavaScript-এ 'Cannot read property of undefined' এরোর কারণ কি?"}
    ],
    "stream": false
  }'
```

#### Chat with security-hero (Security)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "security-hero",
    "messages": [
      {"role": "user", "content": "Node.js অ্যাপে XSS প্রতিরোধের উপায় বলো।"}
    ],
    "stream": false
  }'
```

#### Chat with perf-wizard (Performance)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "perf-wizard",
    "messages": [
      {"role": "user", "content": "Node.js-এ memory leak কিভাবে ধরবে?"}
    ],
    "stream": false
  }'
```

#### Chat with doc-king (Documentation)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doc-king",
    "messages": [
      {"role": "user", "content": "একটা REST API-র জন্য README লেখো।"}
    ],
    "stream": false
  }'
```

#### Chat with qa-tyrant (Quality Assurance)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qa-tyrant",
    "messages": [
      {"role": "user", "content": "Unit test এবং integration test-এর পার্থক্য বলো।"}
    ],
    "stream": false
  }'
```

#### Mission Mode (Full 6-Agent Debate)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mission",
    "messages": [
      {"role": "user", "content": "একটা ই-কমার্স সাইটের API ডিজাইন করো — সিকিউর, ফাস্ট, এবং স্কেলেবল।"}
    ],
    "stream": false
  }'
```

#### Chat with team-heart (Team Heart)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "team-heart",
    "messages": [
      {"role": "user", "content": "টিমের মোটিভেশন কমে গেছে, কী করব?"}
    ],
    "stream": false
  }'
```

#### Chat with customer-experience-specialist (Customer Experience)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "customer-experience-specialist",
    "messages": [
      {"role": "user", "content": "অর্ডার ট্র্যাকিং কিভাবে করব?"}
    ],
    "stream": false
  }'
```

#### Chat with ecommerce-operations-analyst (E-Commerce)
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ecommerce-operations-analyst",
    "messages": [
      {"role": "user", "content": "Facebook-এ প্রোডাক্ট অ্যাড লিখো"}
    ],
    "stream": false
  }'
```

#### Mission Mode with Streaming
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mission",
    "messages": [
      {"role": "user", "content": "React vs Next.js — কোনটা কখন ব্যবহার করবে?"}
    ],
    "stream": true
  }'
```

#### Test with Session ID
```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: code-guru" \
  -H "X-Device-Info: MacBook Pro" \
  -H "X-Editor-Version: VSCode 1.90" \
  -d '{
    "model": "code-guru",
    "messages": [
      {"role": "user", "content": "আমার প্রজেক্টের সমস্যা দেখো।"}
    ],
    "session_id": "test-session-001",
    "client_id": "cli-test",
    "editor": "vscode",
    "stream": false
  }'
```

---

### REMOTE SERVER (https://g.zombiecoder.my.id / https://mission-barisal.onrender.com)

> **Two production endpoints:**
> - `https://g.zombiecoder.my.id` — custom domain (dev/self-hosted)
> - `https://mission-barisal.onrender.com` — Render.com deployment (auto-deploys from `main` branch)
> Replace the host in any command below with either URL.

#### Health Check
```bash
curl https://g.zombiecoder.my.id/health
```
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "code-guru",
    "messages": [
      {"role": "user", "content": "একটা Express.js সার্ভারের ফোল্ডার স্ট্রাকচার দাও।"}
    ],
    "stream": false
  }'

#### List All Agents
```bash
curl https://g.zombiecoder.my.id/v1/models
```

#### List All Provider Models
```bash
curl https://g.zombiecoder.my.id/api/v1/models
```

#### Chat with code-guru (Architecture)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "code-guru",
    "messages": [
      {"role": "user", "content": "একটা Express.js সার্ভারের ফোল্ডার স্ট্রাকচার দাও।"}
    ],
    "stream": false
  }'
```

#### Chat with bug-hunter (Debugging)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bug-hunter",
    "messages": [
      {"role": "user", "content": "JavaScript-এ 'Cannot read property of undefined' এরোর কারণ কি?"}
    ],
    "stream": false
  }'
```

#### Chat with security-hero (Security)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "security-hero",
    "messages": [
      {"role": "user", "content": "Node.js অ্যাপে XSS প্রতিরোধের উপায় বলো।"}
    ],
    "stream": false
  }'
```

#### Chat with perf-wizard (Performance)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "perf-wizard",
    "messages": [
      {"role": "user", "content": "Node.js-এ memory leak কিভাবে ধরবে?"}
    ],
    "stream": false
  }'
```

#### Chat with doc-king (Documentation)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doc-king",
    "messages": [
      {"role": "user", "content": "একটা REST API-র জন্য README লেখো।"}
    ],
    "stream": false
  }'
```

#### Chat with qa-tyrant (Quality Assurance)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qa-tyrant",
    "messages": [
      {"role": "user", "content": "Unit test এবং integration test-এর পার্থক্য বলো।"}
    ],
    "stream": false
  }'
```

#### Mission Mode (Full 6-Agent Debate)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mission",
    "messages": [
      {"role": "user", "content": "একটা ই-কমার্স সাইটের API ডিজাইন করো — সিকিউর, ফাস্ট, এবং স্কেলেবল।"}
    ],
    "stream": false
  }'
```

#### Mission Mode with Streaming
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mission",
    "messages": [
      {"role": "user", "content": "React vs Next.js — কোনটা কখন ব্যবহার করবে?"}
    ],
    "stream": true
  }'
```

#### Test with Session ID (Remote)
```bash
curl -X POST https://g.zombiecoder.my.id/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: bug-hunter" \
  -H "X-Device-Info: iPhone 15" \
  -H "X-Editor-Version: Safari 17" \
  -H "X-OS-Platform: iOS" \
  -H "X-Client-Version: 1.0" \
  -d '{
    "model": "bug-hunter",
    "messages": [
      {"role": "user", "content": "আমার API-তে 502 আসছে, কারণ কি হতে পারে?"}
    ],
    "session_id": "remote-test-001",
    "client_id": "curl-test",
    "editor": "curl",
    "stream": false
  }'
```

#### Identity Check
```bash
curl https://g.zombiecoder.my.id/identity
```

#### Rate Limit Status
```bash
curl https://g.zombiecoder.my.id/api/rate-limit
```

---

## Agent-by-Agent Test Matrix

Use this matrix to test each agent with different types of questions.

| Agent | Test Type | Bengali Prompt | Expected Behavior |
|-------|-----------|----------------|-------------------|
| `code-guru` | Architecture | "Microservices vs Monolith — কোনটা কখন?" | Structured comparison with evidence |
| `code-guru` | Design Pattern | "Singleton pattern কখন ব্যবহার করবে?" | Real-world examples, code snippets |
| `bug-hunter` | Error Debug | "TypeError: Cannot read property of undefined" | Root cause analysis with fix |
| `bug-hunter` | Logic Bug | "Array deduplication কিভাবে করবে?" | Multiple approaches, best practice |
| `security-hero` | SQL Injection | "SQL injection কিভাবে প্রতিরোধ করবে?" | Parameterized queries, ORM suggestions |
| `security-hero` | Auth | "JWT token কিভাবে safe রাখবে?" | Best practices, expiry, storage |
| `perf-wizard` | Latency | "API response time 5s থেকে কমাতে চাই" | Caching, DB optimization, profiling |
| `perf-wizard` | Memory | "Memory leak কিভাবে ধরবে Node.js-এ?" | heapdump, clinic.js, inspection |
| `doc-king` | README | "একটা npm package-এর README লেখো" | Sections, badges, install, usage |
| `doc-king` | API Docs | "REST API endpoint documentation লেখো" | Request/response examples, status codes |
| `qa-tyrant` | Test Strategy | "Testing pyramid কি?" | Unit → Integration → E2E explanation |
| `qa-tyrant` | Code Review | "এই কোডে কি সমস্যা আছে?" | Quality issues, edge cases, suggestions |
| `team-heart` | Team Morale | "টিমের মোটিভেশন কমে গেছে, কী করব?" | Encouraging, playful, harmony-focused response |
| `customer-experience-specialist` | Customer Query | "অর্ডার ট্র্যাকিং কিভাবে করব?" | Empathetic, transparent, omnichannel response |
| `customer-experience-specialist` | Complaint | "প্রোডাক্ট খারাপ পেয়েছি, রিটার্ন চাই" | De-escalation, structured resolution, policy-based |
| `ecommerce-operations-analyst` | Ad Copy | "Facebook-এ প্রোডাক্ট অ্যাড লিখো" | Persuasive, data-driven, high-CTR ad copy |
| `ecommerce-operations-analyst` | Analytics | "কনভার্সন রেট কমছে কেন?" | Funnel analysis, metrics, actionable insights |

---

## Provider Configuration

### OpenCode (Primary — Free)

| Model | Type | Use Case |
|-------|------|----------|
| `deepseek-v4-flash-free` | Primary | Architecture, Security, QA |
| `mimo-v2.5-free` | Primary | Debugging, Performance |
| `big-pickle` | Primary | Documentation, Quality |
| `nemotron-3-ultra-free` | Fallback only | Speed over quality |
| `north-mini-code-free` | Fallback only | Speed over quality |

### Groq (Secondary — Fallback)

| Model | Type | Use Case |
|-------|------|----------|
| `llama-3.3-70b` | Fallback | General purpose |
| `llama-3.1-8b` | Fallback | Fast responses |
| `qwen-32b` | Fallback | Code-heavy tasks |
| `deepseek-r1` | Fallback | Reasoning |

### Gemini (Tertiary — Fallback)

| Model | Type | Use Case |
|-------|------|----------|
| `gemini-flash` | Fallback | Fast responses |
| `gemini-pro` | Fallback | Complex tasks |

---

## Deployment

### cPanel Deployment

See detailed guide: [doc/cPanel Deployment/CPANEL-DEPLOYMENT.md](doc/cPanel%20Deployment/CPANEL-DEPLOYMENT.md)

**Quick Steps:**
1. Upload files to cPanel File Manager
2. Configure `.env` with API keys
3. Start via cPanel Node.js App or PM2 (`node start.js`)
4. Set up reverse proxy (Apache/Nginx)

**Note:** No `npm install` needed — zero external dependencies!

### PM2 Deployment

```bash
# Install PM2 globally (only PM2 is needed)
npm install -g pm2

# Start server (no npm install in project directory!)
pm2 start start.js --name mission-barisal

# Save PM2 config
pm2 save

# Auto-start on boot
pm2 startup
```

### Docker Deployment (Coming Soon)

```bash
docker build -t mission-barisal .
docker run -p 9999:9999 --env-file .env mission-barisal
```

---

## Test Results

### Final Test Run: 2026-07-14

```
RESULTS: 59 passed / 1 failed / 60 total (98%)
```

| Category | Status | Details |
|----------|--------|---------|
| Health Check | PASS | All endpoints respond |
| Agent List | PASS | 7 agents listed (6 + mission) |
| Session Metadata | PASS | Headers stored correctly |
| Bengali Text | PASS | Clean, no English leaks |
| No \uFFFD | PASS | Unicode clean |
| code-guru | PASS | Responds as "মনু" |
| bug-hunter | PASS (flaky) | Responds as "জুয়েল" |
| security-hero | PASS | Responds as "বৃষ্টি" |
| perf-wizard | PASS | Responds as "রাশেদ" |
| doc-king | PASS | Responds as "হালিম" |
| qa-tyrant | PASS | Responds as "মজনু" |
| No Weak Models | PASS | No nemotron/north-mini as primary |
| No Model Self-ID | PASS | Agents don't reveal their model |

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `9999` | No | Engine port (`node api.js`) — all ports are env-driven |
| `SERVER_PORT` | `9999` | No | Alias for `PORT` in `start.js` (env wins over config.json) |
| `UDS_PORT` | `5100` | No | Unix Domain Socket port for MCP (env → config → 5100) |
| `BRIDGE_PORT` | `9999` | No | Bridge listen port (`bridge.js`, forwards → engine) |
| `BRIDGE_TARGET_PORT` | `9999` | No | Bridge upstream engine port |
| `NODE_ENV` | `development` | No | Environment mode |
| `DEPLOY_DOMAIN` | auto-detect | No | Override domain detection |
| `OPENCODE_API_KEY` | — | **Yes** | OpenCode API key |
| `GROQ_API_KEY` | — | No | Groq API key (fallback) |
| `GEMINI_API_KEY` | — | No | Gemini API key (tertiary) |
| `PUSHER_APP_ID` | — | No | Pusher for real-time |
| `PUSHER_KEY` | — | No | Pusher key |
| `PUSHER_SECRET` | — | No | Pusher secret |
| `PUSHER_CLUSTER` | — | No | Pusher cluster |
| `SERVER_NAME` | `Mission Barisal` | No | Display name |
| `SERVER_VERSION` | `3.2.1` | No | Version string |
| `SERVER_TYPE` | `development` | No | production/development |
| `MAX_RATE_LIMIT` | `999999` | No | Requests/min limit |
| `BRANDING_OWNER` | `ZombieCoder` | No | Owner name |

---

## License

MIT License — Free to use, modify, and distribute.

---

## Credits

**Author:** Sahon Srabon (ZombieCoder)
**Location:** Barisal, Bangladesh
**Version:** 3.2.1

---

```
Mission Barisal — Barisal's playful chaos meets code discipline!
Zero Dependency · Free Models · Multi-Agent Debate · Evidence-Based

Shawon Bhai knows everything — misbehave and you'll be caught!
```
