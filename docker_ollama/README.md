# 🐳 Docker Ollama — Local AI Inference Server

> **"ঘুম থেকে উঠে প্রথম কাজ"** — এটা আমাদের সিস্টেমের প্রথম ধাপ।
> এখান থেকেই AI model inference শুরু হয়।

## 📋 সারসংক্ষেপ

| বিষয় | তথ্য |
|-------|------|
| **নাম** | docker ollama |
| **ধরন** | Python Flask + Docker |
| **কাজ** | Ollama LLM server চালানো (CPU-only) |
| **পোর্ট** | `5000` (HTTP) + `/tmp/ollama.sock` (UDS) |
| **মডেল** | `deepseek-r1:1.5b` (ডিফল্ট) |
| **মালিক** | Sahon Srabon (ZombieCoder) |

## 🔗 চেইন — কেন এটা দরকার?

```
User Request → Extension → Mission Barisal (api.js) → Docker Ollama → Model Response
                                                ↑
                                    এখান থেকেই inference হয়
```

**bazar_logic অনুযায়ী:**
- যেমন বাজারে যাওয়ার আগে পেস্ট-সাবান লাগে
- তেমনি AI response পাওয়ার আগে Ollama server লাগে
- এটা ছাড়া পুরো চেইন ভেঙে পড়ে

## 📁 ফোল্ডার স্ট্রাকচার

```
docker_ollama/
├── app.py                 ← মূল Flask application (1322 লাইন)
├── docker-compose.yml     ← Docker container orchestration
├── Dockerfile             ← Ollama CPU-only image
├── Dockerfile.webapp      ← Python Flask webapp image
├── documentation.html     ← API integration guide
├── test-report.html       ← API test results
└── logs/                  ← রান্টাইম logs
```

## 🚀 কিভাবে চালাতে হবে

```bash
# Docker দিয়ে চালু করো
cd "/home/sahon/docker ollama"
docker-compose up -d --build

# চেক করো চালু হয়েছে কিনা
curl http://localhost:5000/health

# Admin Panel দেখো
# Browser-ে যাও: http://localhost:5000/admin
```

## 🔌 API Endpoints

### Health Check
```bash
curl http://localhost:5000/api/status
```
**Response:**
```json
{
  "status": "ok",
  "ollama_status": "connected",
  "model": "deepseek-r1:1.5b",
  "model_loaded": true
}
```

### Generate (Non-streaming)
```bash
curl -X POST http://localhost:5000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-r1:1.5b", "prompt": "Hello!"}'
```

### Generate (Streaming)
```bash
curl -X POST http://localhost:5000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-r1:1.5b", "prompt": "Write a poem", "stream": true}'
```

### OpenAI Compatible (Chat)
```bash
curl -X POST http://localhost:5000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-r1:1.5b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### List Models
```bash
curl http://localhost:5000/api/tags
```

### Pull Model
```bash
curl -X POST http://localhost:5000/api/pull \
  -H "Content-Type: application/json" \
  -d '{"name": "llama3:8b", "stream": true}'
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Internet (o.zombiecoder.my.id)                │
│       │                                        │
│  Cloudflare Tunnel                             │
│       │                                        │
│  Flask Webapp (:5000 HTTP + UDS)               │
│       │                                        │
│  Docker Bridge Network (ollama-internal)        │
│       │                                        │
│  Ollama Container (127.0.0.1:5010)             │
│       │                                        │
│  deepseek-r1:1.5b (1.1GB Q4_K_M)              │
└─────────────────────────────────────────────────┘
```

## ⚙️ Docker Configuration

```yaml
# docker-compose.yml highlights
services:
  ollama-cpu-isolated:
    image: ollama/ollama:latest
    cpus: 4                    # 4 CPU cores
    memory: 8g                 # 8GB RAM
    volumes:
      - ollama-data:/root/.ollama
      - /tmp:/tmp              # UDS socket sharing
    
  webapp:
    build: .
    ports:
      - "5000:5000"            # HTTP API
    environment:
      - OLLAMA_HOST=http://ollama:11434
      - DEFAULT_MODEL=deepseek-r1:1.5b
      - KEEP_ALIVE=24h
```

## 🎯 Real-Time UI Features

Admin Panel-এ আছে:
- **TaskTracker** — Live task progress tracking
- **VerificationLayer** — 4-step verification chain
- **SSE Streaming** — Server-Sent Events for real-time updates
- **Progress Panel** — Floating panel with live indicators

## 🔧 Troubleshooting

### Ollama চালু নেই
```bash
docker-compose logs ollama-cpu-isolated
docker-compose restart ollama-cpu-isolated
```

### Model load হচ্ছে না
```bash
# Model manually pull করো
docker exec ollama-cpu-isolated ollama pull deepseek-r1:1.5b

# Check model status
docker exec ollama-cpu-isolated ollama list
```

### Port 5000 busy
```bash
lsof -i :5000
kill -9 <PID>
```

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Model Size** | 1.1GB (Q4_K_M quantized) |
| **CPU Cores** | 4 |
| **RAM Limit** | 8GB |
| **Inference Speed** | ~8-12 tokens/sec |
| **Keep Alive** | 24 hours |
| **Max Parallel** | 2 requests |

## 🔗 সম্পর্কিত ফোল্ডার

- **`../extension/`** — যে VS Code extension এই serverকে call করে
- **`../missionbarisal/`** — মূল সার্ভার যেটা এখানে proxy করে

---

*Last Updated: 2026-09-01*
*Status: ✅ Production Running*
