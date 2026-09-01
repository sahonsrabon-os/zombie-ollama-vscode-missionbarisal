# 🧟 লগ বিশ্লেষণ — sarver/logs (২০২৬-০৮-১৭)

> **বিশ্লেষক:** Code Guru - Monu
> **উৎস:** `logs/2026-08-16.log` (1MB+), `logs/2026-08-15.log` (2.3MB)

---

## পাওয়া সমস্যাগুলো

### ১. Provider sync failure — gemini HTTP 401
```
[AUTO_SYNC_DONE] {"results":{
  "opencode":{"ok":true,"fetched":62,"total":63},
  "groq":{"ok":true,"fetched":15,"total":27},
  "gemini":{"ok":false,"error":"HTTP 401"},
  "custom_1":{"ok":false,"error":"Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"}
}}
```
- **gemini:** API key ভুল/মেয়াদ শেষ → HTTP 401
- **custom_1 (missionbarisal):** HTML page return করছে (JSON না) — সম্ভবত
  auth page বা proxy error। `"<!DOCTYPE "...` = HTML response

### ২. `{{model}}` template bug → PROXY_FAIL storm
```
[WARN] [PROXY_FAIL] {"model":"agent/code-guru","provider":"opencode","error":"Model agent/code-guru is not supported"}
[WARN] [PROXY_FAIL] {"provider":"opencode","error":"Model {{model}} is not supported"}
[WARN] [PROVIDER_UNHEALTHY] {"provider":"opencode","consecutiveFailures":12,"lastError":"Model {{model}} is not supported","cooldownMs":60000}
```
- ক্লায়েন্ট literal `{{model}}` পাঠাচ্ছে — template interpolate হয়নি
- opencode API-তে `{{model}}` invalid → error
- **১২টা consecutive failure** → PROVIDER_UNHEALTHY + cooldown
- `api.js:1177`-এ guard আছে (`template_guard`) কিন্তু error opencode API থেকে আসে

### ৩. Mission mode সবসময় `simple_qa` / `greeting_skip`
```
[MISSION_COMPLETE] {"agents":1,"responded":1,"mode":"simple_qa_skip"}
[MISSION_COMPLETE] {"agents":1,"responded":1,"mode":"greeting_skip"}
```
- অনেক mission **১টা agent** দিয়ে চলেছে — পূর্ণ debate হয়নি
- কারণ: ছোট input → "short_input_default" → কম agent

### ৪. Session archive (স্বাভাবিক কিন্তু নজর রাখা দরকার)
```
[SESSION_ARCHIVED] {"session":"ctx_20260816_401","messages":2}
```

---

## প্রস্তাবিত ফিক্স

| সমস্যা | ফিক্স |
|--------|-------|
| gemini 401 | gemini API key update/verify |
| missionbarisal HTML | এন্ডপয়েন্ট URL + auth verify |
| `{{model}}` bug | client-side model name validate + guard strengthen |
| simple_qa skip | input length threshold review |

## Definition of Done

- [ ] gemini sync ok
- [ ] missionbarisal sync ok (JSON)
- [ ] `{{model}}` আর PROXY_FAIL না
- [ ] Mission পূর্ণ debate (৬ agent)
