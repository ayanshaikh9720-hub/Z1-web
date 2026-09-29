import React, { useState, useEffect } from 'react';
import { Bookmark, Trash2, Play, User as UserIcon } from 'lucide-react';
import { WatchlistItem, Movie, User } from '../types';
import { api } from '../services/api';
import { MovieCard } from '../components/MovieCard';

interface WatchlistPageProps {
  user: User | null;
  onOpenAuth: () => void;
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
}

export const WatchlistPage: React.FC<WatchlistPageProps> = ({
  user,
  onOpenAuth,
  onSelectMovie,
  onPlayMovie,
}) => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadWatchlist = () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getWatchlist()
      .then((res) => setItems(res.watchlist))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWatchlist();
  }, [user]);

  const handleRemove = async (movieId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.toggleWatchlist(movieId);
      setItems((prev) => prev.filter((i) => i.movieId !== movieId));
    } catch {
      // Ignore
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
          <Bookmark className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display text-2xl font-bold text-white">Your Watchlist</h2>
        <p className="text-slate-400 text-sm">
          Sign in to save licensed movies, sync across all your devices, and resume where you left off.
        </p>
        <button
          onClick={onOpenAuth}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-lg shadow-red-950/40"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[75vh] space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            My Watchlist
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Personal list saved for <b className="text-slate-200">{user.email}</b>
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {items.length} {items.length === 1 ? 'movie' : 'movies'}
        </span>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-2" />
          <span>Loading your watchlist...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center space-y-3 max-w-sm mx-auto">
          <Bookmark className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="font-display text-lg font-bold text-slate-200">Your Watchlist is Empty</h3>
          <p className="text-xs text-slate-400">
            Explore our licensed catalog and tap "Add to Watchlist" on any title to save it for later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          {items.map((item) => {
            if (!item.movie) return null;
            return (
              <div key={item.movieId} className="relative group">
                <MovieCard
                  movie={item.movie}
                  onSelect={onSelectMovie}
                  onPlayDirect={onPlayMovie}
                />
                <button
                  onClick={(e) => handleRemove(item.movieId, e)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-red-600 text-slate-300 hover:text-white transition-colors z-20"
                  title="Remove from watchlist"
                  aria-label="Remove from watchlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
