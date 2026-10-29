const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
};

// Only these files are served; everything else (server code, data) stays private.
const publicFiles = new Set(["index.html", "events.html", "styles.css", "app.js", "events.js"]);
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

async function handleSheetRequest(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  const downloadUrl = resolveSheetDownloadUrl(requestUrl.searchParams.get("url") || "");

  if (!downloadUrl) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Unsupported sheet link. Use a Google Sheets or OneDrive/SharePoint share link.");
    return;
  }

  try {
    const upstream = await fetch(downloadUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const contentType = upstream.headers.get("content-type") || "";

    // A sign-in page instead of a file means the sheet isn't shared publicly.
    if (!upstream.ok || contentType.includes("text/html")) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Couldn't read the sheet. Make sure it's shared as \"Anyone with the link\".");
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(504, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Timed out reading the sheet.");
  }
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
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(fileName)] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleEventsApi(req, res, pathname) {
  const slug = pathname.split("/")[3] ? decodeURIComponent(pathname.split("/")[3]) : "";

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

  if (req.method === "GET") {
    sendJson(res, 200, event);
    return;
  }

  if (req.method === "PUT") {
    const changes = await readJsonBody(req);
    writeEvent(applyEventChanges(event, changes));
    sendJson(res, 200, { updatedAt: event.updatedAt });
    return;
  }

  if (req.method === "DELETE") {
    fs.unlinkSync(eventFilePath(slug));
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
    if (pathname === "/api/sheet") {
      await handleSheetRequest(req, res);
      return;
    }

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

  // /<event-slug> opens that event's wheel.
  const slug = fileName.replace(/\/$/, "").toLowerCase();
  if (readEvent(slug)) {
    serveFile(res, "index.html");
    return;
  }

  res.writeHead(302, { Location: "/" });
  res.end();
});

server.listen(port, () => {
  console.log(`Spin the Wheel running at http://localhost:${port}`);
});
