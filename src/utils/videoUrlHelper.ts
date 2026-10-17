/**
 * Video URL Validation, Normalization and Universal Playback Helper for Z1 Movies
 * 
 * Supports:
 * 1. Direct MP4 video URLs
 * 2. HLS streaming URLs (.m3u8, application/vnd.apple.mpegurl)
 * 3. MPEG-DASH streaming URLs (.mpd, application/dash+xml) via dash.js
 * 4. WebM video URLs & direct WebM streams
 * 5. Supported MOV and other browser-compatible video formats
 * 6. URLs without file extensions (detected via content inspection / HTTP headers)
 * 7. URLs with query parameters, signed tokens, and expiration keys
 * 8. URLs that redirect to a supported video resource
 * 9. Firebase Cloud Storage & Google Cloud Storage signed tokens
 * 10. Security protocol screening (blocks javascript:, data:, file:)
 */

import { VideoFormatType } from '../types';

export interface VideoUrlValidationResult {
  valid: boolean;
  safeUrl: string;
  isBlob: boolean;
  isHls: boolean;
  isDash: boolean;
  isWebm: boolean;
  isMov: boolean;
  isDirect: boolean;
  format: VideoFormatType;
  isFirebaseStorage: boolean;
  isLocalUpload: boolean;
  error?: string;
  diagnostics?: {
    originalUrl: string;
    protocol: string;
    hostname?: string;
    detectedFormat: VideoFormatType;
    hasQueryTokens: boolean;
    hasExtension: boolean;
    extension?: string;
  };
}

const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'about:',
  'chrome:',
  'ms-appx:',
];

/**
 * Detect video format from URL patterns, query params, or explicit hint.
 */
export function detectFormatFromUrl(
  rawUrl: string,
  explicitFormat: VideoFormatType = 'auto'
): VideoFormatType {
  if (explicitFormat && explicitFormat !== 'auto') {
    return explicitFormat;
  }

  if (!rawUrl || typeof rawUrl !== 'string') return 'auto';

  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();

  try {
    const urlObj = lower.startsWith('http://') || lower.startsWith('https://')
      ? new URL(trimmed)
      : new URL(trimmed, 'https://localhost');

    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();

    // 1. Check path extension first
    if (pathname.endsWith('.m3u8')) return 'hls';
    if (pathname.endsWith('.mpd')) return 'dash';
    if (pathname.endsWith('.webm')) return 'webm';
    if (pathname.endsWith('.mov')) return 'mov';
    if (pathname.endsWith('.mp4')) return 'mp4';

    // 2. Check query string tokens or search parameters (e.g. ?manifest=hls or ?file=video.m3u8)
    if (search.includes('.m3u8') || search.includes('format=hls') || search.includes('type=m3u8')) return 'hls';
    if (search.includes('.mpd') || search.includes('format=dash') || search.includes('type=mpd')) return 'dash';
    if (search.includes('.webm') || search.includes('format=webm')) return 'webm';
    if (search.includes('.mov') || search.includes('format=mov')) return 'mov';
    if (search.includes('.mp4') || search.includes('format=mp4')) return 'mp4';

    // 3. Common path keywords for streaming manifests
    if (pathname.includes('/hls/') || pathname.includes('/manifest(format=m3u8')) return 'hls';
    if (pathname.includes('/dash/') || pathname.includes('/manifest(format=mpd')) return 'dash';

    return 'auto';
  } catch {
    if (lower.includes('.m3u8')) return 'hls';
    if (lower.includes('.mpd')) return 'dash';
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.mp4')) return 'mp4';
    return 'auto';
  }
}

/**
 * Validates and safely normalizes any video URL for the universal video player.
 */
export function getSafeVideoUrl(
  rawUrl?: string | null,
  explicitFormat: VideoFormatType = 'auto'
): VideoUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      valid: false,
      safeUrl: '',
      isBlob: false,
      isHls: false,
      isDash: false,
      isWebm: false,
      isMov: false,
      isDirect: false,
      format: 'auto',
      isFirebaseStorage: false,
      isLocalUpload: false,
      error: 'No video stream URL provided.',
    };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      safeUrl: '',
      isBlob: false,
      isHls: false,
      isDash: false,
      isWebm: false,
      isMov: false,
      isDirect: false,
      format: 'auto',
      isFirebaseStorage: false,
      isLocalUpload: false,
      error: 'Video stream URL is empty.',
    };
  }

  const lower = trimmed.toLowerCase();

  // 1. Strict Security Protocol Check: Block malicious or local filesystem protocols
  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      return {
        valid: false,
        safeUrl: '',
        isBlob: false,
        isHls: false,
        isDash: false,
        isWebm: false,
        isMov: false,
        isDirect: false,
        format: 'auto',
        isFirebaseStorage: false,
        isLocalUpload: false,
        error: `Playback blocked for security: '${protocol}' URLs are not permitted.`,
      };
    }
  }

  // Block Windows/Unix absolute local disk file paths (e.g. C:\... or /Users/...)
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^\/(Users|home|private|Windows|Program Files)\//i.test(trimmed)) {
    return {
      valid: false,
      safeUrl: '',
      isBlob: false,
      isHls: false,
      isDash: false,
      isWebm: false,
      isMov: false,
      isDirect: false,
      format: 'auto',
      isFirebaseStorage: false,
      isLocalUpload: false,
      error: 'Playback blocked: Local filesystem paths cannot be loaded directly by the browser.',
    };
  }

  // 1b. Check for known unsupported desktop container formats (.mkv, .avi, .wmv, .flv, .rmvb)
  const isUnsupportedContainer = /\.(mkv|avi|wmv|flv|rmvb)(\?.*)?$/i.test(trimmed);
  if (isUnsupportedContainer) {
    const extMatch = trimmed.match(/\.(mkv|avi|wmv|flv|rmvb)/i);
    const ext = extMatch ? extMatch[1].toUpperCase() : 'MKV';
    return {
      valid: false,
      safeUrl: trimmed,
      isBlob: false,
      isHls: false,
      isDash: false,
      isWebm: false,
      isMov: false,
      isDirect: false,
      format: 'auto',
      isFirebaseStorage: false,
      isLocalUpload: trimmed.includes('/uploads/'),
      error: `The ${ext} container format is not natively playable in web browsers. Please use "Re-encode for compatibility" to convert it to mobile-friendly MP4 (H.264 + AAC).`,
      diagnostics: {
        originalUrl: trimmed,
        protocol: trimmed.split(':')[0] || 'http',
        detectedFormat: 'auto',
        hasQueryTokens: trimmed.includes('?'),
        hasExtension: true,
        extension: ext.toLowerCase(),
      },
    };
  }

  // 2. Client Blob URLs (e.g. blob:http://... or blob:https://...)
  if (lower.startsWith('blob:')) {
    let isCrossOriginBlob = false;
    if (typeof window !== 'undefined' && window.location?.origin) {
      const match = trimmed.match(/^blob:(https?:\/\/[^/]+)/i);
      if (match && match[1]) {
        if (match[1].toLowerCase() !== window.location.origin.toLowerCase()) {
          isCrossOriginBlob = true;
        }
      } else {
        if (!trimmed.includes(window.location.host)) {
          isCrossOriginBlob = true;
        }
      }
    }

    if (isCrossOriginBlob) {
      return {
        valid: false,
        safeUrl: '',
        isBlob: true,
        isHls: false,
        isDash: false,
        isWebm: false,
        isMov: false,
        isDirect: false,
        format: 'auto',
        isFirebaseStorage: false,
        isLocalUpload: false,
        error: 'Video session expired or cross-origin blob is not accessible. Please re-upload or select a valid video.',
      };
    }

    const detected = detectFormatFromUrl(trimmed, explicitFormat);
    return {
      valid: true,
      safeUrl: trimmed,
      isBlob: true,
      isHls: detected === 'hls',
      isDash: detected === 'dash',
      isWebm: detected === 'webm',
      isMov: detected === 'mov',
      isDirect: detected === 'mp4' || detected === 'webm' || detected === 'mov' || detected === 'auto',
      format: detected,
      isFirebaseStorage: false,
      isLocalUpload: false,
    };
  }

  // 3. Normalize Local / Uploaded Video Paths (e.g. /uploads/video.mp4)
  if (trimmed.includes('/uploads/')) {
    const uploadIndex = trimmed.indexOf('/uploads/');
    const pathPart = trimmed.slice(uploadIndex);
    const safeLocalUrl = pathPart.includes(' ') ? pathPart.replace(/ /g, '%20') : pathPart;
    const detected = detectFormatFromUrl(safeLocalUrl, explicitFormat);
    return {
      valid: true,
      safeUrl: safeLocalUrl,
      isBlob: false,
      isHls: detected === 'hls',
      isDash: detected === 'dash',
      isWebm: detected === 'webm',
      isMov: detected === 'mov',
      isDirect: detected === 'mp4' || detected === 'webm' || detected === 'mov' || detected === 'auto',
      format: detected,
      isFirebaseStorage: false,
      isLocalUpload: true,
    };
  }

  if (/^uploads\//i.test(trimmed)) {
    const safeLocalUrl = `/${trimmed}`.replace(/ /g, '%20');
    const detected = detectFormatFromUrl(safeLocalUrl, explicitFormat);
    return {
      valid: true,
      safeUrl: safeLocalUrl,
      isBlob: false,
      isHls: detected === 'hls',
      isDash: detected === 'dash',
      isWebm: detected === 'webm',
      isMov: detected === 'mov',
      isDirect: detected === 'mp4' || detected === 'webm' || detected === 'mov' || detected === 'auto',
      format: detected,
      isFirebaseStorage: false,
      isLocalUpload: true,
    };
  }

  // 4. Remote HTTP / HTTPS URLs (Firebase Storage, Signed URLs, HLS, DASH, external MP4s, WebM, MOV)
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);

      // Check for Firebase Storage / Google Cloud Storage download URLs
      const isFirebase = /firebasestorage\.googleapis\.com|storage\.googleapis\.com|\.firebasestorage\.app|\.appspot\.com/i.test(
        parsed.hostname
      );

      // Detect format
      const detected = detectFormatFromUrl(trimmed, explicitFormat);

      // Preserve query params, signed tokens and authorization keys safely
      let finalSafeUrl = trimmed;
      if (finalSafeUrl.includes(' ')) {
        finalSafeUrl = finalSafeUrl.replace(/ /g, '%20');
      }

      // Upgrade http:// to https:// when running in HTTPS (avoid Mixed Content blocks)
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && parsed.protocol === 'http:') {
        if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          finalSafeUrl = finalSafeUrl.replace(/^http:\/\//i, 'https://');
        }
      }

      return {
        valid: true,
        safeUrl: finalSafeUrl,
        isBlob: false,
        isHls: detected === 'hls',
        isDash: detected === 'dash',
        isWebm: detected === 'webm',
        isMov: detected === 'mov',
        isDirect: detected === 'mp4' || detected === 'webm' || detected === 'mov' || detected === 'auto',
        format: detected,
        isFirebaseStorage: isFirebase,
        isLocalUpload: false,
        diagnostics: {
          originalUrl: trimmed,
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          detectedFormat: detected,
          hasQueryTokens: Boolean(parsed.search),
          hasExtension: Boolean(parsed.pathname.includes('.')),
          extension: parsed.pathname.split('.').pop(),
        },
      };
    } catch {
      const repaired = trimmed.replace(/ /g, '%20');
      const detected = detectFormatFromUrl(repaired, explicitFormat);
      return {
        valid: true,
        safeUrl: repaired,
        isBlob: false,
        isHls: detected === 'hls',
        isDash: detected === 'dash',
        isWebm: detected === 'webm',
        isMov: detected === 'mov',
        isDirect: detected === 'mp4' || detected === 'webm' || detected === 'mov' || detected === 'auto',
        format: detected,
        isFirebaseStorage: /googleapis\.com|firebasestorage\.app|appspot\.com/i.test(repaired),
        isLocalUpload: false,
      };
    }
  }

  // 5. Root-relative paths (e.g. /media/video.mp4 or /assets/...)
  if (trimmed.startsWith('/')) {
    const safeUrl = trimmed.includes(' ') ? trimmed.replace(/ /g, '%20') : trimmed;
    const detected = detectFormatFromUrl(safeUrl, explicitFormat);
    return {
      valid: true,
      safeUrl,
      isBlob: false,
      isHls: detected === 'hls',
      isDash: detected === 'dash',
      isWebm: detected === 'webm',
      isMov: detected === 'mov',
      isDirect: detected === 'mp4' || detected === 'webm' || detected === 'mov' || detected === 'auto',
      format: detected,
      isFirebaseStorage: false,
      isLocalUpload: true,
    };
  }

  return {
    valid: false,
    safeUrl: '',
    isBlob: false,
    isHls: false,
    isDash: false,
    isWebm: false,
    isMov: false,
    isDirect: false,
    format: 'auto',
    isFirebaseStorage: false,
    isLocalUpload: false,
    error: 'Unrecognized URL scheme. Please provide a valid HTTPS, stream, or uploaded video link.',
  };
}

/**
 * Asynchronously probes a video URL to detect MIME type and stream format.
 */
export async function probeVideoFormatAsync(url: string): Promise<{
  valid: boolean;
  format: VideoFormatType;
  contentType: string;
  message: string;
}> {
  if (!url || typeof url !== 'string') {
    return { valid: false, format: 'unknown' as any, contentType: '', message: 'URL is required' };
  }

  const localValidation = getSafeVideoUrl(url);
  if (!localValidation.valid) {
    return {
      valid: false,
      format: 'unknown' as any,
      contentType: '',
      message: localValidation.error || 'Invalid URL scheme',
    };
  }

  // If format already identified by path
  if (localValidation.format !== 'auto') {
    return {
      valid: true,
      format: localValidation.format,
      contentType:
        localValidation.format === 'hls'
          ? 'application/vnd.apple.mpegurl'
          : localValidation.format === 'dash'
          ? 'application/dash+xml'
          : localValidation.format === 'webm'
          ? 'video/webm'
          : 'video/mp4',
      message: `Verified format: ${localValidation.format.toUpperCase()}`,
    };
  }

  // Probe server endpoint
  try {
    const res = await fetch('/api/validate-video-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      const detected = (data.format as VideoFormatType) || detectFormatFromUrl(data.resolvedUrl || url);
      return {
        valid: Boolean(data.valid),
        format: detected,
        contentType: data.contentType || '',
        message: data.message || `Verified ${detected.toUpperCase()}`,
      };
    }
  } catch (err: any) {
    console.warn('[VideoProbe] Server probe error:', err);
  }

  return {
    valid: true,
    format: 'mp4',
    contentType: 'video/mp4',
    message: 'Stream format auto-detected as standard MP4/HTML5',
  };
}
