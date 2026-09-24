'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useReadingScale } from '@/lib/useReadingScale';
import { isNativeApp } from '@/lib/api';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Saved theme, read synchronously on the client (SSR falls back to 'dark'). */
function getInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('theme') as Theme | null) ?? 'dark';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Initialize from localStorage synchronously. Previously this defaulted to
    // 'dark' and read storage in a post-paint effect, so the effect below would
    // briefly remove the `light` class the head bootstrap script had set —
    // re-introducing the very dark flash the script exists to prevent.
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

    // Publish `--reading-scale` from the reader's system text-size preference.
    // Lives here because this provider already wraps the whole app and owns the
    // other "how the reader wants things rendered" concern; it sets a CSS
    // variable and holds no state, so it costs nothing per render.
    useReadingScale();

    useEffect(() => {
        const root = window.document.documentElement;
        const apply = () => {
            const effectiveTheme = resolveTheme(theme);
            setResolvedTheme(effectiveTheme);
            if (effectiveTheme === 'light') {
                root.classList.add('light');
            } else {
                root.classList.remove('light');
            }
        };

        // Intentionally set state from this effect: resolvedTheme is deliberately
        // seeded to 'dark' and only resolved post-hydration (via matchMedia +
        // localStorage) so consumers don't hydration-mismatch and the head
        // bootstrap script's `light` class isn't briefly stripped — this is a
        // sync with those external systems, not a render-time derivation.
        apply();

        try {
            localStorage.setItem('theme', theme);
        } catch {
            // Private mode — the choice still applies for this session.
        }

        // 'system' (Auto) must follow the OS live: flipping iOS/macOS
        // appearance (or Control Center's dark-mode toggle, or the scheduled
        // sunset switch) while the app is open re-resolves the theme instead of
        // waiting for the next launch.
        if (theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, [theme]);

    // Native status bar text follows the resolved theme: light text on the
    // dark theme, dark text on the light one. Without this iOS picks by the
    // system appearance, so a light-theme app on a dark-mode phone drew white
    // clock/battery glyphs on a white header. Native only; the plugin is
    // imported lazily so the web bundle never loads it.
    useEffect(() => {
        if (!isNativeApp()) return;
        void import('@capacitor/status-bar')
            .then(({ StatusBar, Style }) =>
                StatusBar.setStyle({ style: resolvedTheme === 'dark' ? Style.Dark : Style.Light }))
            .catch(() => {
                // Older native build without the plugin — iOS keeps its default.
            });
    }, [resolvedTheme]);

    const setTheme = (newTheme: Theme) => setThemeState(newTheme);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
