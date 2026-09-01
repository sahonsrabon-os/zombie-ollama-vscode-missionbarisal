# 🧟 PENDING #5 — OS Default Root (Directory Path) সমস্যা

> **স্ট্যাটাস:** ⏳ PENDING
> **তারিখ:** ২০২৬-০৮-১৭
> **ফাইল:** `frontend/allindex.live.php` + `external tools/php-broker-server.js`

---

## সমস্যা

Directory Path `/home/sahon/Downloads/phpsoket/softaculous/frontend/`
কে **অপারেটিং সিস্টেমের ডিফল্ট রুট** হিসেবে চিহ্নিত করা হয়েছে। ফলে:

- নির্দিষ্ট OS-এর যেকোনো ফাইল/ফোল্ডার লোকেশন ব্যবহার করতে পারি না
- নতুন project তৈরি করলে **frontend ফোল্ডারের ভিতরে** নির্দিষ্ট ফোল্ডার
তৈরি হয়ে যায়
- আমরা চাচ্ছি না — user-এর যেকোনো path-এ project তৈরি হোক

## Root cause analysis

### 1. `HD` (home directory) variable (allindex.live.php:898)
```js
HD=''  // খালি শুরু
```

### 2. HD set হয় project_info থেকে (line 3208)
```js
if(d.root && !HD){ HD=d.root; }
```
- `d.root` = broker-এর `project_info` response-এর `root` field

### 3. Broker `project_info` (php-broker-server.js:370)
```js
case "project_info": {
  jsonOut(res, { name: pathParam, path: FRONTEND_DIR, id: projectId, root: FRONTEND_DIR, type: "php" });
  return;
}
```
- `root: FRONTEND_DIR` — **frontend ফোল্ডারই root!**

### 4. Project create-এ HD prepend (allindex.live.php:4300)
```js
var fullPath=path;
if(path.indexOf('/')!==0){
  fullPath=HD+'/'+path;  // HD = frontend folder
}
```
- Relative path দিলে `HD` (frontend folder) prepend হয়
- তাই নতুন folder frontend-এর ভিতরে তৈরি হয়

## প্রমাণ

- `curl ...ai_php_api=project_info` →
  `{"root":"/home/sahon/Downloads/phpsoket/softaculous/frontend","type":"php"}`
- `HD` = frontend folder (line 3208)
- `fullPath=HD+'/'+path` (line 4300)

## ফিক্স পরিকল্পনা

1. Broker `project_info` → `root: "/"` বা OS-এর আসল root (`/home/sahon`)
2. অথবা frontend-এ HD-কে OS root হিসেবে configurable করা
3. Project create-এ absolute path allow
4. `FRONTEND_DIR` শুধু static assets serve-এর জন্য, project root হিসেবে না

## Definition of Done

- [ ] project_info root = OS default root (`/`)
- [ ] নতুন project যেকোনো path-এ তৈরি হয়
- [ ] frontend folder-এ আর project folder তৈরি হয় না
