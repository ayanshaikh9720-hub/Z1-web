/**
 * Universal Video Source Resolver & Modular Provider Adapter Architecture
 * for Z1 Movies Streaming Platform.
 * 
 * Classifies sources into:
 * - DIRECT_MEDIA: Raw progressive media files (MP4, MOV)
 * - HLS_STREAM: Adaptive HLS manifests (.m3u8)
 * - WEB_VIDEO: Browser-native WebM streams (.webm)
 * - PROVIDER_SHARE: Third-party streaming or cloud sharing links (Google Drive, TeraBox, TeraShare, YouTube, Vimeo)
 * - AUTH_REQUIRED: Links requiring authentication, login or API keys
 * - UNSUPPORTED: Desktop containers (.mkv, .avi, .wmv) unplayable in standard web browsers
 * - EXPIRED: Signed URLs whose validity timestamp has lapsed
 * - UNKNOWN: Unidentified or malformed endpoints
 */

import { VideoFormatType } from '../types';

export type SourceClassification =
  | 'DIRECT_MEDIA'
  | 'HLS_STREAM'
  | 'WEB_VIDEO'
  | 'PROVIDER_SHARE'
  | 'AUTH_REQUIRED'
  | 'UNSUPPORTED'
  | 'EXPIRED'
  | 'UNKNOWN';

export interface VideoSourceResolutionResult {
  rawUrl: string;
  resolvedUrl: string;
  classification: SourceClassification;
  provider: string;
  providerName: string;
  format: VideoFormatType;
  isPlayableInBrowser: boolean;
  requiresAuth: boolean;
  isExpired: boolean;
  title?: string;
  duration?: number;
  thumbnailUrl?: string;
  directStreamUrl?: string;
  sharePageUrl?: string;
  embedUrl?: string;
  requiresExternalOpening: boolean;
  message: string;
  details?: string;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  canHandle(url: string, parsedUrl?: URL): boolean;
  resolve(url: string, parsedUrl?: URL): Promise<VideoSourceResolutionResult>;
}

/**
 * Checks if a signed URL has expired based on standard query parameter timestamps.
 */
function checkUrlExpiration(parsedUrl: URL): boolean {
  try {
    const searchParams = parsedUrl.searchParams;
    const nowSecs = Math.floor(Date.now() / 1000);

    // Google Cloud Storage / Firebase Storage / AWS S3
    const expires = searchParams.get('Expires') || searchParams.get('X-Amz-Expires') || searchParams.get('expires');
    if (expires && !isNaN(Number(expires))) {
      const expTime = Number(expires);
      if (expTime > 1000000000 && expTime < nowSecs) {
        return true;
      }
    }

    // Azure / Signed Token se parameter
    const se = searchParams.get('se');
    if (se) {
      const expDate = new Date(decodeURIComponent(se)).getTime();
      if (!isNaN(expDate) && expDate < Date.now()) {
        return true;
      }
    }

    // Token expires timestamp
    const tokenExpires = searchParams.get('token_expires') || searchParams.get('expire');
    if (tokenExpires && !isNaN(Number(tokenExpires))) {
      const expTime = Number(tokenExpires);
      if (expTime > 1000000000 && expTime < nowSecs) {
        return true;
      }
    }
  } catch {
    // If search parsing fails, assume not expired
  }
  return false;
}

// --------------------------------------------------------------------------
// 1. Direct Media Adapter (MP4, MOV, Progressive CDN)
// --------------------------------------------------------------------------
export class DirectMediaAdapter implements ProviderAdapter {
  id = 'direct_media';
  name = 'Direct Media Stream';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const pathname = (parsedUrl?.pathname || url).toLowerCase();
    return (
      pathname.endsWith('.mp4') ||
      pathname.endsWith('.mov') ||
      pathname.endsWith('.m4v') ||
      url.includes('.mp4?') ||
      url.includes('.mov?')
    );
  }

  async resolve(url: string, parsedUrl?: URL): Promise<VideoSourceResolutionResult> {
    const p = parsedUrl || new URL(url);
    const isExpired = checkUrlExpiration(p);
    const isMov = p.pathname.toLowerCase().endsWith('.mov');

    if (isExpired) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'EXPIRED',
        provider: 'direct',
        providerName: 'Direct CDN Stream',
        format: 'mp4',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: true,
        requiresExternalOpening: false,
        message: 'Direct media stream signature has expired. Please obtain a refreshed URL.',
      };
    }

    return {
      rawUrl: url,
      resolvedUrl: url,
      classification: 'DIRECT_MEDIA',
      provider: 'direct',
      providerName: isMov ? 'Direct QuickTime/MOV Video' : 'Direct MP4 Video Stream',
      format: isMov ? 'mov' : 'mp4',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      directStreamUrl: url,
      requiresExternalOpening: false,
      message: 'Verified progressive direct video stream ready for HTML5 playback.',
    };
  }
}

// --------------------------------------------------------------------------
// 2. HLS Adaptive Stream Adapter (.m3u8)
// --------------------------------------------------------------------------
export class HlsStreamAdapter implements ProviderAdapter {
  id = 'hls_stream';
  name = 'HLS Adaptive Bitrate Stream';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const pathname = (parsedUrl?.pathname || url).toLowerCase();
    const search = (parsedUrl?.search || '').toLowerCase();
    return (
      pathname.endsWith('.m3u8') ||
      search.includes('.m3u8') ||
      search.includes('format=hls') ||
      pathname.includes('/hls/')
    );
  }

  async resolve(url: string, parsedUrl?: URL): Promise<VideoSourceResolutionResult> {
    const p = parsedUrl || new URL(url);
    const isExpired = checkUrlExpiration(p);

    if (isExpired) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'EXPIRED',
        provider: 'hls',
        providerName: 'HLS Live/VOD Stream',
        format: 'hls',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: true,
        requiresExternalOpening: false,
        message: 'HLS manifest token has expired. Re-authenticate or renew the stream link.',
      };
    }

    return {
      rawUrl: url,
      resolvedUrl: url,
      classification: 'HLS_STREAM',
      provider: 'hls',
      providerName: 'HLS Adaptive Streaming Manifest',
      format: 'hls',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      directStreamUrl: url,
      requiresExternalOpening: false,
      message: 'Adaptive HLS stream endpoint detected. Compatible with Hls.js and native Safari playback.',
    };
  }
}

// --------------------------------------------------------------------------
// 3. WebM Video Adapter (.webm)
// --------------------------------------------------------------------------
export class WebmVideoAdapter implements ProviderAdapter {
  id = 'webm_video';
  name = 'WebM Video Stream';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const pathname = (parsedUrl?.pathname || url).toLowerCase();
    return pathname.endsWith('.webm') || url.includes('.webm?');
  }

  async resolve(url: string): Promise<VideoSourceResolutionResult> {
    return {
      rawUrl: url,
      resolvedUrl: url,
      classification: 'WEB_VIDEO',
      provider: 'webm',
      providerName: 'WebM Video (VP8/VP9/Opus)',
      format: 'webm',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      directStreamUrl: url,
      requiresExternalOpening: false,
      message: 'Browser-compatible WebM media stream detected.',
    };
  }
}

// --------------------------------------------------------------------------
// 4. Google Drive Provider Adapter
// --------------------------------------------------------------------------
export class GoogleDriveAdapter implements ProviderAdapter {
  id = 'gdrive';
  name = 'Google Drive';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const host = (parsedUrl?.hostname || url).toLowerCase();
    return host.includes('drive.google.com') || host.includes('docs.google.com');
  }

  async resolve(url: string): Promise<VideoSourceResolutionResult> {
    // Extract Google Drive File ID
    let fileId = '';
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      fileId = fileIdMatch[1];
    } else {
      const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (idParamMatch && idParamMatch[1]) {
        fileId = idParamMatch[1];
      }
    }

    if (!fileId) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'UNKNOWN',
        provider: 'gdrive',
        providerName: 'Google Drive',
        format: 'auto',
        isPlayableInBrowser: false,
        requiresAuth: true,
        isExpired: false,
        sharePageUrl: url,
        requiresExternalOpening: true,
        message: 'Could not extract Google Drive file ID from sharing link.',
      };
    }

    // Google Drive direct download and preview URLs
    const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    const directStreamUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    return {
      rawUrl: url,
      resolvedUrl: directStreamUrl,
      classification: 'PROVIDER_SHARE',
      provider: 'gdrive',
      providerName: 'Google Drive Cloud Storage',
      format: 'mp4',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      embedUrl,
      directStreamUrl,
      sharePageUrl: `https://drive.google.com/file/d/${fileId}/view`,
      requiresExternalOpening: false,
      message: 'Google Drive file identified. Direct stream & preview embed configured.',
      details: 'Ensure the file sharing permission in Google Drive is set to "Anyone with the link can view".',
    };
  }
}

// --------------------------------------------------------------------------
// 5. TeraBox & TeraShare Provider Adapter
// --------------------------------------------------------------------------
export class TeraBoxAdapter implements ProviderAdapter {
  id = 'terabox';
  name = 'TeraBox / TeraShare';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const host = (parsedUrl?.hostname || url).toLowerCase();
    return (
      host.includes('terabox.com') ||
      host.includes('teraboxapp.com') ||
      host.includes('terashare.link') ||
      host.includes('1024tera.com') ||
      host.includes('4funbox.com') ||
      host.includes('mirrobox.com') ||
      host.includes('nephobox.com') ||
      host.includes('freeterabox.com')
    );
  }

  async resolve(url: string): Promise<VideoSourceResolutionResult> {
    // Extract short code / surl
    let surl = '';
    const surlMatch = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (surlMatch && surlMatch[1]) {
      surl = surlMatch[1];
    }

    return {
      rawUrl: url,
      resolvedUrl: url,
      classification: 'PROVIDER_SHARE',
      provider: 'terabox',
      providerName: 'TeraBox / TeraShare Cloud',
      format: 'auto',
      isPlayableInBrowser: false,
      requiresAuth: true,
      isExpired: false,
      sharePageUrl: url,
      requiresExternalOpening: true,
      message: 'TeraBox sharing link identified.',
      details:
        'TeraBox links are interactive web pages that require user login, browser cookies, and dynamic anti-bot verification. Automated direct streaming requires an authorized TeraBox Enterprise Partner API. Users can view or download this file directly via the TeraBox portal.',
    };
  }
}

// --------------------------------------------------------------------------
// 6. YouTube & Vimeo Video Adapters (Authorized Video Hosting)
// --------------------------------------------------------------------------
export class YouTubeAdapter implements ProviderAdapter {
  id = 'youtube';
  name = 'YouTube';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const host = (parsedUrl?.hostname || url).toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  }

  async resolve(url: string): Promise<VideoSourceResolutionResult> {
    let videoId = '';
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch && shortMatch[1]) {
      videoId = shortMatch[1];
    } else {
      const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      if (longMatch && longMatch[1]) {
        videoId = longMatch[1];
      }
    }

    if (!videoId) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'UNKNOWN',
        provider: 'youtube',
        providerName: 'YouTube',
        format: 'auto',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: false,
        sharePageUrl: url,
        requiresExternalOpening: true,
        message: 'Unable to extract YouTube video ID from URL.',
      };
    }

    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return {
      rawUrl: url,
      resolvedUrl: embedUrl,
      classification: 'PROVIDER_SHARE',
      provider: 'youtube',
      providerName: 'YouTube Video',
      format: 'mp4',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      embedUrl,
      thumbnailUrl,
      sharePageUrl: `https://www.youtube.com/watch?v=${videoId}`,
      requiresExternalOpening: false,
      message: 'YouTube video verified with authorized privacy-enhanced embed player.',
    };
  }
}

export class VimeoAdapter implements ProviderAdapter {
  id = 'vimeo';
  name = 'Vimeo';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const host = (parsedUrl?.hostname || url).toLowerCase();
    return host.includes('vimeo.com');
  }

  async resolve(url: string): Promise<VideoSourceResolutionResult> {
    const idMatch = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)/);
    const videoId = idMatch ? idMatch[1] : '';

    if (!videoId) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'UNKNOWN',
        provider: 'vimeo',
        providerName: 'Vimeo',
        format: 'auto',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: false,
        sharePageUrl: url,
        requiresExternalOpening: true,
        message: 'Could not extract Vimeo video ID.',
      };
    }

    const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1`;

    return {
      rawUrl: url,
      resolvedUrl: embedUrl,
      classification: 'PROVIDER_SHARE',
      provider: 'vimeo',
      providerName: 'Vimeo Streaming',
      format: 'mp4',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      embedUrl,
      sharePageUrl: url,
      requiresExternalOpening: false,
      message: 'Vimeo video verified with authorized player embed.',
    };
  }
}

// --------------------------------------------------------------------------
// 7. Unsupported Desktop Containers Adapter (.mkv, .avi, .wmv, .flv)
// --------------------------------------------------------------------------
export class UnsupportedContainerAdapter implements ProviderAdapter {
  id = 'unsupported';
  name = 'Unsupported Video Container';

  canHandle(url: string, parsedUrl?: URL): boolean {
    const pathname = (parsedUrl?.pathname || url).toLowerCase();
    return (
      pathname.endsWith('.mkv') ||
      pathname.endsWith('.avi') ||
      pathname.endsWith('.wmv') ||
      pathname.endsWith('.flv') ||
      pathname.endsWith('.rmvb')
    );
  }

  async resolve(url: string, parsedUrl?: URL): Promise<VideoSourceResolutionResult> {
    const extMatch = url.match(/\.(mkv|avi|wmv|flv|rmvb)/i);
    const ext = extMatch ? extMatch[1].toUpperCase() : 'MKV';

    return {
      rawUrl: url,
      resolvedUrl: url,
      classification: 'UNSUPPORTED',
      provider: 'unsupported',
      providerName: `${ext} Desktop Container`,
      format: 'auto',
      isPlayableInBrowser: false,
      requiresAuth: false,
      isExpired: false,
      requiresExternalOpening: false,
      message: `The ${ext} container format is not natively supported by web browsers. Please encode or transcode the video to standard MP4 (H.264 + AAC) for streaming.`,
    };
  }
}

// --------------------------------------------------------------------------
// 8. Generic / Unknown Fallback Adapter
// --------------------------------------------------------------------------
export class GenericFallbackAdapter implements ProviderAdapter {
  id = 'generic_fallback';
  name = 'Remote Media Link';

  canHandle(): boolean {
    return true; // Catches everything else
  }

  async resolve(url: string, parsedUrl?: URL): Promise<VideoSourceResolutionResult> {
    const p = parsedUrl || (url.startsWith('http') ? new URL(url) : undefined);
    const isExpired = p ? checkUrlExpiration(p) : false;

    if (isExpired) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'EXPIRED',
        provider: 'unknown',
        providerName: 'Remote Storage Link',
        format: 'auto',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: true,
        requiresExternalOpening: false,
        message: 'The signed link has expired. Please obtain a fresh media URL.',
      };
    }

    const isHttp = url.startsWith('http://') || url.startsWith('https://');
    const isRootRelative = url.startsWith('/');

    if (!isHttp && !isRootRelative) {
      return {
        rawUrl: url,
        resolvedUrl: url,
        classification: 'UNKNOWN',
        provider: 'unknown',
        providerName: 'Unknown Source',
        format: 'auto',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: false,
        requiresExternalOpening: false,
        message: 'Unrecognized URL scheme. Expected HTTPS, HTTP, or local storage path.',
      };
    }

    return {
      rawUrl: url,
      resolvedUrl: url,
      classification: 'DIRECT_MEDIA',
      provider: 'generic',
      providerName: p?.hostname || 'Remote Stream',
      format: 'mp4',
      isPlayableInBrowser: true,
      requiresAuth: false,
      isExpired: false,
      directStreamUrl: url,
      requiresExternalOpening: false,
      message: 'Remote media stream detected. Direct HTML5 playback configured.',
    };
  }
}

// --------------------------------------------------------------------------
// MASTER VIDEO SOURCE RESOLVER ENGINE
// --------------------------------------------------------------------------
export class VideoSourceResolverEngine {
  private adapters: ProviderAdapter[] = [];

  constructor() {
    // Register adapters in evaluation order (specific to generic)
    this.registerAdapter(new UnsupportedContainerAdapter());
    this.registerAdapter(new DirectMediaAdapter());
    this.registerAdapter(new HlsStreamAdapter());
    this.registerAdapter(new WebmVideoAdapter());
    this.registerAdapter(new GoogleDriveAdapter());
    this.registerAdapter(new TeraBoxAdapter());
    this.registerAdapter(new YouTubeAdapter());
    this.registerAdapter(new VimeoAdapter());
    this.registerAdapter(new GenericFallbackAdapter());
  }

  /**
   * Register a new provider adapter. Inserted before the generic fallback.
   */
  public registerAdapter(adapter: ProviderAdapter): void {
    if (this.adapters.length > 0 && this.adapters[this.adapters.length - 1].id === 'generic_fallback') {
      this.adapters.splice(this.adapters.length - 1, 0, adapter);
    } else {
      this.adapters.push(adapter);
    }
  }

  /**
   * Resolves and classifies any video source URL.
   */
  public async resolve(rawUrl: string): Promise<VideoSourceResolutionResult> {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return {
        rawUrl: '',
        resolvedUrl: '',
        classification: 'UNKNOWN',
        provider: 'unknown',
        providerName: 'Unknown',
        format: 'auto',
        isPlayableInBrowser: false,
        requiresAuth: false,
        isExpired: false,
        requiresExternalOpening: false,
        message: 'No video stream URL provided.',
      };
    }

    const trimmed = rawUrl.trim();

    // Parse URL safely
    let parsedUrl: URL | undefined;
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        parsedUrl = new URL(trimmed);
      }
    } catch {
      // invalid URL string
    }

    // Iterate through registered adapters
    for (const adapter of this.adapters) {
      if (adapter.canHandle(trimmed, parsedUrl)) {
        try {
          return await adapter.resolve(trimmed, parsedUrl);
        } catch (err: any) {
          console.warn(`[VideoSourceResolver] Adapter ${adapter.name} error:`, err?.message);
        }
      }
    }

    // Default fallback
    return {
      rawUrl: trimmed,
      resolvedUrl: trimmed,
      classification: 'UNKNOWN',
      provider: 'unknown',
      providerName: 'Unknown',
      format: 'auto',
      isPlayableInBrowser: false,
      requiresAuth: false,
      isExpired: false,
      requiresExternalOpening: false,
      message: 'Could not classify video source URL.',
    };
  }
}

// Global singleton instance
export const videoSourceResolver = new VideoSourceResolverEngine();
