import React, { useState } from 'react';

// Dependency-free share button (no Chakra). Uses the Web Share API when
// available, and falls back to copying the URL to the clipboard on desktop
// browsers (fixing the prior desktop no-op), with brief inline feedback.
const ShareButton = ({ title, url, text }) => {
    const [copied, setCopied] = useState(false);

    const handleShare = async () => {
        const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title, url: shareUrl, text });
            } catch (error) {
                // user cancelled or share failed — ignore
            }
            return;
        }
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            // clipboard unavailable — no-op
        }
    };

    return (
        <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-6 py-3 text-sm font-semibold text-primary transition-all hover:-translate-y-px hover:bg-primary/5 hover:shadow-md active:translate-y-0"
        >
            {copied ? 'Link copied!' : 'Share'}
        </button>
    );
};

export default ShareButton;
