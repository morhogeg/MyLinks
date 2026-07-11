'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

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

    useEffect(() => {
        const root = window.document.documentElement;
        const effectiveTheme = resolveTheme(theme);

        // Intentionally set state from this effect: resolvedTheme is deliberately
        // seeded to 'dark' and only resolved post-hydration (via matchMedia +
        // localStorage) so consumers don't hydration-mismatch and the head
        // bootstrap script's `light` class isn't briefly stripped — this is a
        // sync with those external systems, not a render-time derivation.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResolvedTheme(effectiveTheme);

        if (effectiveTheme === 'light') {
            root.classList.add('light');
        } else {
            root.classList.remove('light');
        }

        localStorage.setItem('theme', theme);
    }, [theme]);

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
