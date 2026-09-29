import React, { useState, useEffect } from 'react';
import { Play, Download, Star, Info, AlertTriangle, RefreshCw, Bookmark, Check } from 'lucide-react';
import { Movie, PlaybackProgress, User } from '../types';
import { api } from '../services/api';
import { MovieCarousel } from '../components/MovieCarousel';
import { AdBanner } from '../components/AdBanner';

interface HomePageProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
  onNavigate: (tab: string, extra?: any) => void;
  user: User | null;
  onOpenAuth: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onSelectMovie,
  onPlayMovie,
  onNavigate,
  user,
  onOpenAuth,
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [heroMovie, setHeroMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [progressList, setProgressList] = useState<PlaybackProgress[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMovies();
      setMovies(data.movies);

      // Select featured hero or highest rated
      const featured = data.movies.find((m) => m.featured) || data.movies[0] || null;
      setHeroMovie(featured);

      // Load user progress if logged in
      if (user) {
        try {
          const [progRes, watchRes] = await Promise.all([
            api.getProgress(),
            api.getWatchlist(),
          ]);
          setProgressList(progRes.progress);
          setWatchlistIds(new Set(watchRes.watchlist.map((w) => w.movieId)));
        } catch {
          // Non-blocking
        }
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load movies. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleToggleWatchlist = async (movieId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      onOpenAuth();
      return;
    }

    try {
      const res = await api.toggleWatchlist(movieId);
      setWatchlistIds((prev) => {
        const next = new Set(prev);
        if (res.inWatchlist) next.add(movieId);
        else next.delete(movieId);
        return next;
      });
    } catch {
      // Ignore
    }
  };

  // Convert progress array to map
  const progressMap = progressList.reduce((acc, curr) => {
    acc[curr.movieId] = curr;
    return acc;
  }, {} as Record<string, PlaybackProgress>);

  // Continue watching movies
  const continueWatchingMovies = movies.filter((m) => progressMap[m.id]);

  // Specific genre filter helper
  const filterByGenre = (genreName: string) => {
    const q = genreName.toLowerCase();
    return movies.filter((m) =>
      m.genres.some((g) => g.toLowerCase() === q || g.toLowerCase().includes(q))
    );
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-10 h-10 border-3 border-red-600/30 border-t-red-600 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm font-medium">Loading movies...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
        <h3 className="font-display text-lg font-bold text-slate-100 mb-1">Connection Issue</h3>
        <p className="text-slate-400 text-sm mb-5">{error}</p>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-slate-400 text-base mb-4">No movies available in the catalog yet.</p>
        {user?.role === 'admin' && (
          <button
            onClick={() => onNavigate('admin')}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold"
          >
            Add Movies in Admin Panel
          </button>
        )}
      </div>
    );
  }

  const hasAuthorizedDownload = heroMovie && heroMovie.downloadUrls && heroMovie.downloadUrls.length > 0;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Large Featured Hero Banner */}
      {heroMovie && (
        <div className="relative w-full min-h-[500px] lg:min-h-[620px] flex items-end overflow-hidden">
          {/* Backdrop Image with Scrim */}
          <div className="absolute inset-0 z-0">
            <img
              src={heroMovie.backdropUrl || heroMovie.posterUrl}
              alt={heroMovie.title}
              className="w-full h-full object-cover object-center filter brightness-[0.7]"
              referrerPolicy="no-referrer"
            />
            {/* Measured Scrim for WCAG AA readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/50 to-transparent" />
          </div>

          {/* Hero Content */}
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pb-12 pt-28 w-full">
            <div className="max-w-2xl space-y-4">
              {/* Unboxed Metadata */}
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <span className="text-red-400 uppercase tracking-wider text-[11px] font-bold">Featured Premiere</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span>{heroMovie.releaseYear}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span>{heroMovie.duration} mins</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="uppercase text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-slate-200">
                  {heroMovie.videoType.toUpperCase()}
                </span>
                {heroMovie.rating && (
                  <>
                    <span aria-hidden="true" className="text-slate-500">·</span>
                    <div className="flex items-center gap-1 text-amber-400 font-bold">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>{heroMovie.rating.toFixed(1)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Title */}
              <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.05] drop-shadow-md">
                {heroMovie.title}
              </h1>

              {/* Genres */}
              <div className="flex flex-wrap gap-2 text-xs text-slate-300 font-medium">
                {heroMovie.genres.map((g, idx) => (
                  <span key={g}>
                    {g}{idx < heroMovie.genres.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>

              {/* Description */}
              <p className="text-sm sm:text-base text-slate-300 line-clamp-3 leading-relaxed drop-shadow">
                {heroMovie.description}
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => onPlayMovie(heroMovie)}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl shadow-xl shadow-red-950/40 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Watch Now</span>
                </button>

                <button
                  onClick={() => onSelectMovie(heroMovie)}
                  className="flex items-center gap-2 px-5 py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-xl backdrop-blur-md border border-slate-700 transition-colors"
                >
                  <Info className="w-4 h-4" />
                  <span>Movie Info</span>
                </button>

                {/* Download Button (Only when authorized licensed files are configured) */}
                {hasAuthorizedDownload && (
                  <button
                    onClick={() => onSelectMovie(heroMovie)}
                    className="flex items-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 text-slate-200 font-semibold text-sm rounded-xl backdrop-blur-md border border-white/10 transition-colors"
                    title="Authorized Downloads Available"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                )}

                <button
                  onClick={(e) => handleToggleWatchlist(heroMovie.id, e)}
                  className="p-3 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl backdrop-blur-md border border-slate-700 transition-colors"
                  aria-label="Save to Watchlist"
                  title="Save to Watchlist"
                >
                  {watchlistIds.has(heroMovie.id) ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Bookmark className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner Ad Placement */}
      <AdBanner type="top-banner" />

      {/* 2. Continue Watching (if logged in and has progress) */}
      {continueWatchingMovies.length > 0 && (
        <MovieCarousel
          title="Continue Watching"
          movies={continueWatchingMovies}
          progressMap={progressMap}
          onSelectMovie={onSelectMovie}
          onPlayDirect={onPlayMovie}
        />
      )}

      {/* 3. Section 1: Trending Movies */}
      <MovieCarousel
        title="Trending Movies"
        movies={movies.filter((m) => m.trending)}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
      />

      {/* 4. Section 2: Latest Releases */}
      <MovieCarousel
        title="Latest Releases"
        movies={[...movies].sort((a, b) => b.releaseYear - a.releaseYear)}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
      />

      {/* 5. Section 3: Popular Movies */}
      <MovieCarousel
        title="Popular Movies"
        movies={[...movies].sort((a, b) => (b.views || 0) - (a.views || 0))}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
      />

      {/* 6. Section 4: Recently Added */}
      <MovieCarousel
        title="Recently Added"
        movies={[...movies].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
      />

      {/* Between Sections Ad Placement */}
      <AdBanner type="between-sections" />

      {/* 7. Section 5: Action */}
      <MovieCarousel
        title="Action"
        movies={filterByGenre('Action')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'Action' })}
      />

      {/* 8. Section 6: Comedy */}
      <MovieCarousel
        title="Comedy"
        movies={filterByGenre('Comedy')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'Comedy' })}
      />

      {/* 9. Section 7: Drama */}
      <MovieCarousel
        title="Drama"
        movies={filterByGenre('Drama')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'Drama' })}
      />

      {/* 10. Section 8: Thriller */}
      <MovieCarousel
        title="Thriller"
        movies={filterByGenre('Thriller')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'Thriller' })}
      />

      {/* 11. Section 9: South Indian */}
      <MovieCarousel
        title="South Indian"
        movies={filterByGenre('South Indian')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'South Indian' })}
      />

      {/* 12. Section 10: Bollywood */}
      <MovieCarousel
        title="Bollywood"
        movies={filterByGenre('Bollywood')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'Bollywood' })}
      />

      {/* 13. Section 11: Regional */}
      <MovieCarousel
        title="Regional"
        movies={filterByGenre('Regional')}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
        viewAllAction={() => onNavigate('genres', { genre: 'Regional' })}
      />

      {/* 14. Section 12: Other Licensed Categories */}
      <MovieCarousel
        title="Other Licensed Categories"
        movies={movies.filter((m) =>
          m.genres.some((g) => ['sci-fi', 'animation', 'fantasy', 'documentary', 'other licensed categories'].includes(g.toLowerCase()))
        )}
        progressMap={progressMap}
        onSelectMovie={onSelectMovie}
        onPlayDirect={onPlayMovie}
      />
    </div>
  );
};
