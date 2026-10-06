import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Download, Bookmark, Check, Star, ShieldCheck, Film, AlertCircle, ExternalLink, Languages, Volume2, Subtitles } from 'lucide-react';
import { Movie, User, DownloadOption } from '../types';
import { api } from '../services/api';
import { AdBanner } from '../components/AdBanner';

interface MovieDetailsPageProps {
  movie: Movie;
  onBack: () => void;
  onPlayMovie: (movie: Movie) => void;
  user: User | null;
  onOpenAuth: () => void;
}

export const MovieDetailsPage: React.FC<MovieDetailsPageProps> = ({
  movie: initialMovie,
  onBack,
  onPlayMovie,
  user,
  onOpenAuth,
}) => {
  const [movie, setMovie] = useState<Movie>(initialMovie);
  const [inWatchlist, setInWatchlist] = useState<boolean>(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState<boolean>(false);
  const [downloadingQuality, setDownloadingQuality] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string>('');
  const [imageError, setImageError] = useState<boolean>(false);

  useEffect(() => {
    // Fetch fresh movie details (increments views on server)
    api.getMovie(initialMovie.id)
      .then((res) => setMovie(res.movie))
      .catch(() => {});

    // Check watchlist status if user is logged in
    if (user) {
      api.getWatchlist()
        .then((res) => {
          setInWatchlist(res.watchlist.some((w) => w.movieId === initialMovie.id));
        })
        .catch(() => {});
    }
  }, [initialMovie.id, user]);

  const handleToggleWatchlist = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      const res = await api.toggleWatchlist(movie.id);
      setInWatchlist(res.inWatchlist);
    } catch {
      // Ignore
    }
  };

  const handleStartDownload = async (opt: DownloadOption) => {
    setDownloadingQuality(opt.quality);
    setDownloadError('');
    try {
      const result = await api.trackDownload(movie.id, opt.quality);
      if (result.success && result.downloadUrl) {
        // Trigger legitimate download
        const a = document.createElement('a');
        a.href = result.downloadUrl;
        a.download = `${movie.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${result.quality}.${result.format.toLowerCase()}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Update local download count
        setMovie((prev) => ({ ...prev, downloads: (prev.downloads || 0) + 1 }));
      } else {
        setDownloadError('Configured download source is currently unavailable.');
      }
    } catch (err: any) {
      setDownloadError(err.message || 'Download link unavailable or access restricted.');
    } finally {
      setDownloadingQuality(null);
    }
  };

  const formatDuration = (mins: number) => {
    if (!mins) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} hr ${m} min` : `${mins} min`;
  };

  const hasAuthorizedDownloads = movie.downloadUrls && movie.downloadUrls.length > 0;

  return (
    <div className="min-h-screen pb-16 bg-[#08090d]">
      {/* Backdrop Header */}
      <div className="relative w-full h-[340px] sm:h-[460px] lg:h-[540px] overflow-hidden">
        <img
          src={movie.backdropUrl || movie.posterUrl}
          alt={movie.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center filter brightness-[0.55]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-transparent to-transparent" />

        {/* Back Button */}
        <div className="absolute top-4 left-4 sm:left-6 z-20">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/60 hover:bg-black/80 text-white text-xs font-semibold backdrop-blur-md border border-white/10 transition-colors"
            aria-label="Back to catalog"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Main Details Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 -mt-36 sm:-mt-52 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Poster Column */}
          <div className="md:col-span-4 lg:col-span-3">
            <div className="relative aspect-[2/3] w-full max-w-[260px] mx-auto md:max-w-none rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-700/80 shadow-2xl">
              {!imageError && movie.posterUrl ? (
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-slate-900 text-center">
                  <Film className="w-12 h-12 text-slate-600 mb-2" />
                  <span className="font-display font-bold text-white text-sm">{movie.title}</span>
                </div>
              )}

              <div className="absolute top-3 left-3 bg-red-600 text-white font-bold text-[10px] tracking-wider px-2 py-0.5 rounded shadow">
                {movie.videoType.toUpperCase()}
              </div>
            </div>

            {/* Quick Stats Box */}
            <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs text-slate-400">
              <div className="flex justify-between items-center">
                <span>Total Stream Views</span>
                <span className="font-mono font-bold text-slate-200 tabular-nums">
                  {movie.views?.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Authorized Downloads</span>
                <span className="font-mono font-bold text-slate-200 tabular-nums">
                  {movie.downloads?.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Distribution Status</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Licensed
                </span>
              </div>
            </div>
          </div>

          {/* Details Content Column */}
          <div className="md:col-span-8 lg:col-span-9 space-y-6">
            <div className="space-y-3">
              {/* Unboxed Metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-medium">
                <span className="text-white font-semibold">{movie.releaseYear}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{movie.language}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{formatDuration(movie.duration)}</span>

                {movie.rating !== undefined && movie.rating > 0 && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <div className="flex items-center gap-1 text-amber-400 font-bold">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span className="text-slate-200">{movie.rating.toFixed(1)} / 10</span>
                    </div>
                  </>
                )}
              </div>

              {/* Title */}
              <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
                {movie.title}
              </h1>

              {/* Genres */}
              <div className="flex flex-wrap gap-2 pt-1">
                {movie.genres.map((g) => (
                  <span
                    key={g}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/80 font-medium"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onPlayMovie(movie)}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl shadow-xl shadow-red-950/40 transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Watch Now</span>
              </button>

              {/* Download Option Button */}
              {hasAuthorizedDownloads ? (
                <button
                  onClick={() => setDownloadModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-3 bg-emerald-700/80 hover:bg-emerald-600 text-white font-semibold text-sm rounded-xl transition-colors border border-emerald-600/40"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Movie</span>
                </button>
              ) : (
                <div
                  className="flex items-center gap-2 px-4 py-3 bg-slate-800/40 text-slate-500 font-medium text-xs rounded-xl border border-slate-800 cursor-not-allowed"
                  title="Direct download has not been licensed for this title"
                >
                  <Download className="w-4 h-4" />
                  <span>Download unavailable</span>
                </div>
              )}

              {/* Watchlist Toggle */}
              <button
                onClick={handleToggleWatchlist}
                className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-xl border border-slate-700 transition-colors"
              >
                {inWatchlist ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>In Watchlist</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4" />
                    <span>Add to Watchlist</span>
                  </>
                )}
              </button>
            </div>

            {/* Synopsis / Description */}
            <div className="space-y-2 pt-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Synopsis</h3>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl">
                {movie.description}
              </p>
            </div>

            {/* Cast & Director */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Director</span>
                <span className="text-sm text-slate-200 font-medium">{movie.director || 'Licensed Production'}</span>
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Starring Cast</span>
                <span className="text-sm text-slate-200 font-medium">
                  {movie.cast && movie.cast.length > 0 ? movie.cast.join(', ') : 'Original Voice Ensemble'}
                </span>
              </div>
            </div>

            {/* Multilingual OTT Audio & Subtitle Languages */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Audio & Subtitles Available
                  </span>
                </div>
                {((movie.audioTracks && movie.audioTracks.length > 0) || (movie.subtitleTracks && movie.subtitleTracks.length > 0)) && (
                  <span className="text-[10px] font-bold text-red-400 bg-red-950/60 border border-red-900/60 px-2 py-0.5 rounded-full">
                    Multilingual
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                {/* Audio Languages */}
                <div className="space-y-1">
                  <span className="text-slate-400 flex items-center gap-1 font-semibold text-[11px]">
                    <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Audio Tracks:</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-medium text-[11px] border border-slate-700">
                      {movie.language || 'English'} [Original]
                    </span>
                    {movie.audioTracks &&
                      movie.audioTracks
                        .filter((t) => t.id !== 'original' && t.language && t.url)
                        .map((track) => (
                          <span
                            key={track.id}
                            className="px-2 py-0.5 rounded bg-red-950/40 text-red-300 font-medium text-[11px] border border-red-900/40"
                          >
                            {track.label || track.language}
                          </span>
                        ))}
                  </div>
                </div>

                {/* Subtitle Languages */}
                <div className="space-y-1">
                  <span className="text-slate-400 flex items-center gap-1 font-semibold text-[11px]">
                    <Subtitles className="w-3.5 h-3.5 text-slate-400" />
                    <span>Subtitles / CC:</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {movie.subtitleTracks && movie.subtitleTracks.length > 0 ? (
                      movie.subtitleTracks
                        .filter((s) => s.language && s.src)
                        .map((sub) => (
                          <span
                            key={sub.id}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-medium text-[11px] border border-slate-700"
                          >
                            {sub.label || sub.language}
                          </span>
                        ))
                    ) : (
                      <span className="text-slate-500 italic text-[11px]">
                        None available
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Movie Details Ad Slot */}
            <AdBanner type="movie-details" />
          </div>
        </div>
      </div>

      {/* Genuine Download Modal (Quality-Based) */}
      {downloadModalOpen && hasAuthorizedDownloads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#0e111a] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Authorized Download Options</h3>
                <p className="text-xs text-slate-400">Select quality resolution for offline playback</p>
              </div>
              <button
                onClick={() => setDownloadModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {downloadError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{downloadError}</span>
              </div>
            )}

            <div className="space-y-3 mb-6">
              {movie.downloadUrls.map((opt) => (
                <div
                  key={opt.quality}
                  className="flex items-center justify-between p-3.5 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{opt.quality}</span>
                      <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                        {opt.format || 'MP4'}
                      </span>
                      {opt.language && (
                        <span className="text-xs text-slate-400 font-sans">· {opt.language}</span>
                      )}
                    </div>
                    {opt.fileSize && (
                      <div className="text-xs text-slate-400">File size: {opt.fileSize}</div>
                    )}
                  </div>

                  <button
                    onClick={() => handleStartDownload(opt)}
                    disabled={downloadingQuality === opt.quality}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shadow-sm"
                  >
                    {downloadingQuality === opt.quality ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                All downloads originate from licensed storage/CDN hosts. No trackers, fake links, or redirect loops.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
