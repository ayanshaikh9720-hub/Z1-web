import React from 'react';
import { Film, ShieldCheck, Mail, FileText } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="w-full bg-[#06070a] border-t border-slate-800/80 pt-12 pb-24 md:pb-12 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center">
                <Film className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-extrabold text-lg text-white">
                Z1<span className="text-red-500">.</span>MOVIES
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-md">
              Z1 Movies provides high-speed, cinematic streaming and authorized downloads.
              We only distribute works under verifiable open distribution agreements, Creative Commons licenses,
              and direct creator permissions.
            </p>
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-300 text-[11px] flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <b>Legal Notice:</b> Z1 Movies hosts and distributes only content for which it has the necessary rights,
                licenses, or permissions. Copyright remains with the respective rights holders.
              </span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div>
            <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider mb-3">Explore</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">
                  Home Catalog
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('movies')} className="hover:text-white transition-colors">
                  All Movies
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('genres')} className="hover:text-white transition-colors">
                  Browse by Genre
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('search')} className="hover:text-white transition-colors">
                  Advanced Search
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('watchlist')} className="hover:text-white transition-colors">
                  My Watchlist
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Contact */}
          <div>
            <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider mb-3">Trust & Legal</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('legal_dmca')} className="hover:text-white transition-colors flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copyright / DMCA</span>
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('legal_terms')} className="hover:text-white transition-colors flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Terms of Service</span>
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('legal_privacy')} className="hover:text-white transition-colors flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Privacy Policy</span>
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-white transition-colors flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Contact & Licensing</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 text-[11px]">
          <div>© {new Date().getFullYear()} Z1 Movies. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span>Powered by HTML5 Adaptive Streaming Engine</span>
            <span>·</span>
            <span className="text-slate-400">v2.4 Production</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
