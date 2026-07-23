const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const UPSTREAM = "https://holdthisdih.xyz";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function proxy(req, res, upstreamPath) {
  const target = new URL(upstreamPath, UPSTREAM);
  const headers = { ...req.headers, host: target.host };
  delete headers["accept-encoding"];

  const upstream = https.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, {
        "content-type": up.headers["content-type"] || "application/octet-stream",
        "cache-control": up.headers["cache-control"] || "no-store",
        "access-control-allow-origin": "*",
      });
      up.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream_failed", message: String(err.message) }));
  });

  req.pipe(upstream);
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || "/";

  if (urlPath === "/api/holders" || urlPath.startsWith("/api/holders?")) {
    return proxy(req, res, "/api/holders");
  }
  if (urlPath === "/api/holders/stream" || urlPath.startsWith("/api/holders/stream?")) {
    return proxy(req, res, "/api/holders/stream");
  }
  if (urlPath === "/api/meta" || urlPath.startsWith("/api/meta?")) {
    return proxyMeta(res);
  }

  return serveStatic(req, res, urlPath);
});

function proxyMeta(res) {
  https
    .get(UPSTREAM + "/", (up) => {
      let body = "";
      up.setEncoding("utf8");
      up.on("data", (chunk) => {
        body += chunk;
        if (body.length > 400000) up.destroy();
      });
      up.on("end", () => {
        let total = null;
        const m1 = body.match(/" of ","(\d+)"," wallets/);
        const m2 = body.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s+of\s+([0-9]{1,3}(?:,[0-9]{3})+)\s+wallets/);
        if (m1) total = Number(m1[1]);
        else if (m2) total = Number(m2[2].replace(/,/g, ""));
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify({ total: total || 3845153 }));
      });
    })
    .on("error", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ total: 3845153 }));
    });
}

server.listen(PORT, () => {
  console.log(`DIH site: http://localhost:${PORT}`);
  console.log(`Live holders proxied from ${UPSTREAM}`);
});
