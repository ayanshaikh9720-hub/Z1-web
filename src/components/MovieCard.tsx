import React, { useState } from 'react';
import { Play, Star, Clock } from 'lucide-react';
import { Movie, PlaybackProgress } from '../types';

interface MovieCardProps {
  movie: Movie;
  progress?: PlaybackProgress;
  onSelect: (movie: Movie) => void;
  onPlayDirect?: (movie: Movie) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  progress,
  onSelect,
  onPlayDirect,
}) => {
  const [imageError, setImageError] = useState(false);

  // Quality badge determination
  const has4K = movie.downloadUrls?.some((d) => d.quality === '4K');
  const hasFHD = movie.downloadUrls?.some((d) => d.quality === '1080p') || movie.videoUrl.includes('1080');
  const qualityBadge = has4K ? '4K' : hasFHD ? 'FHD' : 'HD';

  // Format duration
  const formatDuration = (mins: number) => {
    if (!mins) return '';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div
      onClick={() => onSelect(movie)}
      className="group relative flex flex-col cursor-pointer transition-all duration-300 transform hover:-translate-y-1 select-none"
    >
      {/* Poster Container */}
      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-md group-hover:border-slate-700 group-hover:shadow-red-950/20">
        {!imageError && movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
            <span className="font-display font-bold text-slate-300 text-sm mb-1">{movie.title}</span>
            <span className="text-[10px] text-slate-400">{movie.genres[0] || 'Feature Film'}</span>
          </div>
        )}

        {/* Quality overlay */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <span className="text-[10px] font-bold tracking-wider text-slate-200 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10">
            {qualityBadge}
          </span>
        </div>

        {/* Quick Play Hover Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onPlayDirect) onPlayDirect(movie);
              else onSelect(movie);
            }}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform"
            aria-label={`Play ${movie.title}`}
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        </div>

        {/* Progress Bar (Continue Watching) */}
        {progress && progress.percentage > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-slate-800">
            <div
              className="h-full bg-red-600"
              style={{ width: `${Math.min(100, progress.percentage)}%` }}
            />
          </div>
        )}
      </div>

      {/* Card Metadata */}
      <div className="pt-2 px-1 space-y-1">
        <h4 className="text-sm font-semibold text-slate-100 truncate group-hover:text-red-400 transition-colors">
          {movie.title}
        </h4>

        {/* Unboxed Metadata with Typographic Separator */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>{movie.releaseYear}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>{formatDuration(movie.duration)}</span>

          {movie.rating !== undefined && movie.rating > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <div className="flex items-center gap-0.5 text-amber-400">
                <Star className="w-3 h-3 fill-current" />
                <span className="font-semibold text-slate-200 text-xs">{movie.rating.toFixed(1)}</span>
              </div>
            </>
          )}
        </div>

        {progress && (
          <div className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
            <Clock className="w-3 h-3" />
            <span>{progress.percentage}% watched</span>
          </div>
        )}
      </div>
    </div>
  );
};
