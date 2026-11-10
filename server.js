const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");

const root = __dirname;
const port = process.env.PORT || 3000;
// Railway mounts a volume here in production; locally events live in ./data.
const dataDir = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, "data");
const eventsDir = path.join(dataDir, "events");
const sitePassword = process.env.WHEEL_PASSWORD || "";
const maxBodyBytes = 25 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".mp3": "audio/mpeg",
};

// Only these files are served; everything else (server code, data) stays private.
const publicFiles = new Set([
  "events.html",
  "events.js",
  "control.html",
  "control.js",
  "display.html",
  "display.js",
  "display.css",
  "shared.js",
  "sounds.js",
  "wheel3d.js",
  "winner.mp3",
  "styles.css",
]);
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const reservedSlugs = new Set(["api", "events"]);

// Only these hosts may be fetched through the sheet proxy.
const allowedSheetHosts = [
  /^docs\.google\.com$/,
  /^([a-z0-9-]+\.)*sharepoint\.com$/,
  /^onedrive\.live\.com$/,
  /^1drv\.ms$/,
];

// Turns a shareable sheet link into a URL that returns the raw file.
function resolveSheetDownloadUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !allowedSheetHosts.some((pattern) => pattern.test(url.hostname))) {
    return null;
  }

  if (url.hostname === "docs.google.com") {
    // Published-to-web link: /spreadsheets/d/e/<id>/pubhtml -> pub?output=csv
    const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([^/]+)/);
    if (published) {
      const gid = url.searchParams.get("gid");
      return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv${gid ? `&gid=${gid}` : ""}`;
    }

    // Regular share link: /spreadsheets/d/<id>/edit#gid=0 -> export?format=csv
    const shared = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
    if (!shared) {
      return null;
    }
    const gidMatch = (url.hash + "&" + url.search).match(/gid=(\d+)/);
    return `https://docs.google.com/spreadsheets/d/${shared[1]}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ""}`;
  }

  // OneDrive / SharePoint "Anyone with the link" share: force a file download.
  url.searchParams.set("download", "1");
  return url.toString();
}

// Reads the first column of a shared sheet. Throws with a message the operator can act on.
async function fetchSheetNames(rawUrl) {
  const downloadUrl = resolveSheetDownloadUrl(rawUrl);
  if (!downloadUrl) {
    throw new Error("Unsupported sheet link. Use a Google Sheets or OneDrive/SharePoint share link.");
  }

  let upstream;
  try {
    upstream = await fetch(downloadUrl, { redirect: "follow", signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error("Couldn't reach the sheet. Retrying in 5 seconds.");
  }
  const contentType = upstream.headers.get("content-type") || "";
  // A sign-in page instead of a file means the sheet isn't shared publicly.
  if (!upstream.ok || contentType.includes("text/html")) {
    throw new Error("Couldn't read the sheet. Make sure it's shared as \"Anyone with the link\".");
  }

  const data = Buffer.from(await upstream.arrayBuffer());
  const workbook = contentType.includes("csv")
    ? XLSX.read(data.toString("utf8"), { type: "string" })
    : XLSX.read(data, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false });

  const values = rows
    .map((row) => (Array.isArray(row) ? row[0] : row))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (values.length > 0 && /\bnames?\b/i.test(values[0])) {
    values.shift();
  }
  return values;
}

// ---- Event storage: one JSON file per event ----

function eventFilePath(slug) {
  return path.join(eventsDir, `${slug}.json`);
}

function readEvent(slug) {
  if (!slugPattern.test(slug)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(eventFilePath(slug), "utf8"));
  } catch {
    return null;
  }
}

function writeEvent(event) {
  fs.mkdirSync(eventsDir, { recursive: true });
  const target = eventFilePath(event.slug);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(event));
  fs.renameSync(temp, target);
}

function listEvents() {
  let files = [];
  try {
    files = fs.readdirSync(eventsDir).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }

  return files
    .map((file) => readEvent(file.slice(0, -5)))
    .filter(Boolean)
    .map(({ slug, name, sheetUrl, names, removedNames, awards = [], createdAt, updatedAt }) => ({
      slug,
      name,
      sheetUrl,
      nameCount: names.length,
      removedCount: removedNames.length,
      awardCount: awards.length,
      createdAt,
      updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

// Copies only the fields a client may change, with basic type checks.
function applyEventChanges(event, changes) {
  if (typeof changes.name === "string" && changes.name.trim()) {
    event.name = changes.name.trim().slice(0, 120);
  }
  if (typeof changes.sheetUrl === "string") {
    event.sheetUrl = changes.sheetUrl.trim();
  }
  if (Array.isArray(changes.names)) {
    event.names = changes.names.map(String);
  }
  if (Array.isArray(changes.removedNames)) {
    event.removedNames = changes.removedNames.map(String);
  }
  if (typeof changes.prizesText === "string") {
    event.prizesText = changes.prizesText.slice(0, 20000);
  }
  if (Number.isInteger(changes.currentPrizeIndex) && changes.currentPrizeIndex >= 0) {
    event.currentPrizeIndex = changes.currentPrizeIndex;
  }
  if (Array.isArray(changes.awards)) {
    event.awards = changes.awards
      .filter((award) => award && typeof award === "object")
      .map((award) => ({
        id: String(award.id || ""),
        name: String(award.name || ""),
        prize: String(award.prize || ""),
        at: String(award.at || ""),
      }));
  }
  if (changes.settings && typeof changes.settings === "object") {
    event.settings = changes.settings;
  }
  event.updatedAt = new Date().toISOString();
  return event;
}

// ---- HTTP helpers ----

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  if (!sitePassword) {
    return true;
  }
  const match = (req.headers.authorization || "").match(/^Basic (.+)$/);
  if (!match) {
    return false;
  }
  const password = Buffer.from(match[1], "base64").toString("utf8").split(":").slice(1).join(":");
  const expected = crypto.createHash("sha256").update(sitePassword).digest();
  const actual = crypto.createHash("sha256").update(password).digest();
  return crypto.timingSafeEqual(expected, actual);
}

function serveFile(res, fileName) {
  fs.readFile(path.join(root, fileName), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Server error");
      return;
    }
    // no-cache: browsers check for a newer version each load, so deploys show up without a hard refresh.
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(fileName)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

// ---- Live link between an event's control and display screens ----

// slug -> Set of { res, role } for open streams.
const liveClients = new Map();
// slug -> the spin currently on screen (null once dismissed). Memory only.
const liveStates = new Map();

function sendStreamEvent(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(slug, type, data) {
  (liveClients.get(slug) || new Set()).forEach((client) => sendStreamEvent(client.res, type, data));
}

function broadcastDisplayCount(slug) {
  const clients = liveClients.get(slug) || new Set();
  const count = [...clients].filter((client) => client.role === "display").length;
  broadcast(slug, "displays", { count });
}

function getLiveState(slug) {
  const state = liveStates.get(slug);
  return state ? { ...state, elapsedMs: Date.now() - state.receivedAt } : { type: "dismiss" };
}

// ---- Live sheet: the server reads each open event's sheet and pushes changes ----

const sheetPollIntervalMs = 5000;
// slug -> { url, names, status, inFlight } for the last read of that event's sheet.
const sheetCache = new Map();

function withoutRemoved(names, removedNames) {
  const remaining = [...names];
  removedNames.forEach((removed) => {
    const index = remaining.indexOf(removed);
    if (index !== -1) {
      remaining.splice(index, 1);
    }
  });
  return remaining;
}

function isSpinning(slug) {
  const state = liveStates.get(slug);
  return Boolean(state) && Date.now() < state.receivedAt + state.durationMs;
}

// Puts the latest sheet names (minus removed winners) on the event. Returns true if they changed.
function applySheetNames(event) {
  const cache = sheetCache.get(event.slug);
  if (!event.sheetUrl || !cache?.names || cache.url !== event.sheetUrl) {
    return false;
  }
  const names = withoutRemoved(cache.names, event.removedNames);
  if (names.join("\n") === event.names.join("\n")) {
    return false;
  }
  event.names = names;
  return true;
}

async function pollSheet(slug) {
  const event = readEvent(slug);
  const cache = sheetCache.get(slug) || {};
  // Never change the names mid spin; the next poll picks the change up.
  if (!event?.sheetUrl || cache.inFlight || isSpinning(slug)) {
    return;
  }
  cache.inFlight = true;
  sheetCache.set(slug, cache);
  const url = event.sheetUrl;

  try {
    const names = await fetchSheetNames(url);
    cache.url = url;
    cache.names = names;
    // Re-read: the operator may have saved changes while the sheet was loading.
    const latest = readEvent(slug);
    if (latest?.sheetUrl === url && !isSpinning(slug) && applySheetNames(latest)) {
      latest.updatedAt = new Date().toISOString();
      writeEvent(latest);
      broadcast(slug, "updated", { updatedAt: latest.updatedAt });
    }
    cache.status = { ok: true, count: (latest || event).names.length, checkedAt: new Date().toISOString() };
  } catch (error) {
    cache.status = { ok: false, error: error.message, checkedAt: new Date().toISOString() };
  } finally {
    cache.inFlight = false;
    broadcast(slug, "sheet", cache.status);
  }
}

setInterval(() => {
  liveClients.forEach((clients, slug) => {
    if (clients.size > 0) {
      pollSheet(slug);
    }
  });
}, sheetPollIntervalMs);

function handleStream(req, res, slug) {
  const role = new URL(req.url, "http://localhost").searchParams.get("role") || "display";
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write("retry: 2000\n\n");

  const client = { res, role };
  if (!liveClients.has(slug)) {
    liveClients.set(slug, new Set());
  }
  liveClients.get(slug).add(client);
  sendStreamEvent(res, "live", getLiveState(slug));
  if (sheetCache.get(slug)?.status) {
    sendStreamEvent(res, "sheet", sheetCache.get(slug).status);
  }
  broadcastDisplayCount(slug);
  pollSheet(slug);

  // Proxies close idle connections, so send a comment every 25s.
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(keepAlive);
    liveClients.get(slug)?.delete(client);
    broadcastDisplayCount(slug);
  });
}

async function handleLiveCommand(req, res, slug) {
  const command = await readJsonBody(req);

  if (command.type === "spin") {
    const names = Array.isArray(command.names) ? command.names.map(String) : [];
    const targetIndex = Number(command.targetIndex);
    if (names.length < 2 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= names.length) {
      sendJson(res, 400, { error: "A spin needs at least 2 names and a valid target." });
      return;
    }
    const spin = {
      type: "spin",
      spinId: String(command.spinId || Date.now()),
      names,
      targetIndex,
      durationMs: Math.min(30000, Math.max(1000, Number(command.durationMs) || 7000)),
      winner: names[targetIndex],
      prize: String(command.prize || ""),
      prizeDetail: String(command.prizeDetail || ""),
      header: String(command.header || ""),
      receivedAt: Date.now(),
    };
    liveStates.set(slug, spin);
    broadcast(slug, "live", { ...spin, elapsedMs: 0 });
  } else {
    liveStates.delete(slug);
    broadcast(slug, "live", { type: "dismiss" });
  }

  sendJson(res, 200, { ok: true });
}

async function handleEventsApi(req, res, pathname) {
  const parts = pathname.split("/");
  const slug = parts[3] ? decodeURIComponent(parts[3]) : "";
  const action = parts[4] || "";

  if (!slug) {
    if (req.method === "GET") {
      sendJson(res, 200, listEvents());
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      const newSlug = slugify(body.slug || name);
      if (!name || !slugPattern.test(newSlug)) {
        sendJson(res, 400, { error: "Give the event a name, and an address using letters or numbers." });
        return;
      }
      if (reservedSlugs.has(newSlug)) {
        sendJson(res, 400, { error: `/${newSlug} is reserved. Pick another address.` });
        return;
      }
      if (readEvent(newSlug)) {
        sendJson(res, 409, { error: `An event at /${newSlug} already exists.` });
        return;
      }

      const template = body.copyFrom ? readEvent(String(body.copyFrom)) : null;
      const now = new Date().toISOString();
      const event = {
        slug: newSlug,
        name: name.slice(0, 120),
        sheetUrl: String(body.sheetUrl || "").trim(),
        names: [],
        removedNames: [],
        prizesText: "",
        currentPrizeIndex: 0,
        awards: [],
        settings: template ? template.settings : null,
        createdAt: now,
        updatedAt: now,
      };
      writeEvent(event);
      sendJson(res, 201, event);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const event = readEvent(slug);
  if (!event) {
    sendJson(res, 404, { error: "Event not found" });
    return;
  }

  if (action === "stream" && req.method === "GET") {
    handleStream(req, res, slug);
    return;
  }

  if (action === "live" && req.method === "POST") {
    await handleLiveCommand(req, res, slug);
    return;
  }

  if (action) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, event);
    return;
  }

  if (req.method === "PUT") {
    const changes = await readJsonBody(req);
    const previousSheetUrl = event.sheetUrl;
    const nextSheetUrl = typeof changes.sheetUrl === "string" ? changes.sheetUrl.trim() : event.sheetUrl;
    // While a sheet is connected the server owns the names list.
    if (nextSheetUrl) {
      delete changes.names;
    }
    applyEventChanges(event, changes);
    applySheetNames(event);
    writeEvent(event);
    sendJson(res, 200, { updatedAt: event.updatedAt });
    broadcast(slug, "updated", { updatedAt: event.updatedAt });
    if (event.sheetUrl && event.sheetUrl !== previousSheetUrl) {
      pollSheet(slug);
    }
    return;
  }

  if (req.method === "DELETE") {
    fs.unlinkSync(eventFilePath(slug));
    sheetCache.delete(slug);
    liveStates.delete(slug);
    sendJson(res, 200, { deleted: slug });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

const server = http.createServer(async (req, res) => {
  if (!isAuthorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Spin the Wheel"' });
    res.end("Password required");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  try {
    if (pathname === "/api/events" || pathname.startsWith("/api/events/")) {
      await handleEventsApi(req, res, pathname);
      return;
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Bad request" });
    return;
  }

  if (pathname === "/") {
    serveFile(res, "events.html");
    return;
  }

  const fileName = pathname.slice(1);
  if (publicFiles.has(fileName)) {
    serveFile(res, fileName);
    return;
  }

  // /<event-slug> is the control screen; /<event-slug>/display is the audience screen.
  const [slug, screen = "", ...rest] = fileName.replace(/\/$/, "").toLowerCase().split("/");
  if (rest.length === 0 && (screen === "" || screen === "display") && readEvent(slug)) {
    serveFile(res, screen === "display" ? "display.html" : "control.html");
    return;
  }

  res.writeHead(302, { Location: "/" });
  res.end();
});

server.listen(port, () => {
  console.log(`Spin the Wheel running at http://localhost:${port}`);
});
