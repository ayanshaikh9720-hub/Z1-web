import React, { useState, useEffect, useMemo } from 'react';
import { Search as SearchIcon, X, SlidersHorizontal, Star } from 'lucide-react';
import { Movie } from '../types';
import { api } from '../services/api';
import { MovieCard } from '../components/MovieCard';

interface SearchPageProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
  initialQuery?: string;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  onSelectMovie,
  onPlayMovie,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const GENRES = [
    'All',
    'Action',
    'Comedy',
    'Drama',
    'Thriller',
    'South Indian',
    'Bollywood',
    'Regional',
    'Sci-Fi',
    'Other licensed categories',
  ];

  const YEARS = ['All', '2025', '2024', '2023', '2022'];

  useEffect(() => {
    setLoading(true);
    api.getMovies({ search: query })
      .then((res) => {
        setMovies(res.movies);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  // Apply client-side secondary filter
  const filteredMovies = useMemo(() => {
    return movies.filter((m) => {
      const matchGenre =
        selectedGenre === 'All' ||
        m.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase());
      const matchYear =
        selectedYear === 'All' || m.releaseYear.toString() === selectedYear;
      return matchGenre && matchYear;
    });
  }, [movies, selectedGenre, selectedYear]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[75vh] space-y-6">
      {/* Search Header Input */}
      <div className="space-y-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Search Catalog
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Find movies by title, actor, director, genre, language, or release year.
        </p>

        <div className="relative max-w-2xl">
          <SearchIcon className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, actors, directors, genres, Hindi, English..."
            className="w-full pl-11 pr-10 py-3 bg-[#0e111a] border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm shadow-inner"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs (Interactive Segmented Controls - Allowed per design constitution) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Filter by Genre</span>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900/60 rounded-xl border border-slate-800/80 max-w-4xl">
          {GENRES.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedGenre === genre
                  ? 'bg-red-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
          <span>Release Year:</span>
          <div className="flex items-center gap-1">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  selectedYear === y
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search Results Grid */}
      <div className="pt-4">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <span className="text-xs font-medium text-slate-400">
            Found <b className="text-slate-200 font-mono">{filteredMovies.length}</b> titles
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-2" />
            <span>Searching database...</span>
          </div>
        ) : filteredMovies.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <p className="font-display text-lg text-slate-300">No movies found.</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              We couldn't find matches for "{query}". Try checking for spelling or searching by a broader category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            {filteredMovies.map((m) => (
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
