import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, Minimize, Settings, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import { Movie } from '../types';
import { api } from '../services/api';
import { AdBanner } from './AdBanner';

interface VideoPlayerProps {
  movie: Movie;
  initialTime?: number;
  onClose: () => void;
  onProgressUpdate?: (currentTime: number, duration: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  movie,
  initialTime = 0,
  onClose,
  onProgressUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [hasResumed, setHasResumed] = useState<boolean>(false);

  // Initialize Video Stream (HLS or MP4)
  const initVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');

    // Destroy existing HLS instance if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const src = movie.videoUrl;
    const isHls = movie.videoType === 'hls' || src.includes('.m3u8');

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          if (initialTime > 5 && !hasResumed) {
            video.currentTime = initialTime;
            setHasResumed(true);
          }
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('HLS network error, attempting recovery...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('HLS media error, attempting recovery...');
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setHasError(true);
                setErrorMessage('Video could not be played. Please try again.');
                setIsLoading(false);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS
        video.src = src;
        video.load();
      } else {
        setHasError(true);
        setErrorMessage('HLS stream playback is not supported by your current browser.');
        setIsLoading(false);
      }
    } else {
      // Direct MP4 / WebM
      video.src = src;
      video.load();
    }
  }, [movie.videoUrl, movie.videoType, initialTime, hasResumed]);

  useEffect(() => {
    initVideo();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [initVideo]);

  // Video Element Listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setIsLoading(false);
      if (initialTime > 5 && !hasResumed) {
        video.currentTime = initialTime;
        setHasResumed(true);
      }
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (onProgressUpdate && video.duration > 0) {
        onProgressUpdate(video.currentTime, video.duration);
      }
      // Periodically sync with backend
      if (Math.round(video.currentTime) % 10 === 0 && video.duration > 0) {
        api.saveProgress(movie.id, video.currentTime, video.duration).catch(() => {});
      }
    };

    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('Video could not be played. Please try again.');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, [movie.id, initialTime, hasResumed, onProgressUpdate]);

  // Activity timer for controls auto-hide
  const resetControlsTimer = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        setShowSettings(false);
      }, 3500);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const targetTime = parseFloat(e.target.value);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    resetControlsTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSettings(false);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden"
    >
      {/* Top Bar Overlay */}
      <div
        className={`absolute top-0 inset-x-0 z-30 p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (videoRef.current) {
                api.saveProgress(movie.id, videoRef.current.currentTime, videoRef.current.duration).catch(() => {});
              }
              onClose();
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Back to movie details"
            aria-label="Back to movie details"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-white font-semibold text-base sm:text-lg leading-tight truncate max-w-xs sm:max-w-md">
              {movie.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{movie.releaseYear}</span>
              <span>·</span>
              <span>{movie.language}</span>
              <span>·</span>
              <span className="uppercase text-[10px] bg-red-600/80 text-white px-1 rounded">
                {movie.videoType.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {initialTime > 5 && (
            <span className="hidden sm:inline-block text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
              Resumed at {formatTime(initialTime)}
            </span>
          )}
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-contain cursor-pointer"
          playsInline
          poster={movie.backdropUrl || movie.posterUrl}
          onClick={togglePlay}
        />

        {/* Loading Spinner */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
            <div className="w-12 h-12 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-3"></div>
            <p className="text-white text-sm font-medium tracking-wide">Buffering video stream...</p>
          </div>
        )}

        {/* Error Fallback with Retry */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center z-40">
            <AlertCircle className="w-14 h-14 text-red-500 mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Playback Error</h3>
            <p className="text-slate-300 text-sm max-w-md mb-6">{errorMessage}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={initVideo}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg transition-colors"
              >
                Return to Overview
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Overlay */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Subtle Player Ad Area Notice */}
        <AdBanner type="player-area" className="mb-2 max-w-4xl mx-auto" />

        <div className="max-w-5xl mx-auto space-y-2">
          {/* Progress Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-300 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
              />
            </div>
            <span className="text-xs font-mono text-slate-400 w-12">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                  }
                }}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title="Rewind 10 seconds"
                aria-label="Rewind 10 seconds"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 group">
                <button
                  onClick={toggleMute}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none hidden sm:inline-block"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Playback Speed Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    showSettings ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  aria-label="Playback Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{playbackRate}x</span>
                </button>

                {showSettings && (
                  <div className="absolute right-0 bottom-full mb-2 bg-[#12151f] border border-slate-800 rounded-lg shadow-2xl p-2 w-36 space-y-1 z-50">
                    <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Speed</div>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => handleSpeedChange(speed)}
                        className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                          playbackRate === speed
                            ? 'bg-red-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {speed === 1 ? 'Normal (1x)' : `${speed}x`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
