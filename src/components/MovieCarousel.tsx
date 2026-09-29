import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie, PlaybackProgress } from '../types';
import { MovieCard } from './MovieCard';

interface MovieCarouselProps {
  title: string;
  movies: Movie[];
  progressMap?: Record<string, PlaybackProgress>;
  onSelectMovie: (movie: Movie) => void;
  onPlayDirect?: (movie: Movie) => void;
  viewAllAction?: () => void;
}

export const MovieCarousel: React.FC<MovieCarouselProps> = ({
  title,
  movies,
  progressMap = {},
  onSelectMovie,
  onPlayDirect,
  viewAllAction,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  if (!movies || movies.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const distance = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section className="py-4 relative group">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 mb-3">
        <h3 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs font-normal text-slate-400 font-sans">({movies.length})</span>
        </h3>

        <div className="flex items-center gap-2">
          {viewAllAction && (
            <button
              onClick={viewAllAction}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors mr-2"
            >
              See all
            </button>
          )}

          {/* Desktop scroll arrows */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => scroll('left')}
              className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors focus:outline-none border border-slate-700"
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors focus:outline-none border border-slate-700"
              aria-label={`Scroll ${title} right`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Carousel */}
      <div
        ref={scrollRef}
        className="flex items-start gap-4 px-4 sm:px-6 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
      >
        {movies.map((movie) => (
          <div
            key={movie.id}
            className="w-[150px] sm:w-[180px] md:w-[210px] flex-shrink-0 snap-start"
          >
            <MovieCard
              movie={movie}
              progress={progressMap[movie.id]}
              onSelect={onSelectMovie}
              onPlayDirect={onPlayDirect}
            />
          </div>
        ))}
      </div>
    </section>
  );
};
