// Web server tĩnh tối giản (MetaMask không hoạt động khi mở file:// trực tiếp).
//   /       -> frontend/
//   /docs/  -> docs/
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5173;
const ROOT = path.join(__dirname, "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const base = urlPath.startsWith("/docs/") ? ROOT : path.join(ROOT, "frontend");
    const file = path.normalize(path.join(base, urlPath));
    if (!file.startsWith(base)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Không tìm thấy: " + urlPath);
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`Giao diện demo : http://localhost:${PORT}`);
    console.log(`Tài liệu       : http://localhost:${PORT}/docs/`);
  });
