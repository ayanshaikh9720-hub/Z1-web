import React, { useState, useRef, useEffect } from 'react';
import {
  Film, Image as ImageIcon, Upload, Check, AlertTriangle, X,
  Lock, Star, Flame, Eye, RefreshCw, CheckCircle2, Shield,
  Languages, Volume2, Subtitles, Plus, Trash2
} from 'lucide-react';
import { Movie, AudioTrack, SubtitleTrack } from '../types';
import { api } from '../services/api';
import { processThumbnailFile, normalizePosterUrl, optimizeImageFile } from '../utils/imageUtils';

interface EditMovieModalProps {
  movie: Movie;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedMovie: Movie) => Promise<void>;
}

const COMMON_CATEGORIES = [
  'Action', 'Sci-Fi', 'Thriller', 'Drama', 'Comedy',
  'Bollywood', 'South Indian', 'Regional', 'Romance',
  'Horror', 'Adventure', 'Animation', 'Crime', 'Documentary'
];

const COMMON_LANGUAGES = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam',
  'Bengali', 'Kannada', 'Punjabi', 'Spanish', 'French', 'Other'
];

export const EditMovieModal: React.FC<EditMovieModalProps> = ({
  movie,
  isOpen,
  onClose,
  onSave,
}) => {
  // Form fields
  const [title, setTitle] = useState<string>(movie.title || '');
  const [description, setDescription] = useState<string>(movie.description || '');
  const [genres, setGenres] = useState<string[]>(Array.isArray(movie.genres) ? [...movie.genres] : []);
  const [customGenreInput, setCustomGenreInput] = useState<string>('');
  const [language, setLanguage] = useState<string>(movie.language || 'English');
  const [customLanguage, setCustomLanguage] = useState<string>('');
  const [releaseYear, setReleaseYear] = useState<number>(movie.releaseYear || new Date().getFullYear());
  const [duration, setDuration] = useState<number>(movie.duration || 90);
  const [director, setDirector] = useState<string>(movie.director || '');
  const [cast, setCast] = useState<string>(Array.isArray(movie.cast) ? movie.cast.join(', ') : '');
  const [rating, setRating] = useState<number | undefined>(movie.rating);
  const [featured, setFeatured] = useState<boolean>(Boolean(movie.featured));
  const [trending, setTrending] = useState<boolean>(Boolean(movie.trending));
  const [published, setPublished] = useState<boolean>(Boolean(movie.published));

  // Audio and Subtitle Tracks
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(
    Array.isArray(movie.audioTracks) ? [...movie.audioTracks] : []
  );
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>(
    Array.isArray(movie.subtitleTracks) ? [...movie.subtitleTracks] : []
  );

  // Thumbnail handling
  const [currentPosterUrl, setCurrentPosterUrl] = useState<string>(normalizePosterUrl(movie.posterUrl, movie.title));
  const [newThumbnailPreview, setNewThumbnailPreview] = useState<string | null>(null);
  const [thumbnailInputUrl, setThumbnailInputUrl] = useState<string>('');
  const [isProcessingThumbnail, setIsProcessingThumbnail] = useState<boolean>(false);
  const [thumbnailUploadProgress, setThumbnailUploadProgress] = useState<number>(0);
  const [thumbnailUploadSuccess, setThumbnailUploadSuccess] = useState<string>('');
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string>('');
  const [selectedThumbnailFile, setSelectedThumbnailFile] = useState<File | null>(null);
  const [thumbnailChanged, setThumbnailChanged] = useState<boolean>(false);

  // Active task ref for cleanup
  const activeThumbnailUploadTask = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (activeThumbnailUploadTask.current) {
        try {
          activeThumbnailUploadTask.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // States
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Toggle Category Chip
  const toggleGenre = (genre: string) => {
    setGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  // Add Custom Category
  const handleAddCustomGenre = () => {
    if (!customGenreInput.trim()) return;
    const newGenres = customGenreInput
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g && !genres.includes(g));
    if (newGenres.length > 0) {
      setGenres((prev) => [...prev, ...newGenres]);
      setCustomGenreInput('');
    }
  };

  // Execute Thumbnail Upload with Resumable Firebase Storage
  const executeThumbnailUpload = async (file: File) => {
    if (isProcessingThumbnail) return; // Prevent duplicate upload triggers

    // Validate image format (JPG, JPEG, PNG, WebP)
    const validFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => lowerName.endsWith(ext));
    const hasValidMime = validFormats.includes(file.type.toLowerCase()) || file.type.startsWith('image/');
    if (!hasValidMime && !hasValidExt) {
      setThumbnailUploadError('Thumbnail upload failed: Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.');
      return;
    }

    // Instant local preview
    try {
      const immediatePreview = URL.createObjectURL(file);
      setNewThumbnailPreview(immediatePreview);
      setThumbnailChanged(true);
    } catch {}

    setSelectedThumbnailFile(file);
    setIsProcessingThumbnail(true);
    setThumbnailUploadProgress(15);
    setThumbnailUploadError('');
    setThumbnailUploadSuccess('');
    setError('');

    try {
      const fileToUpload = await optimizeImageFile(file);
      setThumbnailUploadProgress(30);

      const downloadUrl = await api.uploadThumbnail(
        fileToUpload,
        movie.id,
        (pct) => {
          setThumbnailUploadProgress(Math.max(30, pct));
        },
        (task) => {
          activeThumbnailUploadTask.current = task;
        }
      );

      const cleanUrl = normalizePosterUrl(downloadUrl, title);
      setNewThumbnailPreview(cleanUrl);
      setThumbnailChanged(true);
      setThumbnailUploadSuccess(`New thumbnail uploaded to storage: ${file.name}`);
    } catch (err: any) {
      console.error('Thumbnail upload error in EditMovieModal:', err);
      setThumbnailUploadError(`Thumbnail upload failed: ${err.message || 'Unknown image hosting error'}`);
    } finally {
      setIsProcessingThumbnail(false);
      activeThumbnailUploadTask.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Thumbnail File Selection
  const handleThumbnailFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    executeThumbnailUpload(file);
  };

  // Handle Retry Thumbnail Upload
  const handleRetryThumbnail = () => {
    if (selectedThumbnailFile) {
      executeThumbnailUpload(selectedThumbnailFile);
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle Manual Thumbnail URL Apply
  const handleApplyThumbnailUrl = () => {
    if (!thumbnailInputUrl.trim()) return;
    const cleanUrl = normalizePosterUrl(thumbnailInputUrl.trim(), title);
    setNewThumbnailPreview(cleanUrl);
    setThumbnailChanged(true);
    setThumbnailInputUrl('');
  };

  // Revert Thumbnail to Original
  const handleRevertThumbnail = () => {
    setNewThumbnailPreview(null);
    setThumbnailChanged(false);
    setCurrentPosterUrl(normalizePosterUrl(movie.posterUrl, movie.title));
  };

  // Save changes
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Movie title is required.');
      return;
    }

    if (genres.length === 0) {
      setError('Please select or specify at least one category.');
      return;
    }

    if (isProcessingThumbnail) {
      setError('Thumbnail is currently uploading. Please wait for upload to finish.');
      return;
    }

    if (thumbnailChanged && newThumbnailPreview && newThumbnailPreview.startsWith('blob:')) {
      setError('Thumbnail upload has not completed yet. Please wait for upload to finish or retry.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // Determine final posterUrl:
      // If a new thumbnail was selected/uploaded, use it; otherwise preserve existing exactly.
      const finalPosterUrl = thumbnailChanged && newThumbnailPreview
        ? newThumbnailPreview
        : currentPosterUrl;

      // Prepare updated movie object:
      // CRITICAL GUARANTEE:
      // - Keep existing movie video file, videoUrl, videoType, downloadUrls, views, downloads strictly unchanged.
      // - Update only edited metadata fields and new thumbnail.
      const updatedMoviePayload: Movie = {
        ...movie,
        title: title.trim(),
        description: description.trim(),
        genres: genres.length > 0 ? genres : ['Action'],
        language: language === 'Other' && customLanguage ? customLanguage.trim() : language,
        releaseYear: Number(releaseYear) || new Date().getFullYear(),
        duration: Number(duration) || 90,
        director: director.trim(),
        cast: cast.split(',').map((s) => s.trim()).filter(Boolean),
        rating: rating !== undefined ? Number(rating) : undefined,
        featured,
        trending,
        published,
        posterUrl: finalPosterUrl,
        audioTracks: audioTracks.filter((t) => t.language && t.url),
        subtitleTracks: subtitleTracks.filter((s) => s.language && s.src),
        // Existing video files and downloads are strictly locked & preserved:
        videoUrl: movie.videoUrl,
        videoType: movie.videoType,
        downloadUrls: movie.downloadUrls || [],
        updatedAt: new Date().toISOString(),
      };

      await onSave(updatedMoviePayload);
      setSuccessMessage('Movie changes saved successfully!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to save movie changes:', err);
      setError(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const activePoster = newThumbnailPreview || currentPosterUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0e111a] border border-slate-800 rounded-2xl shadow-2xl my-6 text-slate-100 max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-600/40 flex items-center justify-center text-red-500">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
                  Edit Movie
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                  ID: {movie.id.slice(0, 10)}...
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Update movie metadata, category and thumbnail without affecting video stream
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Cancel and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Video Protection Guarantee Banner */}
        <div className="px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40 flex items-center justify-between text-xs text-emerald-300 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Video File Protected:</strong> Existing video stream ({movie.videoType?.toUpperCase() || 'MP4'}) will remain 100% intact and unchanged.
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40 hidden sm:inline">
            Preserved
          </span>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2.5 text-xs text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-2.5 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Top Section: Title & Thumbnail in side-by-side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Main Info */}
            <div className="lg:col-span-2 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Movie Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-red-500 transition-colors"
                  placeholder="e.g. Sintel: The Dragon Quest"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Synopsis / Description
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-red-500 transition-colors leading-relaxed"
                  placeholder="Enter detailed plot or overview of the licensed film..."
                />
              </div>

              {/* Year, Duration, Language */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Release Year
                  </label>
                  <input
                    type="number"
                    min="1900"
                    max="2035"
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(parseInt(e.target.value, 10) || 2025)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value, 10) || 90)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Language
                  </label>
                  <select
                    value={COMMON_LANGUAGES.includes(language) ? language : 'Other'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLanguage(val);
                      if (val !== 'Other') setCustomLanguage('');
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Language field if "Other" */}
              {language === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Specify Custom Language
                  </label>
                  <input
                    type="text"
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                    placeholder="e.g. Marathi, Telugu, Korean..."
                  />
                </div>
              )}
            </div>

            {/* Right 1 Col: Thumbnail / Poster Upload & Change Thumbnail */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col items-center text-center space-y-3">
              <div className="w-full flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-red-500" />
                  <span>Movie Thumbnail</span>
                </span>
                {thumbnailChanged ? (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
                    New Selected
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                    Current
                  </span>
                )}
              </div>

              {/* Poster Preview Frame */}
              <div className="relative w-36 h-52 sm:w-40 sm:h-56 rounded-xl overflow-hidden bg-black/60 border border-slate-700 shadow-lg group">
                <img
                  src={normalizePosterUrl(activePoster, title)}
                  alt={title || 'Movie Poster'}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/src/assets/images/poster_stellar_voyage_1790644925651.jpg';
                  }}
                />
                {isProcessingThumbnail && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-2 text-center z-10">
                    <div className="w-7 h-7 border-2 border-red-500 border-t-transparent rounded-full animate-spin mb-1.5" />
                    <span className="text-[11px] text-white font-semibold">Uploading to image CDN...</span>
                    <span className="text-xs font-mono font-bold text-red-400">{thumbnailUploadProgress}%</span>
                  </div>
                )}
              </div>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                onChange={handleThumbnailFileSelect}
                disabled={isProcessingThumbnail}
                className="hidden"
              />

              {/* Change Thumbnail Action Button & Progress */}
              <div className="w-full space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingThumbnail || saving}
                  className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-red-950/40 flex items-center justify-center gap-2"
                >
                  {isProcessingThumbnail ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading thumbnail... {thumbnailUploadProgress}%</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>{thumbnailChanged ? 'Change Thumbnail Again' : 'Change Thumbnail'}</span>
                    </>
                  )}
                </button>

                {isProcessingThumbnail && (
                  <div className="w-full space-y-1 p-2 bg-black/40 rounded-xl border border-slate-800">
                    <div className="flex justify-between text-[10px] text-slate-300">
                      <span>Uploading to image CDN...</span>
                      <span className="font-mono font-bold text-red-400">{thumbnailUploadProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-600 transition-all duration-150"
                        style={{ width: `${thumbnailUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {thumbnailUploadSuccess && (
                  <div className="p-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-[10px] text-emerald-300 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{thumbnailUploadSuccess}</span>
                  </div>
                )}

                {thumbnailUploadError && (
                  <div className="p-2.5 bg-red-950/70 border border-red-800/80 rounded-xl flex flex-col gap-2 text-[11px] text-red-200 text-left">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span className="break-words font-medium">{thumbnailUploadError}</span>
                    </div>
                    {selectedThumbnailFile && (
                      <button
                        type="button"
                        onClick={handleRetryThumbnail}
                        disabled={isProcessingThumbnail}
                        className="self-end px-2.5 py-1 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 shadow-sm"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}
                  </div>
                )}

                {thumbnailChanged && (
                  <button
                    type="button"
                    onClick={handleRevertThumbnail}
                    className="w-full py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:underline flex items-center justify-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset to Original</span>
                  </button>
                )}
              </div>

              {/* Direct URL Input fallback */}
              <div className="w-full pt-2 border-t border-slate-800/80">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={thumbnailInputUrl}
                    onChange={(e) => setThumbnailInputUrl(e.target.value)}
                    placeholder="Or paste image URL"
                    className="flex-1 px-2.5 py-1.5 bg-black/50 border border-slate-700 rounded-lg text-[11px] text-slate-300 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleApplyThumbnailUrl}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-semibold border border-slate-700"
                  >
                    Set
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 leading-tight">
                JPG, PNG or WebP. If not changed, existing thumbnail stays unchanged.
              </p>
            </div>
          </div>

          {/* Category / Genre Section */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-white">
                  Movie Category / Genres <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Select one or more categories that describe this film
                </span>
              </div>
              <div className="text-xs font-medium text-slate-400">
                Selected: <strong className="text-white">{genres.join(', ') || 'None'}</strong>
              </div>
            </div>

            {/* Clickable Genre Badges */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON_CATEGORIES.map((cat) => {
                const isSelected = genres.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleGenre(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/40 border border-red-500'
                        : 'bg-slate-800/80 text-slate-300 border border-slate-700/80 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Add Custom Genre / Sub-category */}
            <div className="flex gap-2 pt-2 border-t border-slate-800/80">
              <input
                type="text"
                value={customGenreInput}
                onChange={(e) => setCustomGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomGenre();
                  }
                }}
                placeholder="Add custom category (e.g. Anime, Mystery, Historical)..."
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={handleAddCustomGenre}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700"
              >
                + Add Category
              </button>
            </div>
          </div>

          {/* Additional Metadata: Director, Cast, Rating */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Director
              </label>
              <input
                type="text"
                value={director}
                onChange={(e) => setDirector(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                placeholder="Director name"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Cast (Comma separated)
              </label>
              <input
                type="text"
                value={cast}
                onChange={(e) => setCast(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                placeholder="Actors separated by commas"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Rating (0.0 to 10.0)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={rating !== undefined ? rating : ''}
                onChange={(e) => setRating(e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                placeholder="e.g. 8.5"
              />
            </div>
          </div>

          {/* MULTILINGUAL AUDIO & SUBTITLES SECTION */}
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-red-500" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Audio & Subtitle Tracks
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Multilingual OTT Support
              </span>
            </div>

            {/* 1. Audio Tracks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Volume2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Audio Languages</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAudioTracks((prev) => [
                      ...prev,
                      {
                        id: `audio_${Date.now()}`,
                        language: 'Hindi',
                        label: 'Hindi [Dubbed]',
                        url: '',
                      },
                    ]);
                  }}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded bg-red-950/40 border border-red-900/60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Dubbed Track</span>
                </button>
              </div>

              {/* Primary Master Audio (Readonly reference) */}
              <div className="p-2.5 bg-black/40 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-bold text-white">
                    {language || 'English'} [Original Audio]
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                    (Master Video Stream Track)
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                  Default Original
                </span>
              </div>

              {/* Extra Dubbed Tracks */}
              {audioTracks.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic pl-1">
                  Only the original audio track is configured for this film. To add Hindi, Tamil, Telugu, or other dubbed audio streams, tap "+ Add Dubbed Track" above.
                </div>
              ) : (
                audioTracks.map((track, idx) => (
                  <div
                    key={track.id || idx}
                    className="p-3 bg-black/40 rounded-xl border border-slate-800 space-y-2"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                      <div className="sm:col-span-3">
                        <label className="text-[10px] text-slate-400 block mb-1">Language</label>
                        <input
                          type="text"
                          value={track.language}
                          onChange={(e) => {
                            const updated = [...audioTracks];
                            updated[idx].language = e.target.value;
                            if (!updated[idx].label || updated[idx].label.includes('[Dubbed]')) {
                              updated[idx].label = `${e.target.value} [Dubbed]`;
                            }
                            setAudioTracks(updated);
                          }}
                          placeholder="e.g. Hindi, Tamil"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="text-[10px] text-slate-400 block mb-1">Track Label</label>
                        <input
                          type="text"
                          value={track.label}
                          onChange={(e) => {
                            const updated = [...audioTracks];
                            updated[idx].label = e.target.value;
                            setAudioTracks(updated);
                          }}
                          placeholder="e.g. Hindi [Dubbed]"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        />
                      </div>

                      <div className="sm:col-span-5">
                        <label className="text-[10px] text-slate-400 block mb-1">Audio / Stream URL</label>
                        <input
                          type="text"
                          value={track.url}
                          onChange={(e) => {
                            const updated = [...audioTracks];
                            updated[idx].url = e.target.value;
                            setAudioTracks(updated);
                          }}
                          placeholder="https://.../audio_hi.mp3 or alternate stream"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAudioTracks((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="w-full p-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 rounded-lg flex items-center justify-center transition-colors"
                          title="Remove track"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Language Suggestions */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 overflow-x-auto pt-1">
                      <span className="shrink-0">Quick presets:</span>
                      {['Hindi', 'Tamil', 'Telugu', 'Spanish', 'French', 'Malayalam'].map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            const updated = [...audioTracks];
                            updated[idx].language = lang;
                            updated[idx].label = `${lang} [Dubbed]`;
                            setAudioTracks(updated);
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 2. Subtitle Tracks */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Subtitles className="w-3.5 h-3.5 text-red-400" />
                  <span>Subtitles & Closed Captions</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSubtitleTracks((prev) => [
                      ...prev,
                      {
                        id: `sub_${Date.now()}`,
                        language: 'English',
                        label: 'English [CC]',
                        src: '',
                        format: 'vtt',
                      },
                    ]);
                  }}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded bg-red-950/40 border border-red-900/60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Subtitle Track</span>
                </button>
              </div>

              {subtitleTracks.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic pl-1">
                  No custom subtitle files configured. Player will show "Off" by default. Tap "+ Add Subtitle Track" to add WebVTT/SRT subtitles.
                </div>
              ) : (
                subtitleTracks.map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    className="p-3 bg-black/40 rounded-xl border border-slate-800 space-y-2"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                      <div className="sm:col-span-3">
                        <label className="text-[10px] text-slate-400 block mb-1">Language</label>
                        <input
                          type="text"
                          value={sub.language}
                          onChange={(e) => {
                            const updated = [...subtitleTracks];
                            updated[idx].language = e.target.value;
                            if (!updated[idx].label || updated[idx].label.includes('[CC]')) {
                              updated[idx].label = `${e.target.value} [CC]`;
                            }
                            setSubtitleTracks(updated);
                          }}
                          placeholder="e.g. English, Hindi"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="text-[10px] text-slate-400 block mb-1">Subtitle Label</label>
                        <input
                          type="text"
                          value={sub.label}
                          onChange={(e) => {
                            const updated = [...subtitleTracks];
                            updated[idx].label = e.target.value;
                            setSubtitleTracks(updated);
                          }}
                          placeholder="e.g. English [CC]"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        />
                      </div>

                      <div className="sm:col-span-5">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-slate-400 block">WebVTT URL / Data</label>
                          {!sub.src && (
                            <button
                              type="button"
                              onClick={() => {
                                const sampleVtt = `data:text/vtt;charset=utf-8,${encodeURIComponent(
                                  `WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n[${sub.language || 'Subtitles'}] Enjoy streaming on Z1 Movies.\n\n00:00:06.000 --> 00:00:10.000\nHigh-definition licensed OTT cinema.`
                                )}`;
                                const updated = [...subtitleTracks];
                                updated[idx].src = sampleVtt;
                                setSubtitleTracks(updated);
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 underline"
                            >
                              Insert Sample VTT
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={sub.src}
                          onChange={(e) => {
                            const updated = [...subtitleTracks];
                            updated[idx].src = e.target.value;
                            setSubtitleTracks(updated);
                          }}
                          placeholder="https://.../subtitles.vtt or data:text/vtt;..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSubtitleTracks((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="w-full p-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 rounded-lg flex items-center justify-center transition-colors"
                          title="Remove track"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Language Suggestions */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 overflow-x-auto pt-1">
                      <span className="shrink-0">Quick presets:</span>
                      {['English', 'Hindi', 'Tamil', 'Telugu', 'Spanish', 'French'].map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            const updated = [...subtitleTracks];
                            updated[idx].language = lang;
                            updated[idx].label = `${lang} [CC]`;
                            setSubtitleTracks(updated);
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Visibility & Badges Toggles */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Display & Visibility Status
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Publish Status */}
              <div
                onClick={() => setPublished(!published)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  published
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                    : 'bg-amber-950/30 border-amber-800/60 text-amber-300'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">
                    {published ? 'Published (Live)' : 'Draft (Hidden)'}
                  </div>
                  <div className="text-[10px] opacity-75">
                    {published ? 'Visible to all viewers' : 'Only visible to admin'}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    published ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500/30 text-amber-200'
                  }`}
                >
                  {published ? '✓' : '✕'}
                </div>
              </div>

              {/* Featured Status */}
              <div
                onClick={() => setFeatured(!featured)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  featured
                    ? 'bg-red-950/40 border-red-800/80 text-red-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <div>
                  <div className="font-bold text-xs flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" />
                    <span>Featured Hero</span>
                  </div>
                  <div className="text-[10px] opacity-75">
                    {featured ? 'Prominently showcased' : 'Standard placement'}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    featured ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {featured ? '✓' : '—'}
                </div>
              </div>

              {/* Trending Status */}
              <div
                onClick={() => setTrending(!trending)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  trending
                    ? 'bg-orange-950/40 border-orange-800/80 text-orange-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <div>
                  <div className="font-bold text-xs flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Trending Badge</span>
                  </div>
                  <div className="text-[10px] opacity-75">
                    {trending ? 'Ranked in trending row' : 'Normal row'}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    trending ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {trending ? '✓' : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Locked Video File Indicator */}
          <div className="p-3 bg-black/40 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate">
                Stream File: <code className="text-slate-300 font-mono text-[11px]">{movie.videoUrl}</code>
              </span>
            </div>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 shrink-0">
              Unmodified
            </span>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-950/50 transition-all flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
