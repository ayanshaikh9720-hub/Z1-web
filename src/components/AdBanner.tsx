import React, { useEffect, useRef } from 'react';
import { getAdConfig, isAdsEnabled } from '../utils/adConfig';

interface AdBannerProps {
  type: 'top-banner' | 'between-sections' | 'movie-details' | 'player-area';
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ type, className = '' }) => {
  const adRef = useRef<HTMLDivElement | null>(null);
  const config = getAdConfig();

  // If no valid ad configuration exists, keep ad containers completely hidden (Anti-slop / Policy Compliant)
  if (!config.enabled) {
    return null;
  }

  // Push to adsbygoogle array if AdSense client ID is configured
  useEffect(() => {
    if (config.adSenseClientId && typeof window !== 'undefined') {
      try {
        const adsbygoogle = (window as any).adsbygoogle || [];
        adsbygoogle.push({});
      } catch (e) {
        // Suppress AdSense push errors in development
      }
    }
  }, [config.adSenseClientId]);

  if (type === 'top-banner') {
    return (
      <aside
        aria-label="Advertisement"
        className={`w-full max-w-7xl mx-auto px-4 my-3 overflow-hidden ${className}`}
      >
        <div className="w-full bg-[#0d1017] border border-slate-800/80 rounded-xl p-3 flex flex-col items-center justify-center min-h-[90px] text-center">
          <span className="text-[10px] tracking-widest uppercase text-slate-500 mb-1 font-semibold">
            Advertisement
          </span>
          {config.adSenseClientId ? (
            <ins
              className="adsbygoogle"
              style={{ display: 'block', minHeight: '60px', width: '100%' }}
              data-ad-client={config.adSenseClientId}
              data-ad-slot={config.adSenseSlotTopBanner || '1234567890'}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            />
          ) : (
            <div className="text-xs text-slate-400 font-medium">
              Google Mobile Ads / AdSense placement slot
            </div>
          )}
        </div>
      </aside>
    );
  }

  if (type === 'between-sections') {
    return (
      <aside
        aria-label="Advertisement Banner"
        className={`w-full max-w-7xl mx-auto px-4 my-6 overflow-hidden ${className}`}
      >
        <div className="w-full bg-[#0d1017] border border-slate-800/80 rounded-xl p-4 flex flex-col items-center justify-center min-h-[120px] text-center">
          <span className="text-[10px] tracking-widest uppercase text-slate-500 mb-1.5 font-semibold">
            Advertisement
          </span>
          {config.adSenseClientId ? (
            <ins
              className="adsbygoogle"
              style={{ display: 'block', minHeight: '90px', width: '100%' }}
              data-ad-client={config.adSenseClientId}
              data-ad-slot={config.adSenseSlotBetweenSections || '0987654321'}
              data-ad-format="rectangle,horizontal"
              data-full-width-responsive="true"
            />
          ) : (
            <div className="text-xs text-slate-400 font-medium">
              Google Mobile Ads / AdSense responsive placement slot
            </div>
          )}
        </div>
      </aside>
    );
  }

  if (type === 'movie-details') {
    return (
      <aside
        aria-label="Advertisement"
        className={`w-full bg-[#0d1017] border border-slate-800/80 rounded-xl p-3 my-4 overflow-hidden text-center ${className}`}
      >
        <span className="text-[10px] tracking-widest uppercase text-slate-500 mb-1 block font-semibold">
          Advertisement
        </span>
        <div className="min-h-[60px] flex items-center justify-center text-xs text-slate-400">
          Sponsored Media Slot
        </div>
      </aside>
    );
  }

  // player-area
  return (
    <aside
      aria-label="Advertisement"
      className={`w-full bg-black/80 border border-slate-800/80 rounded-lg p-2 my-2 flex items-center justify-between text-xs overflow-hidden ${className}`}
    >
      <span className="text-[10px] uppercase tracking-widest text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded font-semibold">
        Ad
      </span>
      <span className="text-slate-400 text-xs truncate mx-3">Sponsored Content Slot</span>
    </aside>
  );
};
