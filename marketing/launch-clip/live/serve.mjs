/**
 * Serve the live film locally.
 *
 *   node live/serve.mjs            → http://127.0.0.1:4700
 *   node live/serve.mjs --site     the baked site (out/live/site), as hosted
 *   LIVE_TAKES=takes-dpr1 node live/serve.mjs   (a lighter capture, for work)
 *
 *   /                 live/index.html (the stage)
 *   /media/index.json the captures' index, built from the take manifests
 *   /media/takes/...  the captured frames (out/live/<LIVE_TAKES>/...)
 *   /media/fonts/...  Geist, from node_modules (the app's own face)
 *   anything else     live/...
 *
 * Also used in-process by live/render.mjs.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './media.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const clip = path.join(here, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

export function startLiveServer({ port = 4700, takes = process.env.LIVE_TAKES ?? 'takes', site = false } = {}) {
  const takesDir = path.join(clip, 'out', 'live', takes);
  const siteDir = path.join(clip, 'out', 'live', 'site');
  const fontsDir = path.join(clip, 'node_modules', 'geist', 'dist', 'fonts', 'geist-sans');
  let index = null;

  // byte ranges, so a browser can seek inside the baked video
  const send = (res, file, req) => {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    const size = fs.statSync(file).size;
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const range = req?.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const a = range[1] ? Number(range[1]) : size - Number(range[2]);
      const b = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (site) {
      // the baked site, exactly as it would be hosted
      const file = path.join(siteDir, p === '/' ? 'index.html' : p);
      return file.startsWith(siteDir) ? send(res, file, req) : send(res, '');
    }
    if (p === '/' || p === '/index.html') return send(res, path.join(here, 'index.html'), req);
    if (p === '/media/index.json') {
      index ??= buildIndex(takesDir);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(index));
    }
    if (p.startsWith('/media/takes/')) {
      const file = path.join(takesDir, p.slice('/media/takes/'.length));
      return file.startsWith(takesDir) ? send(res, file, req) : send(res, '');
    }
    if (p.startsWith('/media/fonts/')) return send(res, path.join(fontsDir, path.basename(p)), req);
    if (p.startsWith('/media/')) return send(res, path.join(clip, 'out', 'live', 'media', p.slice('/media/'.length)), req);
    const file = path.join(here, p);
    return file.startsWith(here) ? send(res, file, req) : send(res, '');
  });

  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)), reindex: () => (index = null) }),
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.argv.includes('--site');
  const s = await startLiveServer({ port: Number(process.env.PORT ?? 4700), site });
  console.log(`live film${site ? ' (baked site)' : ''} on ${s.url} (Ctrl-C to stop)`);
}
