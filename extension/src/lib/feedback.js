/**
 * Telling the user what happened when there is no popup on screen (right-
 * click saves, the screenshot shortcut, retries): the toolbar badge, and a
 * short confirmation drawn on the page itself.
 */

import { counts } from './queue.js';
import { t } from './i18n.js';
import { APP_URL } from './config.js';

/** Badge colors: the app's light-theme status tokens (white text on top). */
const COLORS = {
    ok: '#15803D',      // --success (light)
    neutral: '#4B5563', // --text-secondary (light)
    warn: '#B45309',    // --warning (light)
    error: '#DC2626',   // --danger (light)
};

const GLYPH = { ok: '✓', neutral: '✓', warn: '✓', error: '!' };

/** How long a per-tab result mark stays before the waiting count returns. */
export const FLASH_MS = 4000;

/** Show the number of saves waiting to be sent (or "!" if some failed). */
export async function refreshBadge() {
    const { waiting, failed } = await counts();
    const text = waiting > 0 ? (waiting > 99 ? '99+' : String(waiting)) : failed > 0 ? '!' : '';
    await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    await chrome.action.setBadgeBackgroundColor({ color: waiting > 0 ? COLORS.warn : COLORS.error });
    await chrome.action.setBadgeText({ text });
    await chrome.action.setTitle({ title: waiting > 0 ? t('actionTitleWaiting', String(waiting)) : t('actionTitle') });
}

/**
 * A result mark on one tab's badge for a few seconds. A queued save shows
 * the waiting count instead, which refreshBadge already set.
 * @param {number | undefined} tabId
 * @param {import('./describe.js').Tone} tone
 */
export async function flashBadge(tabId, tone) {
    if (typeof tabId !== 'number' || tabId < 0) return;
    try {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: COLORS[tone] });
        await chrome.action.setBadgeText({ tabId, text: GLYPH[tone] });
        setTimeout(() => {
            // null clears the tab's own text so the global (waiting count) shows.
            chrome.action.setBadgeText({ tabId, text: null }).catch(() => undefined);
            chrome.action.setBadgeBackgroundColor({ tabId, color: COLORS.warn }).catch(() => undefined);
        }, FLASH_MS);
    } catch {
        // The tab closed in the meantime.
    }
}

/**
 * Injected into the page (top frame, isolated world): a small confirmation in
 * a closed shadow root, so the page's styles can't reach it and it can't
 * reach the page's. Never takes focus; a status (or alert for errors) for
 * screen readers; goes away after 6 s unless hovered or focused; Escape or
 * the close button dismiss it. Self-contained: no outer variables.
 */
export function renderToast(p) {
    const TAG = 'machina-save-toast';
    for (const old of document.querySelectorAll(TAG)) old.remove();
    const host = document.createElement(TAG);
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
:host { all: initial !important; position: fixed !important; z-index: 2147483647 !important;
  right: 16px !important; bottom: 16px !important; left: auto !important; top: auto !important;
  display: block !important; direction: ltr !important; }
.toast { --card:#ffffff; --text:#111827; --muted:#4B5563; --border:rgba(0,0,0,.10);
  --ok:#15803D; --neutral:#4B5563; --warn:#B45309; --error:#DC2626; --focus:#22222A;
  box-sizing: border-box; width: min(360px, calc(100vw - 32px)); display: grid;
  grid-template-columns: 20px 1fr auto; gap: 4px 10px; align-items: start; padding: 12px 12px 12px 14px;
  background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  font: 14px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
@media (prefers-color-scheme: dark) { .toast { --card:#121212; --text:#E5E5E5; --muted:#A0A0A0;
  --border:rgba(255,255,255,.12); --ok:#22C55E; --neutral:#A0A0A0; --warn:#F59E0B; --error:#F87171; --focus:#E9E9F2; } }
@media (prefers-reduced-motion: no-preference) { .toast { animation: in .24s cubic-bezier(0.32,0.72,0,1); } }
@keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
svg { width: 20px; height: 20px; margin-top: 1px; }
.ok svg { color: var(--ok); } .neutral svg { color: var(--neutral); } .warn svg { color: var(--warn); } .error svg { color: var(--error); }
.title { font-weight: 600; margin: 0; }
.detail { color: var(--muted); margin: 2px 0 0; }
a { color: var(--text); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; display: inline-block; margin-top: 6px; padding: 2px 0; }
button { all: unset; box-sizing: border-box; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center;
  color: var(--muted); cursor: pointer; font-size: 20px; line-height: 1; }
button:hover { color: var(--text); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }`);
    root.adoptedStyleSheets = [sheet];

    const box = document.createElement('div');
    box.className = `toast ${p.tone}`;
    box.setAttribute('role', p.tone === 'error' ? 'alert' : 'status');
    box.setAttribute('lang', 'en');

    const NS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(NS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    const shapes = {
        check: ['M20 6 9 17l-5-5'],
        clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
        alert: ['M12 8v5', 'M12 16.5v.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
        link: ['M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1', 'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'],
    };
    for (const d of shapes[p.icon] || shapes.alert) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        icon.append(path);
    }

    const text = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = p.title;
    const detail = document.createElement('p');
    detail.className = 'detail';
    detail.textContent = p.detail;
    text.append(title, detail);
    if (p.openUrl) {
        const link = document.createElement('a');
        link.href = p.openUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = p.openLabel;
        text.append(link);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', p.dismissLabel);
    close.textContent = '×';

    box.append(icon, text, close);
    root.append(box);

    let timer = 0;
    const remove = () => {
        clearTimeout(timer);
        host.remove();
    };
    const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(remove, 6000);
    };
    close.addEventListener('click', remove);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') remove(); });
    box.addEventListener('mouseenter', () => clearTimeout(timer));
    box.addEventListener('mouseleave', arm);
    box.addEventListener('focusin', () => clearTimeout(timer));
    box.addEventListener('focusout', arm);
    (document.body || document.documentElement).append(host);
    arm();
}

/**
 * Show a result on the page. Silently does nothing where the browser doesn't
 * let extensions draw (its own pages, the Web Store); the badge still shows.
 * @param {number | undefined} tabId
 * @param {import('./describe.js').Description} view
 */
export async function showToast(tabId, view) {
    if (typeof tabId !== 'number' || tabId < 0) return;
    try {
        await chrome.scripting.executeScript({
            target: { tabId, frameIds: [0] },
            func: renderToast,
            args: [{
                tone: view.tone,
                icon: view.icon,
                title: view.title,
                detail: view.detail,
                openUrl: APP_URL,
                openLabel: t('toastOpen'),
                dismissLabel: t('toastDismiss'),
            }],
        });
    } catch {
        // Not allowed on this page.
    }
}
