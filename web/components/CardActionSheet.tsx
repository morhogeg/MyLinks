'use client';

import { Link, LinkStatus } from '@/lib/types';
import { Archive, Star, Bell, Trash2, Circle, Check, X, ExternalLink, Layers, Share2, FolderMinus, Lock, ImageOff, Image as ImageIcon } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './ui/Button';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';

interface CardActionSheetProps {
    link: Link;
    isOpen: boolean;
    onClose: () => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateReminder: (link: Link) => void;
    onDelete: (id: string) => void;
    onAddToCollection?: (link: Link) => void;
    onShare?: (link: Link) => void;
    /** Toggle the card's Private flag (parent owns PIN setup — lib/privacyLock). */
    onTogglePrivate?: (link: Link) => void;
    /** Toggle the card's thumbnail banner on/off. */
    onToggleThumbnail?: (link: Link) => void;
    /** When viewing inside a collection, a one-tap remove from it. */
    removeFromCollection?: { name: string; onRemove: () => void };
}

/**
 * Touch-friendly bottom sheet exposing the per-card actions that are otherwise
 * only reachable via hover on desktop. Rendered on coarse-pointer devices so
 * read/favorite/archive/remind/delete are actually usable on a phone.
 *
 * Purely presentational: each row calls the same handlers the card already
 * receives, then closes. Destructive delete is delegated to the parent (which
 * routes it through the branded ConfirmDialog), so this component never
 * destroys data directly.
 */
export default function CardActionSheet({
    link,
    isOpen,
    onClose,
    onStatusChange,
    onReadStatusChange,
    onUpdateReminder,
    onDelete,
    onAddToCollection,
    onShare,
    onTogglePrivate,
    onToggleThumbnail,
    removeFromCollection,
}: CardActionSheetProps) {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    // Bottom sheet on mobile, centered modal on desktop — drag only on mobile.
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });

    // Portal to <body> so the fixed overlay is anchored to the viewport, never
    // trapped inside a transformed/filtered feed ancestor (which would strand the
    // sheet mid-page with no full-screen scrim). `isOpen` only flips true on a
    // client tap, so the portal never runs during SSR; the `document` guard is
    // belt-and-suspenders for that.
    if (!isOpen || typeof document === 'undefined') return null;

    const isFavorite = link.status === 'favorite';
    const isArchived = link.status === 'archived';
    const hasReminder = link.reminderStatus === 'pending';

    const rows: {
        key: string;
        label: string;
        icon: React.ReactNode;
        onClick: () => void;
        danger?: boolean;
        active?: boolean;
    }[] = [
        {
            key: 'source',
            label: 'Open source',
            icon: <ExternalLink className="w-5 h-5" />,
            onClick: () => window.open(link.url, '_blank', 'noopener,noreferrer'),
        },
        {
            key: 'read',
            label: link.isRead ? 'Mark as unread' : 'Mark as read',
            icon: link.isRead ? <Check className="w-5 h-5" /> : <Circle className="w-5 h-5" />,
            active: !!link.isRead,
            onClick: () => onReadStatusChange(link.id, !link.isRead),
        },
        {
            key: 'favorite',
            label: isFavorite ? 'Remove from favorites' : 'Add to favorites',
            icon: <Star className={`w-5 h-5 ${isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />,
            active: isFavorite,
            onClick: () => onStatusChange(link.id, isFavorite ? 'unread' : 'favorite'),
        },
        {
            key: 'archive',
            label: isArchived ? 'Unarchive' : 'Archive',
            icon: <Archive className="w-5 h-5" />,
            active: isArchived,
            onClick: () => onStatusChange(link.id, isArchived ? 'unread' : 'archived'),
        },
        {
            key: 'remind',
            label: hasReminder ? 'Edit reminder' : 'Remind me',
            icon: <Bell className={`w-5 h-5 ${hasReminder ? 'fill-current text-accent' : ''}`} />,
            active: hasReminder,
            onClick: () => onUpdateReminder(link),
        },
        ...(onAddToCollection ? [{
            key: 'collection',
            label: 'Add to collection',
            icon: <Layers className="w-5 h-5" />,
            onClick: () => onAddToCollection(link),
        }] : []),
        ...(onShare ? [{
            key: 'share',
            label: 'Share',
            icon: <Share2 className="w-5 h-5" />,
            onClick: () => onShare(link),
        }] : []),
        ...(onTogglePrivate ? [{
            key: 'private',
            label: link.isPrivate ? 'Remove from Private' : 'Make private',
            icon: <Lock className={`w-5 h-5 ${link.isPrivate ? 'text-accent' : ''}`} />,
            active: !!link.isPrivate,
            onClick: () => onTogglePrivate(link),
        }] : []),
        ...(onToggleThumbnail && link.metadata?.thumbnailUrl ? [{
            key: 'thumbnail',
            label: link.hideThumbnail ? 'Show image' : 'Hide image',
            icon: link.hideThumbnail ? <ImageIcon className="w-5 h-5" /> : <ImageOff className="w-5 h-5" />,
            // Not an "active/on" state — it's a plain toggle, so it renders in the
            // normal text color (the accent styling read as a highlighted item).
            onClick: () => onToggleThumbnail(link),
        }] : []),
        ...(removeFromCollection ? [{
            key: 'remove-collection',
            label: `Remove from ${removeFromCollection.name}`,
            icon: <FolderMinus className="w-5 h-5" />,
            onClick: () => removeFromCollection.onRemove(),
        }] : []),
        {
            key: 'delete',
            label: 'Delete',
            icon: <Trash2 className="w-5 h-5" />,
            danger: true,
            onClick: () => onDelete(link.id),
        },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center animate-fade-in">
            {/* Backdrop */}
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Sheet — capped to the viewport so a long action list scrolls
                internally instead of overflowing off the top of a short screen. */}
            <div
                ref={sheetRef}
                role="menu"
                aria-label="Card actions"
                className="relative w-full sm:max-w-sm max-h-[85vh] flex flex-col bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb"
            >
                {/* Grab handle + header: the drag-to-dismiss zone on mobile. */}
                <div {...handleProps} className="shrink-0">
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>

                    {/* Header: link context + close */}
                    <div className="flex items-center gap-3 px-5 pt-2 pb-3 border-b border-border-subtle">
                    <p className="flex-1 text-sm font-semibold text-text truncate" title={link.title}>
                        {link.title}
                    </p>
                    <IconButton
                        onClick={onClose}
                        aria-label="Close"
                        variant="ghost"
                        radius="full"
                        className="-me-2 text-text-muted"
                    >
                        <X className="w-5 h-5" />
                    </IconButton>
                    </div>
                </div>

                {/* Action rows — scroll within the capped sheet if they don't fit. */}
                <div className="flex-1 min-h-0 py-1 overflow-y-auto overscroll-contain scrollbar-soft">
                    {rows.map((row) => (
                        <button
                            key={row.key}
                            role="menuitem"
                            onClick={() => {
                                row.onClick();
                                onClose();
                            }}
                            className={`w-full flex items-center gap-4 px-5 py-3.5 min-h-[52px] text-[15px] font-medium transition-colors active:bg-fill-strong ${
                                row.danger
                                    ? 'text-red-400 hover:bg-red-500/10'
                                    : row.active
                                        ? 'text-accent hover:bg-accent/10'
                                        : 'text-text hover:bg-fill-subtle'
                            }`}
                        >
                            <span className="flex-shrink-0 w-6 flex items-center justify-center">
                                {row.icon}
                            </span>
                            <span>{row.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}
