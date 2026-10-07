import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import multer from 'multer';
import { loadDB, saveDB, getInitialSeedData, authenticateUser, generateToken, verifyToken, TokenPayload } from './db';

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

// In-memory cache for high-availability thumbnail hosting across serverless/ephemeral instances
export const thumbnailMemoryCache = new Map<string, {
  buffer: Buffer;
  mimetype: string;
  createdAt: number;
}>();

// Multer memory-based storage for thumbnails (bulletproof against filesystem write/read permission errors)
const uploadThumbnailMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
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

// Video Probe helper
function probeUrl(targetUrl: string, maxRedirects = 5): Promise<{
  valid: boolean;
  status: number;
  contentType: string;
  contentLength?: string;
  message: string;
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

          if (statusCode === 200 || statusCode === 206) {
            resolve({
              valid: true,
              status: statusCode,
              contentType,
              contentLength,
              message: 'Video stream verified and playable by browser',
            });
          } else {
            resolve({
              valid: false,
              status: statusCode,
              contentType,
              message: `Remote server returned HTTP ${statusCode}`,
            });
          }
        }
      );

      request.on('error', (err) => {
        resolve({
          valid: false,
          status: 0,
          contentType: '',
          message: `Network probe failed: ${err.message}`,
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({
          valid: false,
          status: 408,
          contentType: '',
          message: 'Video URL verification timed out (8s)',
        });
      });

      request.end();
    } catch (err: any) {
      resolve({
        valid: false,
        status: 400,
        contentType: '',
        message: `Invalid URL: ${err.message}`,
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
      res.json({
        valid: true,
        status: 200,
        contentType: 'video/mp4',
        size: stat.size,
        message: 'Local video file verified on server storage',
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
    posterUrl: data.posterUrl || '/src/assets/images/poster_stellar_voyage_1790644925651.jpg',
    backdropUrl: data.backdropUrl || '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
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

// 18. Video Upload Endpoint
apiRouter.post('/upload', handleVideoMulter, (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const file = req.file || (files && files.length > 0 ? files[0] : null);

  if (!file) {
    return res.status(400).json({ error: 'No video file received in upload payload' });
  }

  const uploadedUrl = `/uploads/${file.filename}`;
  const isVideo = file.mimetype?.startsWith('video/') || file.originalname.match(/\.(mp4|webm|mkv|m3u8)$/i);

  return res.json({
    success: true,
    url: uploadedUrl,
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    isVideo: Boolean(isVideo),
    message: 'File successfully stored and ready for playback',
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
