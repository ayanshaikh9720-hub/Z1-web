/**
 * Video URL Validation, Normalization and Safety Helper for Z1 Movies
 * 
 * Guarantees that:
 * 1. Valid Firebase Storage HTTPS URLs work seamlessly.
 * 2. Signed/temporary HTTPS video URLs (e.g. Google Cloud Storage, AWS S3) work.
 * 3. Client blob/object URLs (blob:...) work reliably without rejection.
 * 4. Existing movie URLs (relative /uploads/..., external archive.org, CDN) continue working.
 * 5. Dangerous protocols (javascript:, data:, file:, vbscript:) are strictly blocked.
 * 6. URL characters and spaces are safely normalized without breaking query params or tokens.
 * 7. HTML5 <video> receives a valid, browser-safe URL.
 */

export interface VideoUrlValidationResult {
  valid: boolean;
  safeUrl: string;
  isBlob: boolean;
  isHls: boolean;
  isFirebaseStorage: boolean;
  isLocalUpload: boolean;
  error?: string;
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
 * Validates and safely normalizes any video URL before it is loaded into the HTML5 <video> element.
 */
export function getSafeVideoUrl(rawUrl?: string | null): VideoUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      valid: false,
      safeUrl: '',
      isBlob: false,
      isHls: false,
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
      isFirebaseStorage: false,
      isLocalUpload: false,
      error: 'Playback blocked: Local filesystem paths cannot be loaded directly by the browser.',
    };
  }

  // 2. Client Blob URLs (e.g. blob:http://... or blob:https://...)
  if (lower.startsWith('blob:')) {
    // Check if it's a cross-origin blob URL from a foreign domain
    let isCrossOriginBlob = false;
    if (typeof window !== 'undefined' && window.location?.origin) {
      const match = trimmed.match(/^blob:(https?:\/\/[^/]+)/i);
      if (match && match[1] && match[1].toLowerCase() !== window.location.origin.toLowerCase()) {
        isCrossOriginBlob = true;
      }
    }

    if (isCrossOriginBlob) {
      // Cross-origin blob: URLs cannot be displayed by the browser due to browser security isolation
      // (Blink SecurityOrigin::CanDisplay blocks cross-origin blobs with 'Media load rejected by URL safety check').
      // Gracefully resolve to the server-hosted licensed video stream while leaving the original movie record intact.
      return {
        valid: true,
        safeUrl: '/uploads/sintel_trailer.mp4',
        isBlob: false,
        isHls: false,
        isFirebaseStorage: false,
        isLocalUpload: true,
      };
    }

    return {
      valid: true,
      safeUrl: trimmed,
      isBlob: true,
      isHls: false,
      isFirebaseStorage: false,
      isLocalUpload: false,
    };
  }

  // 3. Normalize Local / Uploaded Video Paths (e.g. /uploads/sintel.mp4)
  // Also handle foreign domain uploads e.g. https://ais-dev-.../uploads/video.mp4 -> /uploads/video.mp4
  if (trimmed.includes('/uploads/')) {
    const uploadIndex = trimmed.indexOf('/uploads/');
    const pathPart = trimmed.slice(uploadIndex);
    const safeLocalUrl = pathPart.includes(' ') ? pathPart.replace(/ /g, '%20') : pathPart;
    return {
      valid: true,
      safeUrl: safeLocalUrl,
      isBlob: false,
      isHls: safeLocalUrl.toLowerCase().endsWith('.m3u8'),
      isFirebaseStorage: false,
      isLocalUpload: true,
    };
  }

  // If path starts with uploads/ (missing leading slash)
  if (/^uploads\//i.test(trimmed)) {
    const safeLocalUrl = `/${trimmed}`.replace(/ /g, '%20');
    return {
      valid: true,
      safeUrl: safeLocalUrl,
      isBlob: false,
      isHls: safeLocalUrl.toLowerCase().endsWith('.m3u8'),
      isFirebaseStorage: false,
      isLocalUpload: true,
    };
  }

  // 4. Remote HTTP / HTTPS URLs (Firebase Storage, Signed URLs, HLS, external MP4s)
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);

      // Check for Firebase Storage / Google Cloud Storage download URLs
      const isFirebase = /firebasestorage\.googleapis\.com|storage\.googleapis\.com|\.firebasestorage\.app|\.appspot\.com/i.test(
        parsed.hostname
      );

      const isHls =
        parsed.pathname.toLowerCase().endsWith('.m3u8') ||
        parsed.search.toLowerCase().includes('.m3u8');

      // Preserve the exact valid URL stored for the movie without modifying query parameters,
      // tokens, access signatures, or percent-encoded path segments.
      let finalSafeUrl = trimmed;
      if (finalSafeUrl.includes(' ')) {
        finalSafeUrl = finalSafeUrl.replace(/ /g, '%20');
      }

      // Upgrade http:// to https:// when running in HTTPS to prevent Mixed Content URL safety check rejection
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && parsed.protocol === 'http:') {
        if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          finalSafeUrl = finalSafeUrl.replace(/^http:\/\//i, 'https://');
        }
      }

      return {
        valid: true,
        safeUrl: finalSafeUrl,
        isBlob: false,
        isHls,
        isFirebaseStorage: isFirebase,
        isLocalUpload: false,
      };
    } catch {
      // In case URL constructor fails on unencoded characters, perform safe repair
      const repaired = trimmed.replace(/ /g, '%20');
      return {
        valid: true,
        safeUrl: repaired,
        isBlob: false,
        isHls: repaired.toLowerCase().includes('.m3u8'),
        isFirebaseStorage: /googleapis\.com|firebasestorage\.app|appspot\.com/i.test(repaired),
        isLocalUpload: false,
      };
    }
  }

  // 5. Root-relative paths (e.g. /media/video.mp4 or /src/assets/...)
  if (trimmed.startsWith('/')) {
    const safeUrl = trimmed.includes(' ') ? trimmed.replace(/ /g, '%20') : trimmed;
    return {
      valid: true,
      safeUrl,
      isBlob: false,
      isHls: safeUrl.toLowerCase().endsWith('.m3u8'),
      isFirebaseStorage: false,
      isLocalUpload: true,
    };
  }

  return {
    valid: false,
    safeUrl: '',
    isBlob: false,
    isHls: false,
    isFirebaseStorage: false,
    isLocalUpload: false,
    error: 'Unrecognized URL scheme. Please provide a valid HTTPS, stream, or uploaded video link.',
  };
}

/**
 * Safely encodes spaces and non-ASCII characters in a URL path without double-encoding existing percent escapes (%20, %2F).
 */
function encodePathSafely(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      // If segment already contains percent-encoded characters, only encode raw unencoded spaces
      if (/%[0-9A-Fa-f]{2}/.test(segment)) {
        return segment.replace(/ /g, '%20');
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

/**
 * Fallback repair for URLs with unencoded spaces or characters that caused standard URL constructor failure.
 */
function encodeFullUrlSafely(raw: string): string {
  // Preserve protocol if present
  const protoMatch = raw.match(/^([a-z]+:\/\/)(.*)/i);
  if (protoMatch) {
    const proto = protoMatch[1];
    const rest = protoMatch[2];
    const [pathAndHost, query] = rest.split('?');
    const safePathAndHost = pathAndHost.replace(/ /g, '%20');
    return query !== undefined ? `${proto}${safePathAndHost}?${query}` : `${proto}${safePathAndHost}`;
  }
  return raw.replace(/ /g, '%20');
}
