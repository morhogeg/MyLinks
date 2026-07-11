'use client';

import { LogOut, Trash2 } from 'lucide-react';
import ProfileAvatar from '../ProfileAvatar';
import { LargeTitle, Footnote } from './primitives';

export function AccountView({
    accountEmail, displayName, photoURL, providerLabel, signOut, onClose, onDelete, deleteError,
}: {
    accountEmail: string | null;
    displayName: string | null;
    photoURL: string | null;
    providerLabel: string;
    signOut: () => void;
    onClose: () => void;
    onDelete: () => void;
    deleteError: string | null;
}) {
    return (
        <>
            <LargeTitle>Account</LargeTitle>
            <div className="p-3.5 rounded-2xl bg-card border border-border-subtle">
                <div className="flex items-center gap-3.5">
                    <ProfileAvatar email={accountEmail} name={displayName} photoURL={photoURL} size={48} />
                    <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-text truncate">{displayName || accountEmail || 'Signed in'}</div>
                        {displayName && accountEmail && <div className="text-[12px] text-text-muted truncate">{accountEmail}</div>}
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {providerLabel}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => { onClose(); signOut(); }}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold border border-border-subtle text-text hover:bg-card-hover transition-colors cursor-pointer"
                >
                    <LogOut className="w-4 h-4" />
                    Sign out
                </button>
            </div>

            <button
                onClick={onDelete}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-3 text-[13px] font-semibold border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
                <Trash2 className="w-4 h-4" />
                Delete account
            </button>
            <Footnote>Permanently deletes your account and all saved links, collections, and chats. This can&apos;t be undone.</Footnote>
            {deleteError && <p className="mt-1.5 text-[12px] text-red-500 px-2">{deleteError}</p>}
        </>
    );
}
