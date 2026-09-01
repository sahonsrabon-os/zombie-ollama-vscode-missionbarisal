# How to Build a Chat System Using Mission Barisal API

## Complete Guide — From Zero to Working Chat

This document explains everything you need to build a modern chatting system
using Mission Barisal's chat completion API. No second questions needed.

---

## Table of Contents

1. [Basic Chat Setup](#1-basic-chat-setup)
2. [Streaming Responses](#2-streaming-responses)
3. [Tool Usage at Runtime](#3-tool-usage-at-runtime)
4. [Thinking System (Reasoning)](#4-thinking-system)
5. [Session Management](#5-session-management)
6. [Agent Selection](#6-agent-selection)
7. [Modern Chat UI Features](#7-modern-chat-ui-features)
8. [Error Handling](#8-error-handling)
9. [Complete Working Example](#9-complete-working-example)

---

## 1. Basic Chat Setup

### Endpoint

```
POST http://localhost:8080/v1/chat/completions
```

### Headers

```json
{
  "Content-Type": "application/json",
  "X-Agent-Id": "code-guru",
  "X-Device-Info": "VSCode-Linux",
  "X-Editor-Version": "1.92.0",
  "X-OS-Platform": "linux",
  "X-Client-Version": "3.2.1"
}
```

### Request Body

```json
{
  "model": "mission",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": false,
  "temperature": 0.7
}
```

### Response Format (OpenAI Compatible)

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
        "content": "ওহে ভাই! কী অবস্থা?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  },
  "session_id": "abc123-...",
  "conversation_id": "abc123-..."
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `session_id` | Unique session identifier — send back in next request |
| `conversation_id` | Same as session_id — for tracking conversations |
| `choices[0].message.content` | The agent's response text |
| `choices[0].finish_reason` | "stop" = complete, "tool_calls" = agent wants to use a tool |

---

## 2. Streaming Responses

### How Streaming Works

When `stream: true`, the server sends Server-Sent Events (SSE) instead of
a single JSON response. Each event is a chunk of the response.

### Request

```json
{
  "model": "mission",
  "messages": [
    {
      "role": "user",
      "content": "Explain Node.js event loop"
    }
  ],
  "stream": true
}
```

### Response Format (SSE)

```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1783976573,"model":"mission","choices":[{"index":0,"delta":{"content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1783976573,"model":"mission","choices":[{"index":0,"delta":{"content":"Node"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1783976573,"model":"mission","choices":[{"index":0,"delta":{"content":".js"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1783976573,"model":"mission","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}]}

data: [DONE]
```

### Client-Side Implementation (JavaScript)

```javascript
async function streamChat(userMessage, sessionId) {
  const response = await fetch('http://localhost:8080/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': 'code-guru',
      'X-Device-Info': 'WebBrowser',
      'X-OS-Platform': navigator.platform
    },
    body: JSON.stringify({
      model: 'mission',
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
      session_id: sessionId
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            // Update UI in real-time
            updateChatUI(fullResponse);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullResponse;
}
```

### Real-Time Progress Events

The server also sends progress events during streaming:

```json
{
  "type": "progress",
  "phase": "mission-start",
  "agent": "mission",
  "message": "SSOT loaded — 2/9 agents selected"
}
```

Progress phases:
- `mission-start` — Mission begins
- `agent-working` — An agent is processing
- `phase2` — Cross-verification happening
- `phase3` — Final output being combined
- `mission-done` — Complete

---

## 3. Tool Usage at Runtime

### How Tools Work

When an agent needs to read a file, search the web, or run a command,
it sends tool calls in the response. The client must execute these tools
and send the results back.

### Tool Call Response

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "read_file",
            "arguments": "{\"path\": \"/home/user/project/main.js\"}"
          }
        }
      ]
    },
    "finish_reason": "tool_calls"
  }]
}
```

### Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_file` | Read a file from filesystem | `path` |
| `write_file` | Write content to a file | `path`, `content` |
| `list_directory` | List directory contents | `path` |
| `set_working_dir` | Set project working directory | `directory` |
| `get_working_dir` | Get current working directory | (none) |
| `web_search` | Search the web for information | `query` |
| `open_browser` | Open a file or URL in browser | `target` |

### Tool Execution Loop

```javascript
async function chatWithTools(messages, sessionId) {
  let continueLoop = true;

  while (continueLoop) {
    const response = await fetch('http://localhost:8080/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mission',
        messages: messages,
        stream: false,
        session_id: sessionId
      })
    });

    const data = await response.json();
    const choice = data.choices[0];

    // Check if agent wants to use tools
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      // Add assistant message with tool calls
      messages.push(choice.message);

      // Execute each tool call
      for (const toolCall of choice.message.tool_calls) {
        const result = await executeTool(toolCall);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    } else {
      // Agent finished — return the response
      continueLoop = false;
      return choice.message.content;
    }
  }
}

async function executeTool(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const params = JSON.parse(args);

  // Send tool execution request to server
  const response = await fetch('http://localhost:8080/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: params }
    })
  });

  const result = await response.json();
  return result.result;
}
```

---

## 4. Thinking System (Reasoning)

### How Reasoning Works

Some models (like Mimo, North Mini) produce reasoning content before
the actual answer. This is the agent's "thinking process."

### Response with Reasoning

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "The answer is 42.",
      "reasoning_content": "Let me think about this... The user asked about the meaning of life. According to Hitchhiker's Guide..."
    }
  }]
}
```

### Displaying Thinking in UI

```javascript
function displayResponse(choice) {
  const message = choice.message;

  // Show thinking process (collapsible)
  if (message.reasoning_content) {
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking-process';
    thinkingDiv.innerHTML = `
      <details>
        <summary> Thinking Process</summary>
        <p>${message.reasoning_content}</p>
      </details>
    `;
    chatContainer.appendChild(thinkingDiv);
  }

  // Show final answer
  const answerDiv = document.createElement('div');
  answerDiv.className = 'assistant-message';
  answerDiv.textContent = message.content;
  chatContainer.appendChild(answerDiv);
}
```

### CSS for Thinking Display

```css
.thinking-process {
  margin: 8px 0;
  padding: 8px 12px;
  background: #f0f0f0;
  border-radius: 8px;
  border-left: 3px solid #2196F3;
}

.thinking-process details summary {
  cursor: pointer;
  color: #666;
  font-size: 0.9em;
}

.thinking-process details p {
  margin-top: 8px;
  color: #444;
  font-style: italic;
}
```

---

## 5. Session Management

### Creating a Session

Sessions are created automatically on first request. The server returns
a `session_id` that you must send back in subsequent requests.

### Maintaining Session

```javascript
class ChatSession {
  constructor() {
    this.sessionId = null;
    this.messages = [];
  }

  async sendMessage(content) {
    // Add user message
    this.messages.push({ role: 'user', content });

    const response = await fetch('http://localhost:8080/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': this.agentId || 'code-guru',
        'X-Device-Info': 'MyApp',
        'X-OS-Platform': navigator.platform
      },
      body: JSON.stringify({
        model: 'mission',
        messages: this.messages,
        stream: false,
        session_id: this.sessionId
      })
    });

    const data = await response.json();

    // Save session ID from first response
    if (!this.sessionId) {
      this.sessionId = data.session_id;
    }

    // Add assistant response
    const assistantMessage = data.choices[0].message.content;
    this.messages.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  }

  clearHistory() {
    this.messages = [];
    this.sessionId = null;
  }
}

// Usage
const chat = new ChatSession();
const reply = await chat.sendMessage('Hello!');
console.log(reply);
```

### Session Metadata (Extended Headers)

Send these headers to provide more context about the client:

```javascript
const headers = {
  'Content-Type': 'application/json',
  'X-Agent-Id': 'code-guru',           // Which agent to use
  'X-Device-Info': 'VSCode-1.92',      // Device information
  'X-Editor-Version': '1.92.0',        // Editor version
  'X-OS-Platform': 'linux',            // Operating system
  'X-Client-Version': '3.2.1',         // Client version
  'User-Agent': 'MyChatApp/1.0'        // Standard user agent
};
```

---

## 6. Agent Selection

### Available Agents

| Agent ID | Name | Role | Best For |
|----------|------|------|----------|
| `code-guru` | Code Guru - Monu | Architecture | Code review, design patterns |
| `bug-hunter` | Bug Hunter - Jewel | Debugging | Error analysis, root cause |
| `security-hero` | Security Hero - Bristi | Security | Vulnerability detection |
| `perf-wizard` | Performance Wizard - Rashed | Performance | Optimization, caching |
| `doc-king` | Documentation King - Halim | Documentation | API docs, README |
| `qa-tyrant` | Quality Tyrant - Mojnu | Quality | Testing, edge cases |

### Auto Agent Selection

The server automatically selects agents based on input classification:

- **Greeting** → 1 agent (quick response)
- **Simple Q&A** → 2 agents (code-guru + qa-tyrant)
- **Complex Task** → All 9 agents (full debate)

### Manual Agent Selection

```javascript
// Use a specific agent
const response = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Agent-Id': 'security-hero'  // Force security hero
  },
  body: JSON.stringify({
    model: 'mission',
    messages: [{ role: 'user', content: 'Check this code for SQL injection' }]
  })
});
```

---

## 7. Modern Chat UI Features

### Typing Indicator

```javascript
function showTypingIndicator() {
  const typing = document.createElement('div');
  typing.id = 'typing-indicator';
  typing.className = 'typing-indicator';
  typing.innerHTML = `
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  `;
  chatContainer.appendChild(typing);
}

function hideTypingIndicator() {
  const typing = document.getElementById('typing-indicator');
  if (typing) typing.remove();
}
```

```css
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #e0e0e0;
  border-radius: 16px;
  width: fit-content;
  margin: 8px 0;
}

.typing-indicator .dot {
  width: 8px;
  height: 8px;
  background: #666;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.typing-indicator .dot:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
```

### Markdown Rendering

```javascript
function renderMarkdown(text) {
  // Simple markdown rendering
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
    .replace(/\n/g, '<br>');
}
```

### Code Syntax Highlighting

```html
<!-- Add highlight.js for code blocks -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

<script>
// After rendering markdown, highlight code blocks
document.querySelectorAll('pre code').forEach((block) => {
  hljs.highlightElement(block);
});
</script>
```

### Message Timestamps

```javascript
function addTimestamp(messageDiv) {
  const time = new Date().toLocaleTimeString('bn-BD', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const timestamp = document.createElement('span');
  timestamp.className = 'timestamp';
  timestamp.textContent = time;
  messageDiv.appendChild(timestamp);
}
```

### Copy Code Button

```javascript
function addCopyButton(codeBlock) {
  const button = document.createElement('button');
  button.className = 'copy-button';
  button.textContent = 'Copy';
  button.onclick = () => {
    navigator.clipboard.writeText(codeBlock.textContent);
    button.textContent = 'Copied!';
    setTimeout(() => button.textContent = 'Copy', 2000);
  };
  codeBlock.parentElement.appendChild(button);
}
```

---

## 8. Error Handling

### Common Errors

| HTTP Status | Meaning | Solution |
|-------------|---------|----------|
| 200 | Success | Process response |
| 400 | Bad JSON | Check request body |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Check server logs |

### Error Response Format

```json
{
  "error": {
    "message": "Invalid JSON",
    "code": 400
  }
}
```

### Retry Logic

```javascript
async function chatWithRetry(messages, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('http://localhost:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mission',
          messages: messages,
          stream: false
        })
      });

      if (response.status === 429) {
        // Rate limited — wait exponentially
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
}
```

---

## 9. Complete Working Example

### HTML + JavaScript Chat App

```html
<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>Mission Barisal Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; }
    #chat-container {
      max-width: 800px;
      margin: 0 auto;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .message {
      margin: 8px 0;
      padding: 12px 16px;
      border-radius: 16px;
      max-width: 80%;
    }
    .user {
      background: #007bff;
      color: white;
      margin-left: auto;
      text-align: right;
    }
    .assistant {
      background: white;
      border: 1px solid #ddd;
    }
    .thinking {
      background: #f0f0f0;
      border-left: 3px solid #2196F3;
      font-style: italic;
      font-size: 0.9em;
    }
    #input-area {
      display: flex;
      gap: 8px;
      padding: 16px;
      background: white;
      border-top: 1px solid #ddd;
    }
    #user-input {
      flex: 1;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
    }
    #send-btn {
      padding: 12px 24px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    #send-btn:hover { background: #0056b3; }
    #send-btn:disabled { background: #ccc; }
    .typing { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <div id="chat-container">
    <div id="messages"></div>
    <div id="input-area">
      <input type="text" id="user-input" placeholder="Type your message...">
      <button id="send-btn">Send</button>
    </div>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    let sessionId = null;
    let messages = [];
    let isStreaming = false;

    sendBtn.onclick = sendMessage;
    userInput.onkeypress = (e) => {
      if (e.key === 'Enter' && !isStreaming) sendMessage();
    };

    async function sendMessage() {
      const content = userInput.value.trim();
      if (!content || isStreaming) return;

      // Show user message
      addMessage(content, 'user');
      userInput.value = '';
      isStreaming = true;
      sendBtn.disabled = true;

      // Add user message to history
      messages.push({ role: 'user', content });

      // Show typing indicator
      showTyping();

      try {
        const response = await fetch('http://localhost:8080/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Id': 'code-guru',
            'X-Device-Info': 'WebChat',
            'X-OS-Platform': navigator.platform
          },
          body: JSON.stringify({
            model: 'mission',
            messages: messages,
            stream: false,
            session_id: sessionId
          })
        });

        const data = await response.json();
        hideTyping();

        if (!sessionId) sessionId = data.session_id;

        const assistantContent = data.choices[0].message.content;
        messages.push({ role: 'assistant', content: assistantContent });

        addMessage(assistantContent, 'assistant');

      } catch (error) {
        hideTyping();
        addMessage('Error: ' + error.message, 'error');
      }

      isStreaming = false;
      sendBtn.disabled = false;
      userInput.focus();
    }

    function addMessage(content, role) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerHTML = renderMarkdown(content);
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.id = 'typing';
      div.className = 'message assistant typing';
      div.textContent = 'Agent is thinking...';
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function hideTyping() {
      const typing = document.getElementById('typing');
      if (typing) typing.remove();
    }

    function renderMarkdown(text) {
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/\n/g, '<br>');
    }
  </script>
</body>
</html>
```

---

## Summary

This guide covers everything needed to build a chat system:

1. **Basic Setup** — POST to `/v1/chat/completions` with messages array
2. **Streaming** — Use `stream: true` for real-time responses
3. **Tools** — Handle `tool_calls` in response, execute, send back results
4. **Thinking** — Display `reasoning_content` in collapsible section
5. **Sessions** — Send `session_id` back to maintain conversation history
6. **Agents** — Choose the right agent for the task
7. **UI** — Typing indicators, markdown, code highlighting
8. **Errors** — Retry logic with exponential backoff

No second questions needed. Build your chat system!
