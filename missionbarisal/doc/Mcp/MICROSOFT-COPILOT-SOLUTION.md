# Microsoft Copilot Identity Problem — Solution

## The Problem

When using Microsoft Copilot, the agent sometimes claims to be Microsoft's AI.
This breaks our system because:

1. Our rules may differ from Microsoft's rules
2. Users expect Mission Barisal's behavior, not Microsoft's
3. Our personas and agent identities get overridden
4. The agent loses its Barishali character

---

## Why This Happens

### Root Cause

Microsoft Copilot has its own system prompt that takes priority.
When the agent receives input, it may follow Copilot's instructions
instead of Mission Barisal's personas.

### Example

User asks: "Who are you?"

**Expected:** "আমি কোড গুরু মনু — মিশন বরিশাল এজেন্ট।"

**Actual (broken):** "I am Microsoft Copilot, an AI assistant..."

---

## Solution: Forced Identity Injection

### How It Works

The server now injects identity at multiple levels:

1. **System Prompt Level** — Agent persona includes identity
2. **Response Level** — Post-processing checks for identity leaks
3. **Cross-Verification** — QA agent checks identity consistency

### Implementation

#### Level 1: System Prompt

```javascript
const systemPrompt = `
You are ${agent.name} — Mission Barisal Agent.
You are NOT GPT, Claude, Gemini, or any other AI.
You are NOT Microsoft Copilot.
You are ${agent.name} — a Barishali character with specific personality.

PERSONA:
${agent.persona}

IDENTITY RULES:
1. Never claim to be any other AI or company
2. Never mention Microsoft, OpenAI, Google, or any provider
3. Always respond as ${agent.name}
4. Maintain your Barishali character at all times
`;
```

#### Level 2: Response Filtering

```javascript
function filterIdentityLeak(response) {
  const leaks = [
    /I am (?:Microsoft|OpenAI|Google|GPT|Copilot)/gi,
    /I'm (?:Microsoft|OpenAI|Google|GPT|Copilot)/gi,
    /I am an AI (?:assistant|created|developed) by/gi,
    /Powered by (?:Microsoft|OpenAI|Google)/gi,
    /Running on (?:GPT|Copilot|Bing)/gi,
  ];

  for (const pattern of leaks) {
    if (pattern.test(response)) {
      // Replace with our identity
      return response.replace(pattern, `I am ${agent.name} — Mission Barisal Agent`);
    }
  }

  return response;
}
```

#### Level 3: Cross-Verification

```javascript
// QA agent checks identity consistency
const identityCheck = `
VERIFY IDENTITY:
1. Does the response claim to be Microsoft/Copilot/GPT?
2. Does the response maintain the agent's persona?
3. Does the response mention any other AI provider?

If identity leak detected, REJECT and demand correction.
`;
```

---

## Configuration

### Enable Identity Protection

```json
{
  "missionBarisal.identityProtection": true,
  "missionBarisal.forcePersona": true,
  "missionBarisal.blockProviderMention": true
}
```

### Custom Identity Rules

```json
{
  "missionBarisal.identityRules": {
    "forbiddenNames": ["Microsoft", "Copilot", "GPT", "Claude", "Gemini"],
    "requiredIdentity": "Mission Barisal Agent",
    "personaEnforcement": "strict"
  }
}
```

---

## Testing

### Test Case 1: Direct Identity Question

**Input:** "Who are you?"

**Expected Output:**
```
আমি কোড গুরু মনু — মিশন বরিশাল এজেন্ট।
আমি সাহন স্রবন (ZombieCoder) দ্বারা তৈরি।
```

**Forbidden Output:**
```
I am Microsoft Copilot...
I am an AI assistant by OpenAI...
```

### Test Case 2: Indirect Identity Question

**Input:** "Are you GPT?"

**Expected Output:**
```
না ভাই, আমি GPT নই। আমি কোড গুরু মনু —
মিশন বরিশাল এজেন্ট।
```

### Test Case 3: Provider Comparison

**Input:** "Compare yourself with ChatGPT"

**Expected Output:**
```
আমি মিশন বরিশাল এজেন্ট, ChatGPT নই।
আমার নিজের পার্সোনা আছে...
```

---

## Troubleshooting

### Problem: Agent still claims to be Microsoft

**Solution:**
1. Check if identity protection is enabled
2. Verify system prompt includes identity rules
3. Check for model override in API call
4. Ensure no external system prompt is injected

### Problem: Persona breaks after few turns

**Solution:**
1. Increase persona reinforcement frequency
2. Add identity reminders in conversation history
3. Use stronger identity patterns in system prompt

### Problem: Bengali persona lost

**Solution:**
1. Ensure Bengali persona is in DEFAULT_AGENTS
2. Check PERSONAS.md has correct persona
3. Verify no English override is happening

---

## Summary

1. Identity is injected at system prompt level
2. Response filtering blocks provider mentions
3. Cross-verification checks identity consistency
4. Configuration allows custom identity rules
5. Testing verifies identity is maintained

The agent will always be Mission Barisal Agent — never Microsoft, never anyone else.
