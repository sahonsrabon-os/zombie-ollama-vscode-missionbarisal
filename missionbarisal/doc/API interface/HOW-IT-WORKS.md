# Mission Barisal — How It Works

## A Friendly Guide (No Scary Reports)

This document explains how Mission Barisal works in plain language.
No technical jargon, no intimidation. Just clear explanations.

---

## What is Mission Barisal?

Mission Barisal is a team of AI agents that help you with coding.
Think of it as having 6 expert friends who are always ready to help.

### The Team

| Name | What They Do |
|------|--------------|
| **মনু (Monu)** | Code review, design patterns, best practices |
| **জুয়েল (Jewel)** | Finding and fixing bugs |
| **বৃষ্টি (Bristi)** | Security checks, finding vulnerabilities |
| **রাশেদ (Rashed)** | Making code faster |
| **হালিম (Halim)** | Writing documentation |
| **মজনু (Mojnu)** | Testing, quality checks |

---

## How to Use It

### Step 1: Start the Server

```bash
cd /home/sahon/Desktop/api
PORT=5000 node hamba.js
```

### Step 2: Open Your Browser

Go to `http://localhost:8080`

### Step 3: Start Chatting

Type your question and press Enter.

That's it! No complicated setup needed.

---

## What Happens Behind the Scenes

### When You Type a Message

```
1. You type: "এই কোডটি রিভিউ করো"
2. Server receives your message
3. Server decides which agents to ask
4. Agents read your project files (SSOT)
5. Agents check their knowledge (Syllabus)
6. Agents remember past conversations (Memory)
7. Agents discuss among themselves
8. Agents give you the best answer
```

### The Agent Selection Process

```
Simple question → 1-2 agents (quick answer)
Code review → Code Guru + QA Tyrant
Security issue → Security Hero
Bug fix → Bug Hunter
Complex task → All 9 agents (full debate)
```

---

## What the Agents Know

### Your Project (SSOT)

The agents automatically learn about your project:
- What files you have
- What language you use
- What framework you're using
- What dependencies you have

This happens when you first connect. No manual setup needed.

### Your History (Memory)

The agents remember:
- What you talked about before
- What problems you had
- What solutions worked

This helps them give better answers over time.

### What They've Learned (Syllabus)

The agents keep track of:
- Common issues in your project
- Your coding patterns
- Best practices for your stack
- Things that worked before

---

## How Agents Talk to Each Other

### Direct Response

For simple questions, one agent answers directly.

### Collaboration

For complex tasks, agents work together:

```
You: "এই কোডটি রিভিউ করো"

Code Guru: "Let me check the code..."
Code Guru: "Security Hero, check for vulnerabilities"
Security Hero: "Found SQL injection at line 45"
Code Guru: "Performance Wizard, optimize this"
Performance Wizard: "Add index to database query"
Code Guru: [Combines all feedback and responds to you]
```

---

## What Tools Agents Can Use

Agents can:
- **Read your files** — To understand your code
- **Write files** — To create or modify code
- **Search the web** — To find current information
- **List directories** — To see project structure
- **Open browsers** — To test web pages

---

## Common Questions

### "Will it work with my VS Code?"

Yes! Mission Barisal works with VS Code through MCP.
Just configure the MCP settings and it connects automatically.

### "Does it work with Bengali?"

Yes! The agents respond in Bengali and preserve all Bengali characters.
Even complex conjunct characters work correctly.

### "What if it doesn't know something?"

The agent will honestly say "I don't know" and suggest alternatives.
It never makes up information.

### "Is my code safe?"

Yes! The agents only read your files when you ask them to.
They don't send your code anywhere without permission.

### "Can I use it offline?"

The server runs locally on your machine.
Your code never leaves your computer.

---

## How to Build Your Own Chat App

### Simple Version

```html
<!DOCTYPE html>
<html>
<body>
  <input type="text" id="input" placeholder="Type here">
  <button onclick="send()">Send</button>
  <div id="response"></div>

  <script>
    async function send() {
      const input = document.getElementById('input').value;
      const response = await fetch('http://localhost:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mission',
          messages: [{ role: 'user', content: input }]
        })
      });
      const data = await response.json();
      document.getElementById('response').textContent = 
        data.choices[0].message.content;
    }
  </script>
</body>
</html>
```

### With Streaming

```javascript
async function streamChat(message) {
  const response = await fetch('http://localhost:8080/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mission',
      messages: [{ role: 'user', content: message }],
      stream: true
    })
  });

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Process streaming chunks
  }
}
```

---

## What Makes Mission Barisal Different

### 1. Honest Agents

Agents admit when they don't know something.
They never fabricate information.

### 2. Bengali First

All agents respond in Bengali.
Bengali text is preserved perfectly.

### 3. Project Aware

Agents know your project structure.
They read your files and understand your code.

### 4. Collaborative

Agents work together on complex tasks.
They call each other for specialist help.

### 5. Transparent

You can see what agents are thinking.
You know which agent is responding.

### 6. Safe

Your code stays on your machine.
No data is sent to external servers.

---

## Getting Help

### Check Server Status

```bash
curl http://localhost:8080/health
```

### View Available Agents

```bash
curl http://localhost:8080/v1/models
```

### Check Configuration

```bash
curl http://localhost:8080/api/config
```

---

## Summary

Mission Barisal is a friendly team of AI agents that help you code.
It works with your existing tools (VS Code, etc.).
It understands Bengali perfectly.
It knows your project context.
It's honest and transparent.

Just start chatting and let the agents help!
