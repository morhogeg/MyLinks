/**
 * THE SIGNATURE: the one ending every Machina video made from 2026-10-25 on
 * shares, frame for frame and sample for sample (owner: "some things must be
 * the same, e.g. the final frame with the Machina logo and the narration").
 *
 * Plain JS so the picture (kit/Signature.tsx) and the audio scripts
 * (mix-vo, a clip's score, its verify) read the same numbers. Nothing here is
 * per video: a video only chooses WHERE the signature starts (its last
 * SIGNATURE.frames frames) and, optionally, the footer line under it.
 *
 * The voice is ONE take, voiced once and never re-synthesized: FIND THE
 * BOOK's approved sign-off (Gemini TTS, Sulafat, audio/vo-takes/
 * ac1864b4dc285da306b9.flac), resampled to 44.1kHz and de-essed into
 * public/signature/signature-vo.wav. Changing the line means re-voicing it
 * here, for every future video at once, never inside one video.
 */

export const SIGNATURE = {
  /** 30fps, like every reel */
  fps: 30,
  /** its length: the last 5.0s of a video */
  frames: 150,
  /** the paper rises over the video's last shot in these frames */
  paperIn: 12,
  /** the voice take starts here (local frame) */
  voiceAt: 24,
  /** the take, under public/ (staticFile) and on disk from the project root */
  voiceFile: 'signature/signature-vo.wav',
  voicePath: 'public/signature/signature-vo.wav',
  /** the take's length, seconds */
  voiceSec: 3.09,
  /** what is said, and what is set (the name is the drawn wordmark) */
  spoken: 'Machina. Everything you save, finally useful.',
  line: 'Everything you save, finally useful.',
  /** measured word starts in the take, seconds (from needle-vo.json, frame 675) */
  words: [0.03, 0.86, 1.415, 1.617, 2.22, 2.64],
  /** the score under the signature ducks to this while the voice speaks */
  duck: 0.4,
  /** the layout, in 1080×1920 pixels: inside every feed's safe area */
  layout: { markY: 800, markW: 300, nameW: 440, nameDy: 165, lineDy: 261, lineSize: 50, footerDy: 345, footerSize: 34 },
};

/** local frame a word of the take starts on */
export const signatureWordAt = (k) => SIGNATURE.voiceAt + Math.round(SIGNATURE.words[k] * SIGNATURE.fps);
