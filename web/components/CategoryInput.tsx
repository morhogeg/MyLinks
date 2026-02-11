'use client';

import { useState, useEffect, useRef } from 'react';
import { getCategoryColorStyle } from '@/lib/colors';
import { Check, Plus } from 'lucide-react';

interface CategoryInputProps {
    currentCategory: string;
    allCategories: string[];
    onUpdate: (category: string) => void;
    onCancel: () => void;
    className?: string;
    autoFocus?: boolean;
}

export default function CategoryInput({
    currentCategory,
    allCategories,
    onUpdate,
    onCancel,
    className = '',
    autoFocus = true
}: CategoryInputProps) {
    const [value, setValue] = useState(currentCategory);
    const [isOpen, setIsOpen] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial focus
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    // Handle outside clicks
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                // If user clicks outside, save if changed, otherwise cancel
                if (value.trim() && value !== currentCategory) {
                    onUpdate(value.trim());
                } else {
                    onCancel();
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value, currentCategory, onUpdate, onCancel]);

    // Filter categories
    const filteredCategories = allCategories
        .filter(c => c.toLowerCase().includes(value.toLowerCase()));

    const exactMatch = allCategories.some(c => c.toLowerCase() === value.toLowerCase().trim());
    const isNew = value.trim() !== '' && !exactMatch;

    const colorStyle = getCategoryColorStyle(value || 'gray');

    return (
        <div className="relative inline-block" ref={containerRef}>
            <input
                ref={inputRef}
                type="text"
                className={`uppercase font-black tracking-widest px-2 py-0.5 rounded-lg outline-none focus:ring-1 focus:ring-accent/50 bg-white/10 ${className}`}
                style={{
                    color: colorStyle.color,
                    minWidth: '80px'
                }}
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    setIsOpen(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (value.trim()) {
                            onUpdate(value.trim());
                        } else {
                            onCancel();
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onCancel();
                    }
                }}
                onClick={(e) => e.stopPropagation()}
            />

            {isOpen && (value.trim() !== '' || filteredCategories.length > 0) && (
                <div
                    className="absolute top-full start-0 mt-1 w-48 bg-card border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col py-1 animate-in fade-in zoom-in-95 duration-200 max-h-60 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    {filteredCategories.map(category => (
                        <button
                            key={category}
                            onClick={() => onUpdate(category)}
                            className="flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 text-start w-full transition-colors group"
                        >
                            <span
                                className="font-bold uppercase tracking-wider"
                                style={{ color: getCategoryColorStyle(category).color }}
                            >
                                {category}
                            </span>
                            {category === currentCategory && <Check className="w-3 h-3 text-accent" />}
                        </button>
                    ))}

                    {isNew && (
                        <button
                            onClick={() => onUpdate(value.trim())}
                            className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/10 text-start w-full transition-colors border-t border-white/5 text-accent font-bold"
                        >
                            <Plus className="w-3 h-3" />
                            Create &quot;{value.trim()}&quot;
                        </button>
                    )}

                    {filteredCategories.length === 0 && !isNew && (
                        <div className="px-3 py-2 text-xs text-text-muted italic">
                            Type to create...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
