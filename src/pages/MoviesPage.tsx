import React, { useState, useEffect } from 'react';
import { Movie } from '../types';
import { api } from '../services/api';
import { MovieCard } from '../components/MovieCard';
import { ArrowUpDown } from 'lucide-react';

interface MoviesPageProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
}

export const MoviesPage: React.FC<MoviesPageProps> = ({ onSelectMovie, onPlayMovie }) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [sort, setSort] = useState<'newest' | 'views' | 'downloads' | 'rating'>('newest');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getMovies({ sort })
      .then((res) => setMovies(res.movies))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[75vh] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            All Movies
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Complete licensed catalog streamed directly in high definition.
          </p>
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400">Sort by:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500"
          >
            <option value="newest">Recently Added</option>
            <option value="views">Most Viewed</option>
            <option value="downloads">Most Downloaded</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-2" />
          <span>Loading catalog...</span>
        </div>
      ) : movies.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          No movies found.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          {movies.map((m) => (
            <MovieCard
              key={m.id}
              movie={m}
              onSelect={onSelectMovie}
              onPlayDirect={onPlayMovie}
            />
          ))}
        </div>
      )}
    </div>
  );
};
