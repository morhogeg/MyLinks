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

    if (!mounted) return <div className="w-10 h-10" />;

    const toggleTheme = () => {
        if (theme === 'dark') setTheme('light');
        else if (theme === 'light') setTheme('system');
        else setTheme('dark');
    };

    return (
        <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-card border border-white/5 text-text-secondary hover:text-white hover:bg-card-hover transition-all flex items-center justify-center gap-2"
            title={`Current: ${theme} mode`}
        >
            {theme === 'dark' ? (
                <Moon className="w-5 h-5" />
            ) : theme === 'light' ? (
                <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
                <Monitor className="w-5 h-5" />
            )}
            <span className="text-xs font-medium uppercase tracking-wider hidden sm:inline">
                {theme}
            </span>
        </button>
    );
}
