import React, { useState, useEffect } from 'react';
import { Smartphone, Download, CheckCircle2, ShieldCheck, AlertTriangle, ExternalLink, ArrowLeft, RefreshCw, Key, HardDrive, Shield } from 'lucide-react';
import { api } from '../services/api';

interface UpdatesPageProps {
  onBack: () => void;
}

export const UpdatesPage: React.FC<UpdatesPageProps> = ({ onBack }) => {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    api.getAppVersionInfo()
      .then((data) => setUpdateInfo(data))
      .finally(() => setLoading(false));
  }, []);

  const downloadUrl = updateInfo?.downloadUrl || 'https://github.com/ayanqureshi2732-gif/Z1-movie-/releases/latest';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Home</span>
      </button>

      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-600/20 border border-red-500/30 rounded-full text-red-400 text-xs font-bold uppercase tracking-wider mb-3">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Official Android APK Release</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display tracking-tight mb-2">
            Z1 Movies Android Application
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            Get the latest cinematic experience with optimized H.264 & HLS streaming, fast downloads, subtitle customization, and dual-audio support. Supports seamless in-place updates.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-950/60 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download Latest Release APK</span>
            </a>

            <a
              href="https://github.com/ayanqureshi2732-gif/Z1-movie-/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>View All Releases</span>
            </a>
          </div>
        </div>
      </div>

      {/* Update Integrity Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-start">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-3">
            <Shield className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">Persistent Package ID</h3>
          <p className="text-xs text-slate-400 font-mono mb-2">com.z1movies.app</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            The application ID remains strictly identical across every build so Android recognizes updates automatically.
          </p>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-start">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
            <Key className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">Persistent Keystore</h3>
          <p className="text-xs text-slate-400 font-mono mb-2">Release Signature</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Signed with the persistent release key certificate. Prevents "signatures do not match" installation errors.
          </p>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-start">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
            <HardDrive className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">Zero Data Loss</h3>
          <p className="text-xs text-slate-400 font-mono mb-2">Seamless In-Place</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            No uninstallation required. Your watchlists, downloaded movies, saved settings, and logins remain untouched.
          </p>
        </div>
      </div>

      {/* Installation Guide & Android Prompts */}
      <div className="bg-[#0e1118] border border-slate-800 rounded-2xl p-6 mb-8 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>How to Install or Update on Android</span>
        </h2>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300">
          <div className="flex items-start gap-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
            <div className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-xs shrink-0">1</div>
            <div>
              <strong className="text-white block mb-0.5">Download the APK</strong>
              Tap "Download Latest Release APK" above. When prompted by your mobile browser (e.g. Chrome), tap <em>Download anyway</em>.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
            <div className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-xs shrink-0">2</div>
            <div>
              <strong className="text-white block mb-0.5">Open the Downloaded APK</strong>
              Tap the download notification from your notifications bar, or open your phone's <strong>Files / Downloads</strong> app and tap <span className="font-mono text-white">app-release.apk</span>.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
            <div className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-xs shrink-0">3</div>
            <div>
              <strong className="text-white block mb-0.5">Approve the In-Place Update</strong>
              Android Package Installer will display: <em>"Do you want to update this app? Your existing data will not be lost."</em> Tap <strong>Update</strong>.
            </div>
          </div>
        </div>

        {/* Security Prompt FAQ */}
        <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl flex items-start gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-amber-300 block mb-1">Android Unknown Apps Security Prompt:</strong>
            If your phone shows <em>"For your security, your phone is not allowed to install unknown apps from this source"</em>, tap <strong>Settings</strong> and turn ON <strong>Allow from this source</strong>. You do NOT need to uninstall the old app.
          </div>
        </div>
      </div>
    </div>
  );
};
