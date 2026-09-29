import React, { useState, useEffect } from 'react';
import { Movie } from '../types';
import { api } from '../services/api';
import { MovieCard } from '../components/MovieCard';
import { Film } from 'lucide-react';

interface GenresPageProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
  initialGenre?: string;
}

export const GenresPage: React.FC<GenresPageProps> = ({
  onSelectMovie,
  onPlayMovie,
  initialGenre = 'Action',
}) => {
  const [selectedGenre, setSelectedGenre] = useState<string>(initialGenre);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const GENRES = [
    { id: 'Action', label: 'Action', count: 0 },
    { id: 'Comedy', label: 'Comedy', count: 0 },
    { id: 'Drama', label: 'Drama', count: 0 },
    { id: 'Thriller', label: 'Thriller', count: 0 },
    { id: 'Bollywood', label: 'Bollywood', count: 0 },
    { id: 'South Indian', label: 'South Indian', count: 0 },
    { id: 'Regional', label: 'Regional', count: 0 },
    { id: 'Sci-Fi', label: 'Sci-Fi', count: 0 },
    { id: 'Other licensed categories', label: 'Other Licensed Categories', count: 0 },
  ];

  useEffect(() => {
    setLoading(true);
    api.getMovies({ genre: selectedGenre })
      .then((res) => {
        setMovies(res.movies);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedGenre]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[75vh] space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Browse by Genre
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Explore licensed titles curated by cinematic category.
        </p>
      </div>

      {/* Genre Filter Buttons */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-800">
        {GENRES.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGenre(g.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              selectedGenre === g.id
                ? 'bg-red-600 text-white shadow-lg shadow-red-950/40 border border-red-500'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Movies Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-slate-200">
            {selectedGenre} Catalog
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {movies.length} {movies.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-2" />
            <span>Loading {selectedGenre} movies...</span>
          </div>
        ) : movies.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Film className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-base text-slate-300 font-medium">No movies found in this genre.</p>
            <p className="text-xs text-slate-500">More licensed productions will be added soon.</p>
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
    </div>
  );
};
