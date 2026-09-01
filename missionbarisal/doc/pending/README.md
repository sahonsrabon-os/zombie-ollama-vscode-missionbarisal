# 🧟 PENDING — সমস্যা পরিকল্পনা (Problem Plans)

> এই ফোল্ডারে আমাদের পরিকল্পনা অনুযায়ী **৫টা সমস্যা** + লগ বিশ্লেষণ
> লেখা আছে। প্রতিটা plan-এ root cause + প্রমাণ + fix পরিকল্পনা + DoD।

| # | ফাইল | সমস্যা | স্ট্যাটাস |
|---|------|--------|-----------|
| 1 | `01-ADMIN-AGENT.md` | Admin Agent নেই | ⏳ PENDING |
| 2 | `02-PERSONA.md` | Persona inconsistency (6 vs 9 agents, নাম mismatch) | ⏳ PENDING |
| 3 | `03-FRONTEND-SESSION.md` | Frontend-এ session তৈরি হচ্ছে না | ⏳ PENDING |
| 4 | `04-MODEL-DROPDOWN.md` | Model dropdown পরিবর্তন হচ্ছে না (mission সবসময়) | ⏳ PENDING |
| 5 | `05-OS-DEFAULT-ROOT.md` | OS default root — frontend folder-এ project তৈরি হয় | ⏳ PENDING |

## লগ বিশ্লেষণ (logs/)

- `../doc/LOG-ANALYSIS.md` — sarver logs থেকে পাওয়া সমস্যা
  - gemini provider → HTTP 401
  - missionbarisal → HTML return (JSON না)
  - `{{model}}` template bug → PROXY_FAIL storm

## নিয়ম

- প্রতিটা plan implement হলে status `✅ DONE` করবে
- নতুন সমস্যা পেলে নতুন numbered file যোগ করবে
- সব plan-এ প্রমাণ (evidence) থাকতে হবে
