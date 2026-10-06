import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { loadDB, saveDB, getInitialSeedData, authenticateUser, generateToken, verifyToken, TokenPayload } from './db';

const app = express();

const IS_VERCEL = Boolean(process.env.VERCEL);
const UPLOADS_DIR = IS_VERCEL ? '/tmp/uploads' : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {}
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
    const filePath = path.join(UPLOADS_DIR, path.basename(url));
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

// Mount router on BOTH '/api' and '/'
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
