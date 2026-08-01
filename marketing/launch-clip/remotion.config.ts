import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(96);
Config.setCodec('h264');
Config.setCrf(17);
Config.setChromiumOpenGlRenderer('angle-egl');
// Concurrency 2, deliberately. At 4, a page wedged partway through the render
// (~frame 512) and its pending delayRender timed out — the frames themselves are
// fine, they render cleanly in isolation. Four 1080p pages each holding the
// blur/backdrop-filter layers is simply more than this container has to give.
Config.setConcurrency(2);
// Grain, blurs and backdrop-filters are the point of the look — never let the
// renderer skip a frame it hasn't finished painting.
Config.setDelayRenderTimeoutInMilliseconds(120000);

// This environment blocks egress to remotion.media, so Remotion cannot fetch its
// own Chrome Headless Shell. Point it at the Chromium that ships with the
// container's Playwright install instead (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
Config.setBrowserExecutable('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell');
