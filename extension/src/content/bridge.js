/**
 * One-click connect, on mymachina.app only (top frame).
 *
 * The web app (web/lib/extension.ts) asks with window.postMessage, addressed
 * to its own origin:
 *   { source: 'machina-web', id, type: 'machina-ping' | 'machina-connect' | 'machina-disconnect', ... }
 * and this script relays to the service worker, which checks the sender and
 * the token (with the server) before keeping anything. Answers go back to
 * the same origin as { source: 'machina-extension', id, reply }. The token is
 * never sent back to the page; ping returns only a one-way tag of it.
 *
 * Plain script (content scripts are not modules), no access to the page's
 * JavaScript, and nothing here reads the page.
 */
(() => {
    if (window.top !== window) return;

    const FROM_PAGE = 'machina-web';
    const FROM_EXT = 'machina-extension';
    const TYPES = new Set(['machina-ping', 'machina-connect', 'machina-disconnect']);
    const ORIGIN = location.origin;

    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

    const answer = (id, reply) => {
        window.postMessage({ source: FROM_EXT, id, reply }, ORIGIN);
    };

    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== ORIGIN) return;
        const d = event.data;
        if (!d || typeof d !== 'object' || d.source !== FROM_PAGE || !TYPES.has(d.type)) return;
        if (typeof d.id !== 'string' || !d.id || d.id.length > 64) return;

        // Forward only known fields, bounded; the worker validates again.
        const request = { type: d.type };
        if (d.type === 'machina-connect') {
            request.token = str(d.token, 256);
            request.account = str(d.account, 320);
        } else if (d.type === 'machina-disconnect') {
            request.tokenTag = str(d.tokenTag, 64);
        }

        let sent;
        try {
            sent = chrome.runtime.sendMessage({ type: 'bridge', request });
        } catch {
            // The extension was updated or removed since this page loaded.
            sent = Promise.reject(new Error('unavailable'));
        }
        sent.then(
            (reply) => answer(d.id, reply ?? null),
            () => answer(d.id, d.type === 'machina-ping' ? null : { ok: false, reason: 'unavailable' }),
        );
    });

    // Tell a page that is already listening (web/lib/extension.ts onExtensionReady).
    const ready = () => window.postMessage({ source: FROM_EXT, type: 'machina-ready' }, ORIGIN);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready, { once: true });
    } else {
        ready();
    }
})();
