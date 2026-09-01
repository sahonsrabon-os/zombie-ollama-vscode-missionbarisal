# User Experience Testing Guide

## How to Test Like a Real User, Not a Developer

This document explains how to test the system from a user's perspective,
not just feature testing. Focus on real-world experience.

---

## Why UX Testing Matters

### Feature Testing vs UX Testing

| Feature Testing | UX Testing |
|----------------|------------|
| Does the button work? | Is the button easy to find? |
| Does the API return data? | Is the response helpful? |
| Does the code run? | Is the code maintainable? |
| Does the error show? | Is the error message clear? |

### What Users Care About

1. **Speed** — Does it respond quickly?
2. **Clarity** — Is the answer easy to understand?
3. **Helpfulness** — Does it solve my problem?
4. **Honesty** — Does it admit when it doesn't know?
5. **Language** — Does it respond in my language?
6. **Context** — Does it understand my project?

---

## Testing Scenarios

### Scenario 1: New User First Contact

**User Action:** Opens chat, types "Hello"

**Expected Experience:**
- Agent responds quickly (under 2 seconds)
- Response is friendly and in Bengali
- Agent introduces itself
- Agent asks how it can help

**Test Steps:**
1. Open chat application
2. Type "Hello"
3. Measure response time
4. Check response language
5. Verify agent identity

**Pass Criteria:**
- Response time < 2 seconds
- Response in Bengali
- Agent says its name
- Agent offers help

### Scenario 2: Code Review Request

**User Action:** Pastes code, asks for review

**Expected Experience:**
- Agent reads the code
- Agent provides specific feedback
- Agent mentions file names and line numbers
- Agent suggests improvements

**Test Steps:**
1. Copy a code snippet
2. Paste into chat
3. Ask "এই কোডটি রিভিউ করো"
4. Check if agent references specific lines
5. Check if suggestions are actionable

**Pass Criteria:**
- Agent references line numbers
- Suggestions are specific
- Response is in Bengali
- Agent admits uncertainty if unsure

### Scenario 3: Bug Report

**User Action:** Describes a bug

**Expected Experience:**
- Agent asks clarifying questions
- Agent suggests possible causes
- Agent provides debugging steps
- Agent doesn't blame the user

**Test Steps:**
1. Describe a bug: "আমার কোডে error আসছে"
2. Check if agent asks for more info
3. Check if suggestions are helpful
4. Check if tone is supportive

**Pass Criteria:**
- Agent asks clarifying questions
- Suggestions are practical
- Tone is supportive, not blaming
- Agent offers to help fix

### Scenario 4: Bengali Text Handling

**User Action:** Types complex Bengali with conjuncts

**Expected Experience:**
- Bengali text displays correctly
- Conjunct characters preserved
- Response is in Bengali
- No text breaking

**Test Steps:**
1. Type: "ক\u200Dষ (ksha conjunct)"
2. Check if displays correctly
3. Ask agent to respond in Bengali
4. Verify response quality

**Pass Criteria:**
- Bengali characters preserved
- Conjuncts display correctly
- Response in fluent Bengali
- No encoding issues

### Scenario 5: Unknown Information

**User Action:** Asks something agent doesn't know

**Expected Experience:**
- Agent admits it doesn't know
- Agent doesn't fabricate information
- Agent suggests alternatives
- Agent offers to search web

**Test Steps:**
1. Ask: "আমার প্রজেক্টে কতগুলো বাগ আছে?"
2. Check if agent says "I don't know"
3. Check if agent offers to search
4. Check if agent doesn't guess

**Pass Criteria:**
- Agent admits uncertainty
- No fabricated information
- Agent offers alternatives
- Agent suggests web search

---

## Performance Testing

### Response Time

| Action | Expected | Maximum |
|--------|----------|---------|
| Health check | < 100ms | 500ms |
| Simple greeting | < 2s | 5s |
| Code review | < 10s | 30s |
| Full mission | < 30s | 60s |
| Streaming start | < 1s | 2s |

### How to Measure

```javascript
// In browser console
console.time('response');
fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'mission',
    messages: [{ role: 'user', content: 'Hello' }]
  })
})
.then(r => r.json())
.then(data => {
  console.timeEnd('response');
  console.log('Response:', data.choices[0].message.content);
});
```

### Memory Usage

| Component | Expected | Maximum |
|-----------|----------|---------|
| Server | < 100MB | 500MB |
| Client | < 50MB | 200MB |
| Per session | < 1MB | 10MB |

---

## Usability Testing

### Navigation

- [ ] Chat input is easy to find
- [ ] Send button is clearly visible
- [ ] Messages are easy to read
- [ ] Scroll works smoothly
- [ ] History is accessible

### Readability

- [ ] Font size is appropriate
- [ ] Line spacing is comfortable
- [ ] Colors have good contrast
- [ ] Code blocks are highlighted
- [ ] Bengali text is clear

### Interaction

- [ ] Enter key sends message
- [ ] Can copy text easily
- [ ] Can scroll through history
- [ ] Loading indicator shows
- [ ] Error messages are clear

---

## Accessibility Testing

### Screen Reader

- [ ] All text is readable by screen readers
- [ ] Buttons have aria labels
- [ ] Images have alt text
- [ ] Forms have labels

### Keyboard Navigation

- [ ] Can navigate with Tab key
- [ ] Can send with Enter key
- [ ] Can scroll with arrow keys
- [ ] Focus is visible

### Color Contrast

- [ ] Text has 4.5:1 contrast ratio
- [ ] Interactive elements have 3:1 ratio
- [ ] Color is not sole indicator

---

## Real-World Testing Checklist

### Daily Usage

- [ ] Morning: Start chat, ask about project status
- [ ] During work: Ask code questions
- [ ] After work: Summarize day's work
- [ ] End of day: Plan tomorrow's tasks

### Common Tasks

- [ ] Code review: Paste code, get feedback
- [ ] Bug fix: Describe error, get solution
- [ ] Documentation: Ask for docs
- [ ] Testing: Ask for test cases

### Edge Cases

- [ ] Very long messages
- [ ] Very short messages
- [ ] Mixed language messages
- [ ] Code with special characters
- [ ] Empty messages

---

## Testing Tools

### Browser DevTools

```javascript
// Performance timing
performance.mark('start');
// ... make request ...
performance.mark('end');
performance.measure('response', 'start', 'end');
console.log(performance.getEntriesByName('response')[0].duration);
```

### Network Tab

1. Open DevTools → Network
2. Filter by XHR/Fetch
3. Check response times
4. Verify request/response format

### Console Logging

```javascript
// Add to chat app
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('Request:', args[0]);
  console.time('fetch');
  const response = await originalFetch(...args);
  console.timeEnd('fetch');
  return response;
};
```

---

## Bug Reporting Template

When you find a UX issue, report it like this:

```
Title: [Brief description]

Steps to Reproduce:
1. Open chat
2. Type "..."
3. Click send
4. Wait for response

Expected: [What should happen]
Actual: [What actually happened]

Environment:
- Browser: Chrome 120
- OS: Ubuntu 22.04
- Screen: 1920x1080

Screenshot: [If applicable]
```

---

## Summary

1. Test from user perspective, not developer perspective
2. Focus on speed, clarity, helpfulness
3. Test Bengali text thoroughly
4. Test error handling gracefully
5. Measure performance objectively
6. Check accessibility for all users
7. Report issues with clear steps

The goal is a system that users love, not just one that works.
