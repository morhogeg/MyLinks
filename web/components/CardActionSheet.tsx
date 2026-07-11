'use client';

import { Link, LinkStatus } from '@/lib/types';
import { Archive, Star, Bell, Trash2, Circle, Check, X, ExternalLink, Layers, Share2, FolderMinus } from 'lucide-react';
import { useEffect } from 'react';
import { IconButton } from './ui/Button';

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
    removeFromCollection,
}: CardActionSheetProps) {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

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

    return (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Sheet */}
            <div
                role="menu"
                aria-label="Card actions"
                className="relative w-full sm:max-w-sm bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb"
            >
                {/* Grab handle (mobile affordance) */}
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

                {/* Action rows */}
                <div className="py-1">
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
        </div>
    );
}
