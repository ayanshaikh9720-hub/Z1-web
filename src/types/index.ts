export interface DownloadOption {
  quality: '480p' | '720p' | '1080p' | '4K';
  format: 'MP4' | 'MKV' | 'WEBM';
  url: string;
  fileSize?: string;
  language?: string;
}

export interface AudioTrack {
  id: string;
  language: string;
  label: string;
  url: string;
  isDefault?: boolean;
}

export interface SubtitleTrack {
  id: string;
  language: string;
  label: string;
  src: string;
  format?: 'vtt' | 'srt';
  isDefault?: boolean;
}

export type VideoFormatType = 'auto' | 'mp4' | 'hls' | 'dash' | 'webm' | 'mov';

export interface Movie {
  id: string;
  title: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  videoUrl: string;
  videoType: VideoFormatType;
  downloadUrls: DownloadOption[];
  trailerUrl?: string;
  audioTracks?: AudioTrack[];
  subtitleTracks?: SubtitleTrack[];
  releaseYear: number;
  language: string;
  genres: string[];
  duration: number; // in minutes
  cast: string[];
  director: string;
  rating?: number;
  featured?: boolean;
  trending?: boolean;
  published: boolean;
  status?: 'processing' | 'ready' | 'failed';
  transcodeProgress?: number; // 0 to 100
  transcodeError?: string;
  views: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface WatchlistItem {
  movieId: string;
  addedAt: string;
  movie?: Movie;
}

export interface PlaybackProgress {
  movieId: string;
  position: number; // in seconds
  duration: number; // in seconds
  percentage: number;
  updatedAt: string;
  movie?: Movie;
}

export interface AdminStats {
  totalMovies: number;
  totalUsers: number;
  totalViews: number;
  totalDownloads: number;
  publishedCount: number;
  unpublishedCount: number;
  recentlyAdded: Movie[];
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}
