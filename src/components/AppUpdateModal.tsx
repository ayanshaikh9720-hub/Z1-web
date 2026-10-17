import React, { useState, useEffect } from 'react';
import { Smartphone, Download, CheckCircle2, ShieldCheck, AlertTriangle, ExternalLink, X, RefreshCw, Copy, Check } from 'lucide-react';
import { api } from '../services/api';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({ isOpen, onClose }) => {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.getAppVersionInfo()
        .then((data) => setUpdateInfo(data))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const downloadUrl = updateInfo?.downloadUrl || 'https://github.com/ayanqureshi2732-gif/Z1-movie-/releases/latest';

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0e1118] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-gradient-to-r from-red-950/30 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Android App Updates
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                  Seamless Upgrade
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">Package: com.z1movies.app</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-300">
          {/* Current & Latest Version Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-center">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Installed Version
              </span>
              <span className="text-lg font-bold text-white font-mono">
                {updateInfo?.currentVersion || 'v1.0.0'}
              </span>
            </div>
            <div className="p-3 bg-slate-900/80 border border-emerald-500/30 rounded-xl text-center">
              <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider block mb-1">
                Release Status
              </span>
              <span className="text-lg font-bold text-emerald-300 font-mono flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Latest Ready
              </span>
            </div>
          </div>

          {/* User Data Preservation Guarantee */}
          <div className="p-3.5 bg-emerald-950/25 border border-emerald-500/30 rounded-xl flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-200/90 leading-relaxed">
              <strong className="text-emerald-300 block mb-0.5 font-semibold">100% User Data Preserved</strong>
              Because the application ID (<span className="font-mono text-white">com.z1movies.app</span>) and release certificate remain constant, installing a newer APK updates your app in-place. Your watchlists, login sessions, downloaded movies, and preferences will <strong>never</strong> be deleted.
            </div>
          </div>

          {/* Step-by-Step Installation Instructions */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>How to Update Over Existing App</span>
            </h3>
            <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Tap <strong>Download Latest Release APK</strong> below.
              </li>
              <li>
                Once downloaded, tap the notification or open the file in your phone's <strong>Downloads</strong> folder.
              </li>
              <li>
                Android Package Installer will display: <em>"Do you want to update this application? Your existing data will not be lost."</em>
              </li>
              <li>
                Tap <strong>Update</strong> (or Install).
              </li>
              <li>
                The update replaces the app code cleanly without requiring you to uninstall the old version.
              </li>
            </ol>
          </div>

          {/* Android Security Prompt Explanation */}
          <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-200/90">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              <strong>Android Approval Note:</strong> If your browser displays <em>"For security, your phone cannot install unknown apps from this source"</em>, tap <strong>Settings</strong> and switch on <strong>Allow from this source</strong>. You do NOT need to uninstall the old app.
            </p>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0a0d13] flex flex-col sm:flex-row items-center gap-2.5">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-950/50 transition-all text-center"
          >
            <Download className="w-4 h-4" />
            <span>Download Latest Release APK</span>
          </a>

          <button
            onClick={handleCopy}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
            title="Copy download link"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied Link' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
