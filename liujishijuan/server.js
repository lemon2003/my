/* 极简静态服务器（零依赖，仅用 Node 内置模块）
   用途：浏览器禁止在 file:// 下读取本地 PDF，阅读器必须通过 http 访问。
   运行：node server.js   然后访问 http://127.0.0.1:8000/            */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const START_PAGE = "/index.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ "Cache-Control": "no-cache" }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  } catch (e) {
    return send(res, 400, "Bad Request");
  }
  if (pathname === "/") pathname = START_PAGE;

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ""));
  if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not Found: " + pathname);

    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    // 支持 Range，PDF.js 可分段加载大文件
    if (range && /^bytes=/.test(range)) {
      const parts = range.replace(/bytes=/, "").split("-");
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (isNaN(start) || start >= stat.size) {
        return send(res, 416, "", { "Content-Range": "bytes */" + stat.size });
      }
      if (end >= stat.size) end = stat.size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = "http://127.0.0.1:" + PORT + START_PAGE;
  console.log("");
  console.log("  六级真题（本地版）已启动");
  console.log("  " + url);
  console.log("");
  console.log("  关闭此窗口即停止服务。");
  console.log("");
  const cmd =
    process.platform === "win32"
      ? 'start "" "' + url + '"'
      : process.platform === "darwin"
      ? 'open "' + url + '"'
      : 'xdg-open "' + url + '"';
  if (!process.env.NO_OPEN) exec(cmd, () => {});
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log("端口 " + PORT + " 已被占用。可换端口运行： set PORT=8001 && node server.js");
  } else {
    console.log("启动失败：" + e.message);
  }
});
