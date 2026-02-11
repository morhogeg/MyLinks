'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Check, Search } from 'lucide-react';

interface TagInputProps {
    allTags: string[];
    existingTags: string[];
    onAdd: (tag: string) => void;
    onCancel: () => void;
    className?: string;
    placeholder?: string;
}

export default function TagInput({
    allTags,
    existingTags,
    onAdd,
    onCancel,
    className = '',
    placeholder = 'Add tag...'
}: TagInputProps) {
    const [value, setValue] = useState('');
    const [isOpen, setIsOpen] = useState(true);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial focus
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Handle outside clicks
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onCancel();
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onCancel]);

    // Filter tags: those that match input and are not already added
    const suggestions = allTags
        .filter(t =>
            t.toLowerCase().includes(value.toLowerCase()) &&
            !existingTags.includes(t)
        );

    const exactMatch = allTags.some(t => t.toLowerCase() === value.toLowerCase().trim());
    const isNew = value.trim() !== '' && !exactMatch && !existingTags.includes(value.trim());

    // Reset selection when value changes
    useEffect(() => {
        setSelectedIndex(-1);
    }, [value]);

    const handleSelectTag = (tag: string) => {
        onAdd(tag);
        setValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, suggestions.length + (isNew ? 0 : -1)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                handleSelectTag(suggestions[selectedIndex]);
            } else if (isNew && (selectedIndex === suggestions.length || selectedIndex === -1)) {
                handleSelectTag(value.trim());
            } else if (value.trim()) {
                // If nothing selected but value exists, try to add value
                handleSelectTag(value.trim());
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="relative inline-block" ref={containerRef}>
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`text-xs bg-white/5 border border-accent/30 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent w-32 animate-in fade-in zoom-in-95 duration-200 ${className}`}
                />
            </div>

            {isOpen && (
                <div
                    className="absolute top-full left-0 mt-1 w-48 bg-background border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 backdrop-blur-md"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={suggestion}
                                onClick={() => handleSelectTag(suggestion)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${index === selectedIndex ? 'bg-accent text-white' : 'hover:bg-white/10 text-text-muted hover:text-text'
                                    }`}
                            >
                                <span>{suggestion}</span>
                                {existingTags.includes(suggestion) && <Check className="w-3 h-3" />}
                            </button>
                        ))}

                        {isNew && (
                            <button
                                onClick={() => handleSelectTag(value.trim())}
                                onMouseEnter={() => setSelectedIndex(suggestions.length)}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors border-t border-white/5 flex items-center gap-2 ${selectedIndex === suggestions.length ? 'bg-accent/20 text-accent' : 'text-accent hover:bg-accent/10'
                                    }`}
                            >
                                <Plus className="w-3 h-3" />
                                <span className="font-bold">Create &quot;{value.trim()}&quot;</span>
                            </button>
                        )}

                        {suggestions.length === 0 && !isNew && value.trim() === '' && (
                            <div className="px-3 py-3 text-xs text-text-muted/50 text-center italic">
                                No recent tags
                            </div>
                        )}

                        {suggestions.length === 0 && !isNew && value.trim() !== '' && (
                            <div className="px-3 py-3 text-xs text-text-muted/50 text-center italic">
                                No tags found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
