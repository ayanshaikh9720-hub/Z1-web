import React, { useState, useEffect, useRef } from 'react';
import {
  Film, Users, Eye, Download, Plus, Edit2, Trash2, CheckCircle2, XCircle,
  AlertTriangle, UploadCloud, RefreshCw, Star, Flame, Check, ExternalLink,
  Shield, Filter, ArrowUpDown, Play, Image as ImageIcon, MoreVertical,
  Upload, EyeOff
} from 'lucide-react';
import { Movie, AdminStats, DownloadOption, User } from '../types';
import { api } from '../services/api';
import { EditMovieModal } from '../components/EditMovieModal';
import { normalizePosterUrl, optimizeImageFile, DEFAULT_POSTER_FALLBACK } from '../utils/imageUtils';
import { getSafeVideoUrl } from '../utils/videoUrlHelper';

interface AdminPageProps {
  user: User | null;
  onNavigateHome: () => void;
  onOpenAuth?: () => void;
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
  onMovieUpdated?: (movie: Movie) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({
  user,
  onNavigateHome,
  onOpenAuth,
  onSelectMovie,
  onPlayMovie,
  onMovieUpdated,
}) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'unpublished' | 'featured' | 'trending'>('all');
  const [sortField, setSortField] = useState<'newest' | 'views' | 'downloads'>('newest');

  // Dedicated Edit Movie modal state
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [movieToEdit, setMovieToEdit] = useState<Movie | null>(null);
  const [editSectionFocus, setEditSectionFocus] = useState<'general' | 'thumbnail' | 'video'>('general');

  // Actions menu state (tracks which movie row dropdown is currently open)
  const [activeMenuMovieId, setActiveMenuMovieId] = useState<string | null>(null);

  // Safe Delete confirmation modal state
  const [safeDeleteTarget, setSafeDeleteTarget] = useState<Movie | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState<boolean>(false);

  // In-app notifications
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  // Add New Movie modal state
  const [newMovieModalOpen, setNewMovieModalOpen] = useState<boolean>(false);
  const [currentNewMovie, setCurrentNewMovie] = useState<Partial<Movie> | null>(null);
  const [formSaving, setFormSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // Thumbnail upload states for Add New Movie
  const [thumbnailUploading, setThumbnailUploading] = useState<boolean>(false);
  const [thumbnailUploadProgress, setThumbnailUploadProgress] = useState<number>(0);
  const [thumbnailUploadSuccess, setThumbnailUploadSuccess] = useState<string>('');
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string>('');
  const [selectedThumbnailFile, setSelectedThumbnailFile] = useState<File | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);
  const activeThumbnailUploadTask = useRef<any>(null);

  // Clean up any in-flight upload task on unmount
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

  // Video Upload states
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');

  // Video URL Probe State
  const [probeLoading, setProbeLoading] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<{ valid: boolean; message: string; contentType?: string } | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [statsData, moviesData] = await Promise.all([
        api.getAdminStats(),
        api.getMovies({ published: undefined }), // Admin gets all movies (published & unpublished)
      ]);
      setStats(statsData);
      setMovies(moviesData.movies);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Close actions dropdown menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.admin-actions-menu')) {
        setActiveMenuMovieId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleTogglePublish = async (movie: Movie) => {
    try {
      const updated = await api.togglePublish(movie.id, !movie.published);
      setMovies((prev) => prev.map((m) => (m.id === movie.id ? updated.movie : m)));
      api.getAdminStats().then(setStats).catch(() => {});
      if (onMovieUpdated) {
        onMovieUpdated(updated.movie);
      }
      triggerNotification(
        `"${movie.title}" is now ${updated.movie.published ? 'Published (Live)' : 'Unpublished (Draft)'}.`
      );
    } catch (err: any) {
      triggerNotification(`Publish toggle failed: ${err.message}`, 'error');
    }
  };

  const handleToggleFeatured = async (movie: Movie) => {
    try {
      const nextFeatured = !movie.featured;
      const res = await api.updateMovie(movie.id, {
        ...movie,
        featured: nextFeatured,
        updatedAt: new Date().toISOString(),
      });
      setMovies((prev) => prev.map((m) => (m.id === movie.id ? res.movie : m)));
      api.getAdminStats().then(setStats).catch(() => {});
      if (onMovieUpdated) {
        onMovieUpdated(res.movie);
      }
      triggerNotification(
        `"${movie.title}" ${nextFeatured ? 'added to Featured Showcase' : 'removed from Featured'}.`
      );
    } catch (err: any) {
      triggerNotification(`Failed to update featured status: ${err.message}`, 'error');
    }
  };

  const handleStartDelete = (movie: Movie) => {
    setActiveMenuMovieId(null);
    setSafeDeleteTarget(movie);
  };

  const handleConfirmDelete = async () => {
    if (!safeDeleteTarget) return;
    setDeleteInProgress(true);
    try {
      await api.deleteMovie(safeDeleteTarget.id);
      setMovies((prev) => prev.filter((m) => m.id !== safeDeleteTarget.id));
      api.getAdminStats().then(setStats).catch(() => {});
      triggerNotification(`Movie "${safeDeleteTarget.title}" was safely deleted.`);
      setSafeDeleteTarget(null);
    } catch (err: any) {
      triggerNotification(`Failed to delete movie: ${err.message}`, 'error');
    } finally {
      setDeleteInProgress(false);
    }
  };

  // Open Edit Movie Modal for existing movie with targeted section
  const handleOpenEditModal = (movie: Movie, section: 'general' | 'thumbnail' | 'video' = 'general') => {
    setActiveMenuMovieId(null);
    setMovieToEdit(movie);
    setEditSectionFocus(section);
    setEditModalOpen(true);
  };

  // Save Edited Movie Callback
  const handleSaveEditedMovie = async (updated: Movie) => {
    const res = await api.updateMovie(updated.id, updated);
    setMovies((prev) => prev.map((m) => (m.id === res.movie.id ? res.movie : m)));
    api.getAdminStats().then(setStats).catch(() => {});
    if (onMovieUpdated) {
      onMovieUpdated(res.movie);
    }
    triggerNotification(`Saved changes to "${res.movie.title}".`);
  };

  const openNewMovieModal = () => {
    setCurrentNewMovie({
      title: '',
      description: '',
      posterUrl: '', // REQUIRED: Must be uploaded or selected
      backdropUrl: '',
      videoUrl: '',
      videoType: 'mp4',
      downloadUrls: [
        {
          quality: '1080p',
          format: 'MP4',
          url: '',
          fileSize: '1.2 GB',
          language: 'English',
        },
      ],
      releaseYear: 2025,
      language: 'English',
      genres: ['Action', 'Thriller'],
      duration: 90,
      cast: ['Lead Actor', 'Co-Star'],
      director: 'Director Name',
      rating: 8.5,
      featured: false,
      trending: false,
      published: true,
    });
    setFormError('');
    setProbeResult(null);
    setUploadSuccess('');
    setUploadError('');
    setThumbnailUploading(false);
    setThumbnailUploadProgress(0);
    setThumbnailUploadSuccess('');
    setThumbnailUploadError('');
    setSelectedThumbnailFile(null);
    activeThumbnailUploadTask.current = null;
    setNewMovieModalOpen(true);
  };

  // Thumbnail Upload Handler for Add New Movie (Firebase Storage)
  const executeThumbnailUpload = async (file: File) => {
    if (thumbnailUploading) return; // Prevent duplicate upload triggers

    // Validate image format (JPG, JPEG, PNG, WebP)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => lowerName.endsWith(ext));
    const hasValidMime = validTypes.includes(file.type.toLowerCase()) || file.type.startsWith('image/');
    if (!hasValidMime && !hasValidExt) {
      setThumbnailUploadError('Thumbnail upload failed: Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.');
      return;
    }

    // Immediate local preview so the user instantly sees the poster
    try {
      const immediatePreview = URL.createObjectURL(file);
      setCurrentNewMovie((prev) => prev ? {
        ...prev,
        posterUrl: prev.posterUrl || immediatePreview,
        backdropUrl: prev.backdropUrl || immediatePreview,
      } : prev);
    } catch {}

    setSelectedThumbnailFile(file);
    setThumbnailUploading(true);
    setThumbnailUploadProgress(10);
    setThumbnailUploadError('');
    setThumbnailUploadSuccess('');

    try {
      // Automatically optimize/compress large camera images (e.g. from smartphones)
      const fileToUpload = await optimizeImageFile(file);
      setThumbnailUploadProgress(25);

      const targetMovieId = currentNewMovie?.id || `new_${Date.now()}`;
      const downloadUrl = await api.uploadThumbnail(
        fileToUpload,
        targetMovieId,
        (pct) => {
          setThumbnailUploadProgress(Math.max(25, pct));
        },
        (task) => {
          activeThumbnailUploadTask.current = task;
        }
      );

      const normalizedUrl = normalizePosterUrl(downloadUrl, currentNewMovie?.title);

      setCurrentNewMovie((prev) => prev ? {
        ...prev,
        posterUrl: normalizedUrl,
        backdropUrl: prev.backdropUrl || normalizedUrl,
      } : prev);

      setThumbnailUploadSuccess(`Thumbnail uploaded and ready: ${file.name}`);
    } catch (err: any) {
      console.error('Thumbnail upload failed in AdminPage:', err);
      setThumbnailUploadError(`Thumbnail upload failed: ${err.message || 'Unknown image hosting error'}`);
    } finally {
      setThumbnailUploading(false);
      activeThumbnailUploadTask.current = null;
      if (thumbnailFileInputRef.current) {
        thumbnailFileInputRef.current.value = '';
      }
    }
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    executeThumbnailUpload(file);
  };

  const handleRetryThumbnailUpload = () => {
    if (selectedThumbnailFile) {
      executeThumbnailUpload(selectedThumbnailFile);
    } else if (thumbnailFileInputRef.current) {
      thumbnailFileInputRef.current.click();
    }
  };

  // Video Upload Handler for New Movies
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');
    setUploadSuccess('');

    try {
      const res = await api.uploadFile(file, (pct) => setUploadProgress(pct));
      setUploadSuccess(`Upload complete: ${res.originalName} (${Math.round(res.size / 1024 / 1024)} MB)`);
      if (currentNewMovie) {
        setCurrentNewMovie({
          ...currentNewMovie,
          videoUrl: res.url,
          videoType: res.url.endsWith('.m3u8') ? 'hls' : 'mp4',
        });
      }
      verifyVideoUrl(res.url);
    } catch (err: any) {
      setUploadError(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Probe and Verify Video Stream
  const verifyVideoUrl = async (urlToTest?: string) => {
    const testUrl = urlToTest || currentNewMovie?.videoUrl;
    if (!testUrl) {
      setProbeResult({ valid: false, message: 'Please enter a video URL first' });
      return;
    }

    setProbeLoading(true);
    setProbeResult(null);
    try {
      const res = await api.validateVideoUrl(testUrl);
      setProbeResult({
        valid: res.valid,
        message: res.message,
        contentType: res.contentType,
      });
    } catch (err: any) {
      setProbeResult({
        valid: false,
        message: err.message || 'Verification probe failed',
      });
    } finally {
      setProbeLoading(false);
    }
  };

  // Form Save for New Movies
  const handleSaveNewMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentNewMovie || !currentNewMovie.title || !currentNewMovie.videoUrl) {
      setFormError('Title and Video URL are required fields.');
      return;
    }

    const videoValidation = getSafeVideoUrl(currentNewMovie.videoUrl);
    if (!videoValidation.valid) {
      setFormError(videoValidation.error || 'Please provide a valid, safe video stream URL.');
      return;
    }

    if (thumbnailUploading) {
      setFormError('Thumbnail is currently uploading. Please wait for upload to complete.');
      return;
    }

    if (!currentNewMovie.posterUrl || !currentNewMovie.posterUrl.trim()) {
      setFormError('Movie Thumbnail / Poster is required. Please upload a poster before publishing.');
      return;
    }

    if (currentNewMovie.posterUrl.startsWith('blob:')) {
      setFormError('Thumbnail upload has not completed yet. Please wait for upload to finish or retry.');
      return;
    }

    setFormSaving(true);
    setFormError('');

    try {
      const moviePayload: Partial<Movie> = {
        ...currentNewMovie,
        videoUrl: videoValidation.safeUrl,
        backdropUrl: currentNewMovie.backdropUrl || currentNewMovie.posterUrl,
      };

      const res = await api.createMovie(moviePayload);
      setMovies((prev) => [res.movie, ...prev]);
      setNewMovieModalOpen(false);
      api.getAdminStats().then(setStats).catch(() => {});
    } catch (err: any) {
      setFormError(err.message || 'Failed to save movie record.');
    } finally {
      setFormSaving(false);
    }
  };

  // Filtered & Sorted Movie List
  const displayMovies = movies
    .filter((m) => {
      if (filterStatus === 'published') return m.published;
      if (filterStatus === 'unpublished') return !m.published;
      if (filterStatus === 'featured') return m.featured;
      if (filterStatus === 'trending') return m.trending;
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'views') return (b.views || 0) - (a.views || 0);
      if (sortField === 'downloads') return (b.downloads || 0) - (a.downloads || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-900/60 flex items-center justify-center mx-auto text-red-500">
          <Shield className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display text-2xl font-bold text-white">Administrator Access Required</h2>
        <p className="text-slate-400 text-sm">
          You must be authenticated with curator privileges to access the Z1 Movies administrative dashboard.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-950/50"
            >
              Sign In as Admin
            </button>
          )}
          <button
            onClick={onNavigateHome}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[85vh] space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500 uppercase tracking-widest">
            <Shield className="w-4 h-4" />
            <span>Curator Control Hub</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Admin Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadAdminData();
              triggerNotification('Movie library and real statistics refreshed.');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors"
            title="Refresh movie library and statistics"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Refresh List</span>
          </button>

          <button
            onClick={openNewMovieModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Movie</span>
          </button>
        </div>
      </div>

      {/* Global Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
              : 'bg-red-950/70 border-red-800 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real Statistics Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#0e111a] border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Total Movies</span>
              <Film className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {stats.totalMovies}
            </div>
            <div className="text-[11px] text-slate-500">
              {stats.publishedCount} active · {stats.unpublishedCount} draft
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0e111a] border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Total Users</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {stats.totalUsers}
            </div>
            <div className="text-[11px] text-slate-500">Authenticated members</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0e111a] border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Stream Views</span>
              <Eye className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {stats.totalViews.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500">Verified stream events</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0e111a] border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Authorized Downloads</span>
              <Download className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {stats.totalDownloads.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500">Completed file deliveries</div>
          </div>
        </div>
      )}

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <Filter className="w-3.5 h-3.5 text-slate-500 mr-1 shrink-0" />
          {[
            { id: 'all', label: 'All Titles' },
            { id: 'published', label: 'Published' },
            { id: 'unpublished', label: 'Drafts' },
            { id: 'featured', label: 'Featured' },
            { id: 'trending', label: 'Trending' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'bg-red-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-400">Sort:</span>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1"
          >
            <option value="newest">Newest Added</option>
            <option value="views">Most Streamed</option>
            <option value="downloads">Most Downloaded</option>
          </select>
        </div>
      </div>

      {/* Movie Management Table */}
      <div className="bg-[#0e111a] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Movie</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Badges</th>
                <th className="py-3 px-3 text-right">Views</th>
                <th className="py-3 px-3 text-right">Downloads</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {displayMovies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No movies match the current filter.
                  </td>
                </tr>
              ) : (
                displayMovies.map((movie) => (
                  <tr key={movie.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={normalizePosterUrl(movie.posterUrl, movie.title)}
                          alt={movie.title}
                          className="w-10 h-14 object-cover rounded bg-slate-800 shrink-0"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = DEFAULT_POSTER_FALLBACK;
                          }}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-100 truncate text-sm">
                            {movie.title}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {movie.releaseYear} · {movie.language} · {movie.genres.join(', ')}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
                            {movie.videoUrl}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <button
                        onClick={() => handleTogglePublish(movie)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          movie.published
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                            : 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {movie.published ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Published</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Draft</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {movie.featured && (
                          <span className="flex items-center gap-1 text-[10px] bg-red-950/80 text-red-300 border border-red-800/60 px-1.5 py-0.5 rounded font-medium">
                            <Star className="w-3 h-3 fill-current" />
                            Featured
                          </span>
                        )}
                        {movie.trending && (
                          <span className="flex items-center gap-1 text-[10px] bg-orange-950/80 text-orange-300 border border-orange-800/60 px-1.5 py-0.5 rounded font-medium">
                            <Flame className="w-3 h-3 fill-current" />
                            Trending
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-200 tabular-nums">
                      {movie.views?.toLocaleString() || 0}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-200 tabular-nums">
                      {movie.downloads?.toLocaleString() || 0}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Play Test Stream */}
                        <button
                          onClick={() => onPlayMovie(movie)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors"
                          title="Test Player Stream"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>

                        {/* Clearly Visible Actions Menu */}
                        <div className="relative inline-block text-left admin-actions-menu">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMovieId(activeMenuMovieId === movie.id ? null : movie.id);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              activeMenuMovieId === movie.id
                                ? 'bg-red-600 text-white border-red-500 shadow-md'
                                : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-slate-200 hover:text-white border-slate-700 hover:border-slate-600'
                            }`}
                            aria-label={`Actions for ${movie.title}`}
                          >
                            <span>Actions</span>
                            <MoreVertical className="w-3.5 h-3.5 opacity-80" />
                          </button>

                          {activeMenuMovieId === movie.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 mt-1.5 w-56 rounded-xl bg-[#0e111a] border border-slate-700 shadow-2xl py-1.5 z-40 divide-y divide-slate-800/80 animate-in fade-in zoom-in-95 duration-100"
                            >
                              <div className="px-3 py-1.5">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  Movie Actions
                                </div>
                                <div className="text-xs font-semibold text-slate-200 truncate">
                                  {movie.title}
                                </div>
                              </div>

                              <div className="py-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(movie, 'general')}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-red-400" />
                                  <span>Edit Movie</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(movie, 'thumbnail')}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition-colors"
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Change Thumbnail</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(movie, 'video')}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition-colors"
                                >
                                  <Upload className="w-3.5 h-3.5 text-sky-400" />
                                  <span>Replace Video</span>
                                </button>
                              </div>

                              <div className="py-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMovieId(null);
                                    handleTogglePublish(movie);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition-colors"
                                >
                                  {movie.published ? (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Unpublish (Make Draft)</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Publish (Make Live)</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMovieId(null);
                                    handleToggleFeatured(movie);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition-colors"
                                >
                                  <Star className={`w-3.5 h-3.5 ${movie.featured ? 'text-slate-400' : 'text-amber-400 fill-amber-400'}`} />
                                  <span>{movie.featured ? 'Remove from Featured' : 'Add to Featured'}</span>
                                </button>
                              </div>

                              <div className="py-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartDelete(movie)}
                                  className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 flex items-center gap-2.5 transition-colors font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  <span>Delete Movie</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dedicated Edit Movie Modal */}
      {editModalOpen && movieToEdit && (
        <EditMovieModal
          movie={movieToEdit}
          isOpen={editModalOpen}
          initialSection={editSectionFocus}
          onClose={() => {
            setEditModalOpen(false);
            setMovieToEdit(null);
          }}
          onSave={handleSaveEditedMovie}
        />
      )}

      {/* Safe Delete Confirmation Dialog */}
      {safeDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0e111a] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Delete Movie
                </h3>
                <p className="text-xs text-slate-400">
                  Safe deletion confirmation
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs space-y-2">
              <div className="text-slate-300">
                Are you sure you want to delete <span className="font-bold text-white">"{safeDeleteTarget.title}"</span>?
              </div>
              <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
                <li>Only this single movie record will be deleted.</li>
                <li>Other movies, user accounts, and database records remain safe.</li>
                <li>Shared storage assets or referenced files will not be deleted.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSafeDeleteTarget(null)}
                disabled={deleteInProgress}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteInProgress}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-950/50 transition-colors"
              >
                {deleteInProgress ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Movie</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Movie Modal with Video Upload & Probe */}
      {newMovieModalOpen && currentNewMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-[#0e111a] border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 my-8 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div>
                <h3 className="font-display text-xl font-bold text-white">
                  Add New Licensed Movie
                </h3>
                <p className="text-xs text-slate-400">
                  Configure streaming source, authorized download resolutions, and metadata
                </p>
              </div>
              <button
                onClick={() => setNewMovieModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewMovie} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Movie Title *</label>
                  <input
                    type="text"
                    required
                    value={currentNewMovie.title || ''}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    placeholder="Title of authorized film"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Description / Synopsis</label>
                  <textarea
                    rows={3}
                    value={currentNewMovie.description || ''}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    placeholder="Compelling synopsis..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Release Year</label>
                  <input
                    type="number"
                    value={currentNewMovie.releaseYear || 2025}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, releaseYear: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Language</label>
                  <input
                    type="text"
                    value={currentNewMovie.language || 'English'}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, language: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    placeholder="e.g. English, Hindi, Tamil"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={currentNewMovie.duration || 90}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, duration: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Rating (0-10)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={currentNewMovie.rating || ''}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, rating: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    placeholder="Leave empty if unrated"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Director</label>
                  <input
                    type="text"
                    value={currentNewMovie.director || ''}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, director: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cast (Comma separated)</label>
                  <input
                    type="text"
                    value={Array.isArray(currentNewMovie.cast) ? currentNewMovie.cast.join(', ') : ''}
                    onChange={(e) => setCurrentNewMovie({
                      ...currentNewMovie,
                      cast: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    placeholder="Actor 1, Actor 2..."
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Genres (Comma separated)</label>
                  <input
                    type="text"
                    value={Array.isArray(currentNewMovie.genres) ? currentNewMovie.genres.join(', ') : ''}
                    onChange={(e) => setCurrentNewMovie({
                      ...currentNewMovie,
                      genres: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                    placeholder="Action, Thriller, Sci-Fi"
                  />
                </div>
              </div>

              {/* REQUIRED MOVIE THUMBNAIL / POSTER UPLOAD SECTION */}
              <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-red-500" />
                      <span>Movie Thumbnail / Poster</span>
                      <span className="text-red-500 text-xs font-semibold">* Required</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Upload a poster image. It will be hosted on the image CDN and displayed across Home, Catalog, and Search cards.
                    </p>
                  </div>
                  {currentNewMovie.posterUrl ? (
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2.5 py-1 rounded-full flex items-center gap-1 self-start sm:self-auto">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Thumbnail Ready</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-full flex items-center gap-1 self-start sm:self-auto">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Required to publish</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                  {/* Large 2:3 Poster Preview Frame */}
                  <div className="sm:col-span-4 flex flex-col items-center">
                    <div className="relative w-44 h-64 rounded-xl overflow-hidden bg-black/60 border-2 border-dashed border-slate-700 shadow-xl flex flex-col items-center justify-center text-center p-3 group">
                      {currentNewMovie.posterUrl ? (
                        <>
                          <img
                            src={normalizePosterUrl(currentNewMovie.posterUrl, currentNewMovie.title)}
                            alt="Selected Movie Poster Preview"
                            className="w-full h-full object-cover rounded-lg"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_POSTER_FALLBACK;
                            }}
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                            <button
                              type="button"
                              onClick={() => thumbnailFileInputRef.current?.click()}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow-md"
                            >
                              Change Poster
                            </button>
                            <span className="text-[10px] text-slate-300">Click to change</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500 space-y-2 p-2">
                          <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                            <ImageIcon className="w-6 h-6 text-red-500/80" />
                          </div>
                          <span className="text-xs font-bold text-slate-300">No Poster Uploaded</span>
                          <span className="text-[10px] text-slate-500 leading-tight">
                            Poster preview will appear here before publishing
                          </span>
                        </div>
                      )}

                      {thumbnailUploading && (
                        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-3 text-center z-10">
                          <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin mb-2" />
                          <span className="text-xs text-white font-semibold">Uploading to image CDN...</span>
                          <span className="text-xs font-mono font-bold text-red-400">{thumbnailUploadProgress}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Controls & Upload Actions */}
                  <div className="sm:col-span-8 space-y-3.5">
                    <input
                      ref={thumbnailFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      onChange={handleThumbnailUpload}
                      disabled={thumbnailUploading}
                      className="hidden"
                    />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-200">
                          Upload Thumbnail File
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          JPG, JPEG, PNG, WebP (Max 10 MB)
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Select a high-resolution poster. The file is uploaded separately to the image CDN, keeping the video file unchanged.
                      </p>

                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => thumbnailFileInputRef.current?.click()}
                          disabled={thumbnailUploading}
                          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-lg shadow-red-950/50 transition-all hover:scale-[1.01]"
                        >
                          {thumbnailUploading ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Uploading thumbnail... {thumbnailUploadProgress}%</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="w-4 h-4" />
                              <span>
                                {currentNewMovie.posterUrl ? 'Choose Different Thumbnail' : 'Choose Thumbnail / Upload Poster'}
                              </span>
                            </>
                          )}
                        </button>

                        {currentNewMovie.posterUrl && !thumbnailUploading && (
                          <button
                            type="button"
                            onClick={() => setCurrentNewMovie({ ...currentNewMovie, posterUrl: '' })}
                            className="px-3 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Upload Progress Bar */}
                    {thumbnailUploading && (
                      <div className="space-y-1.5 p-3 bg-black/40 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-xs text-slate-300">
                          <span>Uploading thumbnail to image CDN...</span>
                          <span className="font-mono font-bold text-red-400">{thumbnailUploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-600 transition-all duration-150"
                            style={{ width: `${thumbnailUploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Success Notification */}
                    {thumbnailUploadSuccess && (
                      <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span className="truncate">{thumbnailUploadSuccess}</span>
                      </div>
                    )}

                    {/* Error Notification with Retry button */}
                    {thumbnailUploadError && (
                      <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-200">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                          <span className="break-words font-medium">{thumbnailUploadError}</span>
                        </div>
                        {selectedThumbnailFile && (
                          <button
                            type="button"
                            onClick={handleRetryThumbnailUpload}
                            disabled={thumbnailUploading}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Direct Poster URL fallback */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Or enter direct image URL:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={currentNewMovie.posterUrl || ''}
                          onChange={(e) => {
                            const clean = normalizePosterUrl(e.target.value.trim(), currentNewMovie?.title);
                            setCurrentNewMovie({
                              ...currentNewMovie,
                              posterUrl: clean,
                              backdropUrl: currentNewMovie?.backdropUrl || clean,
                            });
                          }}
                          placeholder="https://.../poster.jpg"
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* VIDEO SOURCE CONFIGURATION & DIRECT FILE UPLOAD */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-red-500" />
                    <span>Video Streaming Source & Upload</span>
                  </h4>
                  <span className="text-[10px] uppercase font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    MP4 / HLS Supported
                  </span>
                </div>

                {/* Direct Video Upload Section */}
                <div className="p-3 bg-black/40 rounded-lg border border-dashed border-slate-700">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Upload Movie Video File Directly:
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/mkv,application/vnd.apple.mpegurl"
                    disabled={isUploading}
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-500 cursor-pointer"
                  />

                  {isUploading && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Uploading video to server...</span>
                        <span className="font-mono">{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-600 transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadSuccess && (
                    <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>{uploadSuccess}</span>
                    </div>
                  )}

                  {uploadError && (
                    <div className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>

                {/* Video URL Input & Type */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Video Stream URL *</label>
                    <input
                      type="text"
                      required
                      value={currentNewMovie.videoUrl || ''}
                      onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, videoUrl: e.target.value })}
                      placeholder="https://.../video.mp4 or /uploads/..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Stream Format</label>
                    <select
                      value={currentNewMovie.videoType || 'mp4'}
                      onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, videoType: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs"
                    >
                      <option value="mp4">MP4 (Standard)</option>
                      <option value="hls">HLS (.m3u8 Adaptive)</option>
                      <option value="webm">WebM</option>
                    </select>
                  </div>
                </div>

                {/* Probe & Verification Action */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => verifyVideoUrl()}
                    disabled={probeLoading || !currentNewMovie.videoUrl}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
                  >
                    {probeLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span>Verify Video Stream with Probe</span>
                  </button>

                  {probeResult && (
                    <div className={`text-xs flex items-center gap-1.5 ${probeResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                      {probeResult.valid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                      <span className="truncate max-w-xs">{probeResult.message}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AUTHORIZED DOWNLOAD CONFIGURATION */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Authorized Download Links</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const list = currentNewMovie.downloadUrls || [];
                      setCurrentNewMovie({
                        ...currentNewMovie,
                        downloadUrls: [
                          ...list,
                          {
                            quality: '720p',
                            format: 'MP4',
                            url: currentNewMovie.videoUrl || '',
                            fileSize: '700 MB',
                            language: currentNewMovie.language || 'English',
                          },
                        ],
                      });
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold"
                  >
                    + Add Quality Resolution
                  </button>
                </div>

                <p className="text-[11px] text-slate-400">
                  Leave empty if no offline download rights are granted.
                </p>

                {currentNewMovie.downloadUrls?.map((opt, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-2.5 bg-black/40 rounded-lg border border-slate-800 items-end">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Quality</label>
                      <select
                        value={opt.quality}
                        onChange={(e) => {
                          const updated = [...(currentNewMovie.downloadUrls || [])];
                          updated[idx].quality = e.target.value as any;
                          setCurrentNewMovie({ ...currentNewMovie, downloadUrls: updated });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                      >
                        <option value="480p">480p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="4K">4K</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-slate-400 block mb-1">Download URL</label>
                      <input
                        type="text"
                        value={opt.url}
                        onChange={(e) => {
                          const updated = [...(currentNewMovie.downloadUrls || [])];
                          updated[idx].url = e.target.value;
                          setCurrentNewMovie({ ...currentNewMovie, downloadUrls: updated });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono"
                        placeholder="Direct authorized file URL"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">File Size</label>
                      <input
                        type="text"
                        value={opt.fileSize || ''}
                        onChange={(e) => {
                          const updated = [...(currentNewMovie.downloadUrls || [])];
                          updated[idx].fileSize = e.target.value;
                          setCurrentNewMovie({ ...currentNewMovie, downloadUrls: updated });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                        placeholder="e.g. 1.2 GB"
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (currentNewMovie.downloadUrls || []).filter((_, i) => i !== idx);
                          setCurrentNewMovie({ ...currentNewMovie, downloadUrls: updated });
                        }}
                        className="w-full py-1 bg-red-950/60 text-red-300 hover:bg-red-900 rounded text-xs transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Toggles */}
              <div className="flex flex-wrap gap-6 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentNewMovie.published)}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, published: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span className="font-semibold text-slate-200">Published (Visible to public)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentNewMovie.featured)}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, featured: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span className="font-semibold text-slate-200">Featured in Hero</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentNewMovie.trending)}
                    onChange={(e) => setCurrentNewMovie({ ...currentNewMovie, trending: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span className="font-semibold text-slate-200">Trending Section</span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setNewMovieModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-red-950/40"
                >
                  {formSaving ? 'Saving Record...' : 'Save & Commit Movie'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
