import React from 'react';

interface AdBannerProps {
  type: 'top-banner' | 'between-sections' | 'movie-details' | 'player-area';
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ type, className = '' }) => {
  // Production-ready ad placement slot for Google AdSense or licensed ad provider
  // Ad space is unobtrusive and adheres to OTT streaming layout standards
  if (type === 'top-banner') {
    return (
      <aside aria-label="Sponsored Content" className={`w-full max-w-7xl mx-auto px-4 my-3 ${className}`}>
        <div className="w-full bg-[#12151f]/80 border border-slate-800/80 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-wider uppercase bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">Ad</span>
            <span className="font-medium text-slate-300">Stream in 4K HDR with High-Speed Fiber</span>
            <span className="hidden md:inline text-slate-400">· Experience cinema grade lossless audio</span>
          </div>
          <button
            onClick={() => window.open('https://fast.com', '_blank', 'noopener,noreferrer')}
            className="text-xs text-red-400 hover:text-red-300 font-semibold underline underline-offset-2 whitespace-nowrap"
          >
            Test Connection Speed →
          </button>
        </div>
      </aside>
    );
  }

  if (type === 'between-sections') {
    return (
      <aside aria-label="Sponsored Banner" className={`w-full max-w-7xl mx-auto px-4 my-8 ${className}`}>
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-950/20 via-slate-900 to-slate-950 border border-red-900/20 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-red-500 font-semibold">Featured Partner</div>
            <h4 className="text-base font-semibold text-slate-100">Blender Open Movie Project & Creative Commons Cinema</h4>
            <p className="text-xs text-slate-400 max-w-xl">
              100% legally licensed open-source cinematic releases, rendered with cutting-edge Ray-Tracing and Dolby Surround.
            </p>
          </div>
          <button
            onClick={() => window.open('https://studio.blender.org/films/', '_blank', 'noopener,noreferrer')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-slate-700 whitespace-nowrap"
          >
            Explore Open Projects
          </button>
        </div>
      </aside>
    );
  }

  if (type === 'movie-details') {
    return (
      <aside aria-label="Sponsor" className={`w-full bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 my-6 ${className}`}>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Sponsored Notice</span>
          <span className="text-[11px] text-slate-400">Ultra-fast P2P & CDN delivery enabled</span>
        </div>
        <p className="text-xs text-slate-300 mt-1">
          Authorized high-bandwidth direct streams provided under open distribution licenses.
        </p>
      </aside>
    );
  }

  // player-area
  return (
    <aside aria-label="Player Sponsor" className={`w-full bg-black/60 border border-slate-800/80 rounded-lg p-2.5 my-2 flex items-center justify-between text-xs ${className}`}>
      <span className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">Notice</span>
      <span className="text-slate-400 text-xs truncate mx-3">Enjoying the movie? Support open creators & share Z1 Movies.</span>
      <span className="text-[11px] text-red-400 font-medium">Licensed Stream</span>
    </aside>
  );
};
