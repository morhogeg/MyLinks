'use client';

import { useState, useEffect } from 'react';
import { Share, X } from 'lucide-react';

/**
 * iOS PWA install banner
 * Only shows on iOS Safari when not in standalone mode
 * Dismissible - stores preference in localStorage
 */
export default function InstallPWA() {
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        // Check if we should show the banner
        const isDismissed = localStorage.getItem('pwa_banner_dismissed');
        if (isDismissed) return;

        // Check if iOS Safari (not standalone)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (isIOS && isSafari && !isStandalone) {
            setShowBanner(true);
        }
    }, []);

    const dismiss = () => {
        localStorage.setItem('pwa_banner_dismissed', 'true');
        setShowBanner(false);
    };

    if (!showBanner) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up">
            <div className="bg-card rounded-xl p-4 shadow-2xl border border-white/10">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                        <Share className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-medium text-white mb-1">Install Second Brain</h3>
                        <p className="text-sm text-text-secondary">
                            Tap <Share className="w-4 h-4 inline mx-1" /> then &quot;Add to Home Screen&quot; for the best experience.
                        </p>
                    </div>
                    <button
                        onClick={dismiss}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>
            </div>
        </div>
    );
}
