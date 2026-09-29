import React from 'react';
import { ShieldCheck, FileText, Lock, ArrowLeft } from 'lucide-react';

interface LegalPageProps {
  section: 'terms' | 'privacy' | 'dmca';
  onBack: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ section, onBack }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 min-h-[75vh] space-y-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Home</span>
      </button>

      {section === 'dmca' && (
        <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                DMCA & Copyright Compliance Policy
              </h1>
              <span className="text-xs text-slate-500">Effective Date: 2026</span>
            </div>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <p className="font-semibold text-slate-100 text-sm">
              Core Legal Content Principle:
            </p>
            <p className="text-xs text-slate-400">
              "Z1 Movies hosts and distributes only content for which it has the necessary rights,
              licenses, or permissions. Copyright remains with the respective rights holders."
            </p>
          </div>

          <h2 className="text-lg font-bold text-white pt-2">1. Licensed Distribution</h2>
          <p>
            All media streamed or made available for authorized download on Z1 Movies is vetted under explicit
            Creative Commons (CC-BY, CC0), Open Movie Foundation licenses, or bilateral distribution agreements.
            We do not index or host unauthorized copies of commercial motion pictures.
          </p>

          <h2 className="text-lg font-bold text-white pt-2">2. Notice and Takedown Procedure</h2>
          <p>
            If you are a copyright owner or an authorized agent and believe that content distributed via Z1 Movies
            infringes your rights, you may submit a formal notification under the Digital Millennium Copyright Act (DMCA).
          </p>
          <ul className="list-disc pl-6 space-y-1 text-slate-400 text-xs">
            <li>Identification of the copyrighted work claimed to be infringed.</li>
            <li>Direct URL on Z1 Movies pointing to the disputed work.</li>
            <li>Your contact info: address, telephone number, and official email address.</li>
            <li>A statement of good faith belief and statement made under penalty of perjury.</li>
          </ul>
        </div>
      )}

      {section === 'terms' && (
        <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-500 border border-blue-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Terms of Service
              </h1>
              <span className="text-xs text-slate-500">Effective Date: 2026</span>
            </div>
          </div>

          <h2 className="text-lg font-bold text-white pt-2">1. Permitted Use</h2>
          <p>
            Z1 Movies provides an online streaming and authorized media delivery platform. You agree to use the
            service in compliance with all relevant international and local laws.
          </p>

          <h2 className="text-lg font-bold text-white pt-2">2. Authorized Downloads</h2>
          <p>
            Downloads provided on Z1 Movies are strictly limited to files and resolutions where the content licensor
            has granted offline viewing rights. Users may not circumvent format containers or remove attribution notices.
          </p>
        </div>
      )}

      {section === 'privacy' && (
        <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/10 text-emerald-500 border border-emerald-500/20">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Privacy Policy
              </h1>
              <span className="text-xs text-slate-500">Effective Date: 2026</span>
            </div>
          </div>

          <p>
            Z1 Movies respects user privacy. We do not sell or monetize personal viewing metrics to third parties.
            Account passwords are stored using salted cryptographic PBKDF2 hashing.
          </p>
        </div>
      )}
    </div>
  );
};
