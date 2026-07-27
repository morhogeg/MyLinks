'use client';

import { LogOut, Trash2 } from 'lucide-react';
import ProfileAvatar from '../ProfileAvatar';
import { LargeTitle, Footnote, List, RowShell, RowText } from './primitives';

/**
 * Account screen.
 *
 * Rebuilt on the shared settings grammar (SectionHeader / List / RowShell) that
 * every other screen in this modal already uses. It previously rolled its own
 * `rounded-2xl` card with a bordered pill button and a full-width red outlined
 * block, so it read as a different, older app than the screen you reached it
 * from — that inconsistency was most of what felt dated.
 *
 * Two specific things retired:
 *  · the emerald status dot + emerald label. Lumen is achromatic (porcelain on
 *    graphite); a green "online" pip is off-palette and reads like a chat
 *    presence indicator, not an identity line. The provider is now quiet
 *    secondary text under the email, where it belongs in the hierarchy.
 *  · the outlined Delete button. Destructive actions in this app are rows, and
 *    the confirm dialog is what carries the weight — an always-shouting red box
 *    above the fold made the screen feel like a warning page.
 */
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
    // With a display name the email is the subtitle and the provider sits under
    // it; without one the email IS the title, so the provider becomes the only
    // subtitle rather than repeating the address.
    const title = displayName || accountEmail || 'Signed in';
    const showEmail = Boolean(displayName && accountEmail);

    return (
        <>
            <LargeTitle>Account</LargeTitle>

            {/* Identity — the person, stated plainly. No card chrome of its own:
                it sits on the sheet like a header, which is what gives the screen
                its air. */}
            <div className="flex items-center gap-3.5 px-1.5 pt-1 pb-5">
                <ProfileAvatar email={accountEmail} name={displayName} photoURL={photoURL} size={56} />
                <div className="min-w-0 flex-1">
                    <div className="text-[19px] font-semibold tracking-[-0.015em] text-text truncate leading-tight">
                        {title}
                    </div>
                    {showEmail && (
                        <div className="text-[13px] text-text-secondary truncate mt-0.5">{accountEmail}</div>
                    )}
                    <div className="text-[12.5px] text-text-muted truncate mt-0.5">{providerLabel}</div>
                </div>
            </div>

            <List>
                <RowShell tile={<LogOut className="w-[16px] h-[16px]" />} onClick={() => { onClose(); signOut(); }}>
                    <RowText title="Sign out" />
                </RowShell>
            </List>

            {/* Destructive action in its own group, separated by space rather than
                a "Danger zone" header — that phrase is developer-tool vocabulary
                and off-voice here. Distance and the footnote do the warning; the
                confirm dialog does the stopping. */}
            <div className="mt-7">
                <List>
                    <RowShell
                        tile={<Trash2 className="w-[16px] h-[16px]" />}
                        tileClass="bg-red-500/12 text-red-500"
                        onClick={onDelete}
                    >
                        <RowText title="Delete account" />
                    </RowShell>
                </List>
            </div>
            <Footnote>
                Permanently deletes your account and all saved links, collections, and chats.
                This can&apos;t be undone.
            </Footnote>
            {deleteError && <p className="mt-1.5 text-[12px] text-red-500 px-2">{deleteError}</p>}
        </>
    );
}
