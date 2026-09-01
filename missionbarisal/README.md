<div align="center">

# Mission Barisal v3

### Zero-Dependency Multi-Agent AI System

**9 Specialized Bengali AI Agents | Real-time Web Search | 3-Phase Debate | MCP Tools | PHP Broker Frontend**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Deps](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)](#)
[![Agents](https://img.shields.io/badge/Agents-9-orange.svg)](#)

```
Barisal's playful chaos meets code discipline!
Shawon Bhai knows everything — misbehave and you'll be caught!
```

</div>

---

## What is Mission Barisal?

Mission Barisal is a **zero-dependency multi-agent AI system** built in pure Node.js. It runs **9 specialized AI agents** — each with a unique Bengali persona and expertise — that collaborate through a **3-phase debate pipeline** to provide comprehensive, evidence-based answers.

### Key Features

- **9 Specialized Agents** — Architecture, Debugging, Security, Performance, Documentation, QA, Team Heart, CX, E-Commerce
- **3-Phase Debate Pipeline** — Initial Response → Cross-Verify → Combined Output
- **Real-time Web Search** — Agents search the web for current data before answering
- **MCP Tools** — File I/O, web search, browser automation, memory system
- **Provider Fallback Chain** — OpenCode → Groq → Gemini → missionbarisal (automatic failover)
- **Zero Dependencies** — Pure Node.js, no frameworks, no npm bloat
- **PHP Broker Frontend** — Softaculous-style chat UI served by a zero-dep Node broker (`php-broker-server.js`)
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
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ code-guru│ │bug-hunter│ │ security │ │  perf    │  │    │
│  │  │ (মনু)    │ │ (জুয়েল) │ │ (বাবলু)  │ │ (রাশেদ) │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       │             │             │             │        │    │
│  │       ▼             ▼             ▼             ▼        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │doc-king  │ │qa-tyrant │ │team-heart│ │  CX      │  │    │
│  │  │ (হালিম)  │ │ (মজনু)   │ │ (জারা)   │ │(CX Spec) │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       │             │             │             │        │    │
│  │       ▼             ▼             ▼             ▼        │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │        ecommerce-operations-analyst           │    │    │
│  │  └───────────────────────────────────────────────┘    │    │
│  └───────┼───────────────────────────────────────────────┘    │
│          ▼                                                    │
│  PHASE 2: Cross-Verify → PHASE 3: Combined Output              │
└────────────────────────────────────────────────────────────────┘
```

---

## Agents (9)

| ID | Name | Role | Priority |
|----|------|------|----------|
| `code-guru` | Code Guru - Monu | architecture | 1 |
| `bug-hunter` | Bug Hunter - Jewel | debugging | 2 |
| `security-hero` | Security Hero - Bablu | general | 3 |
| `perf-wizard` | Performance Wizard - Rashed | general | 4 |
| `doc-king` | Documentation King - Halim | general | 5 |
| `qa-tyrant` | Quality Tyrant - Mojnu | general | 6 |
| `team-heart` | Team Heart - Jara | general | 7 |
| `customer-experience-specialist` | Customer Experience Specialist | customer-experience | 8 |
| `ecommerce-operations-analyst` | E-Commerce Operations Analyst | ecommerce-operations | 9 |

> **Note:** The last 3 agents load dynamically from `PERSONAS.md`.

---

## Project Layout

```
sarver/
├── api.js                  # Main server (zero-dep, ~16K lines)
├── start.js                # Starter (CONFIG ALL / START ALL)
├── domain-config.js        # Domain detection & config
├── external-mcp.js         # External MCP client
├── mcp-client.js           # Outbound MCP client
├── skills.js               # Skills loader
├── note-store.js           # Notes persistence
├── db-bridge.php           # PHP PDO bridge (MySQL/PG)
├── frontend/               # PHP chat UI (Softaculous-style)
│   ├── index.php           # Login page (admin/barisal2026, 24h session)
│   ├── allindex.live.php   # Main chat UI
│   └── public/             # Static assets (marked, highlight, etc.)
├── external tools/
│   ├── php-broker-server.js # দালালি সার্ভার (PHP-mirror broker, port 9998)
│   └── appsp-internal-connection.js
├── external mcp/           # MCP server implementations
├── data/                   # Runtime data (sessions, clients, models.db)
├── logs/                   # Server logs
├── doc/                    # Documentation
├── pending/                # Problem plans (5 problems + log analysis)
├── skills/                 # Agent skill definitions
└── test/                   # Test scripts, audits, screenshots
```

---

## Quick Start

### 1. Start everything (sarver + broker)
```bash
cd sarver
node start.js --start-all
# Sarver → port 8080, Broker → port 9998
```

### 2. Start PHP frontend
```bash
cd softaculous
php -S localhost:8081 -t frontend
```

### 3. Open the UI
```
http://localhost:8081/?path=test.proj&project_id=test123
# Login: admin / barisal2026 (24h session)
```

> **Note:** `project_id` + `path` in the URL are REQUIRED — the whole
> system builds parameters from `project_id`. See `pending/05-OS-DEFAULT-ROOT.md`.

---

## Environment (.env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 9999 | Engine port — single source of truth for api.js (and broker's SARVER_URL fallback) |
| `UDS_PORT` | 5100 | Unix Domain Socket port (MCP) |
| `brokerUrl` | http://localhost:PORT | Upstream sarver URL (broker + PHP proxy to) |
| `BROKER_PORT` | 9998 | Broker listen port |
| `BROKER_TIMEOUT_MS` | 120000 | Broker timeout |
| `FRONTEND_URL` | http://localhost:8081 | PHP frontend URL |
| `FRONTEND_PORT` | 8081 | PHP frontend port |
| `FRONTEND_DIR` | ../frontend | Frontend folder path |
| `ALLOWED_DIRS` | ./logs,./data,. | MCP allowed directories |
| `MAX_TOOL_ROUNDS` | 20 | Agent tool rounds |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (domain-aware) |
| GET | `/identity` | System identity |
| GET | `/v1/models` | List agents (masked) |
| GET | `/api/v1/models` | List ALL provider models (unmasked) |
| POST | `/v1/chat/completions` | Agent or mission (OpenAI format) |
| POST | `/api/mission` | Full debate mission |
| POST | `/api/v1/anti-dote` | Anti-Dote Type Safety (6-step chain) |
| POST | `/api/set-working-dir` | Set working dir |
| POST | `/mcp` | MCP JSON-RPC 2.0 |
| GET | `/mcp` (SSE) | MCP SSE streaming |

### Broker (port 9998) — PHP wire format
```
GET/POST {BROKER_URL}/index.live.php?act=ai&path={PROJECT}&project_id={PID}&ai_php_api={ACTION}&csrf_token={TOKEN}
```
Actions: `providers`, `status`, `project_info`, `projects_list`, `projects_create`, `projects_delete`, `settings_load`, `settings_save`, `favorite_model`, `file_tree`, `read_file`, `resolve_file`, `shell`, `set_mode`, `clear`, `new_session`, `start`, `switch_conversation`, `delete_conversation`, `conversations`, `conversation`

---

## Documentation

| Doc | Purpose |
|-----|---------|
| `doc/SERVER-LOGIC.md` | Server logic reference (SSOT for server) |
| `doc/SYSTEM-DOCUMENTATION.md` | System overview |
| `doc/LOG-ANALYSIS.md` | Log analysis — problems found in logs |
| `doc/architecture-modular-analysis.md` | Architecture analysis |
| `doc/ui-design-analysis.md` | UI design analysis |
| `doc/sahon.md` | Owner notes |
| `pending/README.md` | 5 problem plans index |

---

## Known Problems (pending/)

| # | Problem | Plan |
|---|---------|------|
| 1 | Admin Agent নেই | `pending/01-ADMIN-AGENT.md` |
| 2 | Persona inconsistency (6 vs 9 agents) | `pending/02-PERSONA.md` |
| 3 | Frontend session তৈরি হচ্ছে না | `pending/03-FRONTEND-SESSION.md` |
| 4 | Model dropdown পরিবর্তন হচ্ছে না | `pending/04-MODEL-DROPDOWN.md` |
| 5 | OS default root — project frontend-এ তৈরি হয় | `pending/05-OS-DEFAULT-ROOT.md` |

---

## License

MIT — ZombieCoder Mission Barisal v3 by Sahon Srabon (Barisal, Bangladesh)
