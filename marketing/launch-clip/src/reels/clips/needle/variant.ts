import { getInputProps } from 'remotion';
import { NEEDLES } from '../../../../clips/needle-timeline.mjs';
import BOOK_CARDS from './cards.json';
import VIDEO_CARDS from './cards-video.json';
import BOOK_VO from './needle-vo.json';
import VIDEO_VO from './needle-video-vo.json';

/**
 * Which needle this render is: the book (Sam's screenshot of Atomic Habits,
 * the default) or (round 3) the video (Sam's YouTube pick, Mark Manson's
 * "Life is a Video Game, Here Are the Cheat Codes"):
 *
 *   npx remotion render src/index.ts MachinaNeedle --props='{"needle":"video"}'
 *
 * Read once, at load, from the render's input props, so every module of the
 * reel (the field's layouts are built at load) agrees on it. One cut, one
 * camera, one score; what differs is here and in clips/needle-timeline.mjs
 * `NEEDLES`.
 */
const asked = (() => {
  try {
    return (getInputProps() as { needle?: string }).needle;
  } catch {
    return undefined;
  }
})();

/** a line's take, word-timed (audio/synth-vo.py) */
type VoLine = { frame: number; text: string; words: number[] };

const VARIANTS = {
  book: {
    ...NEEDLES.book,
    /** the needle's card (capture/library.mjs `NEEDLE.needle`) */
    needleId: 'atomichabits',
    /** the field's cards (capture/shoot.mjs `needleCards`) */
    cards: BOOK_CARDS as unknown,
    cardsDir: 'cards',
    /** the Ask take (capture/shoot.mjs `needleClip`) */
    take: 'clips/needle/app',
    /** what the answer's ping lands on: its citation */
    ping: 'cite1',
    vo: BOOK_VO as VoLine[],
    audio: 'clips/needle/score-vo.wav',
  },
  video: {
    ...NEEDLES.video,
    needleId: 'cheatcodes',
    cards: VIDEO_CARDS as unknown,
    cardsDir: 'cards-video',
    take: 'clips/needle/video',
    /** the key moment's time in the answer (3:16) */
    ping: 'time',
    vo: VIDEO_VO as VoLine[],
    audio: 'clips/needle/score-video-vo.wav',
  },
};

export const NEEDLE = VARIANTS[asked === 'video' ? 'video' : 'book'];
