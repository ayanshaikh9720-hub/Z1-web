import React, { useState, useEffect, useMemo } from 'react';
import { Movie } from '../types';
import { api } from '../services/api';
import { MovieCard } from '../components/MovieCard';
import { AdBanner } from '../components/AdBanner';
import {
  ArrowUpDown, Search as SearchIcon, X, SlidersHorizontal,
  ChevronDown, RefreshCw, Film, Sparkles
} from 'lucide-react';

interface MoviesPageProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
  initialGenre?: string;
}

const CATEGORIES = [
  'All',
  'Action',
  'Sci-Fi',
  'Thriller',
  'Drama',
  'Comedy',
  'Bollywood',
  'South Indian',
  'Adventure',
  'Animation',
  'Romance',
  'Horror',
];

const LANGUAGES = [
  'All Languages',
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Spanish',
  'French',
];

const PAGE_SIZE = 15; // Fast progressive slice supporting 100+ titles smoothly

export const MoviesPage: React.FC<MoviesPageProps> = ({
  onSelectMovie,
  onPlayMovie,
  initialGenre = 'All',
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Filters & Sorting state
  const [selectedCategory, setSelectedCategory] = useState<string>(initialGenre);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('All Languages');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sort, setSort] = useState<'newest' | 'views' | 'downloads' | 'rating' | 'year' | 'title'>('newest');

  // Pagination state (page index 1-based)
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  // Fetch initial/filtered movie catalog
  const fetchCatalog = async (resetPage = true) => {
    const targetPage = resetPage ? 1 : page;
    if (resetPage) {
      setLoading(true);
      setPage(1);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await api.getMovies({
        genre: selectedCategory === 'All' ? undefined : selectedCategory,
        language: selectedLanguage === 'All Languages' ? undefined : selectedLanguage,
        search: searchQuery.trim() || undefined,
        sort,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });

      if (resetPage) {
        setMovies(res.movies);
      } else {
        // Append unique movies for infinite/progressive load
        setMovies((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newItems = res.movies.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newItems];
        });
      }

      setTotalCount(res.total);
      setHasMore(Boolean((res as any).hasMore));
    } catch (err) {
      console.warn('Could not load movie catalog:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Re-fetch on filter change
  useEffect(() => {
    fetchCatalog(true);
  }, [selectedCategory, selectedLanguage, sort]);

  // Debounced search handling
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCatalog(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load next page
  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);

    setLoadingMore(true);
    api.getMovies({
      genre: selectedCategory === 'All' ? undefined : selectedCategory,
      language: selectedLanguage === 'All Languages' ? undefined : selectedLanguage,
      search: searchQuery.trim() || undefined,
      sort,
      page: nextPage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setMovies((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newItems = res.movies.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newItems];
        });
        setTotalCount(res.total);
        setHasMore(Boolean((res as any).hasMore));
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setSelectedLanguage('All Languages');
    setSearchQuery('');
    setSort('newest');
  };

  const isFiltered = selectedCategory !== 'All' || selectedLanguage !== 'All Languages' || searchQuery !== '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[80vh] space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500 uppercase tracking-widest">
            <Film className="w-4 h-4" />
            <span>Curated Streaming Vault</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Movie Catalog
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Browse our licensed high-definition movies with multi-audio, subtitles, and instant playback.
          </p>
        </div>

        {/* Counter Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
            {loading ? 'Counting...' : `Showing ${movies.length} of ${totalCount} Titles`}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-6 relative">
            <SearchIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, actor, director, genre, or keyword..."
              className="w-full pl-10 pr-9 py-2 bg-black/50 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white p-0.5"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Language Selector */}
          <div className="sm:col-span-3">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full py-2 px-3 bg-black/50 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-red-500 transition-colors"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang} className="bg-slate-900 text-white">
                  {lang}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="sm:col-span-3">
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="w-full py-2 px-3 bg-black/50 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-red-500 transition-colors pr-8"
              >
                <option value="newest" className="bg-slate-900 text-white">Recently Added</option>
                <option value="views" className="bg-slate-900 text-white">Most Viewed</option>
                <option value="downloads" className="bg-slate-900 text-white">Most Downloaded</option>
                <option value="rating" className="bg-slate-900 text-white">Highest Rated</option>
                <option value="year" className="bg-slate-900 text-white">Release Year (Newest)</option>
                <option value="title" className="bg-slate-900 text-white">Title (A to Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                    : 'bg-black/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800/60'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Movie Catalog Grid */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center text-slate-400 text-sm space-y-3">
          <div className="w-9 h-9 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin" />
          <span className="font-medium text-xs tracking-wide">Loading movie collection...</span>
        </div>
      ) : movies.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl p-8">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-white">No Movies Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {isFiltered
                ? 'No movies match your current search and filter combination.'
                : 'No published movies are available in the catalog yet.'}
            </p>
          </div>
          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
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

          {/* Responsive Ad Placement Between Content (Compliant with Google AdSense Guidelines) */}
          <AdBanner type="between-sections" />

          {/* Lazy Load / Load More Action */}
          {hasMore && (
            <div className="flex flex-col items-center justify-center pt-4 pb-2 space-y-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-850 text-white text-xs font-bold rounded-xl border border-slate-800 hover:border-slate-700 transition-all shadow-md"
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                    <span>Loading more movies...</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-red-500" />
                    <span>Load More Movies</span>
                  </>
                )}
              </button>
              <span className="text-[11px] text-slate-500">
                Showing {movies.length} of {totalCount} movies
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
