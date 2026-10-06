import React, { useState, useEffect, useRef } from 'react';
import {
  Film, Users, Eye, Download, Plus, Edit2, Trash2, CheckCircle2, XCircle,
  AlertTriangle, UploadCloud, RefreshCw, Star, Flame, Check, ExternalLink,
  Shield, Filter, ArrowUpDown, Play, Image as ImageIcon
} from 'lucide-react';
import { Movie, AdminStats, DownloadOption, User } from '../types';
import { api } from '../services/api';
import { EditMovieModal } from '../components/EditMovieModal';

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
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);

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

  const handleTogglePublish = async (movie: Movie) => {
    try {
      const updated = await api.togglePublish(movie.id, !movie.published);
      setMovies((prev) => prev.map((m) => (m.id === movie.id ? updated.movie : m)));
      // Refresh stats
      api.getAdminStats().then(setStats).catch(() => {});
      if (onMovieUpdated) {
        onMovieUpdated(updated.movie);
      }
    } catch (err: any) {
      alert(`Publish toggle failed: ${err.message}`);
    }
  };

  const handleDeleteMovie = async (movieId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
    try {
      await api.deleteMovie(movieId);
      setMovies((prev) => prev.filter((m) => m.id !== movieId));
      api.getAdminStats().then(setStats).catch(() => {});
    } catch (err: any) {
      alert(`Failed to delete movie: ${err.message}`);
    }
  };

  // Open Edit Movie Modal for existing movie
  const handleOpenEditModal = (movie: Movie) => {
    setMovieToEdit(movie);
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
    setNewMovieModalOpen(true);
  };

  // Thumbnail Upload Handler for Add New Movie (Firebase Storage)
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image format (JPG, JPEG, PNG, WebP)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setThumbnailUploadError('Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.');
      return;
    }

    // Validate size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setThumbnailUploadError('Image file is too large. Maximum allowed size is 10 MB.');
      return;
    }

    setThumbnailUploading(true);
    setThumbnailUploadProgress(0);
    setThumbnailUploadError('');
    setThumbnailUploadSuccess('');

    try {
      const url = await api.uploadThumbnail(file, (pct) => {
        setThumbnailUploadProgress(pct);
      });

      if (currentNewMovie) {
        setCurrentNewMovie({
          ...currentNewMovie,
          posterUrl: url,
          backdropUrl: currentNewMovie.backdropUrl || url,
        });
      }
      setThumbnailUploadSuccess(`Thumbnail uploaded successfully: ${file.name}`);
    } catch (err: any) {
      setThumbnailUploadError(err.message || 'Thumbnail upload failed');
    } finally {
      setThumbnailUploading(false);
      if (thumbnailFileInputRef.current) {
        thumbnailFileInputRef.current.value = '';
      }
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

    if (!currentNewMovie.posterUrl || !currentNewMovie.posterUrl.trim()) {
      setFormError('Movie Thumbnail / Poster is required. Please upload a poster before publishing.');
      return;
    }

    setFormSaving(true);
    setFormError('');

    try {
      const moviePayload: Partial<Movie> = {
        ...currentNewMovie,
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
              if (window.confirm('Reset database to initial licensed Creative Commons sample library?')) {
                api.resetDemoData().then(() => loadAdminData());
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors"
          >
            Reset Demo Library
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
                          src={movie.posterUrl}
                          alt={movie.title}
                          className="w-10 h-14 object-cover rounded bg-slate-800 shrink-0"
                          referrerPolicy="no-referrer"
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
                        <button
                          onClick={() => onPlayMovie(movie)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors"
                          title="Test Player Stream"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(movie)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-colors shadow-sm"
                          title="Edit Movie Metadata & Thumbnail"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-red-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteMovie(movie.id, movie.title)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors"
                          title="Delete Movie"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
          onClose={() => {
            setEditModalOpen(false);
            setMovieToEdit(null);
          }}
          onSave={handleSaveEditedMovie}
        />
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
                      Upload a poster image. It will be uploaded to Firebase Storage and displayed across Home, Catalog, and Search cards.
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
                            src={currentNewMovie.posterUrl}
                            alt="Selected Movie Poster Preview"
                            className="w-full h-full object-cover rounded-lg"
                            referrerPolicy="no-referrer"
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
                          <span className="text-xs text-white font-semibold">Uploading to Storage...</span>
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
                        Select a high-resolution poster. The file is uploaded separately to Firebase Storage, keeping the video file unchanged.
                      </p>

                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => thumbnailFileInputRef.current?.click()}
                          disabled={thumbnailUploading}
                          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-950/50 transition-all hover:scale-[1.01]"
                        >
                          <UploadCloud className="w-4 h-4" />
                          <span>
                            {currentNewMovie.posterUrl ? 'Choose Different Thumbnail' : 'Choose Thumbnail / Upload Poster'}
                          </span>
                        </button>

                        {currentNewMovie.posterUrl && (
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
                          <span>Uploading thumbnail to Firebase Storage...</span>
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

                    {/* Error Notification */}
                    {thumbnailUploadError && (
                      <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2 text-xs text-red-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{thumbnailUploadError}</span>
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
                          onChange={(e) => setCurrentNewMovie({
                            ...currentNewMovie,
                            posterUrl: e.target.value,
                            backdropUrl: currentNewMovie.backdropUrl || e.target.value,
                          })}
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
