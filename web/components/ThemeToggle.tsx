'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Avoid hydration mismatch by waiting for mount
    useEffect(() => {
        setTimeout(() => setMounted(true), 0);
    }, []);

    if (!mounted) return <div className="w-9 h-9" />;

    const toggleTheme = () => {
        if (theme === 'dark') setTheme('light');
        else if (theme === 'light') setTheme('system');
        else setTheme('dark');
    };

    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="h-9 w-9 rounded-full bg-card border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            title={`Theme: ${theme} — tap for ${next}`}
            aria-label={`Theme: ${theme}. Switch to ${next}`}
        >
            {theme === 'dark' ? (
                <Moon className="w-[18px] h-[18px]" />
            ) : theme === 'light' ? (
                <Sun className="w-[18px] h-[18px] text-amber-500" />
            ) : (
                <Monitor className="w-[18px] h-[18px]" />
            )}
        </button>
    );
}
