import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, Minimize,
  Settings, ArrowLeft, AlertCircle, RefreshCw, Languages, Subtitles,
  Check, X, Sparkles, MessageSquare
} from 'lucide-react';
import { Movie, AudioTrack, SubtitleTrack } from '../types';
import { api } from '../services/api';
import { AdBanner } from './AdBanner';
import { SubtitleCue, loadSubtitles } from '../utils/vttParser';

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
  const dubbedAudioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Playback States
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

  // Multilingual System States
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string>('original');
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState<string>('off');
  const [showAudioSubtitlesMenu, setShowAudioSubtitlesMenu] = useState<boolean>(false);
  const [audioSubtitlesTab, setAudioSubtitlesTab] = useState<'audio' | 'subtitles'>('audio');
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');

  // Collect Available Audio Tracks (Original always first + any configured dubbed tracks)
  const originalAudioTrack: AudioTrack = {
    id: 'original',
    language: movie.language || 'English',
    label: `${movie.language || 'English'} [Original Audio]`,
    url: movie.videoUrl,
    isDefault: true,
  };

  const configuredAudioTracks: AudioTrack[] = Array.isArray(movie.audioTracks)
    ? movie.audioTracks.filter((t) => t.id !== 'original' && t.url && t.language)
    : [];

  const availableAudioTracks: AudioTrack[] = [originalAudioTrack, ...configuredAudioTracks];

  // Collect Available Subtitle Tracks
  const availableSubtitleTracks: SubtitleTrack[] = Array.isArray(movie.subtitleTracks)
    ? movie.subtitleTracks.filter((s) => s.src && s.language)
    : [];

  // Show Toast notification briefly on language/subtitle switch
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2800);
  };

  // 1. Initialize Multilingual Preferences from LocalStorage on mount
  useEffect(() => {
    const savedAudioLang = localStorage.getItem('z1_pref_audio_language');
    const savedSubLang = localStorage.getItem('z1_pref_subtitle_language');

    // Restore Audio Preference if available
    if (savedAudioLang) {
      const match = configuredAudioTracks.find(
        (t) => t.language.toLowerCase() === savedAudioLang.toLowerCase()
      );
      if (match) {
        setSelectedAudioTrackId(match.id);
      } else if (
        movie.language &&
        movie.language.toLowerCase() === savedAudioLang.toLowerCase()
      ) {
        setSelectedAudioTrackId('original');
      }
    }

    // Restore Subtitle Preference if available
    if (savedSubLang) {
      if (savedSubLang === 'off') {
        setSelectedSubtitleTrackId('off');
      } else {
        const match = availableSubtitleTracks.find(
          (s) => s.language.toLowerCase() === savedSubLang.toLowerCase()
        );
        if (match) {
          setSelectedSubtitleTrackId(match.id);
        }
      }
    }
  }, [movie.id]);

  // 2. Load and Parse Subtitle Cues whenever selectedSubtitleTrackId changes
  useEffect(() => {
    if (selectedSubtitleTrackId === 'off') {
      setCues([]);
      setCurrentSubtitleText('');
      return;
    }

    const activeTrack = availableSubtitleTracks.find((s) => s.id === selectedSubtitleTrackId);
    if (!activeTrack || !activeTrack.src) {
      setCues([]);
      setCurrentSubtitleText('');
      return;
    }

    let isCancelled = false;
    loadSubtitles(activeTrack.src)
      .then((loadedCues) => {
        if (!isCancelled) {
          setCues(loadedCues);
        }
      })
      .catch((err) => {
        console.warn('Could not load subtitle track:', err);
        if (!isCancelled) setCues([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedSubtitleTrackId, movie.id]);

  // 3. Audio Track Switching Handler (CRITICAL: Never restarts video; keeps currentTime unchanged)
  const handleSelectAudioTrack = (trackId: string) => {
    if (trackId === selectedAudioTrackId) return;

    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;

    setSelectedAudioTrackId(trackId);

    if (trackId === 'original') {
      // Switching to Master Original Video Audio:
      // Stop and silence auxiliary audio
      if (dubbed) {
        dubbed.pause();
        dubbed.src = '';
      }
      // Unmute master video audio track
      video.muted = isMuted;
      video.volume = isMuted ? 0 : volume;

      localStorage.setItem('z1_pref_audio_language', movie.language || 'English');
      triggerToast(`Audio: ${movie.language || 'English'} [Original Audio]`);
    } else {
      // Switching to a Dubbed / Alternate Audio Track:
      const track = configuredAudioTracks.find((t) => t.id === trackId);
      if (track && track.url && dubbed) {
        // Mute video element so its native audio is silent, but video continues rolling without restarting
        video.muted = true;

        // Load & synchronize alternate audio track
        dubbed.src = track.url;
        dubbed.currentTime = video.currentTime;
        dubbed.playbackRate = video.playbackRate;
        dubbed.volume = isMuted ? 0 : volume;
        dubbed.muted = isMuted;

        if (!video.paused) {
          dubbed.play().catch((err) => {
            console.warn('Dubbed audio autoplay prevented:', err);
          });
        }

        localStorage.setItem('z1_pref_audio_language', track.language);
        triggerToast(`Audio: ${track.label || track.language}`);
      }
    }
  };

  // 4. Subtitle Track Switching Handler
  const handleSelectSubtitleTrack = (trackId: string) => {
    setSelectedSubtitleTrackId(trackId);

    if (trackId === 'off') {
      setCurrentSubtitleText('');
      localStorage.setItem('z1_pref_subtitle_language', 'off');
      triggerToast('Subtitles: Off');
    } else {
      const track = availableSubtitleTracks.find((s) => s.id === trackId);
      if (track) {
        localStorage.setItem('z1_pref_subtitle_language', track.language);
        triggerToast(`Subtitles: ${track.label || track.language}`);
      }
    }
  };

  // Initialize Video Stream (HLS or Direct MP4)
  const initVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');

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
                setErrorMessage('Video stream could not be loaded. Please check stream URL.');
                setIsLoading(false);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.load();
      } else {
        setHasError(true);
        setErrorMessage('HLS stream playback is not supported by your current browser.');
        setIsLoading(false);
      }
    } else {
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

  // Video Element Listeners & Audio Synchronization
  useEffect(() => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
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
      const now = video.currentTime;
      setCurrentTime(now);

      // Periodic progress update callback
      if (onProgressUpdate && video.duration > 0) {
        onProgressUpdate(now, video.duration);
      }

      // Sync progress to database every 10s
      if (Math.round(now) % 10 === 0 && video.duration > 0) {
        api.saveProgress(movie.id, now, video.duration).catch(() => {});
      }

      // 1. Synchronize Dubbed Audio drift (keep audio tightly aligned with video)
      if (dubbed && selectedAudioTrackId !== 'original' && dubbed.src) {
        const drift = Math.abs(dubbed.currentTime - now);
        if (drift > 0.35) {
          dubbed.currentTime = now;
        }
      }

      // 2. Synchronize Subtitle Cue lookup
      if (selectedSubtitleTrackId !== 'off' && cues.length > 0) {
        const activeCue = cues.find((c) => now >= c.start && now <= c.end);
        setCurrentSubtitleText(activeCue ? activeCue.text : '');
      } else if (currentSubtitleText) {
        setCurrentSubtitleText('');
      }
    };

    const handleWaiting = () => setIsLoading(true);

    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
      // Synchronize dubbed audio play
      if (dubbed && selectedAudioTrackId !== 'original' && dubbed.src) {
        dubbed.currentTime = video.currentTime;
        dubbed.play().catch(() => {});
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      // Synchronize dubbed audio pause
      if (dubbed && selectedAudioTrackId !== 'original') {
        dubbed.pause();
      }
    };

    const handleSeeking = () => {
      if (dubbed && selectedAudioTrackId !== 'original') {
        dubbed.currentTime = video.currentTime;
      }
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('Video could not be played. Please check the network connection.');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('error', handleError);
    };
  }, [movie.id, initialTime, hasResumed, onProgressUpdate, selectedAudioTrackId, selectedSubtitleTrackId, cues, currentSubtitleText]);

  // Activity timer for controls auto-hide
  const resetControlsTimer = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !showAudioSubtitlesMenu && !showSettings) {
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
    const dubbed = dubbedAudioRef.current;
    if (!video) return;
    const targetTime = parseFloat(e.target.value);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    if (dubbed && selectedAudioTrackId !== 'original') {
      dubbed.currentTime = targetTime;
    }
    resetControlsTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    setVolume(val);
    const muted = val === 0;
    setIsMuted(muted);

    if (selectedAudioTrackId === 'original') {
      video.volume = val;
      video.muted = muted;
    } else if (dubbed) {
      dubbed.volume = val;
      dubbed.muted = muted;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (selectedAudioTrackId === 'original') {
      video.muted = nextMuted;
    } else if (dubbed) {
      dubbed.muted = nextMuted;
    }
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
    const dubbed = dubbedAudioRef.current;
    if (!video) return;
    video.playbackRate = speed;
    if (dubbed) dubbed.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSettings(false);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'c':
          e.preventDefault();
          // Toggle between Off and first subtitle
          if (availableSubtitleTracks.length > 0) {
            handleSelectSubtitleTrack(
              selectedSubtitleTrackId === 'off' ? availableSubtitleTracks[0].id : 'off'
            );
          }
          break;
        case 'arrowleft':
          e.preventDefault();
          if (videoRef.current) {
            const next = Math.max(0, videoRef.current.currentTime - 10);
            videoRef.current.currentTime = next;
            if (dubbedAudioRef.current) dubbedAudioRef.current.currentTime = next;
            setCurrentTime(next);
            resetControlsTimer();
          }
          break;
        case 'arrowright':
          e.preventDefault();
          if (videoRef.current) {
            const next = Math.min(videoRef.current.duration || 100, videoRef.current.currentTime + 10);
            videoRef.current.currentTime = next;
            if (dubbedAudioRef.current) dubbedAudioRef.current.currentTime = next;
            setCurrentTime(next);
            resetControlsTimer();
          }
          break;
        case 'escape':
          if (showAudioSubtitlesMenu) {
            setShowAudioSubtitlesMenu(false);
          } else if (showSettings) {
            setShowSettings(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, selectedSubtitleTrackId, showAudioSubtitlesMenu, showSettings, availableSubtitleTracks]);

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

  // Find active label descriptions for player badges
  const currentAudioTrack = availableAudioTracks.find((t) => t.id === selectedAudioTrackId) || originalAudioTrack;
  const currentSubtitleTrack = availableSubtitleTracks.find((s) => s.id === selectedSubtitleTrackId);
  const isMultilingualActive = selectedAudioTrackId !== 'original' || selectedSubtitleTrackId !== 'off';

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden"
    >
      {/* Hidden Secondary Audio Element for Dubbed Audio Synchronization */}
      <audio
        ref={dubbedAudioRef}
        preload="auto"
        className="hidden"
        onError={() => {
          console.warn('Dubbed audio failed to load. Reverting to original track.');
          handleSelectAudioTrack('original');
          triggerToast('Alternate audio unavailable. Reverted to Original.');
        }}
      />

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
              <span className="text-slate-300 font-medium">{currentAudioTrack.label}</span>
              {selectedSubtitleTrackId !== 'off' && (
                <>
                  <span>·</span>
                  <span className="text-red-400 font-medium">CC: {currentSubtitleTrack?.label || 'Subtitles'}</span>
                </>
              )}
              <span>·</span>
              <span className="uppercase text-[10px] bg-red-600/80 text-white px-1.5 py-0.5 rounded font-mono">
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

        {/* MODERN OTT SUBTITLE DISPLAY OVERLAY */}
        {currentSubtitleText && (
          <div className="absolute bottom-20 sm:bottom-24 inset-x-4 sm:inset-x-16 z-25 flex justify-center pointer-events-none transition-all duration-150">
            <div className="bg-black/85 backdrop-blur-md text-white px-4 sm:px-6 py-2 rounded-xl text-sm sm:text-base md:text-lg lg:text-xl font-medium tracking-wide text-center shadow-2xl border border-white/15 max-w-3xl leading-relaxed drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
              {currentSubtitleText}
            </div>
          </div>
        )}

        {/* Transient Language Switch Notification Toast */}
        {toastMessage && (
          <div className="absolute top-20 inset-x-0 z-40 flex justify-center pointer-events-none animate-fadeIn">
            <div className="px-4 py-2 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white text-xs sm:text-sm font-semibold rounded-full shadow-2xl flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red-500" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

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

      {/* MODERN OTT AUDIO & SUBTITLES SELECTION MODAL */}
      {showAudioSubtitlesMenu && (
        <div
          onClick={() => setShowAudioSubtitlesMenu(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#0e111a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Languages className="w-5 h-5 text-red-500" />
                <h3 className="font-display text-base sm:text-lg font-bold text-white tracking-tight">
                  Audio & Subtitles
                </h3>
              </div>
              <button
                onClick={() => setShowAudioSubtitlesMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Tab Switcher */}
            <div className="flex sm:hidden border-b border-slate-800 bg-slate-950/60 p-1">
              <button
                onClick={() => setAudioSubtitlesTab('audio')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  audioSubtitlesTab === 'audio'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Audio ({availableAudioTracks.length})</span>
              </button>
              <button
                onClick={() => setAudioSubtitlesTab('subtitles')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  audioSubtitlesTab === 'subtitles'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" />
                <span>Subtitles ({availableSubtitleTracks.length})</span>
              </button>
            </div>

            {/* Two-Column Modern OTT Track Selector */}
            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Column 1: Audio Tracks */}
              <div className={`space-y-3 ${audioSubtitlesTab !== 'audio' ? 'hidden sm:block' : ''}`}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Volume2 className="w-4 h-4 text-red-500" />
                    <span>Audio Languages</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    {availableAudioTracks.length} available
                  </span>
                </div>

                <div className="space-y-2">
                  {availableAudioTracks.map((track) => {
                    const isSelected = selectedAudioTrackId === track.id;
                    const isOriginal = track.id === 'original';

                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => handleSelectAudioTrack(track.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${
                          isSelected
                            ? 'bg-red-950/40 border-red-600 text-white shadow-md'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 truncate">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                              isSelected
                                ? 'border-red-500 bg-red-600 text-white'
                                : 'border-slate-600 group-hover:border-slate-500'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="truncate">
                            <div className="text-xs sm:text-sm font-semibold truncate flex items-center gap-1.5">
                              <span>{track.label || track.language}</span>
                              {isOriginal && (
                                <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.2 rounded font-sans">
                                  Original
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {isOriginal
                                ? 'Master cinematic audio mix'
                                : `${track.language} translated/dubbed track`}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {availableAudioTracks.length === 1 && (
                  <p className="text-[11px] text-slate-500 italic pl-1 pt-1 leading-relaxed">
                    This movie is presented in its original theatrical audio mix ({movie.language || 'English'}). No other dubbed tracks have been configured.
                  </p>
                )}
              </div>

              {/* Column 2: Subtitle Tracks */}
              <div className={`space-y-3 ${audioSubtitlesTab !== 'subtitles' ? 'hidden sm:block' : ''}`}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Subtitles className="w-4 h-4 text-red-500" />
                    <span>Subtitles / Captions</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    {availableSubtitleTracks.length > 0 ? `${availableSubtitleTracks.length} available` : 'None'}
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Off Option */}
                  <button
                    type="button"
                    onClick={() => handleSelectSubtitleTrack('off')}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${
                      selectedSubtitleTrackId === 'off'
                        ? 'bg-red-950/40 border-red-600 text-white shadow-md'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                          selectedSubtitleTrackId === 'off'
                            ? 'border-red-500 bg-red-600 text-white'
                            : 'border-slate-600 group-hover:border-slate-500'
                        }`}
                      >
                        {selectedSubtitleTrackId === 'off' && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-semibold">Off</div>
                        <div className="text-[10px] text-slate-400">Captions disabled</div>
                      </div>
                    </div>
                  </button>

                  {/* Available Subtitle Tracks */}
                  {availableSubtitleTracks.map((sub) => {
                    const isSelected = selectedSubtitleTrackId === sub.id;

                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSelectSubtitleTrack(sub.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${
                          isSelected
                            ? 'bg-red-950/40 border-red-600 text-white shadow-md'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 truncate">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                              isSelected
                                ? 'border-red-500 bg-red-600 text-white'
                                : 'border-slate-600 group-hover:border-slate-500'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="truncate">
                            <div className="text-xs sm:text-sm font-semibold truncate">
                              {sub.label || sub.language}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {sub.language} closed captions
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {availableSubtitleTracks.length === 0 && (
                  <p className="text-[11px] text-slate-500 italic pl-1 pt-1 leading-relaxed">
                    No closed captions or subtitles are currently uploaded for this film. Admins can add WebVTT subtitle files anytime via the Admin Movie Edit screen.
                  </p>
                )}
              </div>
            </div>

            {/* Modal Bottom Note & Done Button */}
            <div className="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Preferences are remembered automatically for future streaming.
              </span>
              <button
                type="button"
                onClick={() => setShowAudioSubtitlesMenu(false)}
                className="w-full sm:w-auto px-5 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-xl transition-colors text-center ml-auto"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={togglePlay}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    const next = Math.max(0, videoRef.current.currentTime - 10);
                    videoRef.current.currentTime = next;
                    if (dubbedAudioRef.current) dubbedAudioRef.current.currentTime = next;
                    setCurrentTime(next);
                  }
                }}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title="Rewind 10 seconds (←)"
                aria-label="Rewind 10 seconds"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 group">
                <button
                  onClick={toggleMute}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                  title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
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

            <div className="flex items-center gap-2 sm:gap-3">
              {/* MULTILINGUAL AUDIO & SUBTITLES BUTTON */}
              <button
                onClick={() => {
                  setShowAudioSubtitlesMenu(!showAudioSubtitlesMenu);
                  setShowSettings(false);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  showAudioSubtitlesMenu || isMultilingualActive
                    ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
                title="Audio & Subtitles"
                aria-label="Audio & Subtitles language settings"
              >
                <Languages className="w-4 h-4" />
                <span className="hidden sm:inline">Audio & Subtitles</span>
                {isMultilingualActive && (
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                )}
              </button>

              {/* Playback Speed Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSettings(!showSettings);
                    setShowAudioSubtitlesMenu(false);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
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
