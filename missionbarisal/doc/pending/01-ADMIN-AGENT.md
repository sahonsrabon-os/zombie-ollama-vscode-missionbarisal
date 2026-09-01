# 🧟 PENDING #1 — Admin Agent (এডমিন এজেন্ট)

> **স্ট্যাটাস:** ⏳ PENDING (plan লেখা হয়েছে, implement বাকি)
> **তারিখ:** ২০২৬-০৮-১৭
> **উৎস:** `test/ADMIN-API-MASTER-PLAN.md`

---

## সমস্যা

সার্ভারে কোনো **Admin Agent / Admin API** নেই। বর্তমানে শুধু ৯টা agent
আছে (code-guru → ecommerce-operations-analyst), কিন্তু সার্ভার ম্যানেজমেন্ট
(কনফিগ, providers, sessions, লগ দেখা, restart) করার কোনো ডেডিকেটেড এডমিন
ইন্টারফেস/এজেন্ট নেই।

## পরিকল্পনা (৪-ধাপ — `test/ADMIN-API-MASTER-PLAN.md` থেকে)

| # | কাজ | বিবরণ | স্ট্যাটাস |
|---|-----|--------|-----------|
| 1 | **UDS_ENABLED env var + api.js গার্ড** | cPanel/Passenger-এ UDS বন্ধ করার সুযোগ | ⏳ |
| 2 | **external-tools.js module** | ফোল্ডার + env + DB থেকে tool auto-load | ⏳ |
| 3 | **skills.js npx → local read** | npx বাদ, zero-dep local read | ⏳ |
| 4 | **Windows/Linux/Mac test** | ক্রস-প্ল্যাটফর্ম যাচাই | ⏳ |

## Admin API প্রস্তাবিত এন্ডপয়েন্ট

- `GET /admin/status` — সার্ভার হেলথ + sessions + providers
- `GET /admin/logs` — লগ বিশ্লেষণ
- `POST /admin/config` — runtime config আপডেট
- `POST /admin/restart` — graceful restart

## প্রমাণ (evidence)

- `api.js` = ১৬,১৬৬ লাইন মোনোলিথ (audit report)
- ৯টা agent load হয়, কিন্তু admin handler নেই
- `PERSONAS.md` ৯টা agent define করে

## Definition of Done

- [ ] Admin API endpoints কাজ করছে
- [ ] Admin agent persona যোগ হয়েছে
- [ ] প্রমাণসহ test done
