import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { FileJobStore } from "./store.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const store = new FileJobStore(join(root, "data", "jobs.json"));
const port = Number(process.env.PORT || 8787);
const runnerToken = process.env.RUNNER_TOKEN || "dev-token";
const appAccessCode = process.env.APP_ACCESS_CODE || "";
let runnerHeartbeat = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message });
  }
}).listen(port, () => {
  console.log(`Video render console: http://localhost:${port}`);
  console.log(`Local runner token: ${runnerToken}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/jobs") {
    authorizeApp(request);
    const jobs = await store.list();
    sendJson(response, 200, { jobs });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    authorizeApp(request);
    const input = await readJson(request);
    const job = await store.create(input);
    sendJson(response, 201, { job });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/runner/status") {
    authorizeApp(request);
    sendJson(response, 200, { runner: getRunnerStatus() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runner/heartbeat") {
    authorizeRunner(request);
    const input = await readJson(request);
    runnerHeartbeat = {
      runnerId: input.runnerId || "local-runner",
      version: input.version || "dev",
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
      checkedAt: new Date().toISOString()
    };
    sendJson(response, 200, { runner: getRunnerStatus() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs/claim") {
    authorizeRunner(request);
    const input = await readJson(request);
    const job = await store.claim(input.runnerId || "local-runner");
    sendJson(response, 200, { job });
    return;
  }

  const match = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "PATCH" && match) {
    authorizeRunner(request);
    const patch = await readJson(request);
    const job = await store.update(match[1], patch);
    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return;
    }
    sendJson(response, 200, { job });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function authorizeRunner(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== runnerToken) {
    const error = new Error("Runner token is invalid");
    error.statusCode = 401;
    throw error;
  }
}

function authorizeApp(request) {
  if (!appAccessCode) {
    return;
  }
  const code = request.headers["x-app-access-code"];
  if (code !== appAccessCode) {
    const error = new Error("Access code is invalid");
    error.statusCode = 401;
    throw error;
  }
}

function getRunnerStatus() {
  if (!runnerHeartbeat) {
    return { online: false };
  }
  const ageMs = Date.now() - Date.parse(runnerHeartbeat.checkedAt);
  return {
    ...runnerHeartbeat,
    online: ageMs < 15000,
    ageMs
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  const body = await readFile(filePath);
  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
  });
  response.end(body);
}

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
