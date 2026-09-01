# 🧟 PENDING #3 — Frontend: Session তৈরি হচ্ছে না

> **স্ট্যাটাস:** ⏳ PENDING
> **তারিখ:** ২০২৬-০৮-১৭
> **ফাইল:** `frontend/allindex.live.php`

---

## সমস্যা

Frontend-এ **কোনো session তৈরি হচ্ছে না**। Chat করলে session list-এ
(conversations sidebar) নতুন session দেখা যায় না।

## Root cause analysis

### Session creation flow (allindex.live.php)
- `newS()` (line 1279): `api('new_session',{},...)` → broker-এ `new_session` action
- সফল হলে: `aC=r.id` (active conversation id), `updateURL(aC)`, `rMsgs([])`
- তারপর `api('start',{provider,model,mode})` → session start

### Broker `new_session` handler
```js
case "new_session": {
  const crypto = require("crypto");
  const newId = crypto.randomBytes(16).toString("hex");
  jsonOut(res, { id: newId, session_id: newId });
  return;
}
```
- নতুন ID generate করে, কিন্তু **কোনো ফাইলে save করে না** (`.conversations.json`-এ না)

### Broker `conversations` handler
- `readJson(STORE.conversations, [])` — খালি array return করে
- কারণ `new_session` conversations-এ save করে না

## প্রভাব

- `conversations` sidebar খালি
- Session reload-এ হারিয়ে যায়
- `switch_conversation` কাজ করে না (কোনো conversation নেই)

## ফিক্স পরিকল্পনা

1. Broker-এ `new_session` → `.conversations.json`-এ session save
2. `conversations` handler → stored sessions return
3. Frontend-এ session list render verify

## প্রমাণ

- `curl ...ai_php_api=new_session` → `{"id":"...","session_id":"..."}` (কিন্তু save হয় না)
- `curl ...ai_php_api=conversations` → `[]` (খালি)
- `frontend/.conversations.json` → নেই/খালি

## Definition of Done

- [ ] new_session → conversations-এ save
- [ ] conversations → stored sessions
- [ ] Browser-এ session sidebar-এ নতুন session দেখা যায়
