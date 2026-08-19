// Minimal backend to read/write data.json
// Run: node server.js
// Then open: http://localhost:3000

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, "data.json");

let writeChain = Promise.resolve();

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function readDataFile() {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== 1) throw new Error("data.json invalid");
  return parsed;
}

async function writeDataFile(payload) {
  if (!payload || payload.version !== 1) throw new Error("Invalid payload");
  const tmp = DATA_FILE + ".tmp";
  const content = JSON.stringify(payload, null, 2);
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, DATA_FILE);
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function serveStaticFile(req, res, filePath) {
  fs.readFile(filePath)
    .then((buf) => {
      res.writeHead(200, {
        "Content-Type": mimeType(filePath),
        "Content-Length": buf.byteLength,
      });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    });
}

async function readBodyJson(req, limitBytes = 5_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("Body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return null;
  return JSON.parse(raw);
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  if (pathname === "/api/data" && req.method === "GET") {
    readDataFile()
      .then((payload) => sendJson(res, 200, payload))
      .catch((err) => sendJson(res, 500, { ok: false, error: err?.message || String(err) }));
    return;
  }

  if (pathname === "/api/data" && req.method === "POST") {
    writeChain = writeChain
      .catch(() => {})
      .then(async () => {
        const payload = await readBodyJson(req);
        await writeDataFile(payload);
      });

    writeChain
      .then(() => sendJson(res, 200, { ok: true }))
      .catch((err) => sendJson(res, 500, { ok: false, error: err?.message || String(err) }));
    return;
  }

  // Static files (serve index.html for "/" and direct assets)
  let filePath = path.join(ROOT_DIR, decodeURIComponent(pathname));
  if (pathname === "/") filePath = path.join(ROOT_DIR, "index.html");

  // Basic path traversal guard
  if (!filePath.startsWith(ROOT_DIR)) {
    sendText(res, 400, "Bad request");
    return;
  }

  return serveStaticFile(req, res, filePath);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Expense app backend running: http://localhost:${PORT}`);
});

