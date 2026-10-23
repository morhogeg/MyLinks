/**
 * The ink list, typed for the picture. The data and the scroll live in
 * clips/revisit-list.mjs (plain JS: the score clicks on the same scroll, the
 * gates check the same saves).
 */
import * as LIST from '../../../../clips/revisit-list.mjs';

export type Item = { id: string; verb: string; title: string; meta: string; br?: string; act?: number };

export const ITEMS = LIST.ITEMS as Item[];
export const VIDEO: number = LIST.VIDEO;
export const ACTS = LIST.ACTS as { it: Item; k: number }[];
export const linesOf = LIST.linesOf as (it: Item) => [string, string | null];
export const L = LIST.L;
export const heightOf = LIST.heightOf as (it: Item) => number;
export const TOPS = LIST.TOPS as unknown as number[];
export const LIST_H: number = LIST.LIST_H;
export const STOP_Y: number = LIST.STOP_Y;
export const scrollAt = LIST.scrollAt as (t: number) => number;
export const speedAt = LIST.speedAt as (t: number) => number;
