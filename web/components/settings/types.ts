import type { Dispatch, SetStateAction } from 'react';
import type { User } from '@/lib/types';

// One home for "how Machina brings your saves back": the main list plus the
// drill-in sub-screens. Navigation is a simple stack (push/pop) so Back always
// returns to wherever you came from and the edge-swipe pops one level.
export type View = 'main' | 'account' | 'resurfacing' | 'cadence' | 'style' | 'schedule' | 'cards' | 'delivery' | 'extension';

export type Settings = User['settings'];
export type SetSettings = Dispatch<SetStateAction<Settings>>;
