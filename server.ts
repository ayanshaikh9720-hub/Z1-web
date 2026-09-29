import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import http from 'http';
import https from 'https';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Setup directories
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${safeBase}_${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 500, // 500MB max for local demo upload
  },
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static streaming route for uploads with HTTP 206 Partial Content (Range Support)
app.get('/uploads/:filename', (req: Request, res: Response) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('File not found');
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  if (range && (ext === '.mp4' || ext === '.webm' || ext === '.mkv')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

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
    fs.createReadStream(filePath).pipe(res);
  }
});

// Database Interfaces
interface DBStructure {
  movies: any[];
  users: any[];
  watchlists: { userId: string; movieId: string; addedAt: string }[];
  progress: { userId: string; movieId: string; position: number; duration: number; percentage: number; updatedAt: string }[];
  contacts: any[];
  stats: {
    totalViews: number;
    totalDownloads: number;
  };
}

// Initial licensed/public-domain seed movies
function getInitialSeedData(): DBStructure {
  const salt = crypto.randomBytes(16).toString('hex');
  const adminHash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
  const userHash = crypto.pbkdf2Sync('user123', salt, 1000, 64, 'sha512').toString('hex');

  return {
    users: [
      {
        id: 'usr_admin',
        name: 'Chief Curator',
        email: 'admin@z1movies.com',
        role: 'admin',
        salt,
        passwordHash: adminHash,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_demo',
        name: 'Cinema Enthusiast',
        email: 'user@z1movies.com',
        role: 'user',
        salt,
        passwordHash: userHash,
        createdAt: new Date().toISOString(),
      },
    ],
    movies: [
      {
        id: 'mov_tears_of_steel',
        title: 'Tears of Steel',
        description: 'Set in a dystopian future Amsterdam, a squad of dedicated researchers and soldiers struggle to save humanity by confronting the machines with an emotional past connection.',
        posterUrl: '/src/assets/images/poster_stellar_voyage_1790644925651.jpg',
        backdropUrl: '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
        videoUrl: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4',
        videoType: 'mp4',
        downloadUrls: [
          {
            quality: '1080p',
            format: 'MP4',
            url: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4',
            fileSize: '1.2 GB',
            language: 'English',
          },
          {
            quality: '720p',
            format: 'MP4',
            url: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4',
            fileSize: '650 MB',
            language: 'English',
          },
          {
            quality: '480p',
            format: 'MP4',
            url: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4',
            fileSize: '320 MB',
            language: 'English',
          }
        ],
        releaseYear: 2024,
        language: 'English',
        genres: ['Action', 'Sci-Fi', 'Thriller'],
        duration: 12,
        cast: ['Derek de Lint', 'Sergio Hasselbaink', 'Rogier Schippers', 'Vanja Rukavina'],
        director: 'Ian Hubert',
        rating: 8.6,
        featured: true,
        trending: true,
        published: true,
        views: 1420,
        downloads: 384,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mov_shadow_runner',
        title: 'Shadow Runner: Neon Protocol',
        description: 'An elite courier carrying encrypted state secrets navigates through a torrential neon metropolis hunted by corporate syndicates.',
        posterUrl: '/src/assets/images/poster_shadow_runner_1790644939411.jpg',
        backdropUrl: '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
        videoUrl: '/uploads/sintel_trailer.mp4',
        videoType: 'mp4',
        downloadUrls: [
          {
            quality: '1080p',
            format: 'MP4',
            url: '/uploads/sintel_trailer.mp4',
            fileSize: '1.8 GB',
            language: 'English',
          },
          {
            quality: '720p',
            format: 'MP4',
            url: '/uploads/sintel_trailer.mp4',
            fileSize: '950 MB',
            language: 'English',
          }
        ],
        releaseYear: 2025,
        language: 'English',
        genres: ['Thriller', 'Action'],
        duration: 15,
        cast: ['Marcus Cole', 'Elena Vance', 'Tariq Al-Mansoor'],
        director: 'R. K. Sterling',
        rating: 8.9,
        featured: true,
        trending: true,
        published: true,
        views: 2980,
        downloads: 712,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mov_desert_dawn',
        title: 'Desert Dawn: Nomads of Time',
        description: 'Across the shifting dunes of an ancient forgotten desert, an archaeologist uncovers a pre-solar monument that bends the perception of time.',
        posterUrl: '/src/assets/images/poster_desert_dawn_1790644949151.jpg',
        backdropUrl: '/src/assets/images/poster_desert_dawn_1790644949151.jpg',
        videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
        videoType: 'mp4',
        downloadUrls: [
          {
            quality: '1080p',
            format: 'MP4',
            url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
            fileSize: '1.4 GB',
            language: 'Hindi (Subtitled)',
          },
          {
            quality: '720p',
            format: 'MP4',
            url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
            fileSize: '720 MB',
            language: 'Hindi (Subtitled)',
          }
        ],
        releaseYear: 2024,
        language: 'Hindi',
        genres: ['Drama', 'Bollywood', 'South Indian'],
        duration: 18,
        cast: ['Arjun Ray', 'Meera Singhania', 'Devan Nair'],
        director: 'Ananya Sen',
        rating: 9.1,
        featured: true,
        trending: true,
        published: true,
        views: 3820,
        downloads: 890,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mov_sintel',
        title: 'Sintel: The Dragon Quest',
        description: 'A lonely young warrior girl travels across treacherous peaks and barren wastelands searching for a baby dragon she nursed to health.',
        posterUrl: '/src/assets/images/poster_stellar_voyage_1790644925651.jpg',
        backdropUrl: '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
        videoUrl: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4',
        videoType: 'mp4',
        downloadUrls: [
          {
            quality: '1080p',
            format: 'MP4',
            url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4',
            fileSize: '1.1 GB',
            language: 'English',
          },
          {
            quality: '720p',
            format: 'MP4',
            url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4',
            fileSize: '540 MB',
            language: 'English',
          }
        ],
        releaseYear: 2023,
        language: 'English',
        genres: ['Action', 'Drama', 'Regional'],
        duration: 15,
        cast: ['Halina Reijn', 'Thom Hoffman'],
        director: 'Colin Levy',
        rating: 8.8,
        featured: false,
        trending: true,
        published: true,
        views: 2190,
        downloads: 640,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mov_big_buck_bunny',
        title: 'Big Buck Bunny & The Forest Rebels',
        description: 'A benevolent giant rabbit with a gentle heart is pushed to his limits when three bullying woodland critters terrorize innocent forest creatures.',
        posterUrl: '/src/assets/images/poster_shadow_runner_1790644939411.jpg',
        backdropUrl: '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
        videoUrl: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
        videoType: 'mp4',
        downloadUrls: [
          {
            quality: '1080p',
            format: 'MP4',
            url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
            fileSize: '950 MB',
            language: 'Original',
          },
          {
            quality: '720p',
            format: 'MP4',
            url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
            fileSize: '480 MB',
            language: 'Original',
          }
        ],
        releaseYear: 2024,
        language: 'English',
        genres: ['Comedy', 'Action'],
        duration: 10,
        cast: ['Sacha Goedegebure', 'Campbell'],
        director: 'Sacha Goedegebure',
        rating: 8.4,
        featured: false,
        trending: false,
        published: true,
        views: 1850,
        downloads: 410,
        createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mov_elephants_dream',
        title: 'Elephants Dream: The Machine Core',
        description: 'Two explorers wander inside an infinite mechanical labyrinth that responds to emotional tension and shifting perceptions of reality.',
        posterUrl: '/src/assets/images/poster_desert_dawn_1790644949151.jpg',
        backdropUrl: '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
        videoUrl: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
        videoType: 'mp4',
        downloadUrls: [
          {
            quality: '1080p',
            format: 'MP4',
            url: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
            fileSize: '820 MB',
            language: 'English',
          }
        ],
        releaseYear: 2023,
        language: 'English',
        genres: ['Drama', 'Sci-Fi'],
        duration: 11,
        cast: ['Tygo Gernandt', 'Cas Jansen'],
        director: 'Bassam Kurdali',
        rating: 8.1,
        featured: false,
        trending: false,
        published: true,
        views: 940,
        downloads: 230,
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mov_hls_stream_sample',
        title: 'Aurora Borealis: Live Stream Feed (HLS)',
        description: 'Adaptive Bitrate live HLS streaming test broadcast capturing pristine northern light phenomena across high Arctic latitudes.',
        posterUrl: '/src/assets/images/poster_stellar_voyage_1790644925651.jpg',
        backdropUrl: '/src/assets/images/hero_cinema_backdrop_1790644911552.jpg',
        videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        videoType: 'hls',
        downloadUrls: [],
        releaseYear: 2025,
        language: 'English',
        genres: ['Drama', 'Regional', 'Other licensed categories'],
        duration: 25,
        cast: ['Dr. Ingrid Thorne', 'Klaus Vang'],
        director: 'Torben Lind',
        rating: 8.7,
        featured: false,
        trending: true,
        published: true,
        views: 1120,
        downloads: 0,
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ],
    watchlists: [],
    progress: [],
    contacts: [],
    stats: {
      totalViews: 14320,
      totalDownloads: 3266,
    }
  };
}

// Database helper
function loadDB(): DBStructure {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading db.json, recreating with initial seed', err);
  }
  const seed = getInitialSeedData();
  saveDB(seed);
  return seed;
}

function saveDB(db: DBStructure): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// Token helper for real secure sessions
const activeSessions = new Map<string, { userId: string; role: string; email: string }>();

function generateToken(userId: string, role: string, email: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, { userId, role, email });
  return token;
}

// Authentication middleware
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid token' });
    return;
  }
  (req as any).user = session;
  next();
}

function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  authMiddleware(req, res, () => {
    const user = (req as any).user;
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
      return;
    }
    next();
  });
}

// Optional Auth (for logging view or progress if token is present)
function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const session = activeSessions.get(token);
    if (session) {
      (req as any).user = session;
    }
  }
  next();
}

// ----------------- API ROUTES ----------------- //

// 1. Video Probe & Validation Route with redirect support
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

          // Follow redirect
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

          // Abort response stream to save memory/bandwidth
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

app.post('/api/validate-video-url', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ valid: false, message: 'URL is required' });
    return;
  }

  // Handle local uploaded files
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

// 2. Direct File Upload Route for Admin
app.post('/api/upload', adminMiddleware, upload.single('video'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file received in upload payload' });
    return;
  }

  const uploadedUrl = `/uploads/${req.file.filename}`;
  const isVideo = req.file.mimetype.startsWith('video/') || req.file.originalname.match(/\.(mp4|webm|mkv|m3u8)$/i);

  res.json({
    success: true,
    url: uploadedUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    isVideo: !!isVideo,
    message: 'File successfully stored and ready for playback',
  });
});

// 3. Movies List & Search & Filters
app.get('/api/movies', (req: Request, res: Response) => {
  const db = loadDB();
  let list = db.movies || [];

  const { search, genre, trending, featured, published, sort, limit } = req.query;

  // Filter by published unless explicitly admin requesting
  if (published !== undefined) {
    const isPub = published === 'true';
    list = list.filter((m) => m.published === isPub);
  } else {
    // By default public only sees published
    list = list.filter((m) => m.published);
  }

  // Filter by trending
  if (trending === 'true') {
    list = list.filter((m) => m.trending);
  }

  // Filter by featured
  if (featured === 'true') {
    list = list.filter((m) => m.featured);
  }

  // Filter by genre
  if (genre && typeof genre === 'string' && genre !== 'All') {
    const searchGenre = genre.toLowerCase();
    list = list.filter((m) =>
      m.genres.some((g: string) => g.toLowerCase() === searchGenre || g.toLowerCase().includes(searchGenre))
    );
  }

  // Dynamic Full Search: Title, Actor, Director, Genre, Language, Year
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

  // Sorting
  if (sort === 'newest') {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === 'views') {
    list.sort((a, b) => (b.views || 0) - (a.views || 0));
  } else if (sort === 'downloads') {
    list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  } else if (sort === 'rating') {
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  // Limit
  if (limit) {
    const l = parseInt(limit as string, 10);
    if (!isNaN(l) && l > 0) {
      list = list.slice(0, l);
    }
  }

  res.json({ movies: list, total: list.length });
});

// 4. Movie Details + View Tracking
app.get('/api/movies/:id', (req: Request, res: Response) => {
  const db = loadDB();
  const movie = db.movies.find((m) => m.id === req.params.id);

  if (!movie) {
    res.status(404).json({ error: 'Movie not found' });
    return;
  }

  // Increment view count
  movie.views = (movie.views || 0) + 1;
  db.stats.totalViews = (db.stats.totalViews || 0) + 1;
  saveDB(db);

  res.json({ movie });
});

// 5. Track Download & Validate Link
app.post('/api/movies/:id/download-click', (req: Request, res: Response) => {
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

// 6. Create Movie (Admin)
app.post('/api/movies', adminMiddleware, (req: Request, res: Response) => {
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

// 7. Update Movie (Admin)
app.put('/api/movies/:id', adminMiddleware, (req: Request, res: Response) => {
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

// 8. Delete Movie (Admin)
app.delete('/api/movies/:id', adminMiddleware, (req: Request, res: Response) => {
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

// 9. Toggle Publish Status (Admin)
app.patch('/api/movies/:id/publish', adminMiddleware, (req: Request, res: Response) => {
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

// 10. Auth: Register
app.post('/api/auth/register', (req: Request, res: Response) => {
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
    role: 'user',
    salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  saveDB(db);

  const token = generateToken(newUser.id, newUser.role, newUser.email);

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

// 11. Auth: Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const db = loadDB();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const testHash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
  if (testHash !== user.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken(user.id, user.role, user.email);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// 12. Auth: Current User
app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
  const sessionUser = (req as any).user;
  const db = loadDB();
  const user = db.users.find((u) => u.id === sessionUser.userId);

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

// 13. Watchlist Management
app.get('/api/user/watchlist', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
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

app.post('/api/user/watchlist', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
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
    // Remove
    db.watchlists.splice(existingIdx, 1);
    added = false;
  } else {
    // Add
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

// 14. Continue Watching Playback Progress
app.get('/api/user/progress', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
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

app.post('/api/user/progress', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
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

// 15. Admin Dashboard Statistics
app.get('/api/admin/stats', adminMiddleware, (_req: Request, res: Response) => {
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

// 16. Admin Reset Demo Data
app.post('/api/admin/reset-demo', adminMiddleware, (_req: Request, res: Response) => {
  const initial = getInitialSeedData();
  saveDB(initial);
  res.json({ success: true, message: 'Database reset to licensed sample library' });
});

// 17. Contact Form
app.post('/api/contact', (req: Request, res: Response) => {
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

// ----------------- VITE INTEGRATION ----------------- //

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Z1 Movies Server] Running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
