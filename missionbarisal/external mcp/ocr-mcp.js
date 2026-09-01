#!/usr/bin/env node
// =============================================================================
// OCR MCP Tool — Mission Barisal v3
// Zero dependency (uses system tesseract + ffmpeg)
//
// Tools:
//   ocr_image    — Extract text from image file (any format)
//   ocr_screenshot — Take screenshot + extract text
//   ocr_crop     — Crop region from image + extract text
//
// Usage: node "external mcp/ocr-mcp.js"
// =============================================================================

const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.OCR_MCP_PORT || "3100", 10);
const TMP_DIR = process.env.OCR_TMP_DIR || path.join(require("os").tmpdir(), "ocr-mcp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────
function run(cmd, timeoutMs = 30000) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
  }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function detectLangs(imgPath) {
  // Default: English only for speed. Add 'ben' manually if needed.
  return process.env.OCR_LANGS || "eng";
}

// ─── Tool Definitions ─────────────────────────────────────
const TOOLS = [
  {
    name: "ocr_image",
    description: "Extract text from an image file (PNG, JPG, BMP, TIFF, PDF). Uses Tesseract OCR. Supports Bengali + English.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the image file"
        },
        langs: {
          type: "string",
          description: "Tesseract language codes (default: eng). E.g. 'eng', 'ben', 'eng+ben+ara'"
        },
        preprocess: {
          type: "string",
          enum: ["none", "threshold", "sharpen", "denoise"],
          description: "Image preprocessing mode (default: none)"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "ocr_screenshot",
    description: "Take a screenshot of the screen and extract text via OCR. Uses ffmpeg x11grab + Tesseract.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Capture region: 'full' (default), or 'WxH+X+Y' (e.g. '1920x1080+0+0')"
        },
        langs: {
          type: "string",
          description: "Tesseract language codes (default: eng)"
        }
      },
      required: []
    }
  },
  {
    name: "ocr_crop",
    description: "Crop a region from an image and extract text. Useful for reading specific parts of screenshots.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to source image" },
        x: { type: "number", description: "X offset (pixels)" },
        y: { type: "number", description: "Y offset (pixels)" },
        width: { type: "number", description: "Crop width (pixels)" },
        height: { type: "number", description: "Crop height (pixels)" },
        langs: { type: "string", description: "Tesseract language codes" }
      },
      required: ["path", "x", "y", "width", "height"]
    }
  }
];

// ─── Tool Execution ───────────────────────────────────────
async function executeTool(name, args) {
  const startTime = Date.now();

  switch (name) {
    case "ocr_image": {
      const imgPath = path.resolve(args.path);
      if (!fileExists(imgPath)) {
        return { content: [{ type: "text", text: `Error: File not found: ${imgPath}` }] };
      }
      const langs = args.langs || detectLangs(imgPath);
      const preprocess = args.preprocess || "none";

      // Preprocessing
      let processedPath = imgPath;
      if (preprocess !== "none") {
        const tmpProcessed = path.join(TMP_DIR, `preprocessed-${Date.now()}.png`);
        switch (preprocess) {
          case "threshold":
            run(`convert "${imgPath}" -threshold 50% "${tmpProcessed}"`);
            break;
          case "sharpen":
            run(`convert "${imgPath}" -sharpen 0x3 "${tmpProcessed}"`);
            break;
          case "denoise":
            run(`convert "${imgPath}" -despeckle -deskew "${tmpProcessed}"`);
            break;
        }
        processedPath = tmpProcessed;
      }

      // OCR
      const txtPath = path.join(TMP_DIR, `ocr-${Date.now()}.txt`);
      run(`tesseract "${processedPath}" "${txtPath.replace(/\.txt$/, "")}" -l ${langs} 2>/dev/null`);

      let text = "";
      try { text = fs.readFileSync(txtPath, "utf8").trim(); } catch {}

      // Cleanup
      if (processedPath !== imgPath) { try { fs.unlinkSync(processedPath); } catch {} }
      try { fs.unlinkSync(txtPath); } catch {}

      const elapsed = Date.now() - startTime;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            text,
            chars: text.length,
            lines: text.split("\n").length,
            langs,
            preprocess,
            elapsed_ms: elapsed,
            source: imgPath
          }, null, 2)
        }]
      };
    }

    case "ocr_screenshot": {
      const langs = args.langs || "eng";
      const region = args.region || "full";
      const screenshotPath = path.join(TMP_DIR, `screenshot-${Date.now()}.png`);

      try {
        if (region === "full") {
          // Full screen via ffmpeg x11grab
          run(`ffmpeg -f x11grab -video_size $(xdpyinfo | grep dimensions | awk '{print $2}' | cut -d'x' -f1)x$(xdpyinfo | grep dimensions | awk '{print $2}' | cut -d'x' -f2) -i :0.0 -frames:v 1 "${screenshotPath}" -y 2>/dev/null`, 15000);
        } else {
          // Specific region
          run(`ffmpeg -f x11grab -video_size ${region} -i :0.0 -frames:v 1 "${screenshotPath}" -y 2>/dev/null`, 15000);
        }

        if (!fileExists(screenshotPath)) {
          return { content: [{ type: "text", text: "Error: Failed to capture screenshot. Check DISPLAY." }] };
        }

        // OCR the screenshot
        const txtPath = path.join(TMP_DIR, `ocr-ss-${Date.now()}.txt`);
        run(`tesseract "${screenshotPath}" "${txtPath.replace(/\.txt$/, "")}" -l ${langs} 2>/dev/null`);
        let text = "";
        try { text = fs.readFileSync(txtPath, "utf8").trim(); } catch {}

        // Cleanup
        try { fs.unlinkSync(screenshotPath); } catch {}
        try { fs.unlinkSync(txtPath); } catch {}

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              text,
              chars: text.length,
              lines: text.split("\n").length,
              langs,
              region,
              elapsed_ms: Date.now() - startTime,
              source: "screenshot"
            }, null, 2)
          }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Screenshot error: ${e.message}. Make sure X11/DISPLAY is available.` }] };
      }
    }

    case "ocr_crop": {
      const imgPath = path.resolve(args.path);
      if (!fileExists(imgPath)) {
        return { content: [{ type: "text", text: `Error: File not found: ${imgPath}` }] };
      }
      const langs = args.langs || "eng";
      const croppedPath = path.join(TMP_DIR, `cropped-${Date.now()}.png`);

      try {
        run(`convert "${imgPath}" -crop ${args.width}x${args.height}+${args.x}+${args.y} +repage "${croppedPath}"`);

        const txtPath = path.join(TMP_DIR, `ocr-crop-${Date.now()}.txt`);
        run(`tesseract "${croppedPath}" "${txtPath.replace(/\.txt$/, "")}" -l ${langs} 2>/dev/null`);
        let text = "";
        try { text = fs.readFileSync(txtPath, "utf8").trim(); } catch {}

        try { fs.unlinkSync(croppedPath); } catch {}
        try { fs.unlinkSync(txtPath); } catch {}

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              text,
              chars: text.length,
              crop: { x: args.x, y: args.y, width: args.width, height: args.height },
              elapsed_ms: Date.now() - startTime
            }, null, 2)
          }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Crop/OCR error: ${e.message}` }] };
      }
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}

// ─── MCP JSON-RPC Server (HTTP) ──────────────────────────
const http = require("http");

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method !== "POST") {
    res.writeHead(405); res.end("Only POST"); return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let request;
  try { request = JSON.parse(body); } catch {
    res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return;
  }

  const { id, method, params } = request;

  // MCP Protocol methods
  if (method === "initialize") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ocr-mcp", version: "1.0.0" }
      }
    }));
    return;
  }

  if (method === "tools/list") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { tools: TOOLS } }));
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};
    try {
      const result = await executeTool(toolName, args);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }
      }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Method not found: " + method }));
});

server.listen(PORT, () => {
  console.log(`[OCR-MCP] Running on http://127.0.0.1:${PORT}`);
  console.log(`[OCR-MCP] Tools: ${TOOLS.map(t => t.name).join(", ")}`);
});
