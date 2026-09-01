# 🔌 Mission Barisal Extension — VS Code AI Integration

> **"ব্রাশ করতে গেলাম"** — এটা আমাদের ব্যবহারকারীর সাথে সরাসরি সম্পর্ক।
> এখান থেকেই user experience তৈরি হয়।

## 📋 সারসংক্ষেপ

| বিষয় | তথ্য |
|-------|------|
| **নাম** | ZombieCoder Mission Barisal |
| **ধরন** | VS Code Extension (TypeScript) |
| **কাজ** | IDE-তে AI agents যুক্ত করা |
| **Protocol** | LSP + WebSocket + MCP |
| **Version** | 1.7.1 |
| **মালিক** | Sahon Srabon (ZombieCoder) |

## 🔗 চেইন — কেন এটা দরকার?

```
User types in VS Code
    ↓
Extension captures input
    ↓
Sends to Mission Barisal (api.js)
    ↓
api.js routes to correct provider/model
    ↓
Response streams back to VS Code
    ↓
User sees AI response in editor
```

**bazar_logic অনুযায়ী:**
- যেমন বাজারে যাওয়ার আগে পকেটে ৫০০ টাকা রাখো
- তেমনি এই extension ছাড়া user AI-র সাথে সরাসরি কথা বলতে পারবে না
- এটাই **bridge** — user আর AI-র মাঝে

## 📁 ফোল্ডার স্ট্রাকচার

```
extension/
├── src/
│   ├── extension.ts          ← Entry point
│   ├── api/                  ← API client (connects to api.js)
│   ├── chat/                 ← Chat panel UI
│   ├── commands/             ← VS Code commands
│   ├── completions/          ← Code completions
│   ├── config/               ← Settings management
│   ├── discovery/            ← Server discovery
│   ├── mission/              ← Mission Barisal integration
│   ├── models/               ← Model management
│   ├── provider/             ← Provider abstraction
│   └── status/               ← Status bar items
├── package.json              ← Extension manifest
├── out/                      ← Compiled JavaScript
├── doc/                      ← Documentation
└── assets/                   ← Images, icons
```

## 🚀 কিভাবে সেটআপ করবে

### ডেভেলপমেন্ট
```bash
cd /home/sahon/missionbarishal/extension

# Dependencies install করো
npm install

# Compile করো
npm run compile

# Extension press F5 দিয়ে চালু করো (Extension Host এ)
```

### Production Install
```bash
# VSIX package তৈরি করো
vsce package

# Install করো
code --install-extension zombiecoder-mission-barisal-1.7.1.vsix
```

## ⚙️ Settings

```json
{
  "missionbarisal.serverUrl": "http://localhost:9999",
  "missionbarisal.defaultAgent": "code-guru",
  "missionbarisal.streaming": true,
  "missionbarisal.autoConnect": true
}
```

## 🔌 How It Works

### 1. Connection Flow
```
Extension Start
    ↓
Discovery: Find server at localhost:9999
    ↓
Connect via WebSocket
    ↓
Register as MCP client
    ↓
Load SSOT/Syllabus from server
    ↓
Ready for chat
```

### 2. Chat Flow
```
User types message
    ↓
Extension sends to api.js:
POST /v1/chat/completions
{
  "model": "code-guru",
  "messages": [...],
  "stream": true
}
    ↓
Server routes to correct provider
    ↓
Response streams back as SSE chunks
    ↓
Extension renders in chat panel
```

### 3. Tool Execution Flow
```
AI wants to use a tool
    ↓
Server sends tool_call in response
    ↓
Extension receives tool_call
    ↓
Extension executes tool (if local)
    ↓
Or server executes tool (if MCP)
    ↓
Result sent back to AI
```

## 🎨 UI Components

### Chat Panel
- Real-time streaming responses
- Markdown rendering
- Code highlighting
- Tool call visualization
- Reasoning/thinking display

### Status Bar
- Server connection status
- Current agent name
- Current model name
- Token usage

### Sidebar
- Agent list
- Session history
- Settings

## 🔧 Features

### Multi-Agent Support
```
code-guru     → Architecture & design
bug-hunter    → Debugging & error analysis
security-hero → Security audit
perf-wizard   → Performance optimization
doc-king      → Documentation
qa-tyrant     → Code quality
```

### Real-Time Streaming
- Chunk-by-chunk response
- No waiting for full response
- Live typing effect

### MCP Tool Integration
- 34+ tools available
- File operations (read/write/list)
- Terminal commands
- Web search
- OCR, Screen recording, TTS

### SSOT & Syllabus
- Single Source of Truth for project context
- Agent behavioral rules
- Auto-loaded on connection

## 🐛 Troubleshooting

### "Chat request failed: operation aborted"
```bash
# Server check করো
curl http://localhost:9999/health

# Server restart করো
cd /home/sahon/zombie
node start.js --start-all
```

### Extension connect করছে না
```json
// VS Code settings.json
{
  "missionbarisal.serverUrl": "http://localhost:9999"
}
```

### Model list দেখাচ্ছে না
```bash
# Server-এ model list check করো
curl http://localhost:9999/api/v1/models
```

## 📊 Protocol Details

### LSP (Language Server Protocol)
- Code completions
- Diagnostics
- Hover information

### WebSocket
- Real-time chat
- Streaming responses
- Session management

### MCP (Model Context Protocol)
- Tool execution
- Resource access
- Agent communication

## 🔗 সম্পর্কিত ফোল্ডার

- **`../docker_ollama/`** — Ollama server যেটা inference করে
- **`../missionbarisal/`** — মূল সার্ভার যেটার সাথে connect করে

---

*Last Updated: 2026-09-01*
*Status: ✅ Production Running*
