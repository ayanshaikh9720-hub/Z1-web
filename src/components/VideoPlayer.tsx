import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize,
  Settings, ArrowLeft, AlertCircle, RefreshCw, Languages, Subtitles,
  Check, X, Sparkles, Film, Info, Radio, Sliders, AlertTriangle
} from 'lucide-react';
import { Movie, AudioTrack, SubtitleTrack } from '../types';
import { api, getApiBaseUrl } from '../services/api';
import { AdBanner } from './AdBanner';
import { SubtitleCue, loadSubtitles } from '../utils/vttParser';
import { getSafeVideoUrl, probeVideoFormatAsync } from '../utils/videoUrlHelper';

interface VideoPlayerProps {
  movie: Movie;
  initialTime?: number;
  onClose: () => void;
  onProgressUpdate?: (currentTime: number, duration: number) => void;
}

interface HlsTrackInfo {
  id: string;
  index: number;
  name: string;
  lang: string;
  isDefault?: boolean;
}

interface QualityLevelInfo {
  index: number;
  label: string;
  height: number;
  bitrate?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  movie,
  initialTime = 0,
  onClose,
  onProgressUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const dubbedAudioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);

  const retryCountRef = useRef<number>(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triedProxyRef = useRef<boolean>(false);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const isScrubbingRef = useRef<boolean>(false);

  // Playback States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [hasResumed, setHasResumed] = useState<boolean>(false);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string>('');
  const [isHlsMode, setIsHlsMode] = useState<boolean>(false);
  const [isDashMode, setIsDashMode] = useState<boolean>(false);
  const [isLiveStream, setIsLiveStream] = useState<boolean>(false);
  const [rangeSeekSupported, setRangeSeekSupported] = useState<boolean>(true);
  const [seekWarning, setSeekWarning] = useState<string>('');

  // Timeline Scrubbing States
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Diagnostics & Re-encoding
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [diagnosticsInfo, setDiagnosticsInfo] = useState<any>(null);
  const [movieStatus, setMovieStatus] = useState<'processing' | 'ready' | 'failed'>(movie.status || 'ready');
  const [transcodeProgress, setTranscodeProgress] = useState<number>(movie.transcodeProgress || 0);
  const [isTriggeringTranscode, setIsTriggeringTranscode] = useState<boolean>(false);
  const [reencodeNotice, setReencodeNotice] = useState<string>('');

  // Multilingual & Subtitle States
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState<boolean>(false);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string>('original');
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState<string>('off');
  const [selectedQualityIndex, setSelectedQualityIndex] = useState<number>(-1); // -1 = Auto

  // Detected Media Tracks
  const [detectedHlsAudioTracks, setDetectedHlsAudioTracks] = useState<HlsTrackInfo[]>([]);
  const [detectedHlsSubtitleTracks, setDetectedHlsSubtitleTracks] = useState<HlsTrackInfo[]>([]);
  const [availableQualityLevels, setAvailableQualityLevels] = useState<QualityLevelInfo[]>([]);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [doubleTapAnimation, setDoubleTapAnimation] = useState<{ side: 'left' | 'right'; label: string } | null>(null);

  // Helper to sanitize stream URL so secret tokens are never exposed in UI
  const sanitizeUrl = (url: string): string => {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const searchParams = new URLSearchParams(parsed.search);
      for (const key of Array.from(searchParams.keys())) {
        if (/token|auth|key|secret|sig|signature|expires|credential/i.test(key)) {
          searchParams.set(key, 'REDACTED');
        }
      }
      parsed.search = searchParams.toString();
      return parsed.toString();
    } catch {
      return url.replace(/([?&](?:token|auth|key|secret|sig|signature)=)[^&]*/gi, '$1REDACTED');
    }
  };

  // Toast notification for user actions
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2800);
  };

  // Activity timer for controls auto-hide
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !showAudioMenu && !showSubtitlesMenu && !showSettings && !showDiagnostics && !isScrubbingRef.current) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        setShowSettings(false);
      }, 3500);
    }
  }, [isPlaying, showAudioMenu, showSubtitlesMenu, showSettings, showDiagnostics]);

  // Audio Tracks Collection
  const originalAudioTrack: AudioTrack = {
    id: 'original',
    language: movie.language || 'English',
    label: `${movie.language || 'English'} [Original Master Audio]`,
    url: movie.videoUrl,
    isDefault: true,
  };

  const configuredAudioTracks: AudioTrack[] = Array.isArray(movie.audioTracks)
    ? movie.audioTracks.filter((t) => t.id !== 'original' && t.url && t.language)
    : [];

  // Merged Audio Tracks: Original + Detected HLS Streams + Auxiliary Uploaded Tracks
  const allAudioTracks = [
    originalAudioTrack,
    ...detectedHlsAudioTracks.map((ht) => ({
      id: `hls_audio_${ht.index}`,
      language: ht.lang || ht.name,
      label: `${ht.name || ht.lang || `Track ${ht.index + 1}`} (HLS Stream)`,
      isHls: true,
      hlsIndex: ht.index,
    })),
    ...configuredAudioTracks,
  ];

  // Subtitle Tracks Collection: Off + Detected HLS Subtitles + WebVTT Tracks
  const availableSubtitleTracks: SubtitleTrack[] = Array.isArray(movie.subtitleTracks)
    ? movie.subtitleTracks.filter((s) => s.src && s.language)
    : [];

  const allSubtitleTracks = [
    ...detectedHlsSubtitleTracks.map((st) => ({
      id: `hls_sub_${st.index}`,
      language: st.lang || st.name,
      label: `${st.name || st.lang || `Subtitle ${st.index + 1}`} (Embedded)`,
      src: '',
      isHls: true,
      hlsIndex: st.index,
    })),
    ...availableSubtitleTracks,
  ];

  // Load WebVTT subtitles when selected
  useEffect(() => {
    if (selectedSubtitleTrackId === 'off' || selectedSubtitleTrackId.startsWith('hls_sub_')) {
      setCues([]);
      setCurrentSubtitleText('');
      return;
    }

    const track = availableSubtitleTracks.find((s) => s.id === selectedSubtitleTrackId);
    if (track && track.src) {
      loadSubtitles(track.src)
        .then((loadedCues) => {
          setCues(loadedCues);
        })
        .catch((err) => {
          console.warn('[VideoPlayer] Subtitle load failed:', err.message);
          triggerToast('Subtitle track could not be loaded.');
          setCues([]);
        });
    }
  }, [selectedSubtitleTrackId]);

  // Check Buffered Ranges
  const updateBufferedProgress = () => {
    const video = videoRef.current;
    if (!video || !video.duration || video.duration <= 0) return;
    try {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const pct = Math.min(100, Math.max(0, (bufferedEnd / video.duration) * 100));
        setBufferedPercent(pct);
      }
    } catch {}
  };

  // Video Stream Initializer
  const initVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
    setSeekWarning('');
    triedProxyRef.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashRef.current) {
      dashRef.current.destroy();
      dashRef.current = null;
    }

    const validation = getSafeVideoUrl(movie.videoUrl);
    if (!validation.valid) {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage(validation.error || 'Video URL is invalid or blocked.');
      return;
    }

    const safeSrc = validation.safeUrl;
    const isDash = validation.isDash || movie.videoType === 'dash' || safeSrc.includes('.mpd');
    const isHls = !isDash && (validation.isHls || movie.videoType === 'hls' || safeSrc.includes('.m3u8'));

    setActiveVideoSrc(safeSrc);
    setIsHlsMode(isHls && !validation.isBlob);
    setIsDashMode(isDash && !validation.isBlob);

    // Initial Technical Diagnostics
    setDiagnosticsInfo({
      originalUrl: sanitizeUrl(movie.videoUrl),
      resolvedUrl: sanitizeUrl(safeSrc),
      detectedFormat: isDash ? 'MPEG-DASH (.mpd)' : isHls ? 'HLS (.m3u8)' : (validation.format || 'MP4').toUpperCase(),
      playerEngine: isDash
        ? 'dash.js (MSE Player)'
        : isHls
        ? (Hls.isSupported() ? 'hls.js (MSE Adaptive Stream)' : 'Native Safari HLS')
        : 'HTML5 Video (Direct Progressive Stream)',
      supportsMSE: typeof window !== 'undefined' && 'MediaSource' in window,
      supportsHls: Hls.isSupported(),
      supportsDash: typeof dashjs !== 'undefined' && dashjs.supportsMediaSource(),
      supportsRange: true,
      timestamp: new Date().toLocaleTimeString(),
    });

    // 1. MPEG-DASH Playback via dash.js
    if (isDash && !validation.isBlob) {
      if (dashjs.supportsMediaSource()) {
        const player = dashjs.MediaPlayer().create();
        dashRef.current = player;
        player.initialize(video, safeSrc, true);

        player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          setIsLoading(false);
          retryCountRef.current = 0;
          if (initialTime > 5 && !hasResumed) {
            video.currentTime = initialTime;
            setHasResumed(true);
          }
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });

        player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
          console.warn('[VideoPlayer] DASH playback error:', e);
          setIsLoading(false);
          setHasError(true);
          setErrorMessage('MPEG-DASH stream playback failed. Stream manifest unreachable.');
        });
      } else {
        video.src = safeSrc;
        video.load();
      }
      return;
    }

    // 2. HLS Playback via hls.js or Native WebKit
    if (isHls && !validation.isBlob) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 60,
          maxMaxBufferLength: 600,
        });
        hlsRef.current = hls;
        hls.loadSource(safeSrc);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          setIsLoading(false);
          retryCountRef.current = 0;

          // Check if stream is live or VOD
          const isLive = data.levels.some((l) => l.details && l.details.live);
          setIsLiveStream(Boolean(isLive));

          // Populate Available Quality Levels
          if (data.levels && data.levels.length > 0) {
            const levels: QualityLevelInfo[] = data.levels.map((lvl, idx) => ({
              index: idx,
              label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
              height: lvl.height || 0,
              bitrate: lvl.bitrate,
            }));
            setAvailableQualityLevels(levels);
          }

          // Populate HLS Alternate Audio Tracks
          if (hls.audioTracks && hls.audioTracks.length > 0) {
            const tracks: HlsTrackInfo[] = hls.audioTracks.map((t, idx) => ({
              id: `hls_audio_${idx}`,
              index: idx,
              name: t.name || t.lang || `Track ${idx + 1}`,
              lang: t.lang || t.name || 'Unknown',
              isDefault: t.default,
            }));
            setDetectedHlsAudioTracks(tracks);
          }

          // Populate HLS Subtitle Tracks
          if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
            const subTracks: HlsTrackInfo[] = hls.subtitleTracks.map((s, idx) => ({
              id: `hls_sub_${idx}`,
              index: idx,
              name: s.name || s.lang || `Subtitle ${idx + 1}`,
              lang: s.lang || s.name || 'Unknown',
            }));
            setDetectedHlsSubtitleTracks(subTracks);
          }

          if (initialTime > 5 && !hasResumed) {
            video.currentTime = initialTime;
            setHasResumed(true);
          }
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });

        // Listen for track updates dynamically
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
          if (data.audioTracks) {
            const tracks: HlsTrackInfo[] = data.audioTracks.map((t, idx) => ({
              id: `hls_audio_${idx}`,
              index: idx,
              name: t.name || t.lang || `Track ${idx + 1}`,
              lang: t.lang || t.name || 'Unknown',
              isDefault: t.default,
            }));
            setDetectedHlsAudioTracks(tracks);
          }
        });

        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
          if (data.subtitleTracks) {
            const subTracks: HlsTrackInfo[] = data.subtitleTracks.map((s, idx) => ({
              id: `hls_sub_${idx}`,
              index: idx,
              name: s.name || s.lang || `Subtitle ${idx + 1}`,
              lang: s.lang || s.name || 'Unknown',
            }));
            setDetectedHlsSubtitleTracks(subTracks);
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (retryCountRef.current < 3) {
                  retryCountRef.current += 1;
                  console.warn(`HLS network error, retrying attempt ${retryCountRef.current}/3...`);
                  hls.startLoad();
                } else {
                  hls.destroy();
                  setHasError(true);
                  setErrorMessage('HLS stream network error. Stream manifest is unreachable.');
                  setIsLoading(false);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('HLS media error, attempting media recovery...');
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setHasError(true);
                setErrorMessage('Fatal HLS adaptive playback failure.');
                setIsLoading(false);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari / iOS WebKit HLS
        video.src = safeSrc;
        video.load();
      } else {
        setHasError(true);
        setErrorMessage('HLS adaptive streaming is not supported by your current browser.');
        setIsLoading(false);
      }
      return;
    }

    // 3. Direct Progressive Stream (MP4, WebM, MOV)
    video.src = safeSrc;
    video.load();

    // Check Range Seeking Capability via probe
    if (safeSrc.startsWith('http://') || safeSrc.startsWith('https://')) {
      probeVideoFormatAsync(safeSrc).then((probe) => {
        if (probe && (probe as any).supportsByteRange !== undefined) {
          setRangeSeekSupported(Boolean((probe as any).supportsByteRange));
        }
      }).catch(() => {});
    }
  }, [movie.videoUrl, movie.videoType, initialTime, hasResumed]);

  // Video Element Mount & Event Listeners
  useEffect(() => {
    initVideo();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (dashRef.current) {
        dashRef.current.destroy();
        dashRef.current = null;
      }
    };
  }, [initVideo]);

  // Attach core video element listeners
  useEffect(() => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const dur = video.duration;
      if (dur && isFinite(dur) && dur > 0) {
        setDuration(dur);
        setIsLiveStream(false);
      } else if (dur === Infinity) {
        setIsLiveStream(true);
      }
      setIsLoading(false);

      // Check browser seekable capability
      if (video.seekable && video.seekable.length === 0 && !isHlsMode) {
        setRangeSeekSupported(false);
      } else {
        setRangeSeekSupported(true);
      }

      if (initialTime > 5 && !hasResumed) {
        video.currentTime = initialTime;
        setHasResumed(true);
      }
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    };

    const handleTimeUpdate = () => {
      const now = video.currentTime;
      // CRITICAL: Do NOT overwrite slider time if user is currently scrubbing/dragging!
      if (!isScrubbingRef.current) {
        setCurrentTime(now);
      }
      updateBufferedProgress();

      // Periodic progress update callback
      if (onProgressUpdate && video.duration > 0) {
        onProgressUpdate(now, video.duration);
      }

      // Sync progress to database every 10s
      if (Math.round(now) % 10 === 0 && video.duration > 0) {
        api.saveProgress(movie.id, now, video.duration).catch(() => {});
      }

      // 1. Synchronize Dubbed Auxiliary Audio drift
      if (dubbed && selectedAudioTrackId !== 'original' && !selectedAudioTrackId.startsWith('hls_audio_') && dubbed.src) {
        const drift = Math.abs(dubbed.currentTime - now);
        if (drift > 0.35) {
          dubbed.currentTime = now;
        }
      }

      // 2. Synchronize WebVTT Subtitles
      if (selectedSubtitleTrackId !== 'off' && cues.length > 0) {
        const activeCue = cues.find((c) => now >= c.start && now <= c.end);
        setCurrentSubtitleText(activeCue ? activeCue.text : '');
      } else if (currentSubtitleText) {
        setCurrentSubtitleText('');
      }
    };

    const handleSeeking = () => {
      setIsSeeking(true);
      if (dubbed && selectedAudioTrackId !== 'original' && !selectedAudioTrackId.startsWith('hls_audio_')) {
        dubbed.currentTime = video.currentTime;
      }
    };

    const handleSeeked = () => {
      setIsSeeking(false);
      setIsLoading(false);
      if (dubbed && selectedAudioTrackId !== 'original' && !selectedAudioTrackId.startsWith('hls_audio_') && !video.paused) {
        dubbed.play().catch(() => {});
      }
    };

    const handleWaiting = () => setIsLoading(true);

    const handlePlaying = () => {
      setIsLoading(false);
      setIsSeeking(false);
      setIsPlaying(true);
      if (dubbed && selectedAudioTrackId !== 'original' && !selectedAudioTrackId.startsWith('hls_audio_')) {
        dubbed.currentTime = video.currentTime;
        dubbed.play().catch(() => {});
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (dubbed && selectedAudioTrackId !== 'original') {
        dubbed.pause();
      }
    };

    const handleError = () => {
      setIsLoading(false);
      setIsSeeking(false);
      const mediaErr = video.error;
      const validation = getSafeVideoUrl(movie.videoUrl);

      // Proxy fallback on network CORS or playback errors
      const isNativeApp = typeof window !== 'undefined' && (
        Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        window.location.protocol === 'capacitor:' ||
        (window.location.hostname === 'localhost' && window.location.port === '')
      );
      const baseUrl = getApiBaseUrl();
      const canAttemptProxy =
        (!isNativeApp || Boolean(baseUrl)) &&
        !validation.isLocalUpload &&
        !validation.isBlob &&
        (validation.safeUrl.startsWith('http://') || validation.safeUrl.startsWith('https://')) &&
        !video.src.includes('/api/stream-proxy') &&
        !triedProxyRef.current;

      if (canAttemptProxy) {
        triedProxyRef.current = true;
        console.warn('[VideoPlayer] Direct playback failed. Attempting playback via stream proxy...');
        video.src = `${baseUrl}/api/stream-proxy?url=${encodeURIComponent(validation.safeUrl)}`;
        video.load();
        video.play().then(() => setIsPlaying(true)).catch(() => {});
        return;
      }

      setHasError(true);
      let msg = 'Video stream could not be loaded. Please check your network connection.';
      if (mediaErr) {
        setDiagnosticsInfo((prev: any) => ({
          ...prev,
          errorCode: mediaErr.code,
          errorMessage: mediaErr.message || `Media Error ${mediaErr.code}`,
        }));

        if (mediaErr.code === 1) {
          msg = 'Video playback was aborted by the client.';
        } else if (mediaErr.code === 2) {
          msg = 'Network download failed. Please check your internet connection.';
        } else if (mediaErr.code === 3 || mediaErr.code === 4) {
          if (validation.isHls || movie.videoUrl.includes('.m3u8')) {
            msg = 'HLS adaptive stream could not be loaded. Stream manifest may be offline.';
          } else {
            msg = 'This video format or audio codec is not natively supported by your browser (e.g. H.265/HEVC or MKV). Re-encode it for compatibility below.';
          }
        }
      }
      setErrorMessage(msg);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', updateBufferedProgress);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', updateBufferedProgress);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, [movie.id, initialTime, hasResumed, selectedAudioTrackId, selectedSubtitleTrackId, cues]);

  // Robust Seeking Execution: checks seekable range & Range requests
  const executeSeek = (targetTime: number) => {
    const video = videoRef.current;
    if (!video) return;

    const dur = duration || video.duration || 100;
    const boundedTime = Math.max(0, Math.min(dur, targetTime));

    // Check if server supports Range seeking beyond buffered range
    if (!rangeSeekSupported && video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      if (boundedTime > bufferedEnd + 2) {
        setSeekWarning('Notice: This media server does not support byte-range seeking. Content must buffer sequentially.');
        setTimeout(() => setSeekWarning(''), 5000);
      }
    }

    video.currentTime = boundedTime;
    setCurrentTime(boundedTime);

    if (dubbedAudioRef.current && selectedAudioTrackId !== 'original' && !selectedAudioTrackId.startsWith('hls_audio_')) {
      dubbedAudioRef.current.currentTime = boundedTime;
    }

    resetControlsTimer();
  };

  // 10-Second Relative Seek (+10s / -10s)
  const handleSeekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = (isScrubbing ? scrubTime : currentTime) + seconds;
    executeSeek(target);
    triggerToast(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
  };

  // Double-tap seeking on left/right half of screen (YouTube / Netflix style)
  const handleVideoTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const now = Date.now();
    const touch = e.changedTouches[0];
    if (!touch || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const tapX = touch.clientX - rect.left;
    const width = rect.width;
    const timeDelta = now - lastTapRef.current.time;

    if (timeDelta < 300) {
      // Double tap detected
      if (tapX < width * 0.35) {
        // Left side: Rewind 10s
        handleSeekRelative(-10);
        setDoubleTapAnimation({ side: 'left', label: '-10s' });
        setTimeout(() => setDoubleTapAnimation(null), 700);
      } else if (tapX > width * 0.65) {
        // Right side: Forward 10s
        handleSeekRelative(10);
        setDoubleTapAnimation({ side: 'right', label: '+10s' });
        setTimeout(() => setDoubleTapAnimation(null), 700);
      } else {
        // Center: toggle play
        togglePlay();
      }
    } else {
      // Single tap: toggle controls
      setControlsVisible((prev) => !prev);
    }

    lastTapRef.current = { time: now, x: tapX };
  };

  // Interactive Timeline Scrubbing Handlers
  const calculateTimeFromClientX = (clientX: number): number => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percentage = clickX / rect.width;
    const dur = duration || videoRef.current?.duration || 100;
    return percentage * dur;
  };

  const handlePointerDownProgressBar = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const targetTime = calculateTimeFromClientX(e.clientX);
    setScrubTime(targetTime);
    setCurrentTime(targetTime);
  };

  const handlePointerMoveProgressBar = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetTime = calculateTimeFromClientX(e.clientX);
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    setHoverPosition(Math.max(0, Math.min(rect.width, e.clientX - rect.left)));
    setHoverTime(targetTime);

    if (isScrubbingRef.current) {
      setScrubTime(targetTime);
      setCurrentTime(targetTime);
    }
  };

  const handlePointerUpProgressBar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}

      const finalTime = calculateTimeFromClientX(e.clientX);
      executeSeek(finalTime);
    }
  };

  const handlePointerLeaveProgressBar = () => {
    setHoverTime(null);
  };

  // Play / Pause Toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  };

  // Audio Language Switching (CRITICAL: Preserves playback position and never restarts stream)
  const handleSelectAudioTrack = (trackId: string) => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;

    setSelectedAudioTrackId(trackId);

    // 1. Switching to Master Original Video Stream
    if (trackId === 'original') {
      if (hlsRef.current && detectedHlsAudioTracks.length > 0) {
        hlsRef.current.audioTrack = 0;
      }
      if (dubbed) {
        dubbed.pause();
        dubbed.src = '';
      }
      video.muted = isMuted;
      video.volume = isMuted ? 0 : volume;

      localStorage.setItem('z1_pref_audio_language', movie.language || 'English');
      triggerToast(`Audio: ${movie.language || 'English'} [Original Audio]`);
      setShowAudioMenu(false);
      return;
    }

    // 2. Switching to Embedded HLS Audio Track
    if (trackId.startsWith('hls_audio_')) {
      const hlsIndex = parseInt(trackId.replace('hls_audio_', ''), 10);
      if (hlsRef.current && !isNaN(hlsIndex)) {
        hlsRef.current.audioTrack = hlsIndex;
        const track = detectedHlsAudioTracks.find((t) => t.index === hlsIndex);
        if (dubbed) {
          dubbed.pause();
          dubbed.src = '';
        }
        video.muted = isMuted;
        video.volume = isMuted ? 0 : volume;

        const langName = track?.name || track?.lang || `Track ${hlsIndex + 1}`;
        localStorage.setItem('z1_pref_audio_language', langName);
        triggerToast(`Audio: ${langName}`);
      }
      setShowAudioMenu(false);
      return;
    }

    // 3. Switching to Auxiliary Dubbed Audio Track
    const track = configuredAudioTracks.find((t) => t.id === trackId);
    if (track && track.url && dubbed) {
      const safeAudio = getSafeVideoUrl(track.url);
      if (!safeAudio.valid) {
        triggerToast('Alternate audio URL is invalid.');
        return;
      }

      video.muted = true;
      dubbed.src = safeAudio.safeUrl;
      dubbed.currentTime = video.currentTime;
      dubbed.playbackRate = video.playbackRate;
      dubbed.volume = isMuted ? 0 : volume;
      dubbed.muted = isMuted;

      if (!video.paused) {
        dubbed.play().catch(() => {});
      }

      localStorage.setItem('z1_pref_audio_language', track.language);
      triggerToast(`Audio: ${track.label || track.language}`);
    }
    setShowAudioMenu(false);
  };

  // Subtitle Track Switching
  const handleSelectSubtitleTrack = (trackId: string) => {
    setSelectedSubtitleTrackId(trackId);

    if (trackId === 'off') {
      if (hlsRef.current) {
        hlsRef.current.subtitleTrack = -1;
      }
      setCurrentSubtitleText('');
      localStorage.setItem('z1_pref_subtitle_language', 'off');
      triggerToast('Subtitles: Off');
    } else if (trackId.startsWith('hls_sub_')) {
      const subIndex = parseInt(trackId.replace('hls_sub_', ''), 10);
      if (hlsRef.current && !isNaN(subIndex)) {
        hlsRef.current.subtitleTrack = subIndex;
        const track = detectedHlsSubtitleTracks.find((s) => s.index === subIndex);
        const name = track?.name || track?.lang || `Subtitle ${subIndex + 1}`;
        localStorage.setItem('z1_pref_subtitle_language', name);
        triggerToast(`Subtitles: ${name}`);
      }
    } else {
      const track = availableSubtitleTracks.find((s) => s.id === trackId);
      if (track) {
        localStorage.setItem('z1_pref_subtitle_language', track.language);
        triggerToast(`Subtitles: ${track.label || track.language}`);
      }
    }
    setShowSubtitlesMenu(false);
  };

  // Quality Level Switching (HLS only)
  const handleSelectQuality = (index: number) => {
    setSelectedQualityIndex(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      const label = index === -1 ? 'Auto' : availableQualityLevels.find((q) => q.index === index)?.label || 'Selected';
      triggerToast(`Quality: ${label}`);
    }
    setShowSettings(false);
  };

  // Fullscreen with Mobile Landscape Orientation
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const doc: any = document;
    const isFs = Boolean(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );

    if (!isFs) {
      const enterPromise = container.requestFullscreen
        ? container.requestFullscreen()
        : (container as any).webkitRequestFullscreen
        ? (container as any).webkitRequestFullscreen()
        : null;

      if (enterPromise && enterPromise.then) {
        enterPromise
          .then(() => {
            setIsFullscreen(true);
            if (typeof window !== 'undefined' && window.screen?.orientation && (window.screen.orientation as any).lock) {
              (window.screen.orientation as any).lock('landscape').catch(() => {});
            }
          })
          .catch(() => {
            if (video && (video as any).webkitEnterFullscreen) {
              (video as any).webkitEnterFullscreen();
              setIsFullscreen(true);
            }
          });
      } else if (video && (video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (typeof window !== 'undefined' && window.screen?.orientation && (window.screen.orientation as any).unlock) {
        (window.screen.orientation as any).unlock();
      }
      if (doc.exitFullscreen) {
        doc.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Sync fullscreen state across browser and native mobile events
  useEffect(() => {
    const handleFsChange = () => {
      const doc: any = document;
      setIsFullscreen(
        Boolean(
          doc.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement
        )
      );
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;
    video.playbackRate = speed;
    if (dubbed) dubbed.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSettings(false);
    triggerToast(`Speed: ${speed}x`);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          handleSeekRelative(-10);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          handleSeekRelative(10);
          break;
        case 'escape':
          if (showAudioMenu) setShowAudioMenu(false);
          else if (showSubtitlesMenu) setShowSubtitlesMenu(false);
          else if (showSettings) setShowSettings(false);
          else if (showDiagnostics) setShowDiagnostics(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, showAudioMenu, showSubtitlesMenu, showSettings, showDiagnostics, duration, currentTime, isScrubbing]);

  const toggleMute = () => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (selectedAudioTrackId === 'original' || selectedAudioTrackId.startsWith('hls_audio_')) {
      video.muted = nextMuted;
    } else if (dubbed) {
      dubbed.muted = nextMuted;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    setVolume(val);
    const muted = val === 0;
    setIsMuted(muted);

    if (selectedAudioTrackId === 'original' || selectedAudioTrackId.startsWith('hls_audio_')) {
      video.volume = val;
      video.muted = muted;
    } else if (dubbed) {
      dubbed.volume = val;
      dubbed.muted = muted;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0 || !isFinite(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const displayTime = isScrubbing ? scrubTime : currentTime;
  const playPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;
  const activeAudioTrack = allAudioTracks.find((t) => t.id === selectedAudioTrackId) || originalAudioTrack;
  const activeSubtitleTrack = allSubtitleTracks.find((s) => s.id === selectedSubtitleTrackId);

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden font-sans"
    >
      {/* Hidden Auxiliary Audio Element for Dubbed Tracks */}
      <audio
        ref={dubbedAudioRef}
        preload="auto"
        className="hidden"
        onError={() => {
          handleSelectAudioTrack('original');
          triggerToast('Alternate audio unavailable. Reverting to master audio.');
        }}
      />

      {/* Top Header Overlay */}
      <div
        className={`absolute top-0 inset-x-0 z-30 p-4 bg-gradient-to-b from-black/95 via-black/60 to-transparent flex items-center justify-between transition-opacity duration-300 ${
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
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-colors"
            title="Return to Details"
            aria-label="Return to Details"
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
              <span className="text-slate-300 font-medium">{activeAudioTrack.label}</span>
              {selectedSubtitleTrackId !== 'off' && (
                <>
                  <span>·</span>
                  <span className="text-red-400 font-medium">CC: {activeSubtitleTrack?.label || 'Subtitles'}</span>
                </>
              )}
              {isLiveStream && (
                <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide animate-pulse">
                  LIVE
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Diagnostics Button */}
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1.5"
            title="Stream Diagnostics"
          >
            <Info className="w-4 h-4" />
            <span className="hidden sm:inline">Stats</span>
          </button>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div
        className="relative flex-1 w-full h-full flex items-center justify-center cursor-pointer"
        onTouchEnd={handleVideoTouchEnd}
        onClick={(e) => {
          // If clicked directly on the video container (not controls)
          if ((e.target as HTMLElement).tagName === 'VIDEO') {
            togglePlay();
          }
        }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain pointer-events-auto"
          playsInline
          // @ts-ignore
          webkit-playsinline="true"
          preload="auto"
          poster={movie.backdropUrl || movie.posterUrl}
        />

        {/* Double-Tap 10s Ripple Animations */}
        {doubleTapAnimation && (
          <div
            className={`absolute inset-y-0 w-1/3 flex items-center justify-center pointer-events-none z-30 transition-opacity duration-300 ${
              doubleTapAnimation.side === 'left' ? 'left-0 bg-white/5 rounded-r-full' : 'right-0 bg-white/5 rounded-l-full'
            }`}
          >
            <div className="flex flex-col items-center justify-center p-4 rounded-full bg-black/70 border border-white/20 text-white animate-pulse">
              {doubleTapAnimation.side === 'left' ? <RotateCcw className="w-8 h-8" /> : <RotateCw className="w-8 h-8" />}
              <span className="text-xs font-bold font-mono mt-1">{doubleTapAnimation.label}</span>
            </div>
          </div>
        )}

        {/* Modern WebVTT Subtitle Render Overlay */}
        {currentSubtitleText && (
          <div className="absolute bottom-24 sm:bottom-28 inset-x-4 sm:inset-x-16 z-25 flex justify-center pointer-events-none">
            <div className="bg-black/90 backdrop-blur-md text-white px-4 sm:px-6 py-2 rounded-xl text-sm sm:text-base md:text-lg lg:text-xl font-medium tracking-wide text-center shadow-2xl border border-white/20 max-w-3xl leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
              {currentSubtitleText}
            </div>
          </div>
        )}

        {/* Transient Toast Notification */}
        {toastMessage && (
          <div className="absolute top-20 inset-x-0 z-40 flex justify-center pointer-events-none">
            <div className="px-4 py-2 bg-slate-900/95 backdrop-blur-md border border-slate-700 text-white text-xs sm:text-sm font-semibold rounded-full shadow-2xl flex items-center gap-2 animate-fadeIn">
              <Sparkles className="w-4 h-4 text-red-500" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Non-Seekable Stream Notice */}
        {seekWarning && (
          <div className="absolute top-20 inset-x-0 z-40 flex justify-center pointer-events-none px-4">
            <div className="px-4 py-2.5 bg-amber-950/90 border border-amber-600/80 text-amber-200 text-xs sm:text-sm rounded-xl shadow-2xl flex items-center gap-2 max-w-lg text-center animate-fadeIn">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{seekWarning}</span>
            </div>
          </div>
        )}

        {/* Center Playback & 10s Skip Buttons */}
        {controlsVisible && !isLoading && !isSeeking && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center gap-8 sm:gap-14 pointer-events-none z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSeekRelative(-10);
              }}
              className="pointer-events-auto p-3.5 sm:p-4 rounded-full bg-black/60 hover:bg-black/80 active:bg-black text-white/90 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-2xl border border-white/10 flex flex-col items-center justify-center"
              title="Rewind 10 seconds"
              aria-label="Rewind 10 seconds"
            >
              <RotateCcw className="w-6 h-6 sm:w-7 sm:h-7" />
              <span className="text-[10px] font-bold block text-center -mt-0.5">10s</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="pointer-events-auto p-4 sm:p-5 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white transition-all transform hover:scale-110 active:scale-95 shadow-2xl shadow-red-950/80 flex items-center justify-center"
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
              ) : (
                <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSeekRelative(10);
              }}
              className="pointer-events-auto p-3.5 sm:p-4 rounded-full bg-black/60 hover:bg-black/80 active:bg-black text-white/90 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-2xl border border-white/10 flex flex-col items-center justify-center"
              title="Forward 10 seconds"
              aria-label="Forward 10 seconds"
            >
              <RotateCw className="w-6 h-6 sm:w-7 sm:h-7" />
              <span className="text-[10px] font-bold block text-center -mt-0.5">10s</span>
            </button>
          </div>
        )}

        {/* Buffering & Seeking Spinner */}
        {(isLoading || isSeeking) && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none z-30">
            <div className="w-14 h-14 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin mb-3"></div>
            <p className="text-white text-xs sm:text-sm font-medium tracking-wide">
              {isSeeking ? 'Seeking stream position...' : 'Buffering media stream...'}
            </p>
          </div>
        )}

        {/* Error Fallback Screen */}
        {hasError && movieStatus !== 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 p-6 text-center z-40 overflow-y-auto">
            <AlertCircle className="w-14 h-14 text-red-500 mb-3 shrink-0" />
            <h3 className="text-lg font-bold text-white mb-1">Playback Error</h3>
            <p className="text-slate-300 text-sm max-w-md mb-3">{errorMessage}</p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  retryCountRef.current = 0;
                  initVideo();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Playback</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                Close Player
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stream Diagnostics Modal */}
      {showDiagnostics && diagnosticsInfo && (
        <div
          onClick={() => setShowDiagnostics(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0d1017] border border-slate-800 rounded-2xl p-5 text-slate-200 text-xs shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <Info className="w-4 h-4 text-red-500" />
                <span>Technical Stream Diagnostics</span>
              </div>
              <button onClick={() => setShowDiagnostics(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Stream Format:</span>
                <span className="text-red-400 font-bold">{diagnosticsInfo.detectedFormat}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Player Engine:</span>
                <span className="text-emerald-400">{diagnosticsInfo.playerEngine}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Byte-Range Seeking:</span>
                <span className={rangeSeekSupported ? 'text-emerald-400' : 'text-amber-400'}>
                  {rangeSeekSupported ? 'Supported (HTTP 206)' : 'Sequential / Progressive Only'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Audio Tracks Detected:</span>
                <span className="text-slate-200">{allAudioTracks.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Subtitles Available:</span>
                <span className="text-slate-200">{allSubtitleTracks.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Resolved Source URL:</span>
                <span className="text-slate-400 truncate max-w-xs">{diagnosticsInfo.resolvedUrl}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED AUDIO & LANGUAGE BOTTOM SHEET */}
      {showAudioMenu && (
        <div
          onClick={() => setShowAudioMenu(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0e111a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-slideUp"
          >
            <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Languages className="w-5 h-5 text-red-500" />
                <h3 className="font-display text-base font-bold text-white tracking-tight">
                  Audio & Language
                </h3>
              </div>
              <button
                onClick={() => setShowAudioMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2">
              {allAudioTracks.map((track) => {
                const isSelected = selectedAudioTrackId === track.id;
                const isOriginal = track.id === 'original';

                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => handleSelectAudioTrack(track.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
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
                            : 'border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          <span>{track.label || track.language}</span>
                          {isOriginal && (
                            <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.2 rounded font-sans">
                              Master
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {isOriginal ? 'Master theatrical mix' : `${track.language} stream`}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

              {allAudioTracks.length === 1 && (
                <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl text-slate-400 text-xs leading-relaxed">
                  Single Audio Track: This video contains only 1 embedded audio stream ({movie.language || 'English'}). No alternate language audio streams were detected in the source media.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED SUBTITLES BOTTOM SHEET */}
      {showSubtitlesMenu && (
        <div
          onClick={() => setShowSubtitlesMenu(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0e111a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-slideUp"
          >
            <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Subtitles className="w-5 h-5 text-red-500" />
                <h3 className="font-display text-base font-bold text-white tracking-tight">
                  Subtitles & Captions
                </h3>
              </div>
              <button
                onClick={() => setShowSubtitlesMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2">
              {/* Off Option */}
              <button
                type="button"
                onClick={() => handleSelectSubtitleTrack('off')}
                className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
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
                        : 'border-slate-600'
                    }`}
                  >
                    {selectedSubtitleTrackId === 'off' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Off</div>
                    <div className="text-[10px] text-slate-400">Captions disabled</div>
                  </div>
                </div>
              </button>

              {/* Subtitle Tracks */}
              {allSubtitleTracks.map((sub) => {
                const isSelected = selectedSubtitleTrackId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleSelectSubtitleTrack(sub.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
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
                            : 'border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-semibold truncate">
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

              {allSubtitleTracks.length === 0 && (
                <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl text-slate-400 text-xs leading-relaxed">
                  No closed captions or subtitles are currently available for this title.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM CONTROL BAR */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 p-3 sm:p-5 bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <AdBanner type="player-area" className="mb-2 max-w-4xl mx-auto" />

        <div className="max-w-5xl mx-auto space-y-2">
          {/* HIGH-PRECISION SEEKABLE PROGRESS BAR */}
          {!isLiveStream ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-300 w-12 text-right">
                {formatTime(displayTime)}
              </span>

              {/* Progress Rail Container with tap-to-seek and drag support */}
              <div
                ref={progressBarRef}
                onPointerDown={handlePointerDownProgressBar}
                onPointerMove={handlePointerMoveProgressBar}
                onPointerUp={handlePointerUpProgressBar}
                onPointerLeave={handlePointerLeaveProgressBar}
                className="relative flex-1 h-6 flex items-center cursor-pointer group touch-none"
              >
                {/* Background Track */}
                <div className="w-full h-1.5 sm:h-2 bg-slate-800/90 rounded-full overflow-hidden transition-all group-hover:h-2.5">
                  {/* Buffered Progress */}
                  <div
                    className="h-full bg-slate-600/70 transition-all duration-200"
                    style={{ width: `${bufferedPercent}%` }}
                  />
                </div>

                {/* Played Progress Bar */}
                <div
                  className="absolute left-0 h-1.5 sm:h-2 bg-gradient-to-r from-red-700 to-red-500 rounded-full pointer-events-none transition-all group-hover:h-2.5 shadow-md shadow-red-950"
                  style={{ width: `${playPercent}%` }}
                />

                {/* Scrubber Thumb Indicator */}
                <div
                  className={`absolute w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white rounded-full shadow-lg border-2 border-red-600 pointer-events-none transform -translate-x-1/2 transition-transform duration-75 ${
                    isScrubbing ? 'scale-125' : 'group-hover:scale-110'
                  }`}
                  style={{ left: `${playPercent}%` }}
                />

                {/* Hover/Scrub Time Bubble Preview */}
                {hoverTime !== null && (
                  <div
                    className="absolute bottom-full mb-2 -translate-x-1/2 px-2 py-1 bg-slate-900 border border-slate-700 text-white text-[10px] font-mono font-bold rounded shadow-xl pointer-events-none whitespace-nowrap"
                    style={{ left: `${hoverPosition}px` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
              </div>

              <span className="text-xs font-mono text-slate-400 w-12">
                {formatTime(duration)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1 text-xs text-red-500 font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                Live Broadcast Stream
              </span>
              <span className="text-slate-400 font-mono text-[11px]">Real-Time Feed</span>
            </div>
          )}

          {/* Player Buttons Row */}
          <div className="flex items-center justify-between pt-1">
            {/* Left Controls: Play, 10s Rewind, 10s Forward, Volume */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={togglePlay}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => handleSeekRelative(-10)}
                className="p-2 sm:p-2.5 text-slate-300 hover:text-white transition-colors"
                title="Rewind 10 seconds"
                aria-label="Rewind 10 seconds"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                onClick={() => handleSeekRelative(10)}
                className="p-2 sm:p-2.5 text-slate-300 hover:text-white transition-colors"
                title="Forward 10 seconds"
                aria-label="Forward 10 seconds"
              >
                <RotateCw className="w-5 h-5" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-300 hover:text-white transition-colors"
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
                  className="w-16 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none hidden sm:inline-block"
                />
              </div>
            </div>

            {/* Right Controls: Audio, Subtitles, Quality/Speed Settings, Fullscreen */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {/* Audio Language Button */}
              <button
                onClick={() => {
                  setShowAudioMenu(true);
                  setShowSubtitlesMenu(false);
                  setShowSettings(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  showAudioMenu
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
                title="Audio Language"
              >
                <Languages className="w-4 h-4 text-red-400" />
                <span className="hidden sm:inline">Audio</span>
              </button>

              {/* Subtitles Button */}
              <button
                onClick={() => {
                  setShowSubtitlesMenu(true);
                  setShowAudioMenu(false);
                  setShowSettings(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedSubtitleTrackId !== 'off'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
                title="Subtitles"
              >
                <Subtitles className="w-4 h-4" />
                <span className="hidden sm:inline">Subtitles</span>
              </button>

              {/* Settings (Speed & Quality) Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSettings(!showSettings);
                    setShowAudioMenu(false);
                    setShowSubtitlesMenu(false);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    showSettings ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  title="Playback Settings"
                >
                  <Settings className="w-4 h-4" />
                  <span>{playbackRate}x</span>
                </button>

                {showSettings && (
                  <div className="absolute right-0 bottom-full mb-3 bg-[#11141e] border border-slate-800 rounded-xl shadow-2xl p-2.5 w-44 space-y-2 z-50">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Playback Speed</div>
                      <div className="grid grid-cols-2 gap-1">
                        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                          <button
                            key={speed}
                            onClick={() => handleSpeedChange(speed)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              playbackRate === speed
                                ? 'bg-red-600 text-white font-bold'
                                : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {speed === 1 ? '1x (Normal)' : `${speed}x`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {availableQualityLevels.length > 1 && (
                      <div className="border-t border-slate-800 pt-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Stream Quality</div>
                        <div className="space-y-0.5">
                          <button
                            onClick={() => handleSelectQuality(-1)}
                            className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                              selectedQualityIndex === -1 ? 'bg-red-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            Auto Adaptive
                          </button>
                          {availableQualityLevels.map((lvl) => (
                            <button
                              key={lvl.index}
                              onClick={() => handleSelectQuality(lvl.index)}
                              className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                                selectedQualityIndex === lvl.index ? 'bg-red-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              {lvl.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-2 sm:p-2.5 text-slate-300 hover:text-white transition-colors"
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
