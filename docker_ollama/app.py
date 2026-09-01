from flask import Flask, request, jsonify, Response, stream_with_context
import requests
import os
import json
import subprocess
import time
import datetime
import io
import uuid
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable
import threading
import queue

app = Flask(__name__)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b")
KEEP_ALIVE = os.environ.get("KEEP_ALIVE", "24h")


# ============================================================
# REAL-TIME TASK TRACKING SYSTEM
# ============================================================
class TaskStatus(Enum):
    """Task status states with verification layers"""
    PENDING = "pending"
    STARTING = "starting"
    VERIFYING = "verifying"        # Verification layer active
    RUNNING = "running"
    STREAMING = "streaming"        # Real-time streaming
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"          # Error recovery state


@dataclass
class TaskProgress:
    """Individual task progress tracker"""
    task_id: str
    task_type: str                 # "generate", "pull", "syllabus", "ssot", etc.
    status: TaskStatus = TaskStatus.PENDING
    message: str = ""
    progress: float = 0.0          # 0.0 to 1.0
    steps: List[Dict] = field(default_factory=list)
    current_step: int = 0
    total_steps: int = 1
    result: Optional[Dict] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    verification_data: Dict = field(default_factory=dict)  # Verification layer data

    def to_dict(self):
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status.value,
            "message": self.message,
            "progress": round(self.progress, 2),
            "steps": self.steps,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "result": self.result,
            "error": self.error,
            "retry_count": self.retry_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "verification_data": self.verification_data
        }

    def update(self, status=None, message=None, progress=None, step_name=None):
        """Update task progress with timestamp"""
        if status:
            self.status = status
        if message:
            self.message = message
        if progress is not None:
            self.progress = min(max(progress, 0.0), 1.0)
        if step_name:
            self.steps.append({"step": step_name, "time": time.time()})
            self.current_step += 1
        self.updated_at = time.time()

    def verify(self, check_name: str, passed: bool, details: str = ""):
        """Add verification checkpoint"""
        self.verification_data[check_name] = {
            "passed": passed,
            "details": details,
            "time": time.time()
        }
        return passed


class TaskManager:
    """Central task manager for real-time UI tracking with verification"""

    def __init__(self):
        self._tasks: Dict[str, TaskProgress] = {}
        self._subscribers: Dict[str, queue.Queue] = {}  # SSE subscribers
        self._lock = threading.Lock()

    def create_task(self, task_type: str, total_steps: int = 3) -> TaskProgress:
        """Create a new trackable task"""
        task_id = str(uuid.uuid4())[:8]
        task = TaskProgress(
            task_id=task_id,
            task_type=task_type,
            total_steps=total_steps
        )
        with self._lock:
            self._tasks[task_id] = task
        self._notify_subscribers(task)
        return task

    def get_task(self, task_id: str) -> Optional[TaskProgress]:
        return self._tasks.get(task_id)

    def update_task(self, task_id: str, **kwargs) -> Optional[TaskProgress]:
        """Update task and notify all subscribers"""
        task = self._tasks.get(task_id)
        if task:
            task.update(**kwargs)
            self._notify_subscribers(task)
        return task

    def get_all_tasks(self) -> List[Dict]:
        with self._lock:
            return [t.to_dict() for t in sorted(
                self._tasks.values(),
                key=lambda x: x.updated_at,
                reverse=True
            )[:50]]  # Last 50 tasks

    def subscribe(self) -> queue.Queue:
        """Subscribe to real-time task updates (for SSE)"""
        q = queue.Queue()
        subscriber_id = str(uuid.uuid4())[:8]
        self._subscribers[subscriber_id] = q
        q.put({"_subscriber_id": subscriber_id})
        return q, subscriber_id

    def unsubscribe(self, subscriber_id: str):
        self._subscribers.pop(subscriber_id, None)

    def _notify_subscribers(self, task: TaskProgress):
        """Push update to all SSE subscribers"""
        data = task.to_dict()
        dead_subs = []
        for sub_id, q in self._subscribers.items():
            try:
                q.put_nowait(data)
            except queue.Full:
                dead_subs.append(sub_id)
        for sub_id in dead_subs:
            self._subscribers.pop(sub_id, None)


# Global task manager instance
task_manager = TaskManager()


# ============================================================
# VERIFICATION LAYER - Error Handling with Retry
# ============================================================
class VerificationLayer:
    """Multi-step verification with retry logic"""

    @staticmethod
    def verify_ollama_connection(timeout: float = 5.0) -> Dict:
        """Step 1: Verify Ollama is reachable"""
        result = {"passed": False, "details": "", "latency_ms": 0}
        try:
            start = time.time()
            r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=timeout)
            latency = (time.time() - start) * 1000
            result["passed"] = r.status_code == 200
            result["details"] = f"Connected in {latency:.0f}ms"
            result["latency_ms"] = latency
        except requests.ConnectionError:
            result["details"] = "Ollama unreachable - connection refused"
        except requests.Timeout:
            result["details"] = f"Ollama timeout after {timeout}s"
        except Exception as e:
            result["details"] = f"Error: {str(e)}"
        return result

    @staticmethod
    def verify_model_loaded(model: str = None) -> Dict:
        """Step 2: Verify model is loaded in memory"""
        model = model or DEFAULT_MODEL
        result = {"passed": False, "details": "", "model": model}
        try:
            r = requests.get(f"{OLLAMA_HOST}/api/ps", timeout=5)
            models = r.json().get("models", [])
            loaded = [m["name"] for m in models]
            result["passed"] = model in loaded
            if result["passed"]:
                result["details"] = f"Model '{model}' loaded in memory"
            else:
                result["details"] = f"Model '{model}' not loaded. Available: {', '.join(loaded) or 'none'}"
        except Exception as e:
            result["details"] = f"Check failed: {str(e)}"
        return result

    @staticmethod
    def verify_request_format(data: Dict, required_fields: List[str]) -> Dict:
        """Step 3: Verify request data format"""
        result = {"passed": False, "details": "", "missing": []}
        missing = [f for f in required_fields if f not in data]
        result["missing"] = missing
        result["passed"] = len(missing) == 0
        if missing:
            result["details"] = f"Missing fields: {', '.join(missing)}"
        else:
            result["details"] = "All required fields present"
        return result

    @staticmethod
    def verify_response(response_data: Dict, expected_keys: List[str] = None) -> Dict:
        """Step 4: Verify response integrity"""
        result = {"passed": False, "details": ""}
        if not response_data:
            result["details"] = "Empty response"
            return result
        if "error" in response_data:
            result["details"] = f"Error in response: {response_data['error']}"
            return result
        if expected_keys:
            missing = [k for k in expected_keys if k not in response_data]
            if missing:
                result["details"] = f"Response missing keys: {', '.join(missing)}"
                return result
        result["passed"] = True
        result["details"] = "Response verified OK"
        return result

    @staticmethod
    def full_verification_chain(task: TaskProgress, data: Dict = None,
                                 model: str = None) -> bool:
        """Run complete verification chain, update task progress"""
        # Step 1: Connection check
        task.update(status=TaskStatus.VERIFYING, message="Verifying Ollama connection...",
                    progress=0.1, step_name="connection_check")
        conn = VerificationLayer.verify_ollama_connection()
        task.verify("connection", conn["passed"], conn["details"])
        if not conn["passed"]:
            task.update(status=TaskStatus.FAILED,
                        message=f"Connection failed: {conn['details']}", progress=0.1)
            return False

        # Step 2: Model check
        task.update(message="Verifying model is loaded...", progress=0.3,
                    step_name="model_check")
        model_check = VerificationLayer.verify_model_loaded(model)
        task.verify("model_loaded", model_check["passed"], model_check["details"])
        if not model_check["passed"]:
            task.update(status=TaskStatus.FAILED,
                        message=f"Model check failed: {model_check['details']}", progress=0.3)
            return False

        # Step 3: Request format (if data provided)
        if data:
            task.update(message="Verifying request format...", progress=0.4,
                        step_name="format_check")
            required = ["model"] if "model" in data else []
            fmt = VerificationLayer.verify_request_format(data, required)
            task.verify("request_format", fmt["passed"], fmt["details"])

        task.update(message="All checks passed", progress=0.5, step_name="verification_complete")
        return True


# ============================================================
# ENHANCED STREAMING WITH REAL-TIME UI UPDATES
# ============================================================
class StreamingTracker:
    """Track streaming responses with real-time progress"""

    @staticmethod
    def track_generate(task: TaskProgress, data: Dict, use_uds: bool = False):
        """Stream generate with live progress tracking"""
        def generate_stream():
            try:
                task.update(status=TaskStatus.STREAMING,
                            message="Generating response...", progress=0.5,
                            step_name="generation_started")

                if use_uds:
                    url = f"http+unix://{os.environ.get('OLLAMA_SOCK', '/tmp/ollama.sock').replace('/', '%2F')}/api/generate"
                else:
                    url = f"{OLLAMA_HOST}/api/generate"

                r = requests.post(url, json=data, stream=True, timeout=300)
                full_response = ""
                chunk_count = 0

                for line in r.iter_lines():
                    if line:
                        chunk_data = line.decode("utf-8")
                        yield chunk_data + "\n"
                        chunk_count += 1

                        try:
                            parsed = json.loads(chunk_data)
                            if "response" in parsed:
                                full_response += parsed["response"]
                            # Update progress based on chunks
                            task.update(
                                progress=min(0.5 + (chunk_count * 0.01), 0.95),
                                message=f"Streaming... ({chunk_count} chunks, {len(full_response)} chars)"
                            )
                        except json.JSONDecodeError:
                            pass

                # Final verification
                task.verify("stream_complete", True, f"Received {chunk_count} chunks")
                task.update(status=TaskStatus.COMPLETED,
                            message=f"Complete - {len(full_response)} characters",
                            progress=1.0, step_name="generation_complete")

            except Exception as e:
                task.verify("stream_error", False, str(e))
                task.update(status=TaskStatus.FAILED,
                            message=f"Stream error: {str(e)}", progress=1.0)

        return Response(stream_with_context(generate_stream()),
                       content_type="application/json")

    @staticmethod
    def track_pull(task: TaskProgress, model_name: str):
        """Track model pull with progress"""
        def pull_stream():
            try:
                task.update(status=TaskStatus.RUNNING,
                            message=f"Pulling model: {model_name}", progress=0.1,
                            step_name="pull_started")

                r = requests.post(f"{OLLAMA_HOST}/api/pull",
                                  json={"name": model_name, "stream": True},
                                  stream=True, timeout=600)

                for line in r.iter_lines():
                    if line:
                        chunk_data = line.decode("utf-8")
                        yield chunk_data + "\n"

                        try:
                            parsed = json.loads(chunk_data)
                            if "status" in parsed:
                                status = parsed["status"]
                                if "completed" in parsed:
                                    pct = parsed["completed"] / max(parsed.get("total", 1), 1)
                                    task.update(
                                        progress=min(0.1 + pct * 0.8, 0.9),
                                        message=f"{status}: {pct*100:.1f}%"
                                    )
                                else:
                                    task.update(message=status)
                        except json.JSONDecodeError:
                            pass

                task.update(status=TaskStatus.COMPLETED,
                            message=f"Model '{model_name}' pulled successfully",
                            progress=1.0, step_name="pull_complete")

            except Exception as e:
                task.update(status=TaskStatus.FAILED,
                            message=f"Pull error: {str(e)}", progress=1.0)

        return Response(stream_with_context(pull_stream()),
                       content_type="application/json")

# Background thread to keep model loaded
def keep_alive_heartbeat():
    while True:
        try:
            requests.post(f"{OLLAMA_HOST}/api/generate",
                json={"model": DEFAULT_MODEL, "prompt": "", "keep_alive": KEEP_ALIVE},
                timeout=30)
        except:
            pass
        time.sleep(300)  # every 5 minutes

threading.Thread(target=keep_alive_heartbeat, daemon=True).start()

ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollama Admin Panel</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',sans-serif;background:#0f0f1a;color:#e0e0e0}
        .sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:#1a1a2e;border-right:1px solid #2a2a4a;padding:20px 0;z-index:100}
        .sidebar h2{color:#00d4ff;padding:0 20px 20px;font-size:16px;border-bottom:1px solid #2a2a4a}
        .sidebar a{display:block;padding:12px 20px;color:#888;text-decoration:none;font-size:14px;transition:all .2s}
        .sidebar a:hover,.sidebar a.active{color:#00d4ff;background:#0d0d1a;border-left:3px solid #00d4ff}
        .main{margin-left:220px;padding:30px}
        .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}
        .header h1{font-size:24px;color:#fff}
        .status-badge{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:bold}
        .status-online{background:#0a3d0a;color:#4ade80;border:1px solid #4ade80}
        .status-offline{background:#3d0a0a;color:#f87171;border:1px solid #f87171}
        .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-bottom:30px}
        .card{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:20px}
        .card h3{color:#888;font-size:12px;text-transform:uppercase;margin-bottom:8px}
        .card .value{font-size:28px;font-weight:bold;color:#00d4ff}
        .card .sub{font-size:12px;color:#666;margin-top:4px}
        .panel{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:20px;margin-bottom:20px}
        .panel h3{color:#fff;margin-bottom:15px;font-size:16px}
        table{width:100%;border-collapse:collapse}
        th,td{padding:12px;text-align:left;border-bottom:1px solid #2a2a4a;font-size:14px}
        th{color:#888;font-size:12px;text-transform:uppercase}
        .btn{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s}
        .btn-primary{background:#00d4ff;color:#000}.btn-primary:hover{background:#00b8d9}
        .btn-danger{background:#dc2626;color:#fff}.btn-danger:hover{background:#b91c1c}
        .btn-success{background:#16a34a;color:#fff}.btn-success:hover{background:#15803d}
        .btn-warning{background:#ca8a04;color:#fff}.btn-warning:hover{background:#a16207}
        .btn-sm{padding:5px 10px;font-size:12px}
        .log-box{background:#0a0a15;border:1px solid #2a2a4a;border-radius:8px;padding:15px;font-family:'Courier New',monospace;font-size:12px;max-height:400px;overflow-y:auto;line-height:1.8}
        .log-line{color:#888}.log-line.error{color:#f87171}.log-line.warn{color:#fbbf24}.log-line.info{color:#4ade80}
        .form-group{margin-bottom:15px}
        .form-group label{display:block;color:#888;font-size:12px;margin-bottom:5px}
        .form-group input,.form-group select,.form-group textarea{width:100%;padding:10px;background:#0a0a15;border:1px solid #2a2a4a;border-radius:6px;color:#fff;font-size:14px;font-family:inherit}
        .form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:#00d4ff}
        .model-card{display:flex;justify-content:space-between;align-items:center;padding:15px;background:#0a0a15;border:1px solid #2a2a4a;border-radius:8px;margin-bottom:10px}
        .model-info h4{color:#fff;margin-bottom:4px}.model-info span{color:#666;font-size:12px}
        .refresh-btn{background:none;border:1px solid #2a2a4a;color:#888;padding:8px 12px;border-radius:6px;cursor:pointer}
        .refresh-btn:hover{border-color:#00d4ff;color:#00d4ff}
        .section{display:none}.section.active{display:block}
        .loading{text-align:center;padding:40px;color:#666}
        .test-result{margin-top:10px;padding:15px;background:#0a0a15;border:1px solid #2a2a4a;border-radius:8px;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;max-height:300px;overflow-y:auto}
        .test-result.success{border-color:#4ade80}.test-result.error{border-color:#f87171}
        .test-row{display:flex;gap:10px;align-items:center;margin-bottom:10px;padding:10px;background:#0a0a15;border-radius:8px}
        .test-row label{min-width:140px;color:#888;font-size:13px}
        .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold}
        .badge-ok{background:#0a3d0a;color:#4ade80}.badge-err{background:#3d0a0a;color:#f87171}.badge-wait{background:#3d3d0a;color:#fbbf24}
        .chat-msg{margin:8px 0;max-width:80%}
        .chat-msg.user{text-align:right;margin-left:auto}
        .chat-msg .bubble{display:inline-block;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6}
        .chat-msg.user .bubble{background:#0066cc;border-bottom-right-radius:4px}
        .chat-msg.bot .bubble{background:#1a1a2e;border:1px solid #2a2a4a;border-bottom-left-radius:4px;white-space:pre-wrap}
        /* ===== REAL-TIME PROGRESS SYSTEM ===== */
        .progress-panel{position:fixed;bottom:20px;right:20px;width:380px;max-height:500px;background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:999;overflow:hidden;display:none}
        .progress-panel.visible{display:block;animation:slideUp 0.3s ease-out}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .progress-header{padding:12px 16px;background:#0d0d1a;border-bottom:1px solid #2a2a4a;display:flex;justify-content:space-between;align-items:center}
        .progress-header h4{color:#00d4ff;font-size:13px;margin:0}
        .progress-close{background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:0 4px}
        .progress-close:hover{color:#fff}
        .progress-body{padding:12px 16px;max-height:400px;overflow-y:auto}
        .task-item{padding:10px;margin-bottom:8px;background:#0a0a15;border-radius:8px;border-left:3px solid #2a2a4a}
        .task-item.running{border-left-color:#00d4ff}
        .task-item.verifying{border-left-color:#fbbf24}
        .task-item.completed{border-left-color:#4ade80}
        .task-item.failed{border-left-color:#f87171}
        .task-item.streaming{border-left-color:#a78bfa;animation:pulse 1.5s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
        .task-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
        .task-type{color:#888;font-size:11px;text-transform:uppercase}
        .task-status{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:bold}
        .task-status.pending{background:#3d3d0a;color:#fbbf24}
        .task-status.starting{background:#3d3d0a;color:#fbbf24}
        .task-status.verifying{background:#3d3d0a;color:#fbbf24}
        .task-status.running{background:#0a3d0a;color:#4ade80}
        .task-status.streaming{background:#2d1f5e;color:#a78bfa}
        .task-status.completed{background:#0a3d0a;color:#4ade80}
        .task-status.failed{background:#3d0a0a;color:#f87171}
        .task-status.retrying{background:#3d3d0a;color:#fbbf24}
        .task-message{color:#ccc;font-size:12px;margin-bottom:6px;line-height:1.4}
        .progress-bar-container{background:#2a2a4a;border-radius:4px;height:6px;overflow:hidden}
        .progress-bar{height:100%;background:linear-gradient(90deg,#00d4ff,#00ff88);border-radius:4px;transition:width 0.3s ease}
        .progress-bar.error{background:linear-gradient(90deg,#f87171,#dc2626)}
        .progress-bar.verify{background:linear-gradient(90deg,#fbbf24,#f59e0b)}
        .progress-bar.stream{background:linear-gradient(90deg,#a78bfa,#7c3aed)}
        .task-steps{margin-top:6px;font-size:11px;color:#666}
        .task-step{display:inline-block;margin-right:8px}
        .task-step.done{color:#4ade80}
        .task-step.active{color:#00d4ff;font-weight:bold}
        .task-verification{margin-top:6px;padding:6px 8px;background:#0a0a15;border-radius:4px;font-size:11px}
        .task-verify-item{display:flex;align-items:center;gap:6px;margin-bottom:3px}
        .task-verify-icon{width:12px;height:12px;border-radius:50%;display:inline-block}
        .task-verify-icon.pass{background:#4ade80}
        .task-verify-icon.fail{background:#f87171}
        .sse-status{position:fixed;top:10px;right:10px;z-index:1000;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:bold}
        .sse-status.connected{background:#0a3d0a;color:#4ade80;border:1px solid #4ade80}
        .sse-status.disconnected{background:#3d0a0a;color:#f87171;border:1px solid #f87171}
        .task-toggle{background:#1a1a2e;border:1px solid #2a2a4a;color:#00d4ff;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:12px;position:fixed;bottom:20px;right:20px;z-index:998}
        .task-toggle:hover{border-color:#00d4ff}
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>Ollama Admin</h2>
        <a href="#" onclick="showSection('dashboard')" class="active" id="nav-dashboard">Dashboard</a>
        <a href="#" onclick="showSection('models')" id="nav-models">Models</a>
        <a href="#" onclick="showSection('settings')" id="nav-settings">Settings</a>
        <a href="#" onclick="showSection('logs')" id="nav-logs">Logs</a>
        <a href="#" onclick="showSection('testing')" id="nav-testing">Testing</a>
        <a href="#" onclick="showSection('chat')" id="nav-chat">Chat</a>
    </div>
    <div class="main">
        <!-- Dashboard -->
        <div id="dashboard" class="section active">
            <div class="header"><h1>Dashboard</h1><span class="status-badge status-online" id="serverStatus">Connecting...</span></div>
            <div class="cards">
                <div class="card"><h3>Models Loaded</h3><div class="value" id="modelsCount">-</div><div class="sub">in memory</div></div>
                <div class="card"><h3>Total Models</h3><div class="value" id="totalModels">-</div><div class="sub">available</div></div>
                <div class="card"><h3>CPU Usage</h3><div class="value" id="cpuUsage">-</div><div class="sub" id="cpuInfo">loading...</div></div>
                <div class="card"><h3>Memory</h3><div class="value" id="memUsage">-</div><div class="sub" id="memInfo">loading...</div></div>
            </div>
            <div class="panel"><h3>Running Models</h3><div id="runningModels"><div class="loading">Loading...</div></div></div>
        </div>

        <!-- Models -->
        <div id="models" class="section">
            <div class="header"><h1>Models</h1><button class="refresh-btn" onclick="loadModels()">Refresh</button></div>
            <div class="panel"><h3>Available Models</h3><div id="modelsList"><div class="loading">Loading...</div></div></div>
            <div class="panel"><h3>Pull New Model</h3>
                <div class="form-group"><label>Model Name (e.g. llama3:8b, mistral, codellama:7b)</label><input type="text" id="pullModelName" placeholder="Enter model name..."></div>
                <button class="btn btn-primary" onclick="pullModel()">Download Model</button>
                <div id="pullStatus" style="margin-top:10px;font-size:13px;"></div>
            </div>
        </div>

        <!-- Settings -->
        <div id="settings" class="section">
            <div class="header"><h1>Settings</h1></div>
            <div class="panel"><h3>Model Configuration</h3>
                <div class="form-group"><label>Default Model</label><select id="defaultModel"></select></div>
                <div class="form-group"><label>Max Context Tokens</label><input type="number" id="maxTokens" value="4096" min="512" max="131072"></div>
                <div class="form-group"><label>Temperature (0.0 - 2.0)</label><input type="number" id="temperature" value="0.7" min="0" max="2" step="0.1"></div>
                <div class="form-group"><label>Top P (0.0 - 1.0)</label><input type="number" id="topP" value="0.9" min="0" max="1" step="0.1"></div>
                <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
            </div>
            <div class="panel"><h3>System Info</h3><div id="systemInfo"><div class="loading">Loading...</div></div></div>
        </div>

        <!-- Logs -->
        <div id="logs" class="section">
            <div class="header"><h1>Logs</h1><button class="refresh-btn" onclick="loadLogs()">Refresh</button></div>
            <div class="panel"><h3>Ollama Server Logs</h3><div class="log-box" id="logBox">Loading...</div></div>
        </div>

        <!-- Testing -->
        <div id="testing" class="section">
            <div class="header"><h1>API Testing</h1><button class="btn btn-primary" onclick="runAllTests()">Run All Tests</button></div>
            
            <div class="panel"><h3>Test Results</h3><div id="testResults"></div></div>

            <div class="panel">
                <h3>Manual Test - Generate</h3>
                <div class="form-group"><label>Prompt</label><textarea id="testPrompt" rows="2" placeholder="Enter prompt...">What is 2+2?</textarea></div>
                <div class="form-group"><label>Model</label><select id="testModel"></select></div>
                <div style="display:flex;gap:10px">
                    <button class="btn btn-primary" onclick="testGenerate(false)">Test Non-Stream</button>
                    <button class="btn btn-success" onclick="testGenerate(true)">Test Stream</button>
                </div>
                <div class="test-result" id="generateResult" style="display:none"></div>
            </div>

            <div class="panel">
                <h3>Manual Test - Chat</h3>
                <div class="form-group"><label>Message</label><textarea id="testChatMsg" rows="2" placeholder="Enter message...">Hello, who are you?</textarea></div>
                <button class="btn btn-primary" onclick="testChat()">Test Chat API</button>
                <div class="test-result" id="chatResult" style="display:none"></div>
            </div>

            <div class="panel">
                <h3>Manual Test - Model Load/Unload</h3>
                <div style="display:flex;gap:10px;align-items:center">
                    <select id="testLoadModel" style="flex:1;padding:10px;background:#0a0a15;border:1px solid #2a2a4a;border-radius:6px;color:#fff"></select>
                    <button class="btn btn-success btn-sm" onclick="testLoadModel()">Load</button>
                    <button class="btn btn-warning btn-sm" onclick="testUnloadModel()">Unload (keep_alive=0)</button>
                </div>
                <div class="test-result" id="loadResult" style="display:none"></div>
            </div>

            <div class="panel">
                <h3>Manual Test - Delete Model</h3>
                <div style="display:flex;gap:10px;align-items:center">
                    <select id="testDeleteModel" style="flex:1;padding:10px;background:#0a0a15;border:1px solid #2a2a4a;border-radius:6px;color:#fff"></select>
                    <button class="btn btn-danger btn-sm" onclick="testDeleteModel()">Delete</button>
                </div>
                <div class="test-result" id="deleteResult" style="display:none"></div>
            </div>
        </div>

        <!-- Chat -->
        <div id="chat" class="section">
            <div class="header">
                <h1>Chat</h1>
                <select id="chatModel" style="background:#1a1a2e;color:#fff;border:1px solid #2a2a4a;padding:8px 12px;border-radius:6px;"></select>
            </div>
            <div class="panel" style="height:calc(100vh - 180px);display:flex;flex-direction:column">
                <div id="chatMessages" style="flex:1;overflow-y:auto;margin-bottom:15px;padding:10px"></div>
                <div style="display:flex;gap:10px">
                    <input type="text" id="chatInput" placeholder="Type a message..." style="flex:1;padding:12px;background:#0a0a15;border:1px solid #2a2a4a;border-radius:8px;color:#fff;font-size:14px" onkeydown="if(event.key==='Enter')sendChat()">
                    <button class="btn btn-primary" onclick="sendChat()">Send</button>
                </div>
            </div>
        </div>
    </div>

<script>
let modelsData=[];
let settings=JSON.parse(localStorage.getItem('ollama_settings')||'{}');

function showSection(n){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.sidebar a').forEach(a=>a.classList.remove('active'));document.getElementById(n).classList.add('active');document.getElementById('nav-'+n).classList.add('active');if(n==='logs')loadLogs();if(n==='testing')loadTestModels();if(n==='settings')loadSystemInfo()}

async function apiFetch(url,opts={}){try{const r=await fetch(url,opts);return await r.json()}catch(e){return{error:e.message}}}

function updateModelSelectors(){
    ['defaultModel','chatModel','testModel','testLoadModel','testDeleteModel'].forEach(id=>{
        const sel=document.getElementById(id);if(!sel)return;
        sel.innerHTML=modelsData.map(m=>'<option value="'+m.name+'">'+m.name+' ('+(m.size/1e9).toFixed(1)+'GB)</option>').join('');
    });
}

async function checkStatus(){
    const d=await apiFetch('/api/tags');
    const b=document.getElementById('serverStatus');
    if(d.error){b.textContent='Offline';b.className='status-badge status-offline'}
    else{b.textContent='Online';b.className='status-badge status-online';modelsData=d.models||[];document.getElementById('totalModels').textContent=modelsData.length;updateModelSelectors()}
}

async function loadRunningModels(){
    const d=await apiFetch('/api/ps');
    const div=document.getElementById('runningModels');
    if(d.models&&d.models.length>0){
        document.getElementById('modelsCount').textContent=d.models.length;
        div.innerHTML=d.models.map(m=>'<div class="model-card"><div class="model-info"><h4>'+m.name+'</h4><span>Size: '+(m.size/1e9).toFixed(1)+'GB | Expires: '+(m.expires_at?new Date(m.expires_at).toLocaleString():'N/A')+'</span></div><button class="btn btn-danger btn-sm" onclick="unloadModel(\''+m.name+'\')">Unload</button></div>').join('');
    }else{document.getElementById('modelsCount').textContent='0';div.innerHTML='<div style="color:#666;padding:20px">No models currently loaded in memory</div>'}
}

async function loadModels(){
    const d=await apiFetch('/api/tags');
    if(d.models){modelsData=d.models;document.getElementById('totalModels').textContent=modelsData.length;
    document.getElementById('modelsList').innerHTML=modelsData.map(m=>'<div class="model-card"><div class="model-info"><h4>'+m.name+'</h4><span>Size: '+(m.size/1e9).toFixed(2)+'GB | Modified: '+new Date(m.modified_at).toLocaleDateString()+' | Context: '+m.details.context_length+'</span></div><div><button class="btn btn-primary btn-sm" onclick="loadModel(\''+m.name+'\')">Load</button> <button class="btn btn-danger btn-sm" onclick="deleteModel(\''+m.name+'\')">Delete</button></div></div>').join('');
    updateModelSelectors()}
}

async function loadModel(n){await apiFetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:n,prompt:'hello',stream:false})});loadRunningModels()}
async function unloadModel(n){await apiFetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:n,prompt:'',keep_alive:0})});setTimeout(loadRunningModels,500)}
async function deleteModel(n){if(!confirm('Delete '+n+'?'))return;await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});setTimeout(loadModels,500)}

async function pullModel(){
    const n=document.getElementById('pullModelName').value.trim();if(!n)return;
    const s=document.getElementById('pullStatus');s.innerHTML='<span style="color:#fbbf24">Downloading '+n+'...</span>';
    try{const r=await fetch('/api/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,stream:true})});
    const reader=r.body.getReader(),dec=new TextDecoder();
    while(true){const{done,value}=await reader.read();if(done)break;const t=dec.decode(value);for(const l of t.split('\n')){if(l.trim())try{const j=JSON.parse(l);if(j.status)s.innerHTML='<span style="color:#4ade80">'+j.status+'</span>'}catch(e){}}}
    s.innerHTML='<span style="color:#4ade80">Downloaded!</span>';loadModels()}catch(e){s.innerHTML='<span style="color:#f87171">Error: '+e.message+'</span>'}
}

async function loadSystemInfo(){
    const d=await apiFetch('/api/system');
    document.getElementById('systemInfo').innerHTML=d.error?'Error':('<table><tr><td style="color:#888">CPU Cores</td><td>'+d.cpu_count+'</td></tr><tr><td style="color:#888">CPU Usage</td><td>'+d.cpu_usage+'</td></tr><tr><td style="color:#888">Memory</td><td>'+d.mem_usage+' of '+d.total_memory+'</td></tr><tr><td style="color:#888">GPU</td><td>'+d.gpu+'</td></tr></table>');
    document.getElementById('cpuUsage').textContent=d.cpu_usage||'--';document.getElementById('cpuInfo').textContent=d.cpu_count+' cores';
    document.getElementById('memUsage').textContent=d.mem_usage||'--';document.getElementById('memInfo').textContent=d.total_memory;
}

async function loadLogs(){
    const d=await apiFetch('/api/logs');
    document.getElementById('logBox').innerHTML=(d.logs||[]).map(l=>{let c='';if(l.includes('error')||l.includes('ERROR'))c='error';else if(l.includes('warn')||l.includes('WARN'))c='warn';else if(l.includes('INFO'))c='info';return'<div class="log-line '+c+'">'+l+'</div>'}).join('');
    document.getElementById('logBox').scrollTop=document.getElementById('logBox').scrollHeight;
}

function saveSettings(){settings.defaultModel=document.getElementById('defaultModel').value;settings.maxTokens=document.getElementById('maxTokens').value;settings.temperature=document.getElementById('temperature').value;settings.topP=document.getElementById('topP').value;localStorage.setItem('ollama_settings',JSON.stringify(settings));alert('Settings saved!')}

function loadTestModels(){updateModelSelectors()}

// === TESTING ===
async function runAllTests(){
    const res=document.getElementById('testResults');res.innerHTML='<div class="loading">Running all tests...</div>';
    const tests=[];
    
    // Test 1: API Status
    try{const d=await apiFetch('/');tests.push({name:'API Status',pass:!!d.status&&d.status==='running',detail:JSON.stringify(d)})}catch(e){tests.push({name:'API Status',pass:false,detail:e.message})}
    
    // Test 2: Model List
    try{const d=await apiFetch('/api/tags');tests.push({name:'Model List (/api/tags)',pass:!!d.models&&d.models.length>0,detail:d.models.length+' models found: '+d.models.map(m=>m.name).join(', ')})}catch(e){tests.push({name:'Model List',pass:false,detail:e.message})}
    
    // Test 3: System Info
    try{const d=await apiFetch('/api/system');tests.push({name:'System Info (/api/system)',pass:!!d.cpu_count,detail:'CPU:'+d.cpu_count+' MEM:'+d.mem_usage+' GPU:'+d.gpu})}catch(e){tests.push({name:'System Info',pass:false,detail:e.message})}
    
    // Test 4: Running Models
    try{const d=await apiFetch('/api/ps');tests.push({name:'Running Models (/api/ps)',pass:d.models!==undefined,detail:(d.models||[]).length+' models loaded'})}catch(e){tests.push({name:'Running Models',pass:false,detail:e.message})}
    
    // Test 5: Generate (Non-stream)
    try{const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-r1:1.5b',prompt:'Say OK',stream:false})});const d=await r.json();tests.push({name:'Generate (non-stream)',pass:!!d.response&&d.response.length>0,detail:'Response: "'+d.response.substring(0,100)+'" | Duration: '+(d.total_duration/1e6).toFixed(0)+'ms'})}catch(e){tests.push({name:'Generate (non-stream)',pass:false,detail:e.message})}
    
    // Test 6: Generate (Stream)
    try{const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-r1:1.5b',prompt:'Say OK',stream:true})});const t=await r.text();const lines=t.trim().split('\n');let resp='';for(const l of lines){try{const j=JSON.parse(l);if(j.response)resp+=j.response}catch(e){}}tests.push({name:'Generate (stream)',pass:resp.length>0,detail:'Response: "'+resp.substring(0,100)+'" | Lines: '+lines.length})}catch(e){tests.push({name:'Generate (stream)',pass:false,detail:e.message})}
    
    // Test 7: Chat API
    try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-r1:1.5b',messages:[{role:'user',content:'Say OK'}],stream:false})});const d=await r.json();tests.push({name:'Chat API (/api/chat)',pass:!!d.message||!!d.messages,detail:JSON.stringify(d).substring(0,150)})}catch(e){tests.push({name:'Chat API',pass:false,detail:e.message})}

    // Test 8: Logs
    try{const d=await apiFetch('/api/logs');tests.push({name:'Logs (/api/logs)',pass:!!d.logs&&d.logs.length>0,detail:d.logs.length+' log lines'})}catch(e){tests.push({name:'Logs',pass:false,detail:e.message})}

    let html='<table><tr><th>Test</th><th>Status</th><th>Details</th></tr>';
    let pass=0,fail=0;
    for(const t of tests){
        const badge=t.pass?'<span class="badge badge-ok">PASS</span>':'<span class="badge badge-err">FAIL</span>';
        html+='<tr><td>'+t.name+'</td><td>'+badge+'</td><td style="font-size:12px;color:#888">'+t.detail+'</td></tr>';
        t.pass?pass++:fail++;
    }
    html+='</table><div style="margin-top:15px;font-size:14px"><strong>'+pass+'</strong> passed, <strong>'+fail+'</strong> failed out of <strong>'+tests.length+'</strong> tests</div>';
    res.innerHTML=html;
}

async function testGenerate(stream){
    const prompt=document.getElementById('testPrompt').value;
    const model=document.getElementById('testModel').value;
    const div=document.getElementById('generateResult');div.style.display='block';div.className='test-result';div.textContent='Testing...';
    try{
        const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model,prompt:prompt,stream:stream})});
        if(stream){
            const reader=r.body.getReader(),dec=new TextDecoder();let resp='',lines=0;
            while(true){const{done,value}=await reader.read();if(done)break;const t=dec.decode(value);for(const l of t.split('\n')){if(l.trim()){lines++;try{const j=JSON.parse(l);if(j.response)resp+=j.response}catch(e){}}}}
            div.className='test-result success';div.textContent='STREAM RESULT ('+lines+' chunks):\n'+resp;
        }else{
            const d=await r.json();div.className='test-result success';div.textContent='RESULT:\n'+JSON.stringify(d,null,2);
        }
    }catch(e){div.className='test-result error';div.textContent='ERROR: '+e.message}
}

async function testChat(){
    const msg=document.getElementById('testChatMsg').value;
    const model=document.getElementById('testModel').value;
    const div=document.getElementById('chatResult');div.style.display='block';div.className='test-result';div.textContent='Testing...';
    try{
        const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model,messages:[{role:'user',content:msg}],stream:false})});
        const d=await r.json();div.className='test-result success';div.textContent='RESULT:\n'+JSON.stringify(d,null,2);
    }catch(e){div.className='test-result error';div.textContent='ERROR: '+e.message}
}

async function testLoadModel(){
    const model=document.getElementById('testLoadModel').value;
    const div=document.getElementById('loadResult');div.style.display='block';div.className='test-result';div.textContent='Loading model: '+model+'...';
    try{const d=await apiFetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model,prompt:'hi',stream:false})});
    div.className='test-result success';div.textContent='MODEL LOADED!\n'+JSON.stringify({model:model,status:'loaded',tokens_eval_count:d.eval_count,duration_ms:(d.total_duration/1e6).toFixed(0)},null,2);loadRunningModels()}catch(e){div.className='test-result error';div.textContent='ERROR: '+e.message}
}

async function testUnloadModel(){
    const model=document.getElementById('testLoadModel').value;
    const div=document.getElementById('loadResult');div.style.display='block';div.className='test-result';div.textContent='Unloading model: '+model+'...';
    try{await apiFetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model,prompt:'',keep_alive:0})});
    div.className='test-result success';div.textContent='MODEL UNLOADED: '+model;loadRunningModels()}catch(e){div.className='test-result error';div.textContent='ERROR: '+e.message}
}

async function testDeleteModel(){
    const model=document.getElementById('testDeleteModel').value;
    if(!confirm('PERMANENTLY DELETE '+model+'?'))return;
    const div=document.getElementById('deleteResult');div.style.display='block';div.className='test-result';div.textContent='Deleting model: '+model+'...';
    try{await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:model})});
    div.className='test-result success';div.textContent='MODEL DELETED: '+model;loadModels()}catch(e){div.className='test-result error';div.textContent='ERROR: '+e.message}
}

// Chat
async function sendChat(){
    const input=document.getElementById('chatInput');const msg=input.value.trim();if(!msg)return;
    const div=document.getElementById('chatMessages');
    div.innerHTML+='<div class="chat-msg user"><div class="bubble">'+msg+'</div></div>';
    input.value='';
    const model=document.getElementById('chatModel').value||'deepseek-r1:1.5b';
    const botDiv=document.createElement('div');botDiv.className='chat-msg bot';botDiv.innerHTML='<div class="bubble">Thinking...</div>';
    div.appendChild(botDiv);div.scrollTop=div.scrollHeight;
    try{const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model,prompt:msg,stream:true})});
    const reader=r.body.getReader(),dec=new TextDecoder();let text='';
    while(true){const{done,value}=await reader.read();if(done)break;const t=dec.decode(value);for(const l of t.split('\n')){if(l.trim())try{const j=JSON.parse(l);if(j.response)text+=j.response}catch(e){}}
    botDiv.innerHTML='<div class="bubble">'+text+'</div>';div.scrollTop=div.scrollHeight}
    }catch(e){botDiv.innerHTML='<div class="bubble" style="color:#f87171">Error: '+e.message+'</div>'}
}

// ============================================================
// REAL-TIME TASK TRACKING SYSTEM (UI)
// ============================================================
class TaskTracker {
    constructor() {
        this.tasks = {};
        this.sseConnection = null;
        this.panel = null;
        this.isVisible = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.init();
    }

    init() {
        this.createProgressPanel();
        this.createSSEIndicator();
        this.connectSSE();
        // Show panel toggle button
        this.showToggleButton();
    }

    createProgressPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'progress-panel';
        this.panel.id = 'taskProgressPanel';
        this.panel.innerHTML = `
            <div class="progress-header">
                <h4>🔄 Live Activity</h4>
                <button class="progress-close" onclick="taskTracker.hidePanel()">✕</button>
            </div>
            <div class="progress-body" id="taskProgressBody">
                <div style="text-align:center;padding:20px;color:#666;font-size:13px">No active tasks</div>
            </div>
        `;
        document.body.appendChild(this.panel);
    }

    createSSEIndicator() {
        this.sseIndicator = document.createElement('div');
        this.sseIndicator.className = 'sse-status disconnected';
        this.sseIndicator.id = 'sseStatus';
        this.sseIndicator.textContent = '● SSE: Connecting...';
        this.sseIndicator.title = 'Server-Sent Events connection status';
        document.body.appendChild(this.sseIndicator);
    }

    showToggleButton() {
        const btn = document.createElement('button');
        btn.className = 'task-toggle';
        btn.id = 'taskToggleBtn';
        btn.innerHTML = '📊 Activity';
        btn.onclick = () => this.togglePanel();
        document.body.appendChild(btn);
    }

    togglePanel() {
        this.isVisible = !this.isVisible;
        this.panel.classList.toggle('visible', this.isVisible);
    }

    showPanel() {
        this.isVisible = true;
        this.panel.classList.add('visible');
    }

    hidePanel() {
        this.isVisible = false;
        this.panel.classList.remove('visible');
    }

    connectSSE() {
        if (this.sseConnection) {
            this.sseConnection.close();
        }

        this.sseConnection = new EventSource('/api/tasks/stream');

        this.sseConnection.onopen = () => {
            this.reconnectAttempts = 0;
            this.updateSSEIndicator(true);
            console.log('[TaskTracker] SSE connected');
        };

        this.sseConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleTaskUpdate(data);
            } catch (e) {
                console.error('[TaskTracker] Parse error:', e);
            }
        };

        this.sseConnection.onerror = (event) => {
            console.error('[TaskTracker] SSE error');
            this.updateSSEIndicator(false);
            this.sseConnection.close();

            // Reconnect with exponential backoff
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
                setTimeout(() => this.connectSSE(), delay);
            }
        };
    }

    updateSSEIndicator(connected) {
        if (this.sseIndicator) {
            this.sseIndicator.className = `sse-status ${connected ? 'connected' : 'disconnected'}`;
            this.sseIndicator.textContent = connected ? '● SSE: Connected' : '● SSE: Disconnected';
        }
    }

    handleTaskUpdate(data) {
        if (data.type === 'connected' || data.type === 'heartbeat') return;

        const taskId = data.task_id;
        if (!taskId) return;

        this.tasks[taskId] = data;
        this.renderTask(data);

        // Show panel if there's an active task
        if (data.status !== 'completed' && data.status !== 'failed') {
            this.showPanel();
        }
    }

    renderTask(data) {
        const body = document.getElementById('taskProgressBody');
        if (!body) return;

        // Remove "no active tasks" message
        const emptyMsg = body.querySelector('div[style*="text-align:center"]');
        if (emptyMsg) emptyMsg.remove();

        // Get or create task element
        let taskEl = document.getElementById('task-' + data.task_id);
        if (!taskEl) {
            taskEl = document.createElement('div');
            taskEl.id = 'task-' + data.task_id;
            taskEl.className = 'task-item';
            body.insertBefore(taskEl, body.firstChild);
        }

        // Update class based on status
        taskEl.className = `task-item ${data.status}`;

        // Calculate progress percentage
        const pct = Math.round(data.progress * 100);

        // Build verification HTML
        let verifyHtml = '';
        if (data.verification_data && Object.keys(data.verification_data).length > 0) {
            verifyHtml = '<div class="task-verification">';
            for (const [check, info] of Object.entries(data.verification_data)) {
                const icon = info.passed ? 'pass' : 'fail';
                verifyHtml += `<div class="task-verify-item">
                    <span class="task-verify-icon ${icon}"></span>
                    <span>${check}: ${info.details || (info.passed ? 'OK' : 'FAIL')}</span>
                </div>`;
            }
            verifyHtml += '</div>';
        }

        // Build steps HTML
        let stepsHtml = '';
        if (data.steps && data.steps.length > 0) {
            stepsHtml = '<div class="task-steps">';
            data.steps.forEach((step, i) => {
                const cls = i < data.current_step ? 'done' : (i === data.current_step ? 'active' : '');
                stepsHtml += `<span class="task-step ${cls}">● ${step.step || 'Step ' + (i+1)}</span>`;
            });
            stepsHtml += '</div>';
        }

        // Progress bar color class
        let barClass = '';
        if (data.status === 'failed') barClass = 'error';
        else if (data.status === 'verifying') barClass = 'verify';
        else if (data.status === 'streaming') barClass = 'stream';

        taskEl.innerHTML = `
            <div class="task-header">
                <span class="task-type">${data.task_type}</span>
                <span class="task-status ${data.status}">${data.status.toUpperCase()}</span>
            </div>
            <div class="task-message">${data.message || 'Processing...'}</div>
            <div class="progress-bar-container">
                <div class="progress-bar ${barClass}" style="width:${pct}%"></div>
            </div>
            ${stepsHtml}
            ${verifyHtml}
            <div style="margin-top:4px;font-size:11px;color:#444">${pct}% • ${data.task_id}</div>
        `;

        // Keep only last 10 tasks visible
        const tasks = body.querySelectorAll('.task-item');
        if (tasks.length > 10) {
            for (let i = 10; i < tasks.length; i++) {
                tasks[i].remove();
            }
        }
    }

    // Programmatic task creation (for use in other functions)
    async createTask(type, totalSteps = 3) {
        try {
            const r = await fetch('/api/tasks/create', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({type, total_steps: totalSteps})
            });
            return await r.json();
        } catch (e) {
            console.error('Task creation failed:', e);
            return null;
        }
    }

    async getTask(taskId) {
        try {
            const r = await fetch('/api/tasks/' + taskId);
            return await r.json();
        } catch (e) {
            return null;
        }
    }
}

// Initialize task tracker
const taskTracker = new TaskTracker();

// ============================================================
// ENHANCED FUNCTIONS WITH REAL-TIME TRACKING
// ============================================================

// Enhanced pull model with progress tracking
async function pullModelTracked() {
    const name = document.getElementById('pullModelName').value.trim();
    if (!name) return;

    // Create tracked task
    const task = await taskTracker.createTask('pull_model', 3);
    const statusDiv = document.getElementById('pullStatus');
    statusDiv.innerHTML = '<span style="color:#00d4ff">⏳ Creating task ' + (task?.task_id || '...') + '</span>';

    // Use EventSource to track progress
    if (task && task.task_id) {
        const origPullModel = window._origPullModel || pullModel;
        window._origPullModel = origPullModel;

        // Update UI with task ID
        statusDiv.innerHTML = '<span style="color:#00d4ff">🔄 Pulling model: ' + name + ' (Task: ' + task.task_id + ')</span>';
    }

    // Execute the actual pull
    await pullModel();
}

// Enhanced test with verification
async function testGenerateTracked(stream) {
    const prompt = document.getElementById('testPrompt').value;
    const model = document.getElementById('testModel').value;
    const div = document.getElementById('generateResult');
    div.style.display = 'block';
    div.className = 'test-result';

    // Step 1: Connection check
    div.textContent = '🔍 Step 1/4: Verifying connection...';
    try {
        const connCheck = await apiFetch('/api/verify/connection');
        if (!connCheck.passed) {
            div.className = 'test-result error';
            div.textContent = '❌ Connection failed: ' + connCheck.details;
            return;
        }
        div.textContent = '✅ Connected: ' + connCheck.details + '\n🔍 Step 2/4: Checking model...';
    } catch (e) {
        div.className = 'test-result error';
        div.textContent = '❌ Connection error: ' + e.message;
        return;
    }

    // Step 2: Model check
    try {
        const modelCheck = await apiFetch('/api/verify/model?model=' + encodeURIComponent(model));
        if (!modelCheck.passed) {
            div.textContent += '\n❌ Model check failed: ' + modelCheck.details;
            div.className = 'test-result error';
            return;
        }
        div.textContent += '\n✅ Model loaded: ' + modelCheck.details + '\n🔍 Step 3/4: Running generation...';
    } catch (e) {
        div.textContent += '\n❌ Model check error: ' + e.message;
        div.className = 'test-result error';
        return;
    }

    // Step 3: Run generation
    await testGenerate(stream);

    // Step 4: Verify result
    const result = div.textContent;
    if (result.includes('ERROR') || result.includes('error')) {
        div.className = 'test-result error';
    } else {
        div.textContent = result + '\n✅ Step 4/4: Verification complete';
        div.className = 'test-result success';
    }
}

// Health check button
async function runHealthCheck() {
    const div = document.getElementById('testResults');
    div.innerHTML = '<div class="loading">Running comprehensive health check...</div>';

    try {
        const health = await apiFetch('/api/health');
        let html = '<div class="panel" style="margin:0">';
        html += '<h3>🏥 System Health</h3>';
        html += '<div style="font-size:14px;margin-bottom:15px">Status: <strong style="color:' + (health.status === 'healthy' ? '#4ade80' : '#fbbf24') + '">' + health.status.toUpperCase() + '</strong></div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">';

        // Connection
        const conn = health.connection;
        html += '<div style="padding:15px;background:#0a0a15;border-radius:8px;border-left:3px solid ' + (conn.passed ? '#4ade80' : '#f87171') + '">';
        html += '<div style="color:#888;font-size:11px;text-transform:uppercase">Connection</div>';
        html += '<div style="color:#fff;font-size:14px;margin-top:4px">' + (conn.passed ? '✅ Connected' : '❌ Failed') + '</div>';
        html += '<div style="color:#666;font-size:12px;margin-top:2px">' + conn.details + '</div>';
        html += '</div>';

        // Model
        const model = health.model;
        html += '<div style="padding:15px;background:#0a0a15;border-radius:8px;border-left:3px solid ' + (model.passed ? '#4ade80' : '#f87171') + '">';
        html += '<div style="color:#888;font-size:11px;text-transform:uppercase">Model: ' + model.model + '</div>';
        html += '<div style="color:#fff;font-size:14px;margin-top:4px">' + (model.passed ? '✅ Loaded' : '❌ Not Loaded') + '</div>';
        html += '<div style="color:#666;font-size:12px;margin-top:2px">' + model.details + '</div>';
        html += '</div>';

        html += '</div>';
        html += '</div>';
        div.innerHTML = html;
    } catch (e) {
        div.innerHTML = '<div class="test-result error">Health check failed: ' + e.message + '</div>';
    }
}

checkStatus();loadRunningModels();loadModels();loadSystemInfo();
setInterval(()=>{checkStatus();loadRunningModels()},10000);
</script>
</body>
</html>"""


@app.route("/admin")
def admin():
    return ADMIN_HTML


@app.route("/")
def index():
    return jsonify({
        "message": "Ollama API",
        "status": "running",
        "admin": "/admin",
        "endpoints": ["/api/tags", "/api/generate", "/api/chat", "/api/ps", "/api/delete", "/api/pull", "/api/system", "/api/logs"]
    })


@app.route("/api/tags")
def tags():
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=10)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ps")
def ps():
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/ps", timeout=10)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/status")
def api_status():
    """API health check"""
    ollama_ok = False
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
        ollama_ok = r.status_code == 200
    except:
        pass
    
    model = DEFAULT_MODEL
    loaded = False
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/ps", timeout=5)
        models = r.json().get("models", [])
        loaded = any(m["name"] == model for m in models)
    except:
        pass
    
    return jsonify({
        "status": "ok",
        "ollama_status": "connected" if ollama_ok else "disconnected",
        "model": model,
        "model_loaded": loaded,
        "keep_alive": KEEP_ALIVE,
        "timestamp": int(time.time())
    }), 200


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    data.setdefault("keep_alive", KEEP_ALIVE)
    stream = data.get("stream", False)

    if stream:
        # Create tracked task for streaming generation
        task = task_manager.create_task("generate", total_steps=4)

        # Run verification chain
        if not VerificationLayer.full_verification_chain(task, data, data.get("model")):
            return jsonify({
                "error": "Verification failed",
                "task": task.to_dict()
            }), 500

        def stream_gen():
            try:
                task.update(status=TaskStatus.STREAMING,
                           message="Streaming response...", progress=0.5,
                           step_name="generation_started")
                task_manager.update_task(task.task_id, status=TaskStatus.STREAMING)

                r = requests.post(f"{OLLAMA_HOST}/api/generate", json=data, stream=True, timeout=300)
                chunk_count = 0
                for line in r.iter_lines():
                    if line:
                        decoded = line.decode("utf-8")
                        yield decoded + "\n"
                        chunk_count += 1
                        # Update progress every 5 chunks
                        if chunk_count % 5 == 0:
                            task.update(
                                progress=min(0.5 + chunk_count * 0.02, 0.95),
                                message=f"Streaming... ({chunk_count} chunks)"
                            )

                task.verify("stream_complete", True, f"{chunk_count} chunks received")
                task.update(status=TaskStatus.COMPLETED,
                           message=f"Complete - {chunk_count} chunks",
                           progress=1.0, step_name="generation_complete")
            except Exception as e:
                task.verify("stream_error", False, str(e))
                task.update(status=TaskStatus.FAILED,
                           message=f"Error: {str(e)}", progress=1.0)
                yield json.dumps({"error": str(e)}) + "\n"
        return Response(stream_gen(), content_type="application/json")
    else:
        try:
            r = requests.post(f"{OLLAMA_HOST}/api/generate", json=data, timeout=300)
            return jsonify(r.json()), r.status_code
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    data.setdefault("keep_alive", KEEP_ALIVE)
    stream = data.get("stream", False)

    if stream:
        # Create tracked task for streaming chat
        task = task_manager.create_task("chat", total_steps=4)

        # Run verification chain
        if not VerificationLayer.full_verification_chain(task, data, data.get("model")):
            return jsonify({
                "error": "Verification failed",
                "task": task.to_dict()
            }), 500

        def stream_gen():
            try:
                task.update(status=TaskStatus.STREAMING,
                           message="Streaming chat response...", progress=0.5,
                           step_name="chat_started")
                task_manager.update_task(task.task_id, status=TaskStatus.STREAMING)

                r = requests.post(f"{OLLAMA_HOST}/api/chat", json=data, stream=True, timeout=300)
                chunk_count = 0
                for line in r.iter_lines():
                    if line:
                        decoded = line.decode("utf-8")
                        yield decoded + "\n"
                        chunk_count += 1
                        if chunk_count % 5 == 0:
                            task.update(
                                progress=min(0.5 + chunk_count * 0.02, 0.95),
                                message=f"Streaming... ({chunk_count} chunks)"
                            )

                task.verify("stream_complete", True, f"{chunk_count} chunks received")
                task.update(status=TaskStatus.COMPLETED,
                           message=f"Complete - {chunk_count} chunks",
                           progress=1.0, step_name="chat_complete")
            except Exception as e:
                task.verify("stream_error", False, str(e))
                task.update(status=TaskStatus.FAILED,
                           message=f"Error: {str(e)}", progress=1.0)
                yield json.dumps({"error": str(e)}) + "\n"
        return Response(stream_gen(), content_type="application/json")
    else:
        try:
            r = requests.post(f"{OLLAMA_HOST}/api/chat", json=data, timeout=300)
            return jsonify(r.json()), r.status_code
        except Exception as e:
            return jsonify({"error": str(e)}), 500


# OpenAI Compatible Endpoint
@app.route("/v1/chat/completions", methods=["POST"])
def openai_chat():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    model = data.get("model", DEFAULT_MODEL)
    messages = data.get("messages", [])
    stream = data.get("stream", False)
    tools = data.get("tools", None)
    options = {}

    if "temperature" in data:
        options["temperature"] = data["temperature"]
    if "max_tokens" in data:
        options["num_predict"] = data["max_tokens"]
    if "top_p" in data:
        options["top_p"] = data["top_p"]

    ollama_data = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "keep_alive": KEEP_ALIVE,
        "options": options
    }
    if tools:
        ollama_data["tools"] = tools

    if stream:
        def stream_gen():
            import uuid
            chat_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
            created = int(time.time())
            try:
                r = requests.post(f"{OLLAMA_HOST}/api/chat", json=ollama_data, stream=True, timeout=300)
                for line in r.iter_lines():
                    if line:
                        ollama_chunk = json.loads(line.decode("utf-8"))
                        delta = {}
                        if ollama_chunk.get("message", {}).get("content"):
                            delta["content"] = ollama_chunk["message"]["content"]
                        if ollama_chunk.get("message", {}).get("tool_calls"):
                            delta["tool_calls"] = ollama_chunk["message"]["tool_calls"]
                        if delta or ollama_chunk.get("done"):
                            chunk = {
                                "id": chat_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": [{
                                    "index": 0,
                                    "delta": delta if not ollama_chunk.get("done") else {},
                                    "finish_reason": "stop" if ollama_chunk.get("done") else None
                                }]
                            }
                            yield f"data: {json.dumps(chunk)}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return Response(stream_gen(), content_type="text/event-stream")
    else:
        try:
            r = requests.post(f"{OLLAMA_HOST}/api/chat", json=ollama_data, timeout=300)
            ollama_resp = r.json()
            message = ollama_resp.get("message", {})
            choice = {
                "index": 0,
                "message": {
                    "role": message.get("role", "assistant"),
                    "content": message.get("content", "")
                },
                "finish_reason": "stop"
            }
            if message.get("tool_calls"):
                choice["message"]["tool_calls"] = message["tool_calls"]
            result = {
                "id": f"chatcmpl-{int(time.time()*1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [choice],
                "usage": {
                    "prompt_tokens": ollama_resp.get("prompt_eval_count", 0),
                    "completion_tokens": ollama_resp.get("eval_count", 0),
                    "total_tokens": ollama_resp.get("prompt_eval_count", 0) + ollama_resp.get("eval_count", 0)
                }
            }
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/v1/models", methods=["GET"])
def openai_models():
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=10)
        ollama_models = r.json().get("models", [])
        data = []
        for m in ollama_models:
            data.append({
                "id": m["name"],
                "object": "model",
                "created": int(datetime.datetime.fromisoformat(m["modified_at"].replace("Z", "+00:00")).timestamp()),
                "owned_by": "ollama"
            })
        return jsonify({"object": "list", "data": data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pull", methods=["POST"])
def pull():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    name = data.get("name", "")
    stream = data.get("stream", False)

    if stream:
        # Create tracked task for model pull
        task = task_manager.create_task("pull_model", total_steps=3)

        # Step 1: Verify connection
        task.update(status=TaskStatus.VERIFYING, message="Verifying connection...",
                    progress=0.1, step_name="connection_check")
        conn = VerificationLayer.verify_ollama_connection()
        task.verify("connection", conn["passed"], conn["details"])
        if not conn["passed"]:
            task.update(status=TaskStatus.FAILED,
                       message=f"Connection failed: {conn['details']}", progress=0.1)
            return jsonify({"error": conn["details"], "task": task.to_dict()}), 500

        def stream_gen():
            try:
                task.update(status=TaskStatus.RUNNING,
                           message=f"Pulling model: {name}", progress=0.2,
                           step_name="pull_started")

                r = requests.post(f"{OLLAMA_HOST}/api/pull",
                                  json={"name": name, "stream": True},
                                  stream=True, timeout=600)

                for line in r.iter_lines():
                    if line:
                        decoded = line.decode("utf-8")
                        yield decoded + "\n"

                        # Parse progress
                        try:
                            parsed = json.loads(decoded)
                            if "status" in parsed:
                                status = parsed["status"]
                                if "completed" in parsed and "total" in parsed:
                                    pct = parsed["completed"] / max(parsed["total"], 1)
                                    task.update(
                                        progress=min(0.2 + pct * 0.7, 0.9),
                                        message=f"{status}: {pct*100:.1f}%"
                                    )
                                else:
                                    task.update(message=status)
                        except json.JSONDecodeError:
                            pass

                task.verify("pull_complete", True, f"Model '{name}' pulled")
                task.update(status=TaskStatus.COMPLETED,
                           message=f"Model '{name}' pulled successfully",
                           progress=1.0, step_name="pull_complete")
            except Exception as e:
                task.verify("pull_error", False, str(e))
                task.update(status=TaskStatus.FAILED,
                           message=f"Pull error: {str(e)}", progress=1.0)
                yield json.dumps({"error": str(e)}) + "\n"

        return Response(stream_gen(), content_type="application/json")
    else:
        try:
            r = requests.post(f"{OLLAMA_HOST}/api/pull", json=data, timeout=600)
            return jsonify(r.json()), r.status_code
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/api/delete", methods=["POST"])
def delete_model():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    try:
        r = requests.delete(f"{OLLAMA_HOST}/api/delete", json=data, timeout=60)
        if r.status_code == 200:
            return jsonify({"status": "success", "message": f"Model '{data.get('name')}' deleted"})
        return jsonify(r.json()), r.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/system")
def system_info():
    try:
        import psutil
        info = {}
        info["cpu_count"] = psutil.cpu_count()
        info["cpu_usage"] = f"{psutil.cpu_percent(interval=0.5)}%"
        mem = psutil.virtual_memory()
        info["total_memory"] = f"{mem.total / 1e9:.1f} GB"
        info["mem_usage"] = f"{mem.percent}%"
        info["gpu"] = "CPU Only"
        try:
            r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
            info["version"] = "connected"
            info["models_count"] = len(r.json().get("models", []))
        except:
            info["version"] = "disconnected"
        return jsonify(info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/logs")
def logs():
    try:
        result = subprocess.run(
            ["docker", "logs", "--tail", "200", "ollama-cpu-isolated"],
            capture_output=True, text=True, timeout=10
        )
        lines = (result.stdout + result.stderr).strip().split("\n")
        return jsonify({"logs": lines[-200:]})
    except Exception as e:
        return jsonify({"logs": [f"Error: {str(e)}"]})


# ============================================================
# /v1/completions - OpenAI Text Completion (non-chat)
# ============================================================
@app.route("/v1/completions", methods=["POST"])
def openai_completions():
    """OpenAI-compatible text completions endpoint.
    
    Request body:
        model: str (required)
        prompt: str or list[str] (required)
        max_tokens: int (default 16)
        temperature: float (default 1.0)
        top_p: float (default 1.0)
        stream: bool (default False)
        stop: str or list[str] (optional)
        echo: bool (default False)
        logprobs: int (optional)
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    model = data.get("model", DEFAULT_MODEL)
    prompt = data.get("prompt", "")
    max_tokens = data.get("max_tokens", 16)
    temperature = data.get("temperature", 1.0)
    top_p = data.get("top_p", 1.0)
    stream = data.get("stream", False)
    stop = data.get("stop", None)
    echo = data.get("echo", False)
    n = data.get("n", 1)
    suffix = data.get("suffix", None)
    user = data.get("user", None)

    # Handle list of prompts
    if isinstance(prompt, list):
        prompt = prompt[0] if prompt else ""

    # Convert stop to list
    if isinstance(stop, str):
        stop = [stop]

    ollama_data = {
        "model": model,
        "prompt": prompt,
        "stream": stream,
        "options": {
            "temperature": temperature,
            "top_p": top_p,
            "num_predict": max_tokens,
        }
    }
    if stop:
        ollama_data["options"]["stop"] = stop

    if stream:
        def stream_gen():
            try:
                r = requests.post(f"{OLLAMA_HOST}/api/generate",
                    json=ollama_data, stream=True, timeout=300)
                prompt_tokens = 0
                for line in r.iter_lines():
                    if line:
                        chunk = json.loads(line.decode("utf-8"))
                        if chunk.get("done"):
                            prompt_tokens = chunk.get("prompt_eval_count", 0)
                        text = chunk.get("response", "")
                        if text:
                            completions_chunk = {
                                "id": f"cmpl-{int(time.time()*1000)}",
                                "object": "text_completion",
                                "created": int(time.time()),
                                "model": model,
                                "choices": [{
                                    "text": text,
                                    "index": 0,
                                    "logprobs": None,
                                    "finish_reason": None
                                }]
                            }
                            yield f"data: {json.dumps(completions_chunk)}\n\n"
                # Final chunk
                final = {
                    "id": f"cmpl-{int(time.time()*1000)}",
                    "object": "text_completion",
                    "created": int(time.time()),
                    "model": model,
                    "choices": [{
                        "text": "",
                        "index": 0,
                        "logprobs": None,
                        "finish_reason": "stop"
                    }],
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": 0,
                        "total_tokens": prompt_tokens
                    }
                }
                yield f"data: {json.dumps(final)}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return Response(stream_gen(), content_type="text/event-stream")
    else:
        try:
            r = requests.post(f"{OLLAMA_HOST}/api/generate",
                json=ollama_data, timeout=300)
            ollama_resp = r.json()
            response_text = ollama_resp.get("response", "")
            prompt_tokens = ollama_resp.get("prompt_eval_count", 0)
            completion_tokens = ollama_resp.get("eval_count", 0)

            if echo:
                response_text = prompt + response_text

            if suffix:
                response_text = response_text + suffix

            choices = []
            for i in range(n):
                choice = {
                    "text": response_text if i == 0 else "",
                    "index": i,
                    "logprobs": None,
                    "finish_reason": "stop"
                }
                choices.append(choice)

            result = {
                "id": f"cmpl-{int(time.time()*1000)}",
                "object": "text_completion",
                "created": int(time.time()),
                "model": model,
                "choices": choices,
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens if n == 1 else 0,
                    "total_tokens": prompt_tokens + (completion_tokens if n == 1 else 0)
                }
            }
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500


# ============================================================
# /v1/embeddings - OpenAI Embeddings
# ============================================================
@app.route("/v1/embeddings", methods=["POST"])
def openai_embeddings():
    """OpenAI-compatible embeddings endpoint.
    
    Request body:
        model: str (required)
        input: str or list[str] (required)
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    model = data.get("model", DEFAULT_MODEL)
    inp = data.get("input", "")
    if isinstance(inp, list):
        inp = inp[0] if inp else ""

    try:
        r = requests.post(f"{OLLAMA_HOST}/api/embeddings",
            json={"model": model, "prompt": inp}, timeout=60)
        ollama_resp = r.json()
        embedding = ollama_resp.get("embedding", [])
        return jsonify({
            "object": "list",
            "data": [{
                "object": "embedding",
                "index": 0,
                "embedding": embedding
            }],
            "model": model,
            "usage": {
                "prompt_tokens": 0,
                "total_tokens": 0
            }
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# /v1/audio/transcription - Placeholder (not implemented)
# ============================================================
@app.route("/v1/audio/transcriptions", methods=["POST"])
def openai_transcription():
    return jsonify({"error": "Transcription not available"}), 501


@app.route("/v1/audio/translations", methods=["POST"])
def openai_translation():
    return jsonify({"error": "Translation not available"}), 501


# ============================================================
# REAL-TIME TASK TRACKING ENDPOINTS
# ============================================================
@app.route("/api/tasks/stream")
def task_stream_sse():
    """SSE endpoint for real-time task progress updates"""
    def event_stream():
        q, subscriber_id = task_manager.subscribe()
        try:
            # Send initial heartbeat
            yield f"data: {json.dumps({'type': 'connected', 'subscriber_id': subscriber_id})}\n\n"

            while True:
                try:
                    data = q.get(timeout=30)  # 30s heartbeat
                    if data.get("_subscriber_id"):
                        continue  # Skip subscriber registration
                    yield f"data: {json.dumps(data)}\n\n"
                except queue.Empty:
                    # Send heartbeat to keep connection alive
                    yield f"data: {json.dumps({'type': 'heartbeat', 'time': int(time.time())})}\n\n"
        except GeneratorExit:
            task_manager.unsubscribe(subscriber_id)

    return Response(
        stream_with_context(event_stream()),
        content_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@app.route("/api/tasks")
def list_tasks():
    """List all tracked tasks"""
    return jsonify({"tasks": task_manager.get_all_tasks()})


@app.route("/api/tasks/<task_id>")
def get_task(task_id):
    """Get specific task status"""
    task = task_manager.get_task(task_id)
    if task:
        return jsonify(task.to_dict())
    return jsonify({"error": "Task not found"}), 404


@app.route("/api/tasks/create", methods=["POST"])
def create_task():
    """Create a new trackable task"""
    data = request.get_json() or {}
    task_type = data.get("type", "generic")
    total_steps = data.get("total_steps", 3)
    task = task_manager.create_task(task_type, total_steps)
    return jsonify(task.to_dict()), 201


@app.route("/api/verify/connection")
def verify_connection():
    """Real-time connection verification endpoint"""
    result = VerificationLayer.verify_ollama_connection()
    return jsonify(result)


@app.route("/api/verify/model")
def verify_model():
    """Real-time model verification endpoint"""
    model = request.args.get("model", DEFAULT_MODEL)
    result = VerificationLayer.verify_model_loaded(model)
    return jsonify(result)


@app.route("/api/health")
def health_check():
    """Comprehensive health check with verification chain"""
    conn = VerificationLayer.verify_ollama_connection()
    model = VerificationLayer.verify_model_loaded()
    return jsonify({
        "status": "healthy" if conn["passed"] and model["passed"] else "degraded",
        "connection": conn,
        "model": model,
        "timestamp": int(time.time())
    })


# ============================================================
# Client Integration - OllamaClient
# ============================================================
class OllamaClient:
    """Unified client for Ollama via UDS (Unix Domain Socket) or TCP.
    
    Usage:
        # UDS (fastest, localhost only)
        client = OllamaClient(socket_path="/tmp/ollama.sock")
        
        # TCP (remote)
        client = OllamaClient(host="http://localhost:5000")
        
        # Auto-detect
        client = OllamaClient()  # tries UDS first, then TCP
        
        # Chat
        response = client.chat("Hello!")
        
        # Generate (raw)
        response = client.generate("What is AI?")
        
        # Completions (OpenAI format)
        response = client.complete("def fibonacci(")
        
        # List models
        models = client.models()
        
        # Stream
        for chunk in client.chat_stream("Tell me a story"):
            print(chunk, end="", flush=True)
    """
    
    def __init__(self, host=None, socket_path=None):
        self.use_uds = False
        self.base_url = None
        self.socket_path = None
        self._session = None
        
        if socket_path and os.path.exists(socket_path):
            self.use_uds = True
            self.socket_path = socket_path
            self.base_url = "http://localhost"
        elif host:
            self.base_url = host.rstrip("/")
        else:
            # Auto-detect: try UDS first
            default_sock = os.environ.get("OLLAMA_SOCK", "/tmp/ollama.sock")
            if os.path.exists(default_sock):
                self.use_uds = True
                self.socket_path = default_sock
                self.base_url = "http://localhost"
            else:
                self.base_url = os.environ.get("HTTP_URL", "http://localhost:5000")
    
    def _get_session(self):
        if self.use_uds:
            try:
                import requests_unixsocket as rus
                if self._session is None:
                    self._session = rus.Session()
                return self._session
            except ImportError:
                import requests
                self._session = requests.Session()
                self.use_uds = False
                return self._session
        else:
            import requests
            if self._session is None:
                self._session = requests.Session()
            return self._session
    
    def _url(self, path):
        if self.use_uds:
            encoded = self.socket_path.replace("/", "%2F")
            return f"http+unix://{encoded}{path}"
        return f"{self.base_url}{path}"
    
    def _post(self, path, json_data, stream=False):
        s = self._get_session()
        if stream:
            return s.post(self._url(path), json=json_data, stream=True, timeout=300)
        return s.post(self._url(path), json=json_data, timeout=300)
    
    def _get(self, path):
        s = self._get_session()
        return s.get(self._url(path), timeout=10)
    
    def status(self):
        """Check API status"""
        try:
            r = self._get("/api/status")
            return r.json()
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    def models(self):
        """List available models"""
        try:
            r = self._get("/api/tags")
            data = r.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            return []
    
    def generate(self, prompt, model=None, **kwargs):
        """Generate text (Ollama native format)"""
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "prompt": prompt,
            "stream": False,
            **kwargs
        }
        r = self._post("/api/generate", data)
        return r.json()
    
    def generate_stream(self, prompt, model=None, **kwargs):
        """Stream generate text (Yields chunks)"""
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "prompt": prompt,
            "stream": True,
            **kwargs
        }
        r = self._post("/api/generate", data, stream=True)
        for line in r.iter_lines():
            if line:
                try:
                    yield json.loads(line.decode("utf-8"))
                except:
                    pass
    
    def chat(self, messages, model=None, tools=None, **kwargs):
        """Chat completion (Ollama native format)"""
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "messages": messages,
            "stream": False,
            **kwargs
        }
        if tools:
            data["tools"] = tools
        
        r = self._post("/api/chat", data)
        return r.json()
    
    def chat_stream(self, messages, model=None, **kwargs):
        """Stream chat (Yields content chunks)"""
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "messages": messages,
            "stream": True,
            **kwargs
        }
        r = self._post("/api/chat", data, stream=True)
        for line in r.iter_lines():
            if line:
                try:
                    chunk = json.loads(line.decode("utf-8"))
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
                except:
                    pass
    
    def complete(self, prompt, model=None, max_tokens=16, **kwargs):
        """OpenAI-compatible text completion"""
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "prompt": prompt,
            "max_tokens": max_tokens,
            "stream": False,
            **kwargs
        }
        r = self._post("/v1/completions", data)
        return r.json()
    
    def complete_stream(self, prompt, model=None, max_tokens=256, **kwargs):
        """Stream text completion (Yields text chunks)"""
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "prompt": prompt,
            "max_tokens": max_tokens,
            "stream": True,
            **kwargs
        }
        r = self._post("/v1/completions", data, stream=True)
        for line in r.iter_lines():
            if line:
                try:
                    chunk = json.loads(line.decode("utf-8"))
                    text = chunk.get("choices", [{}])[0].get("text", "")
                    if text:
                        yield text
                except:
                    pass
    
    def chat_completion(self, messages, model=None, max_tokens=256, tools=None, **kwargs):
        """OpenAI-compatible chat completion"""
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": False,
            **kwargs
        }
        if tools:
            data["tools"] = tools
        
        r = self._post("/v1/chat/completions", data)
        return r.json()
    
    def chat_completion_stream(self, messages, model=None, max_tokens=256, **kwargs):
        """Stream OpenAI chat completion (Yields content chunks)"""
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": True,
            **kwargs
        }
        r = self._post("/v1/chat/completions", data, stream=True)
        for line in r.iter_lines():
            if line:
                try:
                    chunk = json.loads(line.decode("utf-8"))
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield content
                except:
                    pass
    
    def embeddings(self, text, model=None):
        """Get text embeddings"""
        data = {
            "model": model or os.environ.get("DEFAULT_MODEL", "deepseek-r1:1.5b"),
            "input": text
        }
        r = self._post("/v1/embeddings", data)
        return r.json()
    
    def pull(self, name, stream=False):
        """Pull a model"""
        data = {"name": name, "stream": stream}
        if stream:
            return self._post("/api/pull", data, stream=True)
        r = self._post("/api/pull", data)
        return r.json()
    
    def delete(self, name):
        """Delete a model"""
        s = self._get_session()
        r = s.delete(self._url("/api/delete"), json={"name": name}, timeout=60)
        return r.json()
    
    def running(self):
        """List running models"""
        r = self._get("/api/ps")
        return r.json()
    
    def system_info(self):
        """Get system info"""
        r = self._get("/api/system")
        return r.json()


# Module-level convenience instance
_client = None

def get_client():
    """Get or create the global OllamaClient instance."""
    global _client
    if _client is None:
        _client = OllamaClient()
    return _client


# ============================================================
# Unix Domain Socket (UDS) Server
# For competition/internal use via requests_unixsocket
# ============================================================
import socket
import struct
import threading

SOCKET_PATH = os.environ.get("OLLAMA_SOCK", "/tmp/ollama.sock")

class UnixSocketServer:
    """Minimal WSGI-compatible Unix socket server for Flask"""
    
    def __init__(self, app, socket_path):
        self.app = app
        self.socket_path = socket_path
        self.server_socket = None
    
    def start(self):
        try:
            if os.path.exists(self.socket_path):
                if os.path.isdir(self.socket_path):
                    os.rmdir(self.socket_path)
                else:
                    os.unlink(self.socket_path)
        except:
            pass
        
        self.server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server_socket.bind(self.socket_path)
        self.server_socket.listen(5)
        os.chmod(self.socket_path, 0o666)
        print(f"[UDS] Listening: {self.socket_path}", flush=True)
        
        while True:
            try:
                client, _ = self.server_socket.accept()
                threading.Thread(target=self.handle_client, args=(client,), daemon=True).start()
            except Exception as e:
                if self.server_socket:
                    print(f"[UDS] Accept error: {e}", flush=True)
    
    def handle_client(self, client):
        try:
            raw = b""
            while b"\r\n\r\n" not in raw:
                chunk = client.recv(4096)
                if not chunk:
                    client.close()
                    return
                raw += chunk
            
            header_end = raw.index(b"\r\n\r\n")
            header_text = raw[:header_end].decode("utf-8")
            lines = header_text.split("\r\n")
            parts = lines[0].split(" ")
            method = parts[0]
            path = parts[1] if len(parts) > 1 else "/"
            
            headers = {}
            content_length = 0
            for line in lines[1:]:
                if ":" in line:
                    k, v = line.split(":", 1)
                    headers[k.strip().lower()] = v.strip()
                    if k.strip().lower() == "content-length":
                        content_length = int(v.strip())
            
            body_start = header_end + 4
            body = raw[body_start:]
            
            while len(body) < content_length:
                chunk = client.recv(4096)
                if not chunk:
                    break
                body += chunk
            
            body = body[:content_length]
            
            # Build Flask-like environ
            environ = {
                "REQUEST_METHOD": method,
                "PATH_INFO": path,
                "QUERY_STRING": "",
                "SERVER_NAME": "localhost",
                "SERVER_PORT": "0",
                "CONTENT_TYPE": headers.get("content-type", ""),
                "CONTENT_LENGTH": str(content_length),
                "wsgi.input": io.BytesIO(body),
                "wsgi.errors": io.BytesIO(),
                "wsgi.url_scheme": "http",
                "wsgi.multithread": True,
                "wsgi.multiprocess": False,
                "wsgi.run_once": False,
                "HTTP_HOST": headers.get("host", "localhost"),
            }
            for k, v in headers.items():
                environ[f"HTTP_{k.upper().replace('-', '_')}"] = v
            
            # Run Flask app
            response_started = []
            response_headers = []
            
            def start_response(status, headers_list, exc_info=None):
                response_started.append(status)
                response_headers.extend(headers_list)
            
            result = self.app(environ, start_response)
            
            status = response_started[0] if response_started else "500 Internal Server Error"
            status_code = int(status.split(" ")[0])
            
            resp_headers = []
            for k, v in response_headers:
                resp_headers.append(f"{k}: {v}")
            
            response_line = f"HTTP/1.1 {status}\r\n"
            header_block = "\r\n".join(resp_headers) + "\r\n\r\n"
            
            client.sendall((response_line + header_block).encode("utf-8"))
            
            for chunk in result:
                if isinstance(chunk, str):
                    chunk = chunk.encode("utf-8")
                client.sendall(chunk)
            
            client.close()
        except Exception as e:
            print(f"[UDS] Handle error: {e}", flush=True)
            try:
                client.sendall(b"HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\n\r\n{\"error\":\"internal\"}")
                client.close()
            except:
                pass


if __name__ == "__main__":
    # Start UDS server in background thread
    uds = UnixSocketServer(app, SOCKET_PATH)
    uds_thread = threading.Thread(target=uds.start, daemon=True)
    uds_thread.start()
    
    # Start HTTP server on port 5000
    print("[HTTP] Listening: 0.0.0.0:5000", flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
