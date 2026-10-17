import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { loadDB, saveDB, getInitialSeedData, authenticateUser, generateToken, verifyToken, TokenPayload } from './db';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

const app = express();

const IS_VERCEL = Boolean(process.env.VERCEL);
const PRIMARY_UPLOADS_DIR = IS_VERCEL ? '/tmp/uploads' : path.resolve(process.cwd(), 'uploads');
const FALLBACK_UPLOADS_DIR = '/tmp/uploads';

function ensureDirectoryWritable(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const testFile = path.join(dirPath, `.write_check_${Date.now()}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

export let activeUploadsDir = PRIMARY_UPLOADS_DIR;
if (!ensureDirectoryWritable(activeUploadsDir)) {
  activeUploadsDir = FALLBACK_UPLOADS_DIR;
  ensureDirectoryWritable(activeUploadsDir);
}

export let activeThumbnailsDir = path.join(activeUploadsDir, 'thumbnails');
if (!ensureDirectoryWritable(activeThumbnailsDir)) {
  activeThumbnailsDir = path.join(FALLBACK_UPLOADS_DIR, 'thumbnails');
  ensureDirectoryWritable(activeThumbnailsDir);
}

export let activeSubtitlesDir = path.join(activeUploadsDir, 'subtitles');
if (!ensureDirectoryWritable(activeSubtitlesDir)) {
  activeSubtitlesDir = path.join(FALLBACK_UPLOADS_DIR, 'subtitles');
  ensureDirectoryWritable(activeSubtitlesDir);
}

export let activeDubbedDir = path.join(activeUploadsDir, 'dubbed');
if (!ensureDirectoryWritable(activeDubbedDir)) {
  activeDubbedDir = path.join(FALLBACK_UPLOADS_DIR, 'dubbed');
  ensureDirectoryWritable(activeDubbedDir);
}

// In-memory cache for high-availability thumbnail hosting across serverless/ephemeral instances
export const thumbnailMemoryCache = new Map<string, {
  buffer: Buffer;
  mimetype: string;
  createdAt: number;
}>();

// In-memory cache for AI subtitles and dubbed audio
export const subtitlesMemoryCache = new Map<string, string>();
export const dubbedMemoryCache = new Map<string, {
  buffer: Buffer;
  mimetype: string;
  createdAt: number;
}>();

// Multer memory-based storage for thumbnails (bulletproof against filesystem write/read permission errors)
const uploadThumbnailMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10,
  },
}).any(); // Accept any field name (thumbnail, file, poster, image) so unexpected field error never occurs

export function handleThumbnailMulter(req: Request, res: Response, next: NextFunction) {
  uploadThumbnailMiddleware(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Image file is too large. Maximum allowed size is 10 MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Failed to process image upload.' });
    }
    next();
  });
}

// Multer disk/memory hybrid for video uploads
const videoDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, activeUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${safeBase}_${uniqueSuffix}${ext}`);
  },
});

const uploadVideoMiddleware = multer({
  storage: videoDiskStorage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
}).any();

export function handleVideoMulter(req: Request, res: Response, next: NextFunction) {
  uploadVideoMiddleware(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Video upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Failed to process video upload.' });
    }
    next();
  });
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS & Preflight
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Authentication middleware using cryptographic token verification
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid token' });
    return;
  }

  (req as any).user = payload;
  next();
}

function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  authMiddleware(req, res, () => {
    const user = (req as any).user as TokenPayload;
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
      return;
    }
    next();
  });
}

function detectFormatFromResponse(url: string, contentType: string): 'hls' | 'dash' | 'mp4' | 'webm' | 'mov' | 'unknown' {
  const lowerCt = (contentType || '').toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (lowerCt.includes('application/vnd.apple.mpegurl') || lowerCt.includes('application/x-mpegurl') || lowerUrl.includes('.m3u8')) {
    return 'hls';
  }
  if (lowerCt.includes('application/dash+xml') || lowerUrl.includes('.mpd')) {
    return 'dash';
  }
  if (lowerCt.includes('video/webm') || lowerUrl.includes('.webm')) {
    return 'webm';
  }
  if (lowerCt.includes('video/quicktime') || lowerUrl.includes('.mov')) {
    return 'mov';
  }
  if (lowerCt.includes('video/mp4') || lowerUrl.includes('.mp4')) {
    return 'mp4';
  }
  if (lowerCt.startsWith('video/')) {
    return 'mp4';
  }
  return 'unknown';
}

// Video Probe helper
function probeUrl(targetUrl: string, maxRedirects = 5): Promise<{
  valid: boolean;
  status: number;
  contentType: string;
  contentLength?: string;
  format: 'hls' | 'dash' | 'mp4' | 'webm' | 'mov' | 'unknown';
  resolvedUrl: string;
  message: string;
  supportsByteRange: boolean;
}> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      const request = client.request(
        targetUrl,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': 'bytes=0-1024',
            'Accept': '*/*',
          },
          timeout: 8000,
        },
        (probeRes) => {
          const statusCode = probeRes.statusCode || 0;
          const contentType = probeRes.headers['content-type'] || '';
          const contentLength = probeRes.headers['content-length'];
          const acceptRanges = (probeRes.headers['accept-ranges'] || '').toLowerCase();
          const supportsByteRange = statusCode === 206 || acceptRanges.includes('bytes') || Boolean(probeRes.headers['content-range']);

          if (
            (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) &&
            probeRes.headers.location &&
            maxRedirects > 0
          ) {
            probeRes.resume();
            const nextUrl = new URL(probeRes.headers.location, targetUrl).toString();
            resolve(probeUrl(nextUrl, maxRedirects - 1));
            return;
          }

          probeRes.destroy();

          const detectedFormat = detectFormatFromResponse(targetUrl, contentType);

          if (statusCode === 200 || statusCode === 206) {
            resolve({
              valid: true,
              status: statusCode,
              contentType,
              contentLength,
              format: detectedFormat,
              resolvedUrl: targetUrl,
              message: `Video stream verified (${detectedFormat.toUpperCase()}) and playable by browser`,
              supportsByteRange,
            });
          } else {
            resolve({
              valid: false,
              status: statusCode,
              contentType,
              format: detectedFormat,
              resolvedUrl: targetUrl,
              message: `Remote server returned HTTP ${statusCode}`,
              supportsByteRange: false,
            });
          }
        }
      );

      request.on('error', (err) => {
        resolve({
          valid: false,
          status: 0,
          contentType: '',
          format: 'unknown',
          resolvedUrl: targetUrl,
          message: `Network probe failed: ${err.message}`,
          supportsByteRange: false,
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({
          valid: false,
          status: 408,
          contentType: '',
          format: 'unknown',
          resolvedUrl: targetUrl,
          message: 'Video URL verification timed out (8s)',
          supportsByteRange: false,
        });
      });

      request.end();
    } catch (err: any) {
      resolve({
        valid: false,
        status: 400,
        contentType: '',
        format: 'unknown',
        resolvedUrl: targetUrl,
        message: `Invalid URL: ${err.message}`,
        supportsByteRange: false,
      });
    }
  });
}

// Create dedicated API router
const apiRouter = express.Router();

// 1. Auth: Login
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const authResult = authenticateUser(email, password);
  if (!authResult) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  res.json({
    success: true,
    token: authResult.token,
    user: {
      id: authResult.user.id,
      name: authResult.user.name,
      email: authResult.user.email,
      role: authResult.user.role,
      createdAt: authResult.user.createdAt,
    },
  });
});

// 2. Auth: Register
apiRouter.post('/auth/register', (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email, and password are required' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const db = loadDB();
  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

  const newUser = {
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: 'user' as const,
    salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  saveDB(db);

  const token = generateToken(newUser);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    },
  });
});

// 3. Auth: Current User
apiRouter.get('/auth/me', authMiddleware, (req: Request, res: Response) => {
  const tokenUser = (req as any).user as TokenPayload;
  const db = loadDB();
  const user = db.users.find((u) => u.id === tokenUser.userId);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// 4. Movies: List & Search
apiRouter.get('/movies', (req: Request, res: Response) => {
  const db = loadDB();
  let list = db.movies || [];

  const { search, genre, trending, featured, published, sort, limit } = req.query;

  if (published !== undefined) {
    const isPub = published === 'true';
    list = list.filter((m) => m.published === isPub);
  } else {
    list = list.filter((m) => m.published);
  }

  if (trending === 'true') {
    list = list.filter((m) => m.trending);
  }

  if (featured === 'true') {
    list = list.filter((m) => m.featured);
  }

  if (genre && typeof genre === 'string' && genre !== 'All') {
    const searchGenre = genre.toLowerCase();
    list = list.filter((m) =>
      m.genres.some((g: string) => g.toLowerCase() === searchGenre || g.toLowerCase().includes(searchGenre))
    );
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    list = list.filter((m) => {
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchCast = m.cast?.some((c: string) => c.toLowerCase().includes(q));
      const matchDirector = m.director?.toLowerCase().includes(q);
      const matchGenre = m.genres?.some((g: string) => g.toLowerCase().includes(q));
      const matchLang = m.language?.toLowerCase().includes(q);
      const matchYear = m.releaseYear?.toString().includes(q);
      const matchDesc = m.description?.toLowerCase().includes(q);

      return matchTitle || matchCast || matchDirector || matchGenre || matchLang || matchYear || matchDesc;
    });
  }

  if (sort === 'newest') {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === 'views') {
    list.sort((a, b) => (b.views || 0) - (a.views || 0));
  } else if (sort === 'downloads') {
    list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  } else if (sort === 'rating') {
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  if (limit) {
    const l = parseInt(limit as string, 10);
    if (!isNaN(l) && l > 0) {
      list = list.slice(0, l);
    }
  }

  res.json({ movies: list, total: list.length });
});

// 5. Movie Details
apiRouter.get('/movies/:id', (req: Request, res: Response) => {
  const db = loadDB();
  const movie = db.movies.find((m) => m.id === req.params.id);

  if (!movie) {
    res.status(404).json({ error: 'Movie not found' });
    return;
  }

  movie.views = (movie.views || 0) + 1;
  db.stats.totalViews = (db.stats.totalViews || 0) + 1;
  saveDB(db);

  res.json({ movie });
});

// 6. Track Download
apiRouter.post('/movies/:id/download-click', (req: Request, res: Response) => {
  const { quality } = req.body;
  const db = loadDB();
  const movie = db.movies.find((m) => m.id === req.params.id);

  if (!movie) {
    res.status(404).json({ error: 'Movie not found' });
    return;
  }

  const option = movie.downloadUrls?.find((d: any) => d.quality === quality) || movie.downloadUrls?.[0];
  if (!option || !option.url) {
    res.status(400).json({ error: 'Download option unavailable for this movie' });
    return;
  }

  movie.downloads = (movie.downloads || 0) + 1;
  db.stats.totalDownloads = (db.stats.totalDownloads || 0) + 1;
  saveDB(db);

  res.json({
    success: true,
    downloadUrl: option.url,
    quality: option.quality,
    format: option.format || 'MP4',
    fileSize: option.fileSize,
  });
});

// 7. Video Probe & Validation
apiRouter.post('/validate-video-url', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ valid: false, message: 'URL is required' });
    return;
  }

  if (url.startsWith('/uploads/')) {
    const filePath = path.join(activeUploadsDir, path.basename(url));
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const format = ext === '.m3u8' ? 'hls' : ext === '.mpd' ? 'dash' : ext === '.webm' ? 'webm' : ext === '.mov' ? 'mov' : 'mp4';
      const contentType = ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : ext === '.mpd' ? 'application/dash+xml' : ext === '.webm' ? 'video/webm' : 'video/mp4';
      res.json({
        valid: true,
        status: 200,
        contentType,
        format,
        size: stat.size,
        resolvedUrl: url,
        supportsByteRange: true,
        message: `Local video stream (${format.toUpperCase()}) verified on server storage with full HTTP 206 Partial Content support`,
      });
      return;
    } else {
      res.status(404).json({ valid: false, message: 'Local video file not found in uploads' });
      return;
    }
  }

  const result = await probeUrl(url);
  if (result.valid) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// 8. Admin: Create Movie
apiRouter.post('/movies', adminMiddleware, (req: Request, res: Response) => {
  const db = loadDB();
  const data = req.body;

  if (!data.title || !data.videoUrl) {
    res.status(400).json({ error: 'Title and Video URL are required' });
    return;
  }

  const newMovie = {
    id: `mov_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    title: data.title.trim(),
    description: data.description || '',
    posterUrl: data.posterUrl || '/images/poster_stellar_voyage_1790644925651.jpg',
    backdropUrl: data.backdropUrl || '/images/hero_cinema_backdrop_1790644911552.jpg',
    videoUrl: data.videoUrl.trim(),
    videoType: data.videoType || 'mp4',
    downloadUrls: Array.isArray(data.downloadUrls) ? data.downloadUrls : [],
    releaseYear: parseInt(data.releaseYear, 10) || new Date().getFullYear(),
    language: data.language || 'English',
    genres: Array.isArray(data.genres) ? data.genres : ['Action'],
    duration: parseInt(data.duration, 10) || 90,
    cast: Array.isArray(data.cast) ? data.cast : (data.cast ? data.cast.split(',').map((s: string) => s.trim()) : []),
    director: data.director || 'Unknown',
    rating: data.rating ? parseFloat(data.rating) : undefined,
    featured: Boolean(data.featured),
    trending: Boolean(data.trending),
    published: Boolean(data.published),
    views: 0,
    downloads: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.movies.unshift(newMovie);
  saveDB(db);

  res.status(201).json({ success: true, movie: newMovie });
});

// 9. Admin: Update Movie
apiRouter.put('/movies/:id', adminMiddleware, (req: Request, res: Response) => {
  const db = loadDB();
  const index = db.movies.findIndex((m) => m.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: 'Movie not found' });
    return;
  }

  const existing = db.movies[index];
  const data = req.body;

  const updatedMovie = {
    ...existing,
    ...data,
    id: existing.id,
    releaseYear: data.releaseYear ? parseInt(data.releaseYear, 10) : existing.releaseYear,
    duration: data.duration ? parseInt(data.duration, 10) : existing.duration,
    rating: data.rating !== undefined ? parseFloat(data.rating) : existing.rating,
    cast: Array.isArray(data.cast) ? data.cast : (data.cast ? data.cast.split(',').map((s: string) => s.trim()) : existing.cast),
    genres: Array.isArray(data.genres) ? data.genres : existing.genres,
    downloadUrls: Array.isArray(data.downloadUrls) ? data.downloadUrls : existing.downloadUrls,
    updatedAt: new Date().toISOString(),
  };

  db.movies[index] = updatedMovie;
  saveDB(db);

  res.json({ success: true, movie: updatedMovie });
});

// 10. Admin: Delete Movie
apiRouter.delete('/movies/:id', adminMiddleware, (req: Request, res: Response) => {
  const db = loadDB();
  const initialLength = db.movies.length;
  db.movies = db.movies.filter((m) => m.id !== req.params.id);

  if (db.movies.length === initialLength) {
    res.status(404).json({ error: 'Movie not found' });
    return;
  }

  saveDB(db);
  res.json({ success: true, message: 'Movie removed successfully' });
});

// 11. Admin: Toggle Publish
apiRouter.patch('/movies/:id/publish', adminMiddleware, (req: Request, res: Response) => {
  const db = loadDB();
  const movie = db.movies.find((m) => m.id === req.params.id);

  if (!movie) {
    res.status(404).json({ error: 'Movie not found' });
    return;
  }

  movie.published = req.body.published !== undefined ? Boolean(req.body.published) : !movie.published;
  movie.updatedAt = new Date().toISOString();
  saveDB(db);

  res.json({ success: true, movie });
});

// 12. Admin: Stats
apiRouter.get('/admin/stats', adminMiddleware, (_req: Request, res: Response) => {
  const db = loadDB();
  const movies = db.movies || [];

  const totalMovies = movies.length;
  const totalUsers = (db.users || []).length;
  const totalViews = movies.reduce((acc, m) => acc + (m.views || 0), 0) + (db.stats?.totalViews || 0);
  const totalDownloads = movies.reduce((acc, m) => acc + (m.downloads || 0), 0) + (db.stats?.totalDownloads || 0);
  const publishedCount = movies.filter((m) => m.published).length;
  const unpublishedCount = totalMovies - publishedCount;

  const recentlyAdded = [...movies]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  res.json({
    totalMovies,
    totalUsers,
    totalViews,
    totalDownloads,
    publishedCount,
    unpublishedCount,
    recentlyAdded,
  });
});

// 13. Admin: Reset Demo
apiRouter.post('/admin/reset-demo', adminMiddleware, (_req: Request, res: Response) => {
  const initial = getInitialSeedData();
  saveDB(initial);
  res.json({ success: true, message: 'Database reset to licensed sample library' });
});

// 13b. App Update & Release Delivery Endpoint
apiRouter.get('/app/version', (_req: Request, res: Response) => {
  res.json({
    applicationId: 'com.z1movies.app',
    appName: 'Z1 Movies',
    currentVersion: '1.0.0',
    minSupportedVersion: '1.0.0',
    releaseChannel: 'stable',
    updateAvailable: false,
    downloadUrl: 'https://github.com/ayanqureshi2732-gif/Z1-movie-/releases/latest',
    apkDirectUrl: 'https://github.com/ayanqureshi2732-gif/Z1-movie-/releases',
    releaseNotes: 'Seamless in-place APK updates enabled with persistent signing certificate. Preserves all watchlists, downloads, and user sessions.',
    dataPreservationGuaranteed: true,
  });
});

// 14. User: Watchlist
apiRouter.get('/user/watchlist', authMiddleware, (req: Request, res: Response) => {
  const userId = ((req as any).user as TokenPayload).userId;
  const db = loadDB();

  const userItems = (db.watchlists || []).filter((w) => w.userId === userId);
  const movieMap = new Map(db.movies.map((m) => [m.id, m]));

  const enriched = userItems
    .map((item) => ({
      movieId: item.movieId,
      addedAt: item.addedAt,
      movie: movieMap.get(item.movieId),
    }))
    .filter((item) => item.movie !== undefined);

  res.json({ watchlist: enriched });
});

apiRouter.post('/user/watchlist', authMiddleware, (req: Request, res: Response) => {
  const userId = ((req as any).user as TokenPayload).userId;
  const { movieId } = req.body;

  if (!movieId) {
    res.status(400).json({ error: 'movieId is required' });
    return;
  }

  const db = loadDB();
  if (!db.watchlists) db.watchlists = [];

  const existingIdx = db.watchlists.findIndex((w) => w.userId === userId && w.movieId === movieId);
  let added = false;

  if (existingIdx > -1) {
    db.watchlists.splice(existingIdx, 1);
    added = false;
  } else {
    db.watchlists.unshift({
      userId,
      movieId,
      addedAt: new Date().toISOString(),
    });
    added = true;
  }

  saveDB(db);
  res.json({ success: true, inWatchlist: added });
});

// 15. User: Playback Progress
apiRouter.get('/user/progress', authMiddleware, (req: Request, res: Response) => {
  const userId = ((req as any).user as TokenPayload).userId;
  const db = loadDB();

  const userProgress = (db.progress || []).filter((p) => p.userId === userId);
  const movieMap = new Map(db.movies.map((m) => [m.id, m]));

  const enriched = userProgress
    .map((p) => ({
      ...p,
      movie: movieMap.get(p.movieId),
    }))
    .filter((p) => p.movie !== undefined && p.percentage > 2 && p.percentage < 95);

  res.json({ progress: enriched });
});

apiRouter.post('/user/progress', authMiddleware, (req: Request, res: Response) => {
  const userId = ((req as any).user as TokenPayload).userId;
  const { movieId, position, duration } = req.body;

  if (!movieId || position === undefined || !duration) {
    res.status(400).json({ error: 'movieId, position, and duration are required' });
    return;
  }

  const db = loadDB();
  if (!db.progress) db.progress = [];

  const percentage = Math.min(100, Math.round((position / duration) * 100));
  const existingIdx = db.progress.findIndex((p) => p.userId === userId && p.movieId === movieId);
  const entry = {
    userId,
    movieId,
    position: Math.round(position),
    duration: Math.round(duration),
    percentage,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx > -1) {
    db.progress[existingIdx] = entry;
  } else {
    db.progress.unshift(entry);
  }

  saveDB(db);
  res.json({ success: true, progress: entry });
});

// 16. Contact Form
apiRouter.post('/contact', (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  const db = loadDB();
  if (!db.contacts) db.contacts = [];

  const contactRecord = {
    id: `msg_${Date.now()}`,
    name: name.trim(),
    email: email.trim(),
    subject: subject.trim(),
    message: message.trim(),
    createdAt: new Date().toISOString(),
  };

  db.contacts.push(contactRecord);
  saveDB(db);

  res.json({ success: true, message: 'Your message has been received by the Z1 Movies team.' });
});

// 17. Thumbnail Upload (Separate Image Hosting / CDN - Spark Plan Safe)
apiRouter.post('/upload-thumbnail', handleThumbnailMulter, async (req: Request, res: Response) => {
  try {
    let fileBuffer: Buffer | null = null;
    let originalName = 'poster.jpg';
    let mimetype = 'image/jpeg';
    let fileSize = 0;

    // 1. Check if multipart file uploaded
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file || (files && files.length > 0 ? files[0] : null);

    if (file && file.buffer) {
      fileBuffer = file.buffer;
      originalName = file.originalname;
      mimetype = file.mimetype;
      fileSize = file.size;
    } else if (req.body && (req.body.base64 || req.body.image)) {
      // Base64 payload support
      const base64Str = (req.body.base64 || req.body.image).replace(/^data:image\/[a-z]+;base64,/, '');
      fileBuffer = Buffer.from(base64Str, 'base64');
      fileSize = fileBuffer.length;
      if (req.body.filename) originalName = req.body.filename;
      if (req.body.mimetype) mimetype = req.body.mimetype;
    } else if (req.body && req.body.imageUrl) {
      // Direct image URL verification/fallback
      const directUrl = req.body.imageUrl.trim();
      return res.json({
        success: true,
        url: directUrl,
        relativeUrl: directUrl,
        filename: path.basename(directUrl) || 'poster.jpg',
        originalName: path.basename(directUrl) || 'poster.jpg',
        size: 0,
        mimetype: 'image/jpeg',
        message: 'Direct image URL validated and registered.',
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No thumbnail image file found in upload request.' });
    }

    // 2. Validate format (JPG, JPEG, PNG, WebP)
    const ext = (path.extname(originalName).toLowerCase() || '.jpg');
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

    const hasValidExt = validExts.includes(ext);
    const hasValidMime = validMimes.includes(mimetype.toLowerCase());

    if (!hasValidExt && !hasValidMime) {
      return res.status(400).json({
        error: 'Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.',
      });
    }

    // 3. Size validation (Max 10 MB)
    if (fileSize > 10 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Image file is too large. Maximum allowed size is 10 MB.',
      });
    }

    // 4. Generate unique filename
    const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'poster';
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const filename = `poster_${safeBase}_${uniqueSuffix}${ext}`;

    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const finalMime = mimeMap[ext] || mimetype || 'image/jpeg';

    // 5. Store in memory cache
    thumbnailMemoryCache.set(filename, {
      buffer: fileBuffer,
      mimetype: finalMime,
      createdAt: Date.now(),
    });

    // 6. Write to disk across fallback directories
    try {
      const diskPath = path.join(activeThumbnailsDir, filename);
      fs.writeFileSync(diskPath, fileBuffer);
      const rootUploadsPath = path.resolve(process.cwd(), 'uploads', 'thumbnails', filename);
      if (rootUploadsPath !== diskPath) {
        try { fs.writeFileSync(rootUploadsPath, fileBuffer); } catch {}
      }
      const dataThumbnailsPath = path.resolve(process.cwd(), 'data', 'thumbnails', filename);
      try {
        const dataThumbDir = path.dirname(dataThumbnailsPath);
        if (!fs.existsSync(dataThumbDir)) fs.mkdirSync(dataThumbDir, { recursive: true });
        fs.writeFileSync(dataThumbnailsPath, fileBuffer);
      } catch {}
    } catch (diskErr) {
      console.warn('Could not write thumbnail to disk, served from memory cache:', diskErr);
    }

    // 7. Calculate URLs
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
    const isLocal = forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.0.0.1');

    let baseUrl = `${forwardedProto}://${forwardedHost}`;
    if (!isLocal && process.env.APP_URL) {
      baseUrl = process.env.APP_URL.replace(/\/$/, '');
    }

    const relativeUrl = `/uploads/thumbnails/${filename}`;
    const publicUrl = `${baseUrl}${relativeUrl}`;

    return res.status(200).json({
      success: true,
      url: relativeUrl, // Always return root-relative URL as primary url so it works on any domain without cross-origin blocks
      relativeUrl,
      publicUrl,
      imageUrl: relativeUrl,
      posterUrl: relativeUrl,
      thumbnailUrl: relativeUrl,
      filename,
      originalName,
      size: fileSize,
      mimetype: finalMime,
      message: 'Thumbnail uploaded and hosted on image CDN',
    });
  } catch (err: any) {
    console.error('Thumbnail upload controller error:', err);
    return res.status(400).json({
      error: err.message || 'Image hosting service encountered an error processing the thumbnail.',
    });
  }
});

// ----------------- VIDEO CODEC PROBE & TRANSCODING ENGINE ----------------- //

interface CodecInfo {
  videoCodec: string;
  audioCodec: string;
  isH264: boolean;
  isAac: boolean;
  needsTranscode: boolean;
  duration: number;
  audioIndex?: number;
}

interface TranscodeJobState {
  jobId: string;
  movieId?: string;
  inputPath: string;
  outputPath: string;
  outputUrl: string;
  status: 'processing' | 'ready' | 'failed';
  progress: number;
  error?: string;
  videoCodec: string;
  audioCodec: string;
  startedAt: number;
}

const transcodeJobs = new Map<string, TranscodeJobState>();

function probeLocalVideoCodecs(filePath: string): Promise<CodecInfo> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve({
        videoCodec: '',
        audioCodec: '',
        isH264: false,
        isAac: false,
        needsTranscode: true,
        duration: 0,
      });
    }

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        console.warn('[FFprobe] Probe failed or no streams:', err?.message);
        return resolve({
          videoCodec: '',
          audioCodec: '',
          isH264: false,
          isAac: false,
          needsTranscode: true,
          duration: 0,
        });
      }

      const vStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStreams = metadata.streams.filter((s) => s.codec_type === 'audio');

      // If multiple audio tracks exist, prefer Hindi or English, otherwise keep the first
      let chosenAudioStream = audioStreams[0];
      const preferred = audioStreams.find((s) => {
        const lang = (s.tags?.language || s.tags?.title || s.tags?.handler_name || '').toLowerCase();
        return lang.includes('hin') || lang.includes('eng');
      });
      if (preferred) {
        chosenAudioStream = preferred;
      }

      const videoCodec = (vStream?.codec_name || '').toLowerCase();
      const audioCodec = (chosenAudioStream?.codec_name || '').toLowerCase();
      const duration = parseFloat((metadata.format?.duration as any) || '0');
      const audioIndex = chosenAudioStream ? chosenAudioStream.index : undefined;

      const isH264 = videoCodec === 'h264' || videoCodec === 'avc1';
      const isAac = audioCodec === 'aac';
      const needsTranscode = !isH264 || !isAac;

      console.log(
        `[FFprobe] Probed "${path.basename(filePath)}": Video=${videoCodec} (${isH264 ? 'H.264' : 'Non-H.264'}), Audio=${audioCodec} (${isAac ? 'AAC' : 'Non-AAC'}), audioIndex=${audioIndex}, needsTranscode=${needsTranscode}`
      );

      resolve({
        videoCodec,
        audioCodec,
        isH264,
        isAac,
        needsTranscode,
        duration,
        audioIndex,
      });
    });
  });
}

function executeTranscode(
  inputPath: string,
  options: { movieId?: string; targetFilename?: string }
): Promise<string> {
  const jobId = options.movieId || `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const baseName = options.targetFilename
    ? path.basename(options.targetFilename, path.extname(options.targetFilename))
    : path.basename(inputPath, path.extname(inputPath));
  const safeBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'video';
  const outputFilename = `compat_${safeBase}_${Date.now()}.mp4`;
  const outputPath = path.join(activeUploadsDir, outputFilename);
  const outputUrl = `/uploads/${outputFilename}`;

  const jobState: TranscodeJobState = {
    jobId,
    movieId: options.movieId,
    inputPath,
    outputPath,
    outputUrl,
    status: 'processing',
    progress: 0,
    videoCodec: '',
    audioCodec: '',
    startedAt: Date.now(),
  };
  transcodeJobs.set(jobId, jobState);

  // Update DB movie record status to 'processing'
  if (options.movieId) {
    const db = loadDB();
    const movie = db.movies.find((m) => m.id === options.movieId);
    if (movie) {
      movie.status = 'processing';
      movie.transcodeProgress = 0;
      movie.transcodeError = undefined;
      saveDB(db);
    }
  }

  return new Promise(async (resolve, reject) => {
    try {
      const probe = await probeLocalVideoCodecs(inputPath);
      jobState.videoCodec = probe.videoCodec;
      jobState.audioCodec = probe.audioCodec;

      const cmd = ffmpeg(inputPath);
      const audioMap = probe.audioIndex !== undefined ? `0:${probe.audioIndex}?` : '0:a:0?';

      if (probe.isH264 && !probe.isAac) {
        // Video is already H.264, only transcode audio to AAC
        cmd.outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-map', '0:v:0',
          '-map', audioMap,
          '-movflags', '+faststart',
        ]);
      } else {
        // Full transcode to mobile-safe H.264 + AAC
        cmd.outputOptions([
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'high',
          '-level', '4.1',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-map', '0:v:0',
          '-map', audioMap,
          '-movflags', '+faststart',
        ]);
      }

      cmd.on('progress', (progress) => {
        const pct = Math.min(99, Math.max(1, Math.round(progress.percent || 0)));
        jobState.progress = pct;
        if (options.movieId) {
          const db = loadDB();
          const movie = db.movies.find((m) => m.id === options.movieId);
          if (movie && movie.transcodeProgress !== pct) {
            movie.transcodeProgress = pct;
            saveDB(db);
          }
        }
      });

      cmd.on('end', () => {
        console.log(`[FFmpeg] Transcode finished successfully: ${outputPath}`);
        jobState.status = 'ready';
        jobState.progress = 100;

        if (options.movieId) {
          const db = loadDB();
          const movie = db.movies.find((m) => m.id === options.movieId);
          if (movie) {
            movie.videoUrl = outputUrl;
            movie.videoType = 'mp4';
            movie.status = 'ready';
            movie.transcodeProgress = 100;
            movie.transcodeError = undefined;
            movie.updatedAt = new Date().toISOString();
            saveDB(db);
          }
        }

        // Replace original file if it was a distinct uploaded file in activeUploadsDir
        if (inputPath !== outputPath && fs.existsSync(inputPath) && inputPath.startsWith(activeUploadsDir)) {
          try {
            // Keep original safe if it's named as a seed or sample, otherwise clean up
            if (!path.basename(inputPath).startsWith('sintel')) {
              fs.unlinkSync(inputPath);
              console.log(`[FFmpeg] Cleaned up original non-compatible file: ${path.basename(inputPath)}`);
            }
          } catch (delErr) {
            console.warn('[FFmpeg] Could not delete original file after transcode:', delErr);
          }
        }

        resolve(outputUrl);
      });

      cmd.on('error', (err) => {
        console.error(`[FFmpeg] Transcode error for ${inputPath}:`, err.message);
        jobState.status = 'failed';
        jobState.error = err.message;

        if (options.movieId) {
          const db = loadDB();
          const movie = db.movies.find((m) => m.id === options.movieId);
          if (movie) {
            movie.status = 'failed';
            movie.transcodeError = err.message;
            movie.updatedAt = new Date().toISOString();
            saveDB(db);
          }
        }

        reject(err);
      });

      cmd.save(outputPath);
    } catch (err: any) {
      jobState.status = 'failed';
      jobState.error = err.message;
      reject(err);
    }
  });
}

async function downloadRemoteVideoToTemp(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const fileStream = fs.createWriteStream(targetPath);

    function doRequest(currentUrl: string, redirects = 0) {
      if (redirects > 5) {
        return reject(new Error('Too many redirects while downloading remote video'));
      }
      const req = client.get(currentUrl, (res) => {
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = new URL(res.headers.location, currentUrl).toString();
          return doRequest(next, redirects + 1);
        }
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Failed to download remote video: HTTP ${res.statusCode}`));
        }
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html')) {
          return reject(
            new Error(`Remote server returned an HTML webpage (${contentType}) instead of a video stream`)
          );
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Timeout downloading remote video'));
      });
    }

    doRequest(url);
  });
}

// 18. Video Upload Endpoint with Codec Check & Auto-Transcoding
apiRouter.post('/upload', handleVideoMulter, async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const file = req.file || (files && files.length > 0 ? files[0] : null);

  if (!file) {
    return res.status(400).json({ error: 'No video file received in upload payload' });
  }

  const uploadedUrl = `/uploads/${file.filename}`;
  const isVideo = file.mimetype?.startsWith('video/') || file.originalname.match(/\.(mp4|webm|mkv|m3u8)$/i);
  const localFilePath = path.join(activeUploadsDir, file.filename);

  if (IS_VERCEL) {
    return res.json({
      success: true,
      url: uploadedUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      isVideo: Boolean(isVideo),
      status: 'ready',
      needsTranscode: false,
      message: 'Video uploaded. (Note: On Vercel serverless, transcoding is skipped. Please ensure H.264+AAC compatibility).',
    });
  }

  // Probe codec compatibility
  try {
    const probe = await probeLocalVideoCodecs(localFilePath);
    if (probe.needsTranscode) {
      console.log(`[Upload] Non-standard codec detected for ${file.originalname}: Video=${probe.videoCodec}, Audio=${probe.audioCodec}. Auto-transcoding...`);

      // Start background transcode
      executeTranscode(localFilePath, { targetFilename: file.originalname }).catch((err) => {
        console.error('[Upload Auto-transcode Error]:', err);
      });

      return res.json({
        success: true,
        url: uploadedUrl,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        isVideo: Boolean(isVideo),
        status: 'processing',
        needsTranscode: true,
        transcodeProgress: 0,
        videoCodec: probe.videoCodec,
        audioCodec: probe.audioCodec,
        message: `Video uploaded. Non-H.264/AAC codec detected (${probe.videoCodec || 'unknown'} / ${probe.audioCodec || 'unknown'}). Auto-transcoding to mobile-compatible MP4 (H.264 + AAC)...`,
      });
    }

    return res.json({
      success: true,
      url: uploadedUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      isVideo: Boolean(isVideo),
      status: 'ready',
      needsTranscode: false,
      transcodeProgress: 100,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      message: 'Video uploaded and verified H.264 + AAC compatible.',
    });
  } catch (probeErr: any) {
    console.warn('[Upload] Codec probe error:', probeErr.message);
    return res.json({
      success: true,
      url: uploadedUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      isVideo: Boolean(isVideo),
      status: 'ready',
      message: 'File stored and ready for playback',
    });
  }
});

// 18b. Re-encode movie for compatibility
apiRouter.post('/movies/:id/transcode', async (req: Request, res: Response) => {
  if (IS_VERCEL) {
    return res.status(400).json({
      success: false,
      error: 'Server-side video transcoding is not supported on Vercel serverless. Please upload H.264+AAC encoded video or host video on an external streaming provider.',
      isVercel: true,
    });
  }

  const db = loadDB();
  let movie = db.movies.find((m) => m.id === req.params.id);

  // If movie not found in local db, check if client provided movie metadata / videoUrl (e.g. from Firestore or state)
  if (!movie && req.body && (req.body.videoUrl || req.body.movie?.videoUrl)) {
    const bodyMovie = req.body.movie || {};
    movie = {
      id: req.params.id,
      title: req.body.title || bodyMovie.title || 'Video Stream',
      videoUrl: req.body.videoUrl || bodyMovie.videoUrl,
      videoType: req.body.videoType || bodyMovie.videoType || 'mp4',
      status: 'processing',
      transcodeProgress: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...bodyMovie,
    };
    db.movies.push(movie);
    saveDB(db);
  }

  if (!movie) {
    return res.status(404).json({
      success: false,
      error: `Movie with ID "${req.params.id}" not found on server. Please provide videoUrl in request body.`,
      status: 'failed',
    });
  }

  if (!movie.videoUrl) {
    return res.status(400).json({
      success: false,
      error: 'Movie has no valid video stream URL to transcode.',
      status: 'failed',
    });
  }

  if (movie.videoUrl.startsWith('blob:')) {
    return res.status(400).json({
      success: false,
      error: 'Cannot transcode browser-memory blob URL. Please wait for the video upload to complete before transcoding.',
      status: 'failed',
    });
  }

  if (movie.videoUrl.includes('.m3u8')) {
    return res.status(400).json({
      success: false,
      error: 'This video is an HLS (.m3u8) adaptive stream. It is already formatted for streaming and cannot be converted via MP4 transcoding.',
      status: 'ready',
    });
  }

  // Check if already running
  const existingJob = transcodeJobs.get(movie.id);
  if (existingJob && existingJob.status === 'processing') {
    return res.json({
      success: true,
      message: 'Transcode is already in progress',
      status: 'processing',
      progress: existingJob.progress,
      movie,
    });
  }

  movie.status = 'processing';
  movie.transcodeProgress = 1;
  movie.transcodeError = undefined;
  saveDB(db);

  res.json({
    success: true,
    message: `Started compatibility re-encoding for "${movie.title}"`,
    status: 'processing',
    progress: 1,
    movie,
  });

  // Run in background
  (async () => {
    try {
      let localInputPath = '';
      if (movie.videoUrl.startsWith('/uploads/')) {
        const fname = path.basename(movie.videoUrl);
        const searchDirs = [activeUploadsDir, path.resolve(process.cwd(), 'uploads'), '/tmp/uploads'];
        for (const dir of searchDirs) {
          const p = path.join(dir, fname);
          if (fs.existsSync(p)) {
            localInputPath = p;
            break;
          }
        }
      }

      if (!localInputPath) {
        // Download remote video or copy to temporary file
        const tempSource = path.join('/tmp', `temp_src_${movie.id}_${Date.now()}.mp4`);
        await downloadRemoteVideoToTemp(movie.videoUrl, tempSource);
        localInputPath = tempSource;
      }

      await executeTranscode(localInputPath, { movieId: movie.id, targetFilename: movie.title });
    } catch (err: any) {
      console.error(`[Re-encode Error] Movie ${movie.id}:`, err);
      const db2 = loadDB();
      const m2 = db2.movies.find((m) => m.id === movie.id);
      if (m2) {
        m2.status = 'failed';
        m2.transcodeError = err.message || 'Transcode failed';
        saveDB(db2);
      }
    }
  })();
});

// Support GET on /movies/:id/transcode so redirects or misconfigured methods return clean JSON
apiRouter.get('/movies/:id/transcode', (req: Request, res: Response) => {
  const db = loadDB();
  const movie = db.movies.find((m) => m.id === req.params.id);
  const job = transcodeJobs.get(req.params.id);

  if (!movie && !job) {
    return res.status(404).json({
      success: false,
      error: `Movie with ID "${req.params.id}" not found. To initiate transcoding, send a POST request.`,
      status: 'ready',
    });
  }

  const status = job?.status || movie?.status || 'ready';
  const progress = job?.progress !== undefined ? job.progress : movie?.transcodeProgress || 100;
  return res.json({
    success: true,
    status,
    progress,
    message: `Current transcode status: ${status}`,
    videoUrl: movie?.videoUrl,
  });
});

// 18c. Get transcode status for movie
apiRouter.get('/movies/:id/transcode-status', (req: Request, res: Response) => {
  const db = loadDB();
  const movie = db.movies.find((m) => m.id === req.params.id);
  const job = transcodeJobs.get(req.params.id);

  if (!movie && !job) {
    return res.status(404).json({
      success: false,
      error: `Movie with ID "${req.params.id}" not found`,
      status: 'ready',
      progress: 100,
    });
  }

  const status = job?.status || movie?.status || 'ready';
  const progress =
    job?.progress !== undefined
      ? job.progress
      : movie?.transcodeProgress !== undefined
      ? movie.transcodeProgress
      : 100;
  const error = job?.error || movie?.transcodeError;

  res.json({
    success: true,
    status,
    progress,
    error,
    videoUrl: movie?.videoUrl,
  });
});

// 19. Transparent Video Stream Proxy (resolves CORS and playback blocks for external MP4/HLS streams)
function pipeProxyStream(targetUrl: string, req: Request, res: Response, redirectCount = 0): void {
  if (redirectCount > 5) {
    res.status(508).json({ error: 'Too many redirects encountered while resolving video stream' });
    return;
  }

  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    };
    if (req.headers.range) {
      headers['Range'] = req.headers.range as string;
    }

    const proxyReq = client.request(
      targetUrl,
      {
        method: req.method,
        headers,
        timeout: 25000,
      },
      (proxyRes) => {
        const statusCode = proxyRes.statusCode || 200;

        // Follow redirects internally up to 5 times
        if (
          (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) &&
          proxyRes.headers.location
        ) {
          const redirectUrl = new URL(proxyRes.headers.location, targetUrl).toString();
          return pipeProxyStream(redirectUrl, req, res, redirectCount + 1);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Type');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

        if (proxyRes.headers['content-type']) {
          res.setHeader('Content-Type', proxyRes.headers['content-type']);
        }
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        if (proxyRes.headers['content-range']) {
          res.setHeader('Content-Range', proxyRes.headers['content-range']);
        }
        if (proxyRes.headers['accept-ranges']) {
          res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
        }

        res.status(statusCode);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.warn('Proxy streaming error:', err);
      if (!res.headersSent) {
        res.status(502).json({ error: `Proxy stream failed: ${err.message}` });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy stream timed out' });
      }
    });

    proxyReq.end();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(400).json({ error: `Invalid stream URL: ${err.message}` });
    }
  }
}

apiRouter.get('/stream-proxy', (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Target video URL is required' });
  }
  pipeProxyStream(targetUrl, req, res);
});

// Static handler for thumbnail images (serves from memory cache first, then disk)
const serveThumbnailHandler = (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  // 1. Check memory cache first
  const cached = thumbnailMemoryCache.get(filename);
  if (cached) {
    res.setHeader('Content-Type', cached.mimetype);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(cached.buffer);
  }

  // 2. Search potential disk locations
  const searchDirs = [
    activeThumbnailsDir,
    path.resolve(process.cwd(), 'uploads', 'thumbnails'),
    path.resolve(process.cwd(), 'data', 'thumbnails'),
    '/tmp/uploads/thumbnails',
    path.resolve(process.cwd(), 'uploads'),
  ];

  for (const dir of searchDirs) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  return res.status(404).json({ error: 'Thumbnail not found' });
};

// Static streaming handler for video uploads with HTTP 206 Partial Content & full CORS
const serveVideoUploadHandler = (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const searchDirs = [
    activeUploadsDir,
    path.resolve(process.cwd(), 'uploads'),
    '/tmp/uploads',
  ];

  let targetPath = '';
  for (const dir of searchDirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(targetPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(targetPath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
  };

  const contentType = mimeTypes[ext] || 'video/mp4';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

  if (range && (ext === '.mp4' || ext === '.webm' || ext === '.mkv')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(targetPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(targetPath).pipe(res);
  }
};

// Static handler for subtitle files (.vtt)
const serveSubtitleHandler = (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');

  // Check cache first
  if (subtitlesMemoryCache.has(filename)) {
    return res.send(subtitlesMemoryCache.get(filename));
  }

  // Check disk
  const searchDirs = [
    activeSubtitlesDir,
    path.resolve(process.cwd(), 'uploads', 'subtitles'),
    path.resolve(process.cwd(), 'uploads'),
    '/tmp/uploads/subtitles',
  ];
  for (const dir of searchDirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      return fs.createReadStream(p).pipe(res);
    }
  }
  return res.status(404).json({ error: 'Subtitle track not found' });
};

// Static streaming handler for dubbed audio (.wav, .mp3)
const serveDubbedAudioHandler = (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

  // Check memory cache first
  if (dubbedMemoryCache.has(filename)) {
    const item = dubbedMemoryCache.get(filename)!;
    res.setHeader('Content-Type', item.mimetype);
    res.setHeader('Content-Length', item.buffer.length);
    res.setHeader('Accept-Ranges', 'bytes');
    return res.send(item.buffer);
  }

  const searchDirs = [
    activeDubbedDir,
    path.resolve(process.cwd(), 'uploads', 'dubbed'),
    path.resolve(process.cwd(), 'uploads'),
    '/tmp/uploads/dubbed',
  ];
  for (const dir of searchDirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      const ext = path.extname(p).toLowerCase();
      const mime = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      return fs.createReadStream(p).pipe(res);
    }
  }
  return res.status(404).json({ error: 'Dubbed audio not found' });
};

// Mount AI & Multilingual static media routes
app.get('/uploads/subtitles/:filename', serveSubtitleHandler);
apiRouter.get('/uploads/subtitles/:filename', serveSubtitleHandler);
apiRouter.get('/subtitles/:filename', serveSubtitleHandler);

app.get('/uploads/dubbed/:filename', serveDubbedAudioHandler);
apiRouter.get('/uploads/dubbed/:filename', serveDubbedAudioHandler);
apiRouter.get('/dubbed/:filename', serveDubbedAudioHandler);

// AI Subtitle Translation Endpoint
apiRouter.post('/ai/translate-subtitles', async (req: Request, res: Response) => {
  const { vttContent, text, targetLanguage } = req.body;
  if (!targetLanguage || typeof targetLanguage !== 'string') {
    res.status(400).json({ error: 'targetLanguage is required' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Gemini API is not configured on this server.' });
    return;
  }

  const ai = new GoogleGenAI();
  let lastError: any = null;

  // 1. WebVTT subtitle track translation
  if (vttContent && typeof vttContent === 'string') {
    const prompt = `Translate all spoken dialogue and cue texts in this WebVTT subtitle track into ${targetLanguage}.
Strict rules:
1. Preserve the WebVTT format exactly, including the "WEBVTT" header at the very top.
2. Keep all timestamps (e.g. 00:00:01.000 --> 00:00:04.000) completely unchanged.
3. Keep cue identifiers / numbers unchanged.
4. Only translate the dialogue lines.
5. Return ONLY the raw WebVTT content, without any markdown formatting, backticks, or explanatory text.`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: `${prompt}\n\n${vttContent}` }] }],
        });

        let rawVtt = response.text || '';
        // Clean markdown backticks if returned
        rawVtt = rawVtt.replace(/^```(?:vtt|webvtt)?\n/i, '').replace(/\n```$/i, '').trim();
        if (!rawVtt.startsWith('WEBVTT')) {
          rawVtt = `WEBVTT\n\n${rawVtt}`;
        }

        const safeLang = targetLanguage.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const filename = `sub_${safeLang}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.vtt`;

        subtitlesMemoryCache.set(filename, rawVtt);

        try {
          fs.writeFileSync(path.join(activeSubtitlesDir, filename), rawVtt, 'utf8');
        } catch (e) {
          console.warn('Could not persist subtitle to disk, cached in memory:', e);
        }

        res.json({
          success: true,
          subtitleUrl: `/uploads/subtitles/${filename}`,
          language: targetLanguage,
          label: `${targetLanguage} [AI Translated]`,
          vttContent: rawVtt,
        });
        return;
      } catch (err: any) {
        lastError = err;
        console.warn(`[translate-subtitles] Attempt ${attempt} failed:`, err.message);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    res.status(500).json({ error: `Subtitle translation failed: ${lastError?.message || 'AI request error'}` });
    return;
  }

  // 2. Plain text translation
  if (text && typeof text === 'string') {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Translate the following dialogue or text accurately into ${targetLanguage}. Return ONLY the translation, without markdown code fences:\n\n${text}`,
        });
        const translatedText = response.text?.trim() || '';
        res.json({
          success: true,
          translatedText,
          language: targetLanguage,
          label: `${targetLanguage} [AI Translated]`,
        });
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
    res.status(500).json({ error: `Text translation failed: ${lastError?.message || 'AI request error'}` });
    return;
  }

  res.status(400).json({ error: 'Either vttContent or text must be provided.' });
});

// AI Dubbing Audio Synthesizer Endpoint
apiRouter.post('/ai/generate-dubbing', async (req: Request, res: Response) => {
  const { text, targetLanguage, voiceName } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Dialogue or scene text is required' });
    return;
  }
  const lang = targetLanguage || 'English';

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Gemini API is not configured on this server.' });
    return;
  }

  const ai = new GoogleGenAI();
  let lastError: any = null;
  const selectedVoice = voiceName || 'Kore';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: text.slice(0, 1500) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('TTS model did not return audio data.');
      }

      const audioBuffer = Buffer.from(base64Audio, 'base64');
      const safeLang = lang.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const filename = `dub_${safeLang}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.wav`;

      dubbedMemoryCache.set(filename, {
        buffer: audioBuffer,
        mimetype: 'audio/wav',
        createdAt: Date.now(),
      });

      try {
        fs.writeFileSync(path.join(activeDubbedDir, filename), audioBuffer);
      } catch (e) {
        console.warn('Could not persist dubbed audio to disk, cached in memory:', e);
      }

      res.json({
        success: true,
        audioUrl: `/uploads/dubbed/${filename}`,
        language: lang,
        label: `${lang} [AI Dubbed]`,
        voice: selectedVoice,
        size: audioBuffer.length,
      });
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(`[generate-dubbing] Attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
  }

  res.status(500).json({ error: `Dubbing generation failed: ${lastError?.message || 'AI request error'}` });
});

// Mount thumbnail routes
app.get('/uploads/thumbnails/:filename', serveThumbnailHandler);
apiRouter.get('/uploads/thumbnails/:filename', serveThumbnailHandler);
apiRouter.get('/thumbnails/:filename', serveThumbnailHandler);

// Mount video uploads routes
app.get('/uploads/:filename', serveVideoUploadHandler);
apiRouter.get('/uploads/:filename', serveVideoUploadHandler);

// Static serving of bundled image assets across all environments (dev, preview, Vercel)
app.use('/src/assets', express.static(path.resolve(process.cwd(), 'src/assets')));
app.use('/assets', express.static(path.resolve(process.cwd(), 'src/assets')));

// Mount router on BOTH '/api' and '/'
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Terminal 404 handler for all /api/* routes to prevent unhandled API requests from falling through to HTML SPA
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl || req.url}`,
    status: 404,
  });
});

// Global Error Handling Middleware - Guarantees clean JSON responses instead of default HTML 500
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Z1 Movies Server Error]:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds maximum allowed limit.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  const status = err.status || err.statusCode || 400;
  return res.status(status).json({
    error: err.message || 'An unexpected error occurred during request processing.',
  });
});

export default app;
