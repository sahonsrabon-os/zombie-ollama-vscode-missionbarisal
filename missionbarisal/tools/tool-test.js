#!/usr/bin/env node
/**
 * tool-test.js v2 — Full Evidence Report
 * Tests: calculator tool + RAM usage + timing + accuracy + tool calls
 * Output: JSON report (printed + saved as evidence)
 * POST only — NO HEAD requests!
 *
 * Usage: node tools/tool-test.js
 */

const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OLLAMA = "http://localhost:5000";
const MODELS = ["deepseek-r1:1.5b"];
const QUESTION = "What is 2 + 3?";
const EXPECTED = 5;

// ─── Report container ───
const report = {
  tool: "tool-test.js v2",
  timestamp: new Date().toISOString(),
  question: QUESTION,
  expected_answer: EXPECTED,
  ram: { before: null, after: null, delta: null },
  models: [],
};

// ─── RAM reading (from /proc/meminfo via free) ───
function getMem() {
  try {
    const out = execSync("free -b").toString().split("\n");
    const mem = out[1].split(/\s+/);
    return {
      total: parseInt(mem[1]),
      used: parseInt(mem[2]),
      free: parseInt(mem[3]),
      buff_cache: parseInt(mem[5]),
      available: parseInt(mem[6]),
    };
  } catch (e) {
    return null;
  }
}

function fmt(b) {
  return b == null ? "?" : (b / 1024 / 1024).toFixed(0) + "MiB";
}

// ─── GET helper (for /api/ps only — NOT HEAD) ───
function getJson(url) {
  try {
    const out = execSync(`curl -s --max-time 5 "${url}"`).toString();
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

// ─── POST helper (Studio format — POST only, no HEAD!) ───
function post(url, body, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: timeoutMs || 300000,
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          const ms = Date.now() - start;
          try {
            resolve({ status: res.statusCode, json: JSON.parse(buf), ms });
          } catch {
            resolve({ status: res.statusCode, raw: buf.slice(0, 300), ms });
          }
        });
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout", ms: Date.now() - start }); });
    req.on("error", (e) => resolve({ status: 0, error: e.message, ms: Date.now() - start }));
    req.write(data);
    req.end();
  });
}

// ─── Calculator tool schema ───
const TOOL = {
  type: "function",
  function: {
    name: "add",
    description: "Add two numbers: a + b",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    },
  },
};

// ─── Load model + measure RAM footprint ───
async function loadModel(model) {
  const memBefore = getMem();
  const r = await post(
    `${OLLAMA}/api/generate`,
    { model, prompt: "hi", stream: false, keep_alive: "10m" }
  );
  const memAfter = getMem();
  const footprint = memBefore && memAfter ? memAfter.used - memBefore.used : null;
  return {
    status: r.status,
    load_ms: r.ms,
    load_sec: ((r.ms || 0) / 1000).toFixed(2),
    load_duration: r.json ? ((r.json.load_duration || 0) / 1e9).toFixed(2) + "s" : null,
    eval_duration: r.json ? ((r.json.eval_duration || 0) / 1e9).toFixed(2) + "s" : null,
    eval_count: r.json ? r.json.eval_count : null,
    ram_footprint_bytes: footprint,
    ram_footprint: fmt(footprint),
    error: r.error || (r.json && r.json.error) || null,
  };
}

// ─── Evaluate accuracy ───
function evaluate(toolCalls, content) {
  if (toolCalls && toolCalls.length > 0) {
    const fn = toolCalls[0].function;
    let args = null;
    try {
      args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
    } catch (e) { args = null; }
    const a = args && args.a;
    const b = args && args.b;
    const sum = typeof a === "number" && typeof b === "number" ? a + b : null;
    return {
      tool_called: fn.name,
      arguments_raw: fn.arguments,
      arguments_parsed: args,
      computed_sum: sum,
      expected: EXPECTED,
      accurate: sum === EXPECTED,
    };
  }
  const has5 = content && /\b5(\.0)?\b/.test(content);
  return {
    tool_called: null,
    content_preview: content ? content.slice(0, 150) : null,
    expected: EXPECTED,
    accurate: !!has5,
  };
}

// ─── Streaming test (chunk by chunk) ───
async function testStream(model) {
  return new Promise((resolve) => {
    const start = Date.now();
    const u = new URL(`${OLLAMA}/v1/chat/completions`);
    const data = JSON.stringify({
      model,
      messages: [{ role: "user", content: "Count from 1 to 5 slowly" }],
      stream: true,
    });
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: 120000,
      },
      (res) => {
        let buf = "";
        const chunks = [];
        res.on("data", (c) => {
          buf += c;
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const d = trimmed.slice(5).trim();
            if (d === "[DONE]") continue;
            try {
              const parsed = JSON.parse(d);
              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) chunks.push(content);
            } catch (e) { }
          }
        });
        res.on("end", () => {
          const ms = Date.now() - start;
          const fullText = chunks.join("");
          resolve({
            status: res.statusCode,
            chunks_received: chunks.length,
            total_chars: fullText.length,
            first_chunk_ms: ms,
            preview: fullText.slice(0, 200),
            ok: chunks.length > 0,
          });
        });
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout", ms: Date.now() - start, ok: false }); });
    req.on("error", (e) => resolve({ status: 0, error: e.message, ms: Date.now() - start, ok: false }));
    req.write(data);
    req.end();
  });
}

// ─── Main ───
async function main() {
  report.ram.before = getMem();
  console.log("=== ক্যালকুলেটর টুল টেস্ট v2 (প্রমাণসহ) ===");
  console.log(`প্রশ্ন: "${QUESTION}" | উত্তর প্রত্যাশিত: ${EXPECTED}`);
  console.log(`RAM (আগে): মোট ${fmt(report.ram.before.total)} | ব্যবহৃত ${fmt(report.ram.before.used)} | ফাঁকা ${fmt(report.ram.before.free)} | অ্যাভেইলেবল ${fmt(report.ram.before.available)}`);
  console.log("");

  for (const model of MODELS) {
    console.log(`── ${model} ──`);
    const entry = { model, question: QUESTION };

    // Step 1: Load + RAM footprint
    process.stdout.write(`  [লোড] মডেল RAM-এ আনছি... `);
    const load = await loadModel(model);
    entry.load = load;
    console.log(load.status === 200 ? `✅ ${load.load_sec}s (RAM দখল: ${load.ram_footprint})` : `⚠️ ${load.error || load.status}`);

    // Step 2: Tool test
    process.stdout.write(`  [টুল] "What is 2 + 3?" ক্যালকুলেটর টুল দিয়ে... `);
    const t = await post(
      `${OLLAMA}/v1/chat/completions`,
      {
        model,
        messages: [{ role: "user", content: QUESTION }],
        tools: [TOOL],
        stream: false,
      }
    );
    const msg = t.json && t.json.choices && t.json.choices[0] && t.json.choices[0].message;
    const toolCalls = (msg && msg.tool_calls) || [];
    const content = (msg && msg.content) || "";
    const verdict = evaluate(toolCalls, content);
    entry.tool_test = {
      status: t.status,
      time_ms: t.ms,
      time_sec: ((t.ms || 0) / 1000).toFixed(2),
      error: t.error || (t.json && t.json.error && t.json.error.message) || null,
      tool_calls: toolCalls,
      content: content,
      accuracy: verdict,
    };
    entry.ram_after_test = getMem();

    if (t.status === 200 && verdict.tool_called) {
      console.log(`✅ টুল কল: ${verdict.tool_called}(${JSON.stringify(verdict.arguments_parsed)}) | সময় ${entry.tool_test.time_sec}s | নির্ভুলতা: ${verdict.accurate ? "সঠিক ✅" : "ভুল ❌"}`);
    } else if (t.status === 200) {
      console.log(`📝 টেক্সট: "${content.slice(0, 60)}" | ${entry.tool_test.time_sec}s | ${verdict.accurate ? "সঠিক ✅" : "ভুল/অনিশ্চিত ❌"}`);
    } else if (t.status === 400) {
      console.log(`❌ ৪০০: "${(entry.tool_test.error || "").slice(0, 80)}" [${entry.tool_test.time_ms}ms]`);
    } else {
      console.log(`❓ status=${t.status}: ${entry.tool_test.error || "unknown"} [${entry.tool_test.time_ms}ms]`);
    }
    console.log("");
    report.models.push(entry);

    // Step 3: Streaming test
    process.stdout.write(`  [স্ট্রিম] "Count from 1 to 5" streaming... `);
    const st = await testStream(model);
    entry.stream_test = st;
    if (st.ok) {
      console.log(`✅ ${st.chunks_received} chunks, ${st.total_chars} chars in ${st.first_chunk_ms}ms`);
    } else {
      console.log(`❌ ${st.error || "no chunks"} [${st.status}]`);
    }
    console.log("");
  }

  // Final RAM
  report.ram.after = getMem();
  if (report.ram.before && report.ram.after) {
    report.ram.delta = {
      used_bytes: report.ram.after.used - report.ram.before.used,
      used: fmt(report.ram.after.used - report.ram.before.used),
      free_before: fmt(report.ram.before.free),
      free_after: fmt(report.ram.after.free),
    };
  }

  // Loaded models in Ollama
  const ps = getJson(`${OLLAMA}/api/ps`);
  report.ollama_loaded = ps && ps.models ? ps.models.map((m) => ({
    name: m.name,
    size: fmt(m.size),
    size_vram: m.size_vram,
    expires_at: m.expires_at,
  })) : [];

  console.log("=== RAM শেষ অবস্থা ===");
  console.log(`ব্যবহৃত: ${fmt(report.ram.after.used)} | ফাঁকা: ${fmt(report.ram.after.free)} | অ্যাভেইলেবল: ${fmt(report.ram.after.available)}`);
  if (report.ram.delta) console.log(`মডেল দুইটা দখল করেছে: ${report.ram.delta.used}`);
  console.log("");

  // Save evidence
  const evidenceDir = path.join(__dirname, "evidence");
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evFile = path.join(evidenceDir, `tool-test-${stamp}.json`);
  fs.writeFileSync(evFile, JSON.stringify(report, null, 2), "utf8");

  // Print JSON report
  console.log("=== JSON রিপোর্ট ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\n📁 প্রমাণ সংরক্ষিত:", evFile);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
