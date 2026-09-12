<div align="center">

# Zombie Family

### Complete Self-Hosted AI Platform

**3 Components | 9 Agents | 136 Models | 34 MCP Tools | Zero Cloud Dependency**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Zero Deps](https://img.shields.io/badge/Server-Deps-Zero-brightgreen.svg)](#)
[![VS Code](https://img.shields.io/badge/Editor-VS%20Code-blue.svg)](https://code.visualstudio.com)

```
Three systems, one family.
Extension talks to Server, Server talks to Ollama.
User never leaves VS Code.
```

</div>

---

## What is Zombie Family?

Zombie Family is a **complete, self-hosted AI platform** consisting of three tightly integrated components. It runs **9 specialized AI agents** with unique Bengali personas, connects to **136 models** across **5 providers**, and provides **34 MCP tools** — all running locally on your machine with zero cloud dependency for inference.

### The Three Systems

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   ┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐   │
│   │ EXTENSION   │───>│ MISSION BARISAL │───>│ DOCKER OLLAMA    │   │
│   │ (VS Code)   │    │ (Server:9999)   │    │ (Inference:5000) │   │
│   │             │    │                 │    │                  │   │
│   │ TypeScript  │    │ Node.js         │    │ Python + Docker  │   │
│   │ Port: —     │    │ Port: 9999      │    │ Port: 5000       │   │
│   │ Role: UI    │    │ Role: Brain     │    │ Role: Engine     │   │
│   └─────────────┘    └─────────────────┘    └──────────────────┘   │
│         │                    │                      │               │
│         │                    │                      │               │
│         ▼                    ▼                      ▼               │
│   User types here    Routes & manages        Runs AI models        │
│   Sees response      Agents, tools,          deepseek-r1:1.5b      │
│   here               sessions, memory        llama3:8b, etc.       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System 1: extension/ — VS Code AI Integration

> **"Brush korte gelam"** — This is our direct contact with the user.
> User experience is built here.

### What It Does

The extension bridges VS Code editor with the Mission Barisal server. Users chat with AI agents directly inside VS Code without leaving their workflow.

### Key Features

| Feature | Description |
|---------|-------------|
| **Real-time Streaming** | Chunk-by-chunk response, no waiting for full answer |
| **Multi-Agent Selection** | Choose from 9 specialist agents |
| **MCP Tool Integration** | 34+ tools available through chat |
| **SSOT/Syllabus Auto-load** | Project context loaded automatically |
| **Reasoning Display** | Thinking blocks shown separately |
| **No UI Changes** | Works within existing VS Code Copilot Chat |
| **Offline Fallback** | Works with local Ollama if server is down |
| **Evidence-Based** | Responses require proof, no hallucination |

### How It Connects

```
User types in VS Code
    |
    v
Extension captures input
    |
    v
Sends POST /v1/chat/completions to localhost:9999
    |
    v
Server routes to correct provider/model
    |
    v
Response streams back as SSE chunks
    |
    v
Extension renders in chat panel
```

### Real-World Usage

**Scenario 1: Developer debugging code**
```
User: "TypeError: Cannot read property of undefined" error
Extension sends to bug-hunter agent
Agent searches web for current solutions
Returns root cause analysis with fix
User applies fix without leaving VS Code
```

**Scenario 2: Architecture review**
```
User: "Should I use microservices or monolith?"
Extension sends to code-guru agent
Agent loads SSOT (project context)
Returns structured comparison with evidence
User makes informed decision
```

**Scenario 3: Security audit**
```
User: "Check my API for vulnerabilities"
Extension sends to security-hero agent
Agent searches for latest CVEs
Returns prioritized fix list
User patches critical issues immediately
```

### Setup

```bash
# Install from VSIX
code --install-extension zombiecoder-mission-barisal-1.8.0.vsix

# Or build from source
cd extension/
npm install
npm run compile
# Press F5 in VS Code to launch Extension Host
```

### Settings

```json
{
  "missionbarisal.serverUrl": "http://localhost:9999",
  "missionbarisal.defaultAgent": "code-guru",
  "missionbarisal.streaming": true,
  "missionbarisal.autoConnect": true
}
```

---

## System 2: missionbarisal/ — Multi-Agent Server

> **"Bajare gelam"** — This is the brain of our system.
> Everything is controlled from here.

### What It Does

The central server that routes requests, manages agents, executes tools, handles sessions, and orchestrates the entire AI pipeline. Built in pure Node.js with zero external dependencies.

### Key Features

#### Provider Callback System

```
Request comes in
    |
    v
┌─────────────────────────────────────────────────┐
│           PROVIDER ROUTER                        │
│                                                  │
│   Priority 1 ──> Priority 2 ──> Priority 3      │
│   OpenCode      Groq            Gemini           │
│   (63 models)   (14 models)     (7 models)       │
│                                                  │
│   P1 fails? ──> P2                                │
│   P2 fails? ──> P3                                │
│   All fail?  ──> Ollama (local fallback)          │
│                                                  │
│   Total: 136 models across 5 providers            │
└─────────────────────────────────────────────────┘
```

**Real-world management:**
- Provider health checked every 60 seconds
- Automatic failover without user intervention
- Live model sync from provider APIs
- Priority-based routing with rate limit awareness

#### Agent System

| Agent | Name | Role | Expertise |
|-------|------|------|-----------|
| `code-guru` | Monu | Architecture | System design, patterns, clean code |
| `bug-hunter` | Jewel | Debugging | Bug detection, root cause analysis |
| `security-hero` | Bablu | Security | Security audit, OWASP, vulnerabilities |
| `perf-wizard` | Rashed | Performance | Optimization, caching, profiling |
| `doc-king` | Halim | Documentation | API docs, README, technical writing |
| `qa-tyrant` | Mojnu | Quality | Testing, QA, code quality |
| `team-heart` | Jara | Team Heart | Harmony, morale, delivery |
| `customer-experience` | Specialist | Customer Experience | Support, retention, complaints |
| `ecommerce-operations` | Analyst | E-Commerce | Ad copy, analytics, strategy |

**Each agent has:**
- Unique Bengali persona (Barishali style)
- SSOT (project context)
- Syllabus (behavioral rules)
- Memory (session history)
- bazar_logic chain-of-thought

#### Anti-Dote Type Safety (6-Step Verification Chain)

```
Step 1: Input Validation (schema + proof)
    |
    v
Step 2: Type Safety Check
    |
    v
Step 3: Cross-Verification (agent debate)
    |
    v
Step 4: Compiler Check (code suggestions)
    |
    v
Step 5: Evidence Verification (proof required)
    |
    v
Step 6: Output Sanitization (no watermarks)
```

**Real-world impact:**
- Prevents hallucination (no proof = no answer)
- Catches malformed tool calls from small models
- Validates code changes before suggesting
- Strips watermarks and branding from responses

#### MCP (Model Context Protocol) — 34 Tools

| Category | Tools |
|----------|-------|
| **File Operations** | read_file, write_file, list_directory, delete_file, rename_file, set_working_dir, get_working_dir |
| **Search** | grep, glob, web_search |
| **Terminal** | terminal, exec |
| **System** | system_info, env_get |
| **Database** | db_query, db_list_tables |
| **OCR** | ocr_image, ocr_screenshot, ocr_crop |
| **Screen** | screen_screenshot, screen_record_start, screen_record_stop, screen_record_status |
| **TTS** | tts_speak, tts_play, tts_voices |
| **Agent** | agent_mission, agent_single, call_agent, get_memory, read_ssot |
| **HTTP** | http_request, open_browser, remote_mcp_call |

**Real-world usage:**
```
User: "Read my main.js and find the bug"
Agent calls: read_file("main.js")
Agent calls: grep("error handling", "*.js")
Agent analyzes and returns fix
```

#### UDS (Unix Domain Socket)

```
VS Code Extension
    |
    v
UDS Socket (/tmp/zombiecoder/mcp.sock)
    |
    v
Mission Barisal Server (port 9999)
    |
    v
Response back through socket
```

**Why UDS:**
- Faster than TCP (no network stack overhead)
- No port conflicts
- Automatic fallback to HTTP if UDS unavailable
- Supports multiple concurrent clients

#### SSOT/Syllabus/Memory

```
┌─────────────────────────────────────────────────┐
│           THREE-FILE MEMORY SYSTEM               │
│                                                  │
│   SSOT.md          — Project context             │
│   (Single Source     (tech stack, structure,      │
│    of Truth)          files, framework)           │
│                                                  │
│   syllabus.md      — Behavioral rules            │
│   (Agent's           (bazar_logic, evidence,     │
│    growing brain)     identity, constraints)     │
│                                                  │
│   memory.json      — Session history             │
│   (Conversation      (past interactions,          │
│    continuity)        context, decisions)         │
└─────────────────────────────────────────────────┘
```

**Real-world management:**
- SSOT auto-generated from workspace scan
- Syllabus updated with each learning
- Memory preserved across sessions
- All files project-scoped (no cross-project mixing)

### Setup

```bash
cd missionbarisal/
node start.js --start-all

# Health check
curl http://localhost:9999/health

# List agents
curl http://localhost:9999/v1/models

# List all models
curl http://localhost:9999/api/v1/models
```

---

## System 3: docker_ollama/ — Local LLM Inference

> **"Ghum theke uthe prothom kaj"** — This is the first step of our system.
> AI model inference starts here.

### What It Does

Runs Ollama LLM server in Docker with CPU-only configuration. Provides local AI inference without any cloud dependency.

### Why Docker (Not Bare Metal)

| Reason | Explanation |
|--------|-------------|
| **Environment Isolation** | No dependency conflicts with system |
| **RAM Allocation** | Limit to 8GB, prevent OOM kills |
| **Reproducible** | Same setup on any machine |
| **UDS Socket** | Faster than TCP for local communication |
| **Easy Cleanup** | `docker-compose down` removes everything |
| **Resource Control** | CPU cores, memory, network all configurable |

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Environment                             │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Flask Webapp     │  │  Ollama Container    │ │
│  │  (Port 5000)      │  │  (Port 5010)         │ │
│  │                   │  │                      │ │
│  │  - Admin Panel    │  │  - deepseek-r1:1.5b  │ │
│  │  - Task Tracker   │  │  - llama3:8b         │ │
│  │  - SSE Streaming  │  │  - keep_alive: 24h   │ │
│  │  - UDS Socket     │  │  - CPU: 4 cores      │ │
│  └──────────────────┘  │  - RAM: 8GB limit    │ │
│                         └──────────────────────┘ │
│                                                  │
│  Shared: /tmp (UDS socket)                       │
└─────────────────────────────────────────────────┘
```

### RAM Allocation

```yaml
# docker-compose.yml
services:
  ollama-cpu-isolated:
    image: ollama/ollama:latest
    cpus: 4                    # 4 CPU cores
    memory: 8g                 # 8GB RAM limit
    volumes:
      - ollama-data:/root/.ollama
      - /tmp:/tmp              # UDS socket sharing
```

**Management:**
- Increase RAM: Change `memory: 8g` to `memory: 16g`
- Add CPU: Change `cpus: 4` to `cpus: 8`
- Monitor usage: `docker stats ollama-cpu-isolated`

### Real-World Usage

**Scenario 1: Offline development**
```
No internet? No problem.
Ollama runs locally with deepseek-r1:1.5b
Agent responds even without cloud providers
Performance: ~8-12 tokens/sec on CPU
```

**Scenario 2: Cost optimization**
```
Cloud API costs adding up?
Route simple queries to local Ollama
Reserve cloud models for complex tasks
Saves $$$ on API bills
```

**Scenario 3: Privacy-sensitive work**
```
Client data can't leave the network?
All inference happens locally
No data sent to external APIs
GDPR/privacy compliant
```

### Setup

```bash
# Clone
git clone <repo-url>
cd docker_ollama

# Build and start
docker-compose up -d --build

# Verify
curl http://localhost:5000/health

# Check models
docker exec ollama-cpu-isolated ollama list

# Pull new model
docker exec ollama-cpu-isolated ollama pull llama3:8b
```

### Test Commands

```bash
# Health check
curl http://localhost:5000/api/status

# Non-streaming chat
curl -X POST http://localhost:5000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-r1:1.5b","messages":[{"role":"user","content":"Hello"}]}'

# Streaming chat
curl -X POST http://localhost:5000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-r1:1.5b","messages":[{"role":"user","content":"Write a poem"}],"stream":true}'

# List models
curl http://localhost:5000/api/tags
```

---

## How The Three Systems Connect

### Request Flow (Real Example)

```
User types: "Find the bug in my API"

    |
    v
[EXTENSION] Captures input, adds mission context
    |
    v
[SERVER] Receives POST /v1/chat/completions
    |-- Loads SSOT (project structure)
    |-- Loads syllabus (agent rules)
    |-- Loads memory (past context)
    |-- Routes to bug-hunter agent
    |
    v
[SERVER] Calls provider chain
    |-- Try OpenCode (primary) ──> FAIL (rate limit)
    |-- Try Groq (secondary) ──> SUCCESS
    |
    v
[OLLAMA] (if local model selected)
    |-- deepseek-r1:1.5b processes request
    |-- Returns tool_call: read_file("api.js")
    |
    v
[SERVER] Executes tool
    |-- Reads api.js
    |-- Returns content to agent
    |
    v
[SERVER] Agent analyzes, finds bug
    |-- Applies anti-dote verification
    |-- Cross-checks with evidence
    |
    v
[EXTENSION] Renders response
    |-- Shows thinking block
    |-- Shows bug analysis
    |-- Shows suggested fix
    |
    v
User sees answer in VS Code
```

### Communication Protocol

```
EXTENSION <──HTTP/WebSocket──> SERVER <──HTTP/UDS──> OLLAMA
    |                              |                     |
    |  POST /v1/chat/completions   |  POST /v1/chat/    |
    |  GET /v1/models              |  completions        |
    |  POST /mcp                   |  GET /api/tags      |
    |  WebSocket /ws               |  UDS socket         |
    |                              |                     |
    v                              v                     v
VS Code UI                  Agent Router           LLM Inference
                            Tool Executor          Model Loading
                            Session Manager        Keep-alive
```

---

## Quick Start (All Three Systems)

### Step 1: Start Ollama (Inference)

```bash
cd "/home/sahon/Zombie family/docker_ollama"
docker-compose up -d --build
curl http://localhost:5000/health
```

### Step 2: Start Server (Brain)

```bash
cd "/home/sahon/Zombie family/missionbarisal"
node start.js --start-all
curl http://localhost:9999/health
```

### Step 3: Install Extension (UI)

```bash
code --install-extension "/home/sahon/Zombie family/extension/zombiecoder-mission-barisal-1.8.0.vsix"
```

### Step 4: Verify Everything

```bash
# Server health
curl http://localhost:9999/health

# List agents
curl http://localhost:9999/v1/models

# List all models
curl http://localhost:9999/api/v1/models

# Test chat
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "code-guru",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "stream": false
  }'

# Check MCP tools
curl -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## Management & Monitoring

### Daily Operations

| Task | Command |
|------|---------|
| Check server health | `curl http://localhost:9999/health` |
| Check Ollama status | `docker exec ollama-cpu-isolated ollama list` |
| View server logs | `tail -f logs/server.log` |
| Restart server | `node start.js --start-all` |
| Restart Ollama | `docker-compose restart` |
| Check Docker stats | `docker stats ollama-cpu-isolated` |

### Resource Monitoring

```bash
# Server memory usage
ps aux | grep "node api.js"

# Docker resource usage
docker stats --no-stream

# Disk usage
du -sh "/home/sahon/Zombie family/"

# Port usage
lsof -i :9999  # Server
lsof -i :5000  # Ollama
```

### Scaling

| Component | How to Scale |
|-----------|--------------|
| **Server** | Add more RAM, use PM2 cluster mode |
| **Ollama** | Increase `cpus` and `memory` in docker-compose |
| **Extension** | No scaling needed (client-side) |
| **Models** | Pull larger models: `ollama pull llama3:70b` |

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Extension not connecting | Server not running | `node start.js --start-all` |
| "operation aborted" error | Client timeout | Increase `requestTimeout` in settings |
| Model not responding | Ollama not running | `docker-compose up -d` |
| Tools not working | MCP not connected | `curl http://localhost:9999/api/mcp-clients` |
| RAM full | Model too large | Use smaller model or increase Docker RAM |
| Slow response | CPU inference | Use cloud provider instead of local Ollama |
| Agent gives wrong answer | Hallucination | Check if SSOT/syllabus is loaded |
| Port already in use | Previous server running | `kill $(lsof -t -i:9999)` |

---

## File Structure

```
Zombie family/
├── README.md                          ← This file
├── extension/                         ← VS Code Extension
│   ├── src/                           ← TypeScript source (12 modules)
│   ├── out/                           ← Compiled JavaScript
│   ├── package.json                   ← Build configuration
│   ├── zombiecoder-mission-barisal-1.8.0.vsix  ← Installable package
│   └── README.md                      ← Extension documentation
├── docker_ollama/                     ← Local LLM Inference
│   ├── app.py                         ← Flask server (1322 lines)
│   ├── docker-compose.yml             ← Container orchestration
│   ├── Dockerfile                     ← Ollama CPU image
│   ├── Dockerfile.webapp              ← Python webapp image
│   ├── documentation.html             ← API integration guide
│   ├── test-report.html               ← Test results
│   └── README.md                      ← Ollama documentation
└── missionbarisal/                    ← Multi-Agent Server
    ├── api.js                         ← Main server (17000+ lines)
    ├── start.js                       ← Bootstrap & startup
    ├── PERSONAS.md                    ← Agent personas
    ├── Ethical.md                     ← Ethical guidelines
    ├── domain-config.js               ← Domain detection
    ├── external-mcp.js                ← External MCP integration
    ├── mcp-client.js                  ← MCP client
    ├── note-store.js                  ← Note persistence
    ├── skills.js                      ← Skill management
    ├── .zombiecoder/                  ← Agent memory system
    │   ├── SSOT.md                    ← Single Source of Truth
    │   └── agents/
    │       ├── syllabus.md            ← Agent behavioral rules
    │       └── sessions/              ← Session archives
    ├── external mcp/                  ← MCP tools
    │   ├── ocr-mcp.js                 ← OCR (Tesseract)
    │   ├── screen-recorder-mcp.js     ← Screen recording
    │   └── tts-mcp.js                 ← Text-to-speech
    ├── skills/                        ← 50+ skill files
    ├── doc/                           ← Documentation
    └── README.md                      ← Server documentation
```

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `9999` | No | Server port |
| `UDS_PORT` | `5100` | No | UDS socket port |
| `OPENCODE_API_KEY` | — | Yes | OpenCode API key |
| `GROQ_API_KEY` | — | No | Groq API key (fallback) |
| `GEMINI_API_KEY` | — | No | Gemini API key |
| `OLLAMA_BASE` | `http://localhost:5000/v1` | No | Ollama endpoint |
| `DEFAULT_MODEL` | `deepseek-r1:1.5b` | No | Default Ollama model |
| `KEEP_ALIVE` | `24h` | No | Model keep-alive time |

---

## Test Results

### Component Status

| Component | Status | Evidence |
|-----------|--------|----------|
| Extension | Installed | `code --list-extensions` shows zombiecoder |
| Server | Running | `/health` returns `healthy: true` |
| Ollama | Running | `/api/status` returns `connected` |
| MCP Tools | Available | 34 tools listed via `/mcp` |
| Agents | Active | 9 agents loaded |
| Models | Synced | 136 models across 5 providers |

### Verified Test Commands

```bash
# Extension installed
$ code --list-extensions | grep zombie
zombiecoder.zombiecoder-mission-barisal

# Server healthy
$ curl http://localhost:9999/health
{"healthy":true,"version":"3.2.1","agents":9,"models":136}

# MCP tools available
$ curl -X POST http://localhost:9999/mcp -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
Total tools: 34

# Agent responding
$ curl -X POST http://localhost:9999/v1/chat/completions -d '{"model":"code-guru","messages":[...]}'
Response received successfully
```

---

## Credits

**Author:** Sahon Srabon (ZombieCoder)
**Location:** Barisal, Bangladesh
**Version:** 3.2.1
**License:** MIT

---

```
Zombie Family — Three systems, one family.
Extension talks to Server, Server talks to Ollama.
User never leaves VS Code.

Zero Dependency · Local-First · Multi-Agent · Evidence-Based
```
