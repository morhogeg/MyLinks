import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { test, expect, EXTENSION_SRC, type Ext } from './fixtures';

// Chrome Web Store screenshots (1280x800) and the small promo tile (440x280),
// built from the REAL popup: each shot drives the loaded extension against
// the stub backend, screenshots the popup itself, then places it over the
// page it saved inside a plain browser frame. The pages are made up for the
// shots (no real site or brand).
//
//   npm run extension:assets      (writes extension/store/*.png)

const OUT = join(EXTENSION_SRC, 'store');

const ENGLISH_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Why bridges sing in the wind</title>
<style>
body{margin:0;background:#fbfaf7;color:#1d1d1f;font:18px/1.65 Georgia,"Times New Roman",serif}
header{border-bottom:1px solid #e7e3da;padding:18px 56px;font:600 15px -apple-system,Segoe UI,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b665c}
main{width:560px;margin:44px 0 0 56px}
h1{font-size:40px;line-height:1.15;margin:0 0 14px;letter-spacing:-.01em}
.dek{font-size:20px;color:#55524b;margin:0 0 26px}
.meta{font:14px -apple-system,Segoe UI,sans-serif;color:#8a857b;margin-bottom:26px}
p{margin:0 0 18px}
</style></head><body><header>Field Notes</header><main>
<h1>Why bridges sing in the wind</h1>
<p class="dek">Long spans hum, flutter, and sometimes twist. Engineers have learned to listen.</p>
<div class="meta">12 min read</div>
<p>Stand under a long suspension bridge on a gusty day and you may hear it: a low, steady tone that rises and falls with the wind. The deck and cables are vibrating, shedding small whirlpools of air in a regular rhythm.</p>
<p>Most of the time the sound is harmless. The trouble starts when that rhythm lines up with the structure's own natural frequency, and each push arrives at exactly the wrong moment.</p>
</main></body></html>`;

const HEBREW_PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>איך גשרים נושאים את המשקל של עצמם</title>
<style>
body{margin:0;background:#141416;color:#ececef;font:18px/1.7 -apple-system,"Segoe UI","Noto Sans Hebrew",Arial,sans-serif}
header{border-bottom:1px solid #2a2a2f;padding:18px 56px;font-weight:600;font-size:15px;color:#9a9aa3}
main{width:560px;margin:44px auto 0 56px}
h1{font-size:38px;line-height:1.2;margin:0 0 14px}
.dek{font-size:20px;color:#b4b4bc;margin:0 0 26px}
.meta{font-size:14px;color:#85858e;margin-bottom:26px}
p{margin:0 0 18px;color:#d6d6db}
</style></head><body><header>יומן שדה</header><main>
<h1>איך גשרים נושאים את המשקל של עצמם</h1>
<p class="dek">קשתות דוחפות החוצה, כבלים מושכים פנימה. כך זה מחזיק.</p>
<div class="meta">8 דקות קריאה</div>
<p>גשר ארוך צריך קודם כל לשאת את עצמו. לפני כל מכונית ולפני כל הולך רגל, המשקל של הגשר עצמו הוא העומס הגדול ביותר שהוא נושא.</p>
<p>לכן מהנדסים מחפשים צורות שמעבירות את הכוח לקרקע בדרך הקצרה ביותר.</p>
</main></body></html>`;

interface Shot {
    file: string;
    headline: string;
    sub: string;
    dark: boolean;
    host: string;
    page: Buffer;
    popup: Buffer;
}

// Serve a made-up page at a made-up https address, so the popup shows a
// plausible host instead of the stub's 127.0.0.1.
async function pageShot(ext: Ext, url: string, html: string) {
    await ext.context.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 1120, height: 760 });
    await page.goto(url);
    const tabId = await ext.worker.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id ?? -1, url);
    return { tabId, png: await page.screenshot() };
}

async function popupShot(popup: import('@playwright/test').Page) {
    // Let fonts settle; the result line has already appeared.
    await popup.waitForTimeout(150);
    return popup.locator('.wrap').screenshot({ omitBackground: true });
}

const b64 = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;

function frameHtml(s: Shot, toolbarIcon: Buffer): string {
    const bg = s.dark ? 'linear-gradient(160deg,#1c1c22,#0b0b0e)' : 'linear-gradient(160deg,#f4f4f6,#e3e4e9)';
    const ink = s.dark ? '#f2f2f5' : '#111827';
    const sub = s.dark ? '#a8a8b3' : '#4b5563';
    const chrome = s.dark ? '#2a2a30' : '#e9e9ee';
    const bar = s.dark ? '#1f1f24' : '#ffffff';
    const pill = s.dark ? '#34343c' : '#f1f1f4';
    const pillInk = s.dark ? '#c9c9d1' : '#4b5563';
    const popupBorder = s.dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1280px;height:800px;overflow:hidden}
body{background:${bg};font-family:-apple-system,"SF Pro Display","Segoe UI",Roboto,Arial,sans-serif;position:relative}
.copy{position:absolute;left:64px;top:0;bottom:0;width:330px;display:flex;flex-direction:column;justify-content:center}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;font-size:18px;color:${ink};margin-bottom:28px}
.brand img{width:34px;height:34px;border-radius:9px}
h1{margin:0 0 16px;font-size:40px;line-height:1.1;letter-spacing:-.025em;color:${ink};font-weight:700}
p{margin:0;font-size:19px;line-height:1.45;color:${sub}}
.win{position:absolute;left:440px;top:88px;width:800px;height:624px;border-radius:14px;overflow:hidden;
 box-shadow:0 30px 80px -20px rgba(0,0,0,${s.dark ? '.7' : '.35'}),0 0 0 1px rgba(0,0,0,.08);background:${bar}}
.tabs{height:38px;background:${chrome};display:flex;align-items:flex-end;padding:0 12px;gap:8px}
.dots{display:flex;gap:7px;align-self:center;margin-right:10px}.dots i{width:11px;height:11px;border-radius:50%;background:${s.dark ? '#4a4a52' : '#c9c9d0'};display:block}
.tab{height:30px;width:220px;border-radius:9px 9px 0 0;background:${bar};padding:0 12px;display:flex;align-items:center;font-size:12px;color:${pillInk};white-space:nowrap;overflow:hidden}
.toolbar{height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid ${s.dark ? '#2c2c33' : '#e5e5ea'}}
.url{flex:1;height:30px;border-radius:15px;background:${pill};color:${pillInk};font-size:13px;display:flex;align-items:center;padding:0 14px}
.ext{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:${s.dark ? '#3a3a42' : '#e4e4ea'}}
.ext img{width:20px;height:20px}
.content{position:absolute;top:82px;left:0;right:0;bottom:0;overflow:hidden}
.content img{width:1120px;transform-origin:0 0;transform:scale(.7143);display:block}
.popup{position:absolute;right:28px;top:122px;border-radius:12px;overflow:hidden;box-shadow:0 18px 48px -8px rgba(0,0,0,${s.dark ? '.75' : '.30'}),0 0 0 1px ${popupBorder}}
.popup img{display:block;width:340px}
</style></head><body>
<div class="copy">
  <div class="brand"><img src="${b64(toolbarIcon)}" alt="">Machina</div>
  <h1>${s.headline}</h1>
  <p>${s.sub}</p>
</div>
<div class="win">
  <div class="tabs"><div class="dots"><i></i><i></i><i></i></div><div class="tab">${s.host}</div></div>
  <div class="toolbar"><div class="url">${s.host}</div><div class="ext"><img src="${b64(toolbarIcon)}" alt=""></div></div>
  <div class="content"><img src="${b64(s.page)}" alt=""></div>
</div>
<div class="popup" style="right:${1280 - 440 - 800 + 16}px;top:${88 + 82 + 6}px"><img src="${b64(s.popup)}" alt=""></div>
</body></html>`;
}

async function compose(ext: Ext, shots: Shot[]) {
    const { readFileSync } = await import('fs');
    const icon = readFileSync(join(EXTENSION_SRC, 'icons', 'icon128.png'));
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    mkdirSync(OUT, { recursive: true });
    for (const s of shots) {
        await page.setContent(frameHtml(s, icon));
        await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
        writeFileSync(join(OUT, s.file), await page.screenshot({ type: 'png' }));
    }

    // Small promo tile, 440x280.
    await page.setViewportSize({ width: 440, height: 280 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:440px;height:280px;overflow:hidden}
body{background:radial-gradient(120% 120% at 30% 20%,#3a3a46 0%,#16161c 55%,#0a0a0d 100%);font-family:-apple-system,"SF Pro Display","Segoe UI",Roboto,Arial,sans-serif;color:#f4f4f7;display:flex;flex-direction:column;justify-content:center;padding:0 40px}
.row{display:flex;align-items:center;gap:16px;margin-bottom:18px}
img{width:72px;height:72px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.5))}
.name{font-size:38px;font-weight:700;letter-spacing:-.02em}
.tag{font-size:21px;line-height:1.35;color:#c9ccd6;max-width:340px}
</style></head><body><div class="row"><img src="${b64(icon)}" alt=""><div class="name">Machina</div></div>
<div class="tag">Save any page in one click. Find it again when you need it.</div></body></html>`);
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
    writeFileSync(join(OUT, 'promo-small-440x280.png'), await page.screenshot({ type: 'png' }));
}

test('store screenshots and promo tile @assets', async ({ ext }) => {
    test.setTimeout(120_000);
    const shots: Shot[] = [];

    // 1. Save a page: light, English.
    await ext.connect();
    const en = await pageShot(ext, 'https://fieldnotes.example/bridges', ENGLISH_PAGE);
    let popup = await ext.openPopup(en.tabId, { colorScheme: 'light' });
    await expect(popup.getByText('Saved to Machina')).toBeVisible();
    shots.push({
        file: 'screenshot-1-save.png', dark: false, host: 'fieldnotes.example/bridges',
        headline: 'Save any page in one click', sub: 'Click the Machina icon, or press Ctrl+Shift+S. The page lands in your library and Machina reads it for you.',
        page: en.png, popup: await popupShot(popup),
    });

    // 2. Dark mode and a right-to-left page.
    const he = await pageShot(ext, 'https://yoman.example/gesher', HEBREW_PAGE);
    popup = await ext.openPopup(he.tabId, { colorScheme: 'dark' });
    await expect(popup.getByText('Saved to Machina')).toBeVisible();
    shots.push({
        file: 'screenshot-2-dark-rtl.png', dark: true, host: 'yoman.example/gesher',
        headline: 'Any page, any language', sub: 'Light or dark, left to right or right to left. The popup follows your system.',
        page: he.png, popup: await popupShot(popup),
    });

    // 3. Already saved, and saved for later.
    ext.stub.reply = () => ({ status: 200, body: { success: true, duplicate: true } });
    popup = await ext.openPopup(en.tabId, { colorScheme: 'light' });
    await expect(popup.getByText('Already in your library')).toBeVisible();
    shots.push({
        file: 'screenshot-3-already-saved.png', dark: false, host: 'fieldnotes.example/bridges',
        headline: 'Never save the same page twice', sub: 'Machina tells you when a page is already in your library, so it stays tidy.',
        page: en.png, popup: await popupShot(popup),
    });

    // 4. Connect in one click.
    await ext.worker.evaluate(() => chrome.storage.local.remove(['token', 'account']));
    popup = await ext.openPopup(en.tabId, { colorScheme: 'light' });
    await expect(popup.getByRole('heading', { name: 'Save anything in one click' })).toBeVisible();
    shots.push({
        file: 'screenshot-4-connect.png', dark: false, host: 'fieldnotes.example/bridges',
        headline: 'Connect in one click', sub: 'Signed in to Machina in this browser? One click links the extension to your account. Nothing to copy.',
        page: en.png, popup: await popupShot(popup),
    });

    await compose(ext, shots);
});

declare const chrome: {
    storage: { local: { remove(k: string[]): Promise<void> } };
    tabs: { query(q: object): Promise<Array<{ id?: number }>> };
};
