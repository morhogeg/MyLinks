'use client';

/**
 * Circular profile avatar — the Google photo when available, otherwise a
 * gradient monogram from the name/email. Used in the header and Settings.
 */
export default function ProfileAvatar({
    email,
    name,
    photoURL,
    size = 32,
    className = '',
}: {
    email?: string | null;
    name?: string | null;
    photoURL?: string | null;
    size?: number;
    className?: string;
}) {
    const initial = (name?.trim()?.[0] || email?.trim()?.[0] || '?').toUpperCase();
    const dimension = { width: size, height: size };

    if (photoURL) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={photoURL}
                alt={name || email || 'Profile'}
                width={size}
                height={size}
                // Google avatar URLs 403 when a referrer is sent.
                referrerPolicy="no-referrer"
                className={`rounded-full object-cover ring-1 ring-black-fixed/5 dark:ring-white-fixed/10 ${className}`}
                style={dimension}
            />
        );
    }

    return (
        <div
            aria-hidden="true"
            className={`rounded-full flex items-center justify-center bg-[image:var(--accent-gradient)] text-white-fixed font-bold ring-1 ring-white-fixed/15 ${className}`}
            style={{ ...dimension, fontSize: Math.round(size * 0.42) }}
        >
            {initial}
        </div>
    );
}
