const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

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

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/sheet")) {
    handleSheetRequest(req, res);
    return;
  }

  const pathname = decodeURIComponent(req.url.split("?")[0]);
  const urlPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Spin the Wheel running at http://localhost:${port}`);
});
