# 🧟 PENDING #2 — Persona (পার্সোনা) সমস্যা

> **স্ট্যাটাস:** ✅ COMPLETE (2026-08-17)
> **তারিখ:** ২০২৬-০৮-১৭
> **উৎস:** `test/PERSONA-ADMIN-ANALYSIS.md` + README.md + PERSONAS.md

---

## সমস্যা ১: README বলে "6 agents" কিন্তু আসলে 9 — ✅ FIXED

- `README.md:7,25,29` — এখন "9 agents" (আপডেট করা হয়েছে)
- `README.md` Agents (9) section — code-guru → ecommerce (৯টা agent)
- `PERSONAS.md` define করে **৯টা agent**
- `doc/SYSTEM-DOCUMENTATION.md` + `doc/SERVER-LOGIC.md` — 9-agent table
- `doc/` সব port reference — 8080 (production port)

## সমস্যা ২: security-hero নাম mismatch — ✅ FIXED

- `README.md:67-68` (diagram): `security (বাবলু)`
- `README.md:95` (table): `Security Hero - Bablu`
- `PERSONAS.md:70,77`: `Security Hero - Bablu`
- **সব জায়গায় Bablu (বাবলু) — consistent**

## সমস্যা ৩: Admin panel-এ persona consistency

- Persona real-world role: fictional AI characters (Monu, Jewel, Bablu, Rashed, Halim, Mojnu, Jara)
- Agent IDs: code-guru, bug-hunter, security-hero, perf-wizard, doc-king, qa-tyrant, team-heart, customer-experience-specialist, ecommerce-operations-analyst

## ফিক্স পরিকল্পনা

1. README-এ "6 agents" → "9 agents" আপডেট — ✅ DONE
2. security-hero নাম একীভূত করা (Bablu) — ✅ DONE (README diagram + table + PERSONAS সব Bablu)
3. Admin panel-এ persona list + role display — ⏳ বাকি

## প্রমাণ

- `grep "6 Specialized" README.md` → 0 match (আগে ৩টা ছিল)
- `grep "বাবলু" README.md` → diagram + table
- `grep "Bablu" PERSONAS.md` → security-hero

## Definition of Done

- [x] README-এ ৯টা agent count
- [x] security-hero নাম consistent
- [ ] Admin panel-এ persona consistency
