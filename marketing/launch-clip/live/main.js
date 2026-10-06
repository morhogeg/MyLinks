/**
 * The live film's player: loads the capture index, builds the stage and the
 * film, and runs it in real time with a scrubber and chapter marks.
 *
 *   ?format=landscape|portrait   (default: by the window's shape)
 *   ?t=12.5                      start at a time (seconds)
 *   ?render                      frame-exact mode for live/render.mjs: no
 *                                clock, window.__film.seek(t) draws a frame
 *                                and resolves once every image is decoded
 */

import { Stage } from './engine/stage.js';
import { Captions } from './engine/type.js';
import { buildFilm } from './film/script.js';
import { FORMATS } from './film/formats.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const pick = () => {
  const f = params.get('format');
  if (f && FORMATS[f]) return FORMATS[f];
  return innerHeight > innerWidth * 1.15 && FORMATS.portrait ? FORMATS.portrait : FORMATS.landscape;
};
const format = pick();
if (RENDER) document.body.classList.add('render');

const frame = document.getElementById('frame');
frame.style.width = `${format.size.w}px`;
frame.style.height = `${format.size.h}px`;
frame.classList.add(`fmt-${format.name}`);

const fit = () => {
  if (RENDER) {
    frame.style.transform = '';
    return;
  }
  const s = Math.min(innerWidth / format.size.w, innerHeight / format.size.h);
  const x = (innerWidth - format.size.w * s) / 2;
  const y = (innerHeight - format.size.h * s) / 2;
  frame.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
};
fit();
addEventListener('resize', fit);

// the baked artifact page carries its index inline; everywhere else it is fetched
const index = window.__MACHINA_INDEX__ ?? (await fetch('media/index.json').then((r) => r.json()));
// LIVE (the baked site): the slab plays the baked screen video and the
// page's clock follows it; RENDER and the dev server use the PNG frames
const LIVE = !RENDER && !!index.live;
let video = null;
let audio = null;
if (LIVE) {
  video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  // H.264 where the browser has it (Safari, Chrome, Edge, most Firefox), VP9
  // where it does not
  const h264 = video.canPlayType('video/mp4; codecs="avc1.640028"');
  video.src = h264 || !index.live.screenWebm ? index.live.screen : index.live.screenWebm;
  if (index.live.score) {
    audio = new Audio(index.live.score);
    audio.preload = 'auto';
  }
}
const stage = new Stage(frame, format.size);
const captions = new Captions(frame.querySelector('.type'));
const overlay = {
  root: frame,
  taps: frame.querySelector('.taps'),
  marks: frame.querySelector('.marks'),
  threads: frame.querySelector('.threads'),
  brand: frame.querySelector('.brand'),
  day: [...frame.querySelectorAll('.paper .day')],
};
const film = buildFilm({ stage, index, captions, overlay, format, video });
await document.fonts.load('600 58px Geist').catch(() => {});

const decodeAll = (imgs) =>
  Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth
        ? img.decode().catch(() => {})
        : new Promise((res) => {
            img.addEventListener('load', () => img.decode().catch(() => {}).then(res), { once: true });
            img.addEventListener('error', res, { once: true });
          }),
    ),
  );

if (RENDER) {
  // first frame: also wait for every constellation card image
  await decodeAll([...frame.querySelectorAll('img')].filter((i) => i.src));
  window.__film = {
    duration: film.duration,
    chapters: film.chapters,
    async seek(t) {
      const imgs = film.update(t);
      await decodeAll(imgs);
      await new Promise((r) => requestAnimationFrame(() => r()));
      return true;
    },
  };
  window.__filmReady = true;
} else {
  runPlayer();
}

function runPlayer() {
  const controls = document.getElementById('controls');
  const playBtn = document.getElementById('play');
  const soundBtn = document.getElementById('sound');
  const scrub = document.getElementById('scrub');
  const fill = scrub.querySelector('.fill');
  const knob = scrub.querySelector('.knob');
  const timeEl = document.getElementById('time');
  const chapterEl = document.getElementById('chapter');
  const D = film.duration;
  let t = Number(params.get('t') ?? 0);
  let playing = false;
  let soundOn = false;
  let last = performance.now();
  let idleTimer = 0;

  for (const ch of film.chapters.slice(1)) {
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.title = ch.name;
    tick.setAttribute('aria-label', `Jump to ${ch.name}`);
    tick.style.left = `${(ch.t / D) * 100}%`;
    tick.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      seek(ch.t);
    });
    scrub.appendChild(tick);
    ch.el = tick;
  }

  const fmt = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  const icon = () => {
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    if (soundBtn) {
      soundBtn.hidden = !audio;
      soundBtn.setAttribute('aria-label', soundOn ? 'Mute' : 'Sound on');
      soundBtn.innerHTML = soundOn
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';
    }
  };
  const draw = () => {
    film.update(t);
    const k = Math.min(1, t / D);
    fill.style.width = `${k * 100}%`;
    knob.style.left = `${k * 100}%`;
    timeEl.textContent = `${fmt(t)} / ${fmt(D)}`;
    let current = film.chapters[0];
    for (const ch of film.chapters) {
      ch.el?.classList.toggle('on', t >= ch.t);
      if (t >= ch.t) current = ch;
    }
    if (chapterEl.textContent !== current.name) chapterEl.textContent = current.name;
  };
  const wake = () => {
    controls.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => playing && controls.classList.add('idle'), 2200);
  };
  const syncAudio = (force) => {
    if (!audio) return;
    audio.muted = !soundOn;
    if (!playing || !soundOn) {
      if (!audio.paused) audio.pause();
      return;
    }
    if (force || Math.abs(audio.currentTime - t) > 0.12) audio.currentTime = t;
    if (audio.paused) audio.play().catch(() => {});
  };
  function seek(to) {
    t = Math.max(0, Math.min(D, to));
    if (video) video.currentTime = Math.min(t, (video.duration || D) - 0.01);
    syncAudio(true);
    draw();
  }
  function setPlaying(on) {
    if (on && t >= D - 0.02) seek(0);
    playing = on;
    if (video) {
      if (on) video.play().catch(() => {
        // autoplay refused: wait for a tap
        playing = false;
        icon();
      });
      else video.pause();
    }
    syncAudio(true);
    icon();
    wake();
  }
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setPlaying(!playing);
  });
  soundBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    syncAudio(true);
    icon();
    wake();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!playing);
    } else if (e.code === 'ArrowRight') seek(t + 2);
    else if (e.code === 'ArrowLeft') seek(t - 2);
    else if (e.code === 'KeyM' && audio) soundBtn.click();
    wake();
  });
  addEventListener('pointermove', wake);
  frame.addEventListener('click', () => setPlaying(!playing));
  const seekTo = (e) => {
    const r = scrub.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * D);
  };
  scrub.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    scrub.setPointerCapture(e.pointerId);
    seekTo(e);
    const move = (ev) => seekTo(ev);
    const up = () => {
      scrub.removeEventListener('pointermove', move);
      scrub.removeEventListener('pointerup', up);
    };
    scrub.addEventListener('pointermove', move);
    scrub.addEventListener('pointerup', up);
  });
  // reduced motion: start paused on the endcard's first frame of the title
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      // the video is the clock when there is one: the screen can never drift
      // from the 3D around it
      if (video && video.readyState >= 2 && !video.paused) t = Math.min(D, video.currentTime);
      else if (!video) t += dt;
      if (t >= D - 0.01 || (video && video.ended)) {
        t = D;
        setPlaying(false);
      }
      syncAudio(false);
    }
    draw();
    requestAnimationFrame(loop);
  };
  let started = false;
  // a plain #save / #find / #ask / #connect / #revisit starts at that chapter
  // (the one part of a link every host passes through)
  const hashChapter = film.chapters.find((ch) => `#${ch.name.toLowerCase()}` === location.hash.toLowerCase());
  if (hashChapter && !params.has('t')) t = hashChapter.t;
  const start = () => {
    if (started) return;
    started = true;
    document.getElementById('loading').classList.add('gone');
    icon();
    wake();
    if (reduce && !params.has('t') && !hashChapter) seek(film.at.outro + 3.2);
    else {
      seek(t);
      if (!params.has('paused') && !reduce) setPlaying(true);
    }
    requestAnimationFrame(loop);
  };
  if (video && video.readyState < 3) {
    video.addEventListener('canplaythrough', start, { once: true });
    video.addEventListener('loadeddata', () => setTimeout(start, 1500), { once: true });
    video.addEventListener('error', () => {
      document.getElementById('loading').textContent = 'This browser cannot play the film.';
    });
    video.load();
  } else start();
}
