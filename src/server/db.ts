import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface DBStructure {
  movies: any[];
  users: UserRecord[];
  watchlists: { userId: string; movieId: string; addedAt: string }[];
  progress: { userId: string; movieId: string; position: number; duration: number; percentage: number; updatedAt: string }[];
  contacts: any[];
  stats: {
    totalViews: number;
    totalDownloads: number;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'z1-movies-production-secret-key-2026';

// Determine writable directory based on environment (Vercel serverless uses /tmp)
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? '/tmp' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'z1_movies_db.json');
const BUNDLED_DB_FILE = path.resolve(process.cwd(), 'data', 'db.json');

// In-memory fallback in case of serverless filesystem anomalies
let memoryDB: DBStructure | null = null;

export function getInitialSeedData(): DBStructure {
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
          },
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
          },
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
          },
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
          },
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
          },
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
          },
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
      },
    ],
    watchlists: [],
    progress: [],
    contacts: [],
    stats: {
      totalViews: 14320,
      totalDownloads: 3266,
    },
  };
}

export function loadDB(): DBStructure {
  if (memoryDB) {
    return memoryDB;
  }

  try {
    // 1. Check primary DB_FILE
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      memoryDB = JSON.parse(content);
      return memoryDB!;
    }

    // 2. Check bundled DB_FILE in project
    if (fs.existsSync(BUNDLED_DB_FILE)) {
      const content = fs.readFileSync(BUNDLED_DB_FILE, 'utf-8');
      memoryDB = JSON.parse(content);
      return memoryDB!;
    }
  } catch (err) {
    console.error('Error reading DB file, initializing fresh store:', err);
  }

  // 3. Fallback to fresh seed
  memoryDB = getInitialSeedData();
  saveDB(memoryDB);
  return memoryDB;
}

export function saveDB(db: DBStructure): void {
  memoryDB = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    // In serverless environments where disk may be read-only, memoryDB retains state
    console.warn('Could not persist to disk, retained in memory:', err);
  }
}

// ----------------- SECURE TOKEN & CRYPTO AUTH ----------------- //

export interface TokenPayload {
  userId: string;
  role: 'admin' | 'user';
  email: string;
  exp: number;
}

export function generateToken(user: { id: string; role: 'admin' | 'user'; email: string }): string {
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    email: user.email,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');

  return `${payloadB64}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, providedSig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');

  try {
    const isSigValid = crypto.timingSafeEqual(
      Buffer.from(providedSig),
      Buffer.from(expectedSig)
    );
    if (!isSigValid) return null;

    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload: TokenPayload = JSON.parse(payloadStr);

    if (payload.exp && payload.exp < Date.now()) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

export function authenticateUser(email: string, password: string): { user: UserRecord; token: string } | null {
  const db = loadDB();
  const normalizedEmail = email.trim().toLowerCase();

  // Find user
  let user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);

  // If user is admin@z1movies.com and not in DB for some reason, ensure admin account exists
  if (!user && normalizedEmail === 'admin@z1movies.com') {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
    user = {
      id: 'usr_admin',
      name: 'Chief Curator',
      email: 'admin@z1movies.com',
      role: 'admin',
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    saveDB(db);
  }

  if (!user) return null;

  const testHash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
  if (testHash !== user.passwordHash) {
    return null;
  }

  const token = generateToken(user);
  return { user, token };
}
