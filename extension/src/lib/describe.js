/**
 * Plain words for a save's result. One mapping, used by the popup and by the
 * on-page toast, so a save reads the same wherever it was made.
 *
 * Result outcomes are the server's (api.js Outcome) plus the client-side
 * ones saves.js adds: queued, unsure, private-failed, queue-full,
 * not-connected, unsavable, image-unsavable, screenshot-failed, no-tab.
 */

import { t } from './i18n.js';

/**
 * @typedef {'ok' | 'neutral' | 'warn' | 'error'} Tone
 * @typedef {{tone: Tone, icon: 'check' | 'clock' | 'alert' | 'link', title: string, detail: string}} Description
 */

const UNSAVABLE_REASON = {
    browser: 'unsavableBrowser',
    file: 'unsavableFile',
    other: 'unsavableOther',
};

/**
 * @param {{outcome: string, kind?: string, quote?: string, cause?: string, queued?: boolean,
 *          message?: string, error?: string, reason?: string}} r
 * @returns {Description}
 */
export function describe(r) {
    const screenshot = r.kind === 'screenshot';
    const hasQuote = Boolean(r.quote);
    switch (r.outcome) {
        case 'saved':
            return screenshot
                ? { tone: 'ok', icon: 'check', title: t('screenshotSavedTitle'), detail: t('screenshotSavedDetail') }
                : { tone: 'ok', icon: 'check', title: t('savedTitle'), detail: t(hasQuote ? 'savedQuoteDetail' : 'savedDetail') };
        case 'duplicate':
            return { tone: 'neutral', icon: 'check', title: t('duplicateTitle'), detail: t(hasQuote ? 'duplicateQuoteDetail' : 'duplicateDetail') };
        case 'waiting':
            return { tone: 'warn', icon: 'clock', title: t('waitingTitle'), detail: r.message || t('waitingDetail') };
        case 'reconnect':
            return { tone: 'warn', icon: 'alert', title: t('reconnectTitle'), detail: t(r.queued === false ? 'reconnectNotKeptDetail' : 'reconnectDetail') };
        case 'queued': {
            const key = r.cause === 'offline' ? 'queuedOfflineDetail'
                : r.cause === 'rate-limited' ? 'queuedRateDetail' : 'queuedServerDetail';
            return { tone: 'warn', icon: 'clock', title: t('queuedTitle'), detail: t(key) };
        }
        case 'timeout':
        case 'unsure':
            return { tone: 'warn', icon: 'alert', title: t('unsureTitle'), detail: t('unsureDetail') };
        case 'unexpected':
            return { tone: 'warn', icon: 'alert', title: t('unsureTitle'), detail: t('unexpectedDetail') };
        case 'too-large':
            return { tone: 'error', icon: 'alert', title: t('tooLargeTitle'), detail: r.error || t('tooLargeDetail') };
        case 'rejected':
            return { tone: 'error', icon: 'alert', title: t('rejectedTitle'), detail: r.error || t('rejectedDetail') };
        case 'quota':
            return { tone: 'warn', icon: 'alert', title: t('quotaTitle'), detail: t('quotaDetail') };
        case 'private-failed':
            return { tone: 'error', icon: 'alert', title: t('privateFailedTitle'), detail: t('privateFailedDetail') };
        case 'queue-full':
            return { tone: 'error', icon: 'alert', title: t('queueFullTitle'), detail: t('queueFullDetail') };
        case 'not-connected':
            return { tone: 'neutral', icon: 'link', title: t('notConnectedTitle'), detail: t('notConnectedDetail') };
        case 'unsavable':
            return { tone: 'neutral', icon: 'alert', title: t('unsavableTitle'), detail: t(UNSAVABLE_REASON[r.reason] || 'unsavableOther') };
        case 'image-unsavable':
            return { tone: 'neutral', icon: 'alert', title: t('rejectedTitle'), detail: t('imageNotSavable') };
        case 'screenshot-failed':
            return { tone: 'error', icon: 'alert', title: t('screenshotFailedTitle'), detail: t('screenshotFailedDetail') };
        case 'no-tab':
            return { tone: 'neutral', icon: 'alert', title: t('noTabTitle'), detail: t('noTabDetail') };
        // Only reachable if the queue was skipped (not expected): say what is known.
        case 'offline':
        case 'network':
        case 'server':
        case 'rate-limited':
            return { tone: 'error', icon: 'alert', title: t('privateFailedTitle'), detail: t('tokenNetwork') };
        default:
            return { tone: 'warn', icon: 'alert', title: t('unsureTitle'), detail: t('unexpectedDetail') };
    }
}
