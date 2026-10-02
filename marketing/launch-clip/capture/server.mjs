/**
 * The capture server: serves the real app's static export and stands in for
 * the backend behind `/api/*`, answering in exactly the shapes the app's own
 * code parses (web/components/AskBrain.tsx for the chat stream,
 * web/lib/useSemanticSearch.ts for search, web/lib/entitlement.ts, the
 * AddLinkForm enqueue). The answers themselves come from capture/library.mjs.
 *
 * Used in-process by capture/shoot.mjs, which also holds the pacing controls:
 * the Ask stream releases text only when the shooter asks for more, so a
 * capture can photograph the answer at any point of its arrival.
 *
 *   node capture/server.mjs   (standalone, for poking at the app by hand)
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADASK_TED, ASK, ASK_MORE, CAPTURE_USER, CARDS, SEARCH, TRIP_ASK, TRIP_CARDS } from './library.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', 'out', 'capture', 'app', 'out');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const readBody = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
  });

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const cardSource = (id) => {
  // (the trip ad's cards are written by its own take, not seeded)
  const c = CARDS.find((x) => x.id === id) ?? TRIP_CARDS.find((x) => x.id === id);
  return { id, title: c.title, category: c.category, sourceName: c.sourceName ?? null, url: c.url || null };
};

export function startServer(port = 4600) {
  /** The Ask stream in flight, released by `advanceChat`. */
  let chat = null;
  const log = [];

  const sse = (res, evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);

  const api = async (req, res, url) => {
    const body = req.method === 'POST' ? await readBody(req) : {};
    log.push({ path: url.pathname, body });

    switch (url.pathname) {
      case '/api/callable/claim_workspace':
        return json(res, 200, { data: { uid: CAPTURE_USER.uid }, uid: CAPTURE_USER.uid });
      case '/api/claim-workspace':
        return json(res, 200, { uid: CAPTURE_USER.uid });
      case '/api/entitlement':
      case '/api/entitlement/sync':
        return json(res, 200, {
          plan: 'pro',
          source: 'founder',
          proUntil: null,
          trialEndsAt: null,
          quotas: { saves: { used: 0, limit: 0 }, asks: { used: 0, limit: 0 }, imports: { used: 0, limit: 0 } },
        });
      case '/api/search': {
        if (body.warmup) {
          res.writeHead(204);
          return res.end();
        }
        const q = String(body.query ?? '').trim().toLowerCase();
        const hits = q === SEARCH.query.toLowerCase() ? SEARCH.hits : [];
        return json(res, 200, { links: hits.map((id) => ({ id })), mode: 'judge' });
      }
      case '/api/share':
        return json(res, 200, { success: true, cardId: body.cardId ?? null });
      case '/api/chat': {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.flushHeaders?.();
        // (the ASK clip's follow-up: any other question gets ASK_MORE)
        // (the Ask ad's questions get their own answers)
        const own = [TRIP_ASK, ADASK_TED].find((r) => r.question === body.question);
        const reply = own ?? (body.question === undefined || body.question === ASK.question ? ASK : ASK_MORE);
        chat = { res, sent: 0, text: reply.answer, sources: reply.sources, sourcesSent: false };
        return;
      }
      case '/api/client-error':
        res.writeHead(204);
        return res.end();
      default:
        return json(res, 404, { error: `capture server has no ${url.pathname}` });
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return api(req, res, url);

    // static export: /x → x.html, /x/ → x/index.html, / → index.html
    let p = decodeURIComponent(url.pathname);
    let file = path.join(ROOT, p);
    if (p.endsWith('/')) file = path.join(file, 'index.html');
    else if (!path.extname(p) && fs.existsSync(file + '.html')) file += '.html';
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        log,
        close: () => new Promise((r) => server.close(r)),
        chatOpen: () => !!chat,
        /** Release `n` more characters of the Ask answer (whole words). */
        advanceChat: (n) => {
          if (!chat) return false;
          let end = Math.min(chat.text.length, chat.sent + n);
          while (end < chat.text.length && !/\s/.test(chat.text[end])) end++;
          if (end > chat.sent) {
            sse(chat.res, { type: 'token', text: chat.text.slice(chat.sent, end) });
            chat.sent = end;
          }
          return chat.sent >= chat.text.length;
        },
        /** Finish the answer: the rest of the text, the sources, done. */
        finishChat: () => {
          if (!chat) return;
          if (chat.sent < chat.text.length) sse(chat.res, { type: 'token', text: chat.text.slice(chat.sent) });
          sse(chat.res, { type: 'sources', sources: (chat.sources ?? ASK.sources).map(cardSource) });
          sse(chat.res, { type: 'done' });
          chat.res.end();
          chat = null;
        },
      }),
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer(Number(process.env.PORT ?? 4600));
  console.log(`capture server on ${s.url} (Ctrl-C to stop)`);
  // standalone: stream answers on a timer so the app can be used by hand
  setInterval(() => {
    if (s.chatOpen() && s.advanceChat(6)) s.finishChat();
  }, 60);
}
