/**
 * Known direct CDN images for commonly linked IMDb titles to prevent mediaviewer HTML page breakages
 */
const KNOWN_IMDB_CDN_MAP: Record<string, string> = {
  tt32474264: 'https://m.media-amazon.com/images/M/MV5BM2Q3NzY4MGQtYzMwMy00YTg2LWI1MGItYjU4ODI5YTNhYmFlXkEyXkFqcGc@._V1_.jpg',
};

export const DEFAULT_POSTER_FALLBACK = '/images/poster_stellar_voyage_1790644925651.jpg';

/**
 * Normalizes any poster URL to guarantee it renders as a valid image:
 * 1. Resolves IMDb mediaviewer webpage links (which return HTML and fail in <img>) to real Amazon CDN image URLs.
 * 2. Normalizes foreign domain uploads (e.g. ais-dev-.../uploads/thumbnails) to root-relative paths (/uploads/thumbnails/...)
 *    so they never get blocked by cross-origin cookie checks.
 * 3. Normalizes legacy /src/assets/images/ paths to public /images/ paths for production build compatibility.
 * 4. Preserves valid HTTPS image URLs and local asset paths.
 */
export function normalizePosterUrl(url?: string | null, title?: string): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return DEFAULT_POSTER_FALLBACK;
  }

  const clean = url.trim();

  // 1. Check for specific title "Korean kanakaraju" or IMDb ID tt32474264
  if (clean.includes('tt32474264') || (title && title.toLowerCase().includes('kanakaraju'))) {
    return KNOWN_IMDB_CDN_MAP.tt32474264;
  }

  // 2. Check for generic IMDb mediaviewer URL (e.g. imdb.com/title/ttXXXXXXX/mediaviewer/...)
  const imdbMatch = clean.match(/\/title\/(tt\d+)/i);
  if (imdbMatch && imdbMatch[1]) {
    const imdbId = imdbMatch[1].toLowerCase();
    if (KNOWN_IMDB_CDN_MAP[imdbId]) {
      return KNOWN_IMDB_CDN_MAP[imdbId];
    }
  }

  // 3. Normalize legacy source asset paths /src/assets/images/ -> /images/
  if (clean.includes('/src/assets/images/')) {
    return clean.replace(/.*\/src\/assets\/images\//, '/images/');
  }

  // 4. Normalize foreign domain uploaded thumbnail URLs to root-relative paths
  // E.g. https://ais-dev-.../uploads/thumbnails/poster.jpg -> /uploads/thumbnails/poster.jpg
  if (clean.includes('/uploads/thumbnails/')) {
    const idx = clean.indexOf('/uploads/thumbnails/');
    return clean.slice(idx);
  }

  // 5. Normalize foreign domain uploaded video URLs to root-relative paths
  if (clean.includes('/uploads/') && !clean.startsWith('/uploads/')) {
    const idx = clean.indexOf('/uploads/');
    return clean.slice(idx);
  }

  // 6. If it's an IMDb mediaviewer webpage link without known mapping, use fallback
  if (clean.includes('imdb.com/title/') && clean.includes('mediaviewer')) {
    return DEFAULT_POSTER_FALLBACK;
  }

  return clean;
}

/**
 * Utility for handling, resizing and optimizing thumbnail poster images.
 * Keeps thumbnail data compact and universally compatible for storage.
 */
export function processThumbnailFile(file: File, maxWidth = 900, maxHeight = 1350): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
      reject(new Error('Please select an image file (JPG, PNG, WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-quality JPEG
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve(dataUrl);
        } catch {
          resolve(event.target?.result as string);
        }
      };

      img.onerror = () => {
        reject(new Error('Unable to read thumbnail image data.'));
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the selected file.'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Automatically optimizes/compresses large image files (e.g. 10MB+ phone camera uploads)
 * into a lightweight Web-compatible File under 1MB.
 */
export async function optimizeImageFile(file: File): Promise<File> {
  // If file is already small (under 1.5MB) and valid format, no compression needed
  if (file.size <= 1.5 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp' || file.type === 'image/png')) {
    return file;
  }

  try {
    const dataUrl = await processThumbnailFile(file, 900, 1350);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const cleanName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], cleanName, { type: 'image/jpeg' });
  } catch {
    // If canvas optimization fails, return original file
    return file;
  }
}

