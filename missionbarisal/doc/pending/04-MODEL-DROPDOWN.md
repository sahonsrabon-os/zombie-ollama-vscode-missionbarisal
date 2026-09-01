# 🧟 PENDING #4 — Frontend: Model Dropdown পরিবর্তন হচ্ছে না

> **স্ট্যাটাস:** ⏳ PENDING
> **তারিখ:** ২০২৬-০৮-১৭
> **ফাইল:** `frontend/allindex.live.php` + `external tools/php-broker-server.js`

---

## সমস্যা

Dropdown থেকে model পরিবর্তন করলে **পরিবর্তন হয় না** — সরাসরি **mission
model** কাজ করে। অন্য model select করলেও chat mission model-এ চলে।

## Root cause analysis

### 1. Hidden `#ocModel` select (allindex.live.php:689)
```html
<select class="ocSel" id="ocModel" title="Model" style="display:none">
  <option value="">Select model</option>
</select>
```
- `#ocModel` হল **hidden** native select
- Visible dropdown: `#ocModelBtn` (button) + `#ocModelDrop` (custom dropdown)

### 2. `selectModel(v)` (line 1987-2005)
```js
function selectModel(v){
  var ms=document.getElementById('ocModel');
  ms.value=v;
  ...
  api('start',{provider:p[0],model:p.slice(1).join('/'),mode:...},function(){});
}
```
- Model value hidden select-এ set হয়
- `api('start',...)` call হয়

### 3. Broker `start` action (php-broker-server.js:493-498)
```js
case "start":
case "switch_conversation":
case "delete_conversation": {
  jsonOut(res, { ok: true });
  return;
}
```
- **`start` কিছুই করে না** — শুধু `{ok:true}` return করে
- Model broker/sarver-এ save হয় না

### 4. Chat send-এ model পাঠানোই হয় না (allindex.live.php:1490-1495)
```js
var params='content='+encodeURIComponent(sendText)+'&csrf_token='+C;
if(aC)params+='&conversation_id='+encodeURIComponent(aC);
```
- শুধু `content + conversation_id` — **model নেই!**
- তাই chat সবসময় default "mission" model-এ চলে

## প্রভাব

- Model dropdown cosmetic — আসল পরিবর্তন হয় না
- সব chat mission model-এ যায়
- Agent-specific model (code-guru, bug-hunter) select করলে কাজ করে না

## ফিক্স পরিকল্পনা

1. Broker `start` action → session-এ model save (`.session.json`)
2. Chat send-এ `model` param যোগ (frontend)
3. Broker SSE proxy-তে `model` forward
4. Sarver-এ model change verify

## প্রমাণ

- `#ocModel` style="display:none" (line 689)
- Broker `start` → `{ok:true}` (line 493-498)
- Chat params-এ model নেই (line 1490-1495)
- Browser test: model select করলেও chat mission-এ যায়

## Definition of Done

- [ ] Broker start → session-এ model save
- [ ] Chat send-এ model param
- [ ] Model change আসলেই কাজ করে
