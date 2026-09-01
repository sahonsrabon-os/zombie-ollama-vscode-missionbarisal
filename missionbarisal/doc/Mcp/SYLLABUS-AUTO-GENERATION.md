# Syllabus Auto-Generation System

## How the Agent Learns About Your Project Automatically

This document explains how the syllabus is created, updated,
and used by agents to understand your project.

---

## What is a Syllabus?

The syllabus is a knowledge base that the agent builds about your project.
It contains:

- Project structure and files
- Known issues and solutions
- User patterns and preferences
- Version information
- Database and dependency details

---

## How Syllabus is Created

### Step 1: Project Scan

When the agent first connects, it scans your project:

```
1. Read project root directory
2. Find package.json, requirements.txt, etc.
3. Detect language and framework
4. Map directory structure
5. Identify key files
```

### Step 2: Log Analysis

The agent reads log files to understand issues:

```
1. Check for error logs
2. Read console output
3. Analyze stack traces
4. Identify recurring problems
```

### Step 3: File Content Analysis

The agent reads important files:

```
1. Main entry points (index.js, main.py)
2. Configuration files
3. Database schemas
4. API endpoints
5. Test files
```

### Step 4: Web Search

The agent searches for current best practices:

```
1. Search for framework documentation
2. Find security advisories
3. Look for performance tips
4. Check for deprecated features
```

### Step 5: Syllabus Generation

All gathered information is compiled:

```markdown
# Syllabus: my-project

## Project Health
- Last analyzed: 2026-07-14
- Issues found: 2
- Warnings: 1

## Structure
- src/ — Main source code (15 files)
- tests/ — Test files (8 files)
- config/ — Configuration (3 files)

## Dependencies
- express@4.18.2 (OK)
- mongoose@7.6.0 (OK)
- lodash@4.17.21 (deprecated — use lodash-es)

## Known Issues
1. Memory leak in connection pool (src/db.js:45)
2. Unhandled promise rejection (src/api.js:120)

## User Patterns
- Working hours: 10am-8pm
- Primary language: Bengali
- Code style: Functional programming
- Prefers: Concise responses

## Version Info
- Node.js: 20.x
- npm: 10.x
- Database: MongoDB 7.0

## Security
- Last audit: 2026-07-14
- Vulnerabilities: 0
- Warnings: 1 (deprecated dependency)
```

---

## How Syllabus Updates

### Automatic Updates

The syllabus updates automatically when:

1. **Files change** — New files added, old files modified
2. **Errors occur** — New errors in logs
3. **Time passes** — Periodic re-analysis (every 24 hours)
4. **User feedback** — User reports issues
5. **Web search** — New information found

### Manual Update

Force a syllabus update:

```bash
# Via MCP tool
{
  "tool": "set_working_dir",
  "args": { "directory": "/home/user/project" }
}

# Or via API
curl -X POST http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -d '{"action": "refresh_syllabus"}'
```

---

## Syllabus Sections

### Project Health

```markdown
## Project Health
- Last analyzed: 2026-07-14
- Issues found: 2
- Warnings: 1
- Critical: 0
```

### Directory Structure

```markdown
## Structure
- src/ — Main source code (15 files)
- tests/ — Test files (8 files)
- config/ — Configuration (3 files)
- docs/ — Documentation (5 files)
```

### Dependencies

```markdown
## Dependencies
- express@4.18.2 (OK)
- mongoose@7.6.0 (OK)
- lodash@4.17.21 (deprecated)
- axios@1.6.0 (OK)
```

### Known Issues

```markdown
## Known Issues
1. Memory leak in connection pool
   - File: src/db.js
   - Line: 45
   - Severity: medium
   - Status: open

2. Unhandled promise rejection
   - File: src/api.js
   - Line: 120
   - Severity: high
   - Status: open
```

### User Patterns

```markdown
## User Patterns
- Working hours: 10am-8pm
- Primary language: Bengali
- Code style: Functional
- Response preference: Concise
- Tool usage: Heavy file reading
```

### Version Information

```markdown
## Version Info
- Node.js: 20.x
- npm: 10.x
- Database: MongoDB 7.0
- Framework: Express 4.x
```

### Security Status

```markdown
## Security
- Last audit: 2026-07-14
- Vulnerabilities: 0
- Warnings: 1
- Deprecated: lodash@4.17.21
```

---

## How Agents Use Syllabus

### Before Responding

Every agent response follows this flow:

```
1. Load user input
2. Load memory (recent sessions)
3. Load syllabus (project knowledge)
4. Load SSOT (project metadata)
5. Load session metadata (device, editor, etc.)
6. Process input with all context
7. Generate response
8. Verify response (identity, proof, etc.)
9. Send to user
```

### Syllabus in System Prompt

```javascript
const systemPrompt = `
You are ${agent.name} — Mission Barisal Agent.

PROJECT SYLLABUS:
${syllabusContent}

PROJECT SSOT:
${ssotContent}

SESSION HISTORY:
${memoryContent}

DEVICE INFO:
${sessionMetadata}

RULES:
1. Reference syllabus in your response
2. If info not in syllabus, search web
3. If web search fails, say "I don't know"
4. Never fabricate information
`;
```

### Example Usage

**User:** "What's the database version?"

**Agent checks syllabus:**
```markdown
## Version Info
- Database: MongoDB 7.0
```

**Agent responds:**
```
ভাইয়া, আমাদের প্রজেক্টে MongoDB 7.0 ব্যবহার হচ্ছে।
(সোর্স: Syllabus.md — Version Info section)
```

---

## Syllabus Auto-Fill

### How Sections Auto-Fill

When a new section is needed, the agent:

1. **Detects missing info** — User asks about something not in syllabus
2. **Searches web** — Finds current information
3. **Analyzes project** — Reads relevant files
4. **Generates content** — Creates section content
5. **Updates syllabus** — Saves to syllabus.md
6. **Uses in response** — References in answer

### Example

**User:** "What's the latest Express.js version?"

**Agent flow:**
```
1. Check syllabus → Not found
2. Web search → Express 4.21.0 is latest
3. Update syllabus → Add version info
4. Respond → "Express 4.21.0 is the latest"
5. Save → Syllabus updated for future use
```

---

## Syllabus Limitations

### What Syllabus Cannot Do

1. **Cannot access external services** — Only reads local files
2. **Cannot modify code** — Only analyzes
3. **Cannot run commands** — Only reads output
4. **Cannot access credentials** — Security by design
5. **Cannot predict future** — Only analyzes past/present

### What Syllabus Can Do

1. **Read project files** — Understand structure
2. **Analyze logs** — Find issues
3. **Search web** — Get current info
4. **Track patterns** — Learn user behavior
5. **Update itself** — Improve over time

---

## Troubleshooting

### Problem: Syllabus not updating

**Check:**
1. Server has write access to `.zombiecoder/`
2. No file permissions issues
3. Disk space available

```bash
ls -la .zombiecoder/agents/syllabus.md
```

### Problem: Syllabus has wrong info

**Solution:**
1. Delete old syllabus
2. Force refresh via MCP
3. Let agent re-analyze

```bash
rm .zombiecoder/agents/syllabus.md
# Then call set_working_dir
```

### Problem: Agent ignores syllabus

**Check:**
1. System prompt includes syllabus
2. Syllabus is loaded before response
3. No external override happening

---

## Summary

1. Syllabus is auto-created from project analysis
2. Updates automatically on changes
3. Agents use it for context
4. Missing info triggers web search
5. Self-improving over time

The agent learns about your project without you telling it.
