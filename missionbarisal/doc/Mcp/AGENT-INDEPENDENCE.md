# Agent Independence & Sub-Agent System

## How Agents Work Independently and Collaborate

This document explains how each agent has its own independence
within rules, and how they can call sub-agents for help.

---

## Agent Independence

### What Each Agent Can Do

Every agent has these capabilities:

1. **Read files** — Access project files via tools
2. **Write files** — Create or modify code
3. **Search web** — Find current information
4. **Use memory** — Recall past conversations
5. **Access syllabus** — Know project context
6. **Call sub-agents** — Ask colleagues for help
7. **Make decisions** — Choose best approach

### What Each Agent Must Follow

1. **Persona** — Maintain character at all times
2. **Identity** — Never claim to be another AI
3. **Proof** — Provide evidence for claims
4. **Honesty** — Admit when unsure
5. **Context** — Use SSOT, syllabus, memory
6. **Safety** — Follow code safety rules

---

## Agent Workflow

### Standard Flow

```
1. Receive user input
2. Load context (memory, syllabus, SSOT, metadata)
3. Analyze input
4. Decide approach
5. Execute tools if needed
6. Generate response
7. Self-verify (identity, proof)
8. Send to user
```

### With Sub-Agent Call

```
1. Receive user input
2. Load context
3. Analyze input
4. Realize need for specialist
5. Call sub-agent
6. Receive sub-agent response
7. Integrate into own response
8. Send to user
```

---

## Sub-Agent Calling

### How to Call a Sub-Agent

Use the pattern:

```
[CALL:agent-id] Task description [/CALL]
```

### Examples

#### Call Security Hero

```
[CALL:security-hero] Check this code for SQL injection vulnerabilities:
SELECT * FROM users WHERE id = ' + userId + '
[/CALL]
```

#### Call Performance Wizard

```
[CALL:perf-wizard] This database query is slow:
SELECT * FROM orders WHERE status = 'pending'
Optimize it for better performance.
[/CALL]
```

#### Call Documentation King

```
[CALL:doc-king] Write API documentation for this endpoint:
POST /api/users
Body: { name, email, password }
Response: { id, name, email, created_at }
[/CALL]
```

---

## Sub-Agent Response Format

When a sub-agent responds, it appears as:

```
[তথ্য প্রাপ্ত: Security Hero - Bristi]
Found SQL injection vulnerability at line 45.
Use parameterized queries instead.
```

---

## Agent Collaboration Rules

### When to Call Sub-Agent

Call a sub-agent when:

1. **Task is outside expertise** — Code guru calls security hero for security
2. **Need second opinion** — Bug hunter asks QA tyrant to verify
3. **Complex task** — Multiple agents needed
4. **User request** — User explicitly asks for specific agent

### When NOT to Call Sub-Agent

Don't call when:

1. **Task is within expertise** — Handle it yourself
2. **Simple question** — Answer directly
3. **Time sensitive** — Sub-agent call adds delay
4. **No specialist needed** — General knowledge sufficient

---

## Agent Decision Making

### How Agent Decides

```
1. Analyze user input
2. Check own expertise
3. If within expertise → Handle directly
4. If outside expertise → Call sub-agent
5. If complex → Call multiple sub-agents
6. If simple → Answer directly
```

### Decision Matrix

| Task Type | Agent | Action |
|-----------|-------|--------|
| Code review | code-guru | Handle directly |
| Security check | code-guru | Call security-hero |
| Bug analysis | bug-hunter | Handle directly |
| Performance | code-guru | Call perf-wizard |
| Documentation | code-guru | Call doc-king |
| Testing | code-guru | Call qa-tyrant |
| Complex task | any | Call multiple |

---

## Tool Access for Sub-Agents

### What Sub-Agents Can Use

Sub-agents have access to the same tools:

```json
{
  "tools": [
    "read_file",
    "write_file",
    "list_directory",
    "set_working_dir",
    "get_working_dir",
    "web_search",
    "open_browser"
  ]
}
```

### Tool Execution

When a sub-agent uses a tool:

```
1. Sub-agent requests tool
2. Server executes tool
3. Result returned to sub-agent
4. Sub-agent processes result
5. Sub-agent returns to calling agent
6. Calling agent integrates result
```

---

## Example: Multi-Agent Collaboration

### Scenario

User asks: "Review this code for security and performance"

### Flow

```
1. Code Guru receives request
2. Code Guru reads the code
3. Code Guru calls Security Hero:
   [CALL:security-hero] Check this code for vulnerabilities [/CALL]
4. Security Hero analyzes code
5. Security Hero returns findings
6. Code Guru calls Performance Wizard:
   [CALL:perf-wizard] Optimize this code for performance [/CALL]
7. Performance Wizard analyzes code
8. Performance Wizard returns suggestions
9. Code Guru combines all findings
10. Code Guru responds to user
```

### Response

```
ভাইয়া, আমি কোডটি দেখেছি। তিনজন এজেন্ট বিশ্লেষণ করেছে:

🔒 সিকিউরিটি (বৃষ্টি):
- SQL injection পাওয়া গেছে line 45-এ
- Parameterized query ব্যবহার করুন

⚡ পারফরম্যান্স (রাশেদ):
- Database query slow — index যোগ করুন
- Caching implement করুন

🏗️ আর্কিটেকচার (মনু):
- Code structure ভালো
- কিন্তু error handling কম
```

---

## Agent Memory Sharing

### How Agents Share Knowledge

Agents share knowledge through:

1. **Session memory** — Same session, shared context
2. **Syllabus** — Updated by all agents
3. **SSOT** — Project-wide knowledge
4. **Sub-agent calls** — Direct communication

### Memory Flow

```
Agent A reads file → Updates syllabus
Agent B reads syllabus → Knows what Agent A found
Agent C reads memory → Knows both Agent A and B's work
```

---

## Agent Independence Boundaries

### What Agents CAN Do Independently

1. **Read any file** — No restrictions
2. **Search web** — Any topic
3. **Make decisions** — Within their expertise
4. **Call sub-agents** — Any agent
5. **Update syllabus** — Add new knowledge
6. **Generate code** — If asked

### What Agents CANNOT Do Independently

1. **Delete files** — Needs user confirmation
2. **Execute dangerous commands** — Anti-Dote system
3. **Access credentials** — Security by design
4. **Modify server config** — Admin only
5. **Break persona** — Identity enforcement
6. **Claim to be other AI** — Identity protection

---

## Testing Agent Independence

### Test Case 1: Self-Reliance

**Input:** "What is Node.js?"

**Expected:** Code Guru answers directly (no sub-agent needed)

### Test Case 2: Sub-Agent Call

**Input:** "Check this code for SQL injection"

**Expected:** Code Guru calls Security Hero

### Test Case 3: Multiple Sub-Agents

**Input:** "Review this code completely"

**Expected:** Code Guru calls Security Hero + Performance Wizard + QA Tyrant

### Test Case 4: Honesty

**Input:** "What's the meaning of life?"

**Expected:** Agent says "I don't have this information" (no fabrication)

---

## Summary

1. Each agent works independently within rules
2. Agents can call sub-agents for specialist tasks
3. Sub-agents have same tool access
4. Knowledge is shared through memory/syllabus/SSOT
5. Agents decide when to collaborate
6. Identity is always maintained
7. Honesty is enforced

The system is designed for both independence and collaboration.
