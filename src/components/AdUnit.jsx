import * as React from 'react';
import { cn } from '../lib/utils';

const CLIENT = 'ca-pub-5189362957619937';

export default function AdUnit({ slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_IN_CONTENT, className }) {
  React.useEffect(() => {
    if (!slot) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* AdSense may be blocked */ }
  }, [slot]);
  if (!slot) return null;
  return (
    <aside aria-label="Advertisement" className={cn('my-8 min-h-[100px] overflow-hidden text-center', className)}>
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Advertisement</span>
      <ins className="adsbygoogle block" data-ad-client={CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
