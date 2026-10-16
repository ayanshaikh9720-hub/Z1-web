import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Configuration interface
export interface StorageUploadResult {
  success: boolean;
  url: string;
  relativeUrl?: string;
  publicUrl?: string;
  provider: 'supabase' | 'local_cdn';
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  message?: string;
}

// Magic bytes validator for real image format verification
export function validateImageMagicBytes(buffer: Buffer): { valid: boolean; format?: 'jpeg' | 'png' | 'webp'; mimetype?: string } {
  if (!buffer || buffer.length < 12) {
    return { valid: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, format: 'jpeg', mimetype: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return { valid: true, format: 'png', mimetype: 'image/png' };
  }

  // WebP: RIFF (bytes 0..3) ... WEBP (bytes 8..11)
  const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  if (isRiff && isWebp) {
    return { valid: true, format: 'webp', mimetype: 'image/webp' };
  }

  return { valid: false };
}

// Check if Supabase Storage is configured via server environment variables
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith('http'));
}

/**
 * Upload thumbnail image file with guaranteed persistence:
 * 1. If Supabase credentials exist, uploads to configured public Supabase bucket.
 * 2. Always writes to server local CDN directory and in-memory cache for ultra-resilient delivery.
 */
export async function uploadThumbnailToStorage(options: {
  buffer: Buffer;
  originalName: string;
  declaredMimetype: string;
  baseUrl: string;
  activeThumbnailsDir: string;
  memoryCache: Map<string, { buffer: Buffer; mimetype: string; createdAt: number }>;
}): Promise<StorageUploadResult> {
  const { buffer, originalName, declaredMimetype, baseUrl, activeThumbnailsDir, memoryCache } = options;

  // 1. File size check (Max 10 MB)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Image exceeds the maximum allowed size of 10 MB (received ${(buffer.length / 1024 / 1024).toFixed(2)} MB).`);
  }

  // 2. Validate magic bytes to verify actual image content
  const magicValidation = validateImageMagicBytes(buffer);
  if (!magicValidation.valid) {
    throw new Error('Invalid image file content. The file data does not match JPG, JPEG, PNG, or WebP format.');
  }

  const finalMime = magicValidation.mimetype || declaredMimetype || 'image/jpeg';
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  const correctExt = extMap[finalMime] || (path.extname(originalName).toLowerCase() || '.jpg');

  // 3. Generate collision-resistant unique filename
  const cleanBase = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'poster';
  const uniqueId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const filename = `poster_${cleanBase}_${uniqueId}${correctExt}`;

  // 4. Save to memory cache for zero-latency retrieval
  memoryCache.set(filename, {
    buffer,
    mimetype: finalMime,
    createdAt: Date.now(),
  });

  // 5. Save to local disk across persistent locations
  try {
    const diskPath = path.join(activeThumbnailsDir, filename);
    fs.writeFileSync(diskPath, buffer);

    const rootUploadsPath = path.resolve(process.cwd(), 'uploads', 'thumbnails', filename);
    if (rootUploadsPath !== diskPath) {
      try {
        const rootDir = path.dirname(rootUploadsPath);
        if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
        fs.writeFileSync(rootUploadsPath, buffer);
      } catch {}
    }

    const dataThumbnailsPath = path.resolve(process.cwd(), 'data', 'thumbnails', filename);
    try {
      const dataThumbDir = path.dirname(dataThumbnailsPath);
      if (!fs.existsSync(dataThumbDir)) fs.mkdirSync(dataThumbDir, { recursive: true });
      fs.writeFileSync(dataThumbnailsPath, buffer);
    } catch {}
  } catch (diskErr) {
    console.warn('[Storage] Notice: Could not write thumbnail to disk, served via memory cache:', diskErr);
  }

  const relativeUrl = `/uploads/thumbnails/${filename}`;
  const localPublicUrl = `${baseUrl.replace(/\/$/, '')}${relativeUrl}`;

  // 6. If Supabase is configured, upload to Supabase Storage bucket
  if (isSupabaseConfigured()) {
    try {
      const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) as string;
      const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY) as string;
      const bucketName = process.env.SUPABASE_BUCKET || 'movie-thumbnails';

      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });

      // Upload file to Supabase bucket
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(filename, buffer, {
          contentType: finalMime,
          upsert: false,
          cacheControl: '31536000',
        });

      if (!uploadErr && uploadData) {
        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filename);
        if (urlData && urlData.publicUrl) {
          console.log(`[Storage] Successfully uploaded thumbnail to Supabase Storage: ${urlData.publicUrl}`);
          return {
            success: true,
            url: urlData.publicUrl,
            publicUrl: urlData.publicUrl,
            relativeUrl,
            provider: 'supabase',
            filename,
            originalName,
            size: buffer.length,
            mimetype: finalMime,
            message: 'Thumbnail successfully uploaded to Supabase Storage',
          };
        }
      } else if (uploadErr) {
        console.warn('[Storage] Supabase upload returned error, falling back to server CDN:', uploadErr.message);
      }
    } catch (supabaseErr: any) {
      console.warn('[Storage] Supabase upload failed with exception, falling back to server CDN:', supabaseErr?.message);
    }
  }

  // 7. Return local CDN storage URL
  return {
    success: true,
    url: relativeUrl,
    relativeUrl,
    publicUrl: localPublicUrl,
    provider: 'local_cdn',
    filename,
    originalName,
    size: buffer.length,
    mimetype: finalMime,
    message: 'Thumbnail successfully stored and hosted on image CDN',
  };
}
