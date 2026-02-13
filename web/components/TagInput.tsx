'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

    const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Update coordinates when opening or resizing
    useEffect(() => {
        if (isOpen) {
            const checkMobile = () => setIsMobile(window.innerWidth < 640);

            const updatePosition = () => {
                if (inputRef.current) {
                    const rect = inputRef.current.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const spaceBelow = viewportHeight - rect.bottom;

                    // Default max height is 320px (20rem), but constrain to available space
                    const maxAllowedHeight = Math.min(320, spaceBelow - 20);

                    setCoords({
                        top: rect.bottom, // Fixed position relative to viewport (no scrollY)
                        left: rect.left,  // Fixed position relative to viewport (no scrollX)
                        width: rect.width,
                        maxHeight: Math.max(100, maxAllowedHeight) // Ensure at least 100px
                    });
                }
                checkMobile();
            };

            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);

            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
            };
        }
    }, [isOpen]);

    // Handle outside clicks - updated for Portal
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            // If click is on input, do nothing (input handles its own focus/click)
            const isInputClick = inputRef.current && inputRef.current.contains(target);

            // If we are in Portal, checking strict hierarchy with `contains` on specific node is hard 
            // without a ref to the portal root. 
            // However, the dropdown logic stops propagation of mousedown events.
            // So if `handleClickOutside` triggers, it effectively means the click was NOT in the dropdown.
            // Thus, we only need to ensure it wasn't on the input.
            if (!isInputClick) {
                onCancel();
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onCancel]);

    // Filter tags: those that match input
    const suggestions = allTags
        .filter(t =>
            t.toLowerCase().includes(value.toLowerCase())
        );

    const exactMatch = allTags.some(t => t.toLowerCase() === value.toLowerCase().trim());
    const isNew = value.trim() !== '' && !exactMatch && !existingTags.includes(value.trim());

    // Reset selection when value changes
    useEffect(() => {
        setSelectedIndex(-1);
    }, [value]);

    const handleSelectTag = (tag: string) => {
        if (existingTags.includes(tag)) return;
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

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Portal content
    // Mobile: Center on screen
    // Desktop: Align with input
    const dropdownStyle: React.CSSProperties = isMobile ? {
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '320px',
        maxHeight: '60vh'
    } : {
        top: coords?.top ? coords.top + 4 : 0,
        left: coords?.left || 0,
        width: '12rem', // w-48
        maxHeight: coords?.maxHeight ? `${coords.maxHeight}px` : '20rem'
    };

    const dropdown = isOpen && mounted ? (
        <div
            className="fixed z-[100] overflow-hidden rounded-xl shadow-2xl bg-background border border-white/10 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md"
            style={dropdownStyle}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={`overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-white/10 ${isMobile ? 'max-h-[50vh]' : ''} p-1 space-y-0.5`} style={!isMobile ? { maxHeight: coords?.maxHeight ? `${coords.maxHeight}px` : '20rem' } : {}}>
                {suggestions.map((suggestion, index) => {
                    const isSelected = existingTags.includes(suggestion);
                    return (
                        <button
                            key={suggestion}
                            onClick={() => handleSelectTag(suggestion)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            disabled={isSelected}
                            className={`w-full text-left px-3 py-2 text-xs transition-all flex items-center justify-between rounded-lg
                                ${index === selectedIndex ? 'bg-accent text-white' : ''}
                                ${isSelected
                                    ? 'bg-accent/10 text-accent font-bold cursor-default opacity-80 hover:bg-accent/10'
                                    : index !== selectedIndex ? 'hover:bg-white/10 text-text-muted hover:text-text' : ''
                                }
                            `}
                        >
                            <span>{suggestion}</span>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>
                    );
                })}

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
    ) : null;

    // Use createPortal to render dropdown


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
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`text-xs bg-white/5 border border-accent/30 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent w-32 animate-in fade-in zoom-in-95 duration-200 ${className}`}
                />
            </div>
            {isOpen && mounted && createPortal(dropdown, document.body)}
        </div>
    );
}
