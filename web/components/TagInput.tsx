'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Check, Search } from 'lucide-react';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useSheetDrag } from '@/lib/useSheetDrag';
import { useScrollLock } from '@/lib/useScrollLock';

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
    const inputRef = useRef<HTMLInputElement>(null);       // desktop inline field
    const sheetInputRef = useRef<HTMLInputElement>(null);  // mobile sheet field

    // This component only ever mounts client-side (after a tap), so reading the
    // width synchronously here is safe and avoids a first-frame flash.
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 640
    );

    // Visual viewport drives the mobile sheet so it rides above the keyboard.
    const vp = useVisualViewport();

    // Freeze the page behind the mobile sheet (ref-counted, same as every other
    // sheet). Without it, touch-scrolling the tag list chains through to the feed
    // behind the scrim instead of scrolling the list.
    useScrollLock(isOpen && isMobile);

    // Drag-to-dismiss for the mobile sheet — closes via the same onCancel the X uses.
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose: onCancel, enabled: isMobile });

    // Focus the right field on open.
    useEffect(() => {
        if (!isOpen) return;
        const el = isMobile ? sheetInputRef.current : inputRef.current;
        el?.focus();
    }, [isOpen, isMobile]);

    // ── Desktop anchored-dropdown positioning ─────────────────────────────────
    const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number; openUpwards: boolean } | null>(null);
    useEffect(() => {
        if (!isOpen || isMobile) return;
        const updatePosition = () => {
            const el = inputRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;
            const openUpwards = spaceBelow < 250 && spaceAbove > spaceBelow;
            const availableSpace = openUpwards ? spaceAbove - 20 : spaceBelow - 20;
            const maxHeight = Math.min(320, Math.max(160, availableSpace));
            setCoords({
                top: openUpwards ? undefined : rect.bottom,
                bottom: openUpwards ? viewportHeight - rect.top : undefined,
                left: rect.left,
                width: rect.width,
                maxHeight,
                openUpwards,
            });
        };
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, isMobile]);

    // Track the breakpoint while open (rotation / resize).
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Desktop only: clicking outside the dropdown cancels. (Mobile uses the
    // sheet's own backdrop, so we don't attach a global handler there.)
    useEffect(() => {
        if (!isOpen || isMobile) return;
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (inputRef.current && inputRef.current.contains(target)) return;
            onCancel();
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, isMobile, onCancel]);

    // ── Suggestions ───────────────────────────────────────────────────────────
    const suggestions = allTags.filter(t => t.toLowerCase().includes(value.toLowerCase()));
    const exactMatch = allTags.some(t => t.toLowerCase() === value.toLowerCase().trim());
    const isNew = value.trim() !== '' && !exactMatch && !existingTags.includes(value.trim());

    // Typing resets the keyboard selection — done in the change handlers (not an
    // effect) to avoid a redundant render pass.
    const onValueChange = (next: string) => {
        setValue(next);
        setSelectedIndex(-1);
    };

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
                handleSelectTag(value.trim());
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    // ── Shared list rows ──────────────────────────────────────────────────────
    const listRows = (rowClass: string) => (
        <>
            {suggestions.map((suggestion, index) => {
                const isSelected = existingTags.includes(suggestion);
                return (
                    <button
                        key={suggestion}
                        onClick={() => handleSelectTag(suggestion)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        disabled={isSelected}
                        className={`w-full text-left flex items-center justify-between rounded-lg transition-colors ${rowClass}
                            ${index === selectedIndex ? 'bg-accent text-white' : ''}
                            ${isSelected
                                ? 'bg-accent/10 text-accent font-semibold cursor-default opacity-80'
                                : index !== selectedIndex ? 'text-text hover:bg-fill-strong' : ''}`}
                    >
                        <span className="truncate">{suggestion}</span>
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                );
            })}

            {isNew && (
                <button
                    onClick={() => handleSelectTag(value.trim())}
                    onMouseEnter={() => setSelectedIndex(suggestions.length)}
                    className={`w-full text-left flex items-center gap-2 rounded-lg transition-colors ${rowClass} ${selectedIndex === suggestions.length ? 'bg-accent/20 text-accent' : 'text-accent hover:bg-accent/10'}`}
                >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="font-semibold truncate">Create &quot;{value.trim()}&quot;</span>
                </button>
            )}

            {suggestions.length === 0 && !isNew && (
                <div className="px-3 py-3 text-xs text-text-muted/60 text-center italic">
                    {value.trim() === '' ? 'No recent tags' : 'No tags found'}
                </div>
            )}
        </>
    );

    // ── Mobile bottom sheet ───────────────────────────────────────────────────
    const mobileSheet = (
        <div
            className="fixed inset-x-0 z-[100] flex items-end animate-fade-in"
            style={{ top: vp.offsetTop || 0, height: vp.height || '100%', bottom: 'auto' }}
        >
            <div ref={scrimRef} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCancel} />
            <div ref={sheetRef} className="relative w-full max-h-[85%] flex flex-col bg-card border-t border-border-strong rounded-t-3xl shadow-2xl animate-slide-up overflow-hidden">
                {/* Grab handle + header: the drag-to-dismiss zone. */}
                <div {...handleProps} className="shrink-0">
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>
                    <div className="flex items-center gap-3 px-4 pb-3">
                        <h3 className="flex-1 text-base font-bold text-text">Add a tag</h3>
                        <button
                            onClick={onCancel}
                            aria-label="Close"
                            className="h-9 w-9 -me-1 inline-flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="px-4 pb-3 shrink-0">
                    <div className="flex items-center gap-2 px-3 h-11 rounded-xl bg-background border border-border-subtle focus-within:border-accent/50 transition-colors">
                        <Search className="w-4 h-4 text-text-muted shrink-0" />
                        <input
                            ref={sheetInputRef}
                            type="text"
                            value={value}
                            onChange={(e) => onValueChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search or create a tag…"
                            className="flex-1 bg-transparent text-[15px] text-text placeholder:text-text-muted outline-none"
                        />
                    </div>
                </div>
                <div
                    className="overflow-y-auto overscroll-contain px-2 pb-3 space-y-0.5 scrollbar-soft"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
                    {listRows('px-3 py-3 text-[15px]')}
                </div>
            </div>
        </div>
    );

    // ── Desktop anchored dropdown ─────────────────────────────────────────────
    const desktopDropdown = (
        <div
            className="fixed z-[100] overflow-hidden rounded-xl shadow-2xl bg-background border border-border-strong animate-in fade-in zoom-in-95 duration-150"
            style={{
                top: coords?.openUpwards ? undefined : (coords?.top ? coords.top + 4 : 0),
                bottom: coords?.openUpwards ? (coords?.bottom ? coords.bottom + 4 : 0) : undefined,
                left: coords?.left || 0,
                width: '14rem',
                maxHeight: coords?.maxHeight ? `${coords.maxHeight}px` : '20rem',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div
                className="overflow-y-auto overscroll-contain scrollbar-soft p-1 space-y-0.5"
                style={{ maxHeight: coords?.maxHeight ? `${coords.maxHeight}px` : '20rem' }}
            >
                {listRows('px-3 py-2 text-xs')}
            </div>
        </div>
    );

    return (
        <div className="relative inline-block" ref={containerRef}>
            {isMobile ? (
                // The card already shows the chip row; this pill keeps the layout
                // stable while the real input lives in the sheet.
                <button
                    onClick={() => setIsOpen(true)}
                    className={`inline-flex items-center gap-1 text-xs font-bold text-accent bg-accent/10 px-2 py-1 rounded-lg border border-accent/20 ${className}`}
                >
                    <Plus className="w-3 h-3" />
                    {value.trim() || 'Add tag'}
                </button>
            ) : (
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => { onValueChange(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`text-xs bg-fill-subtle border border-accent/30 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent w-32 animate-in fade-in zoom-in-95 duration-200 ${className}`}
                />
            )}
            {isOpen && typeof document !== 'undefined' && createPortal(isMobile ? mobileSheet : desktopDropdown, document.body)}
        </div>
    );
}
