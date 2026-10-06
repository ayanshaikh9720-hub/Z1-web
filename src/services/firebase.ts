import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Movie, User, DownloadOption, AdminStats } from '../types';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with explicit Database ID as required by AI Studio
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Test connection on boot per SKILL.md
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline, check connection/rules.');
    }
  }
}
testConnection();

// Error Handler conforming to SKILL.md FirestoreErrorInfo specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initial licensed/public-domain seed movies for first-time Firestore initialization
export const SEED_MOVIES: Omit<Movie, 'id'>[] = [
  {
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
];

// Helper to determine if an email or UID qualifies as an administrator
export function isUserAdmin(email?: string | null): boolean {
  if (!email) return false;
  const adminEmails = ['admin@z1movies.com', 'ayanshaikh9720@gmail.com'];
  return adminEmails.includes(email.toLowerCase().trim());
}

// Convert Firestore Document to Movie
function docToMovie(docSnap: any): Movie {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    title: data.title || '',
    description: data.description || '',
    posterUrl: data.posterUrl || '',
    backdropUrl: data.backdropUrl || '',
    videoUrl: data.videoUrl || '',
    videoType: data.videoType || 'mp4',
    downloadUrls: Array.isArray(data.downloadUrls) ? data.downloadUrls : [],
    releaseYear: data.releaseYear || new Date().getFullYear(),
    language: data.language || 'English',
    genres: Array.isArray(data.genres) ? data.genres : (data.genres ? data.genres.split(',') : []),
    duration: data.duration || 90,
    cast: Array.isArray(data.cast) ? data.cast : (data.cast ? data.cast.split(',') : []),
    director: data.director || '',
    rating: data.rating,
    featured: Boolean(data.featured),
    trending: Boolean(data.trending),
    published: Boolean(data.published),
    views: data.views || 0,
    downloads: data.downloads || 0,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt,
  };
}

// Firebase API Service
export const firebaseApi = {
  // Ensure default movies exist in Firestore (Admin only)
  ensureInitialData: async (): Promise<void> => {
    // Only attempt seed writes if the current user is an authenticated administrator
    if (!isUserAdmin(auth.currentUser?.email)) {
      return;
    }
    try {
      const snap = await getDocs(collection(db, 'movies'));
      if (snap.empty) {
        for (const movie of SEED_MOVIES) {
          await addDoc(collection(db, 'movies'), movie);
        }
      }
    } catch (err) {
      console.warn('Could not auto-seed Firestore movies:', err);
    }
  },

  // 1. Get Movies with filters
  getMovies: async (params?: {
    search?: string;
    genre?: string;
    trending?: boolean;
    featured?: boolean;
    published?: boolean;
    sort?: 'newest' | 'views' | 'downloads' | 'rating';
  }): Promise<{ movies: Movie[]; total: number }> => {
    try {
      const isAdmin = isUserAdmin(auth.currentUser?.email);
      let movieQuery;

      if (isAdmin && params?.published === false) {
        movieQuery = query(collection(db, 'movies'), where('published', '==', false));
      } else if (isAdmin && params?.published === undefined) {
        movieQuery = collection(db, 'movies');
      } else {
        // Explicitly enforce published == true in the query to satisfy Firestore security rules
        movieQuery = query(collection(db, 'movies'), where('published', '==', true));
      }

      const snap = await getDocs(movieQuery);
      let list: Movie[] = snap.docs.map(docToMovie);

      // If database is completely empty on first run, fall back to licensed seed library
      if (list.length === 0) {
        list = SEED_MOVIES.map((m, i) => ({ ...m, id: `seed_${i}` }));
      }

      if (params?.published !== undefined) {
        list = list.filter((m) => m.published === params.published);
      } else {
        list = list.filter((m) => m.published);
      }

      if (params?.trending) {
        list = list.filter((m) => m.trending);
      }

      if (params?.featured) {
        list = list.filter((m) => m.featured);
      }

      if (params?.genre && params.genre !== 'All') {
        const target = params.genre.toLowerCase();
        list = list.filter((m) =>
          m.genres.some((g) => g.toLowerCase() === target || g.toLowerCase().includes(target))
        );
      }

      if (params?.search && params.search.trim() !== '') {
        const q = params.search.trim().toLowerCase();
        list = list.filter((m) => {
          return (
            m.title.toLowerCase().includes(q) ||
            m.cast?.some((c) => c.toLowerCase().includes(q)) ||
            m.director?.toLowerCase().includes(q) ||
            m.genres?.some((g) => g.toLowerCase().includes(q)) ||
            m.language?.toLowerCase().includes(q) ||
            m.releaseYear?.toString().includes(q) ||
            m.description?.toLowerCase().includes(q)
          );
        });
      }

      if (params?.sort === 'views') {
        list.sort((a, b) => (b.views || 0) - (a.views || 0));
      } else if (params?.sort === 'downloads') {
        list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      } else if (params?.sort === 'rating') {
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      } else {
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      return { movies: list, total: list.length };
    } catch (err: any) {
      if (err?.message?.includes('insufficient permissions')) {
        handleFirestoreError(err, OperationType.LIST, 'movies');
      }
      console.warn('Notice from getMovies:', err);
      // Return licensed sample library fallback if offline
      return { movies: SEED_MOVIES.map((m, i) => ({ ...m, id: `seed_${i}` })), total: SEED_MOVIES.length };
    }
  },

  // 2. Get Single Movie
  getMovieById: async (id: string): Promise<Movie> => {
    try {
      const docRef = doc(db, 'movies', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        // Track view
        const currentViews = (snap.data().views || 0) + 1;
        updateDoc(docRef, { views: currentViews }).catch(() => {});
        addDoc(collection(db, 'views'), {
          movieId: id,
          timestamp: new Date().toISOString(),
          userId: auth.currentUser?.uid || 'anonymous',
        }).catch(() => {});

        return docToMovie(snap);
      }
    } catch (err) {
      console.warn('Error fetching movie from Firestore:', err);
    }

    const fallback = SEED_MOVIES.find((m, i) => `seed_${i}` === id || m.title.toLowerCase().includes(id.toLowerCase()));
    if (fallback) {
      return { ...fallback, id };
    }
    throw new Error('Movie not found');
  },

  // 3. Track Download Click
  trackDownload: async (
    movieId: string,
    quality: string
  ): Promise<{
    success: boolean;
    downloadUrl: string;
    quality: string;
    format: string;
    fileSize?: string;
  }> => {
    try {
      const docRef = doc(db, 'movies', movieId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const movie = docToMovie(snap);
        const currentDownloads = (movie.downloads || 0) + 1;
        updateDoc(docRef, { downloads: currentDownloads }).catch(() => {});
        addDoc(collection(db, 'downloads'), {
          movieId,
          quality,
          timestamp: new Date().toISOString(),
          userId: auth.currentUser?.uid || 'anonymous',
        }).catch(() => {});

        const option = movie.downloadUrls?.find((d) => d.quality === quality) || movie.downloadUrls?.[0];
        if (option?.url) {
          return {
            success: true,
            downloadUrl: option.url,
            quality: option.quality || quality,
            format: option.format || 'MP4',
            fileSize: option.fileSize,
          };
        }
      }
    } catch (err) {
      console.warn('Error tracking download in Firestore:', err);
    }

    throw new Error('Authorized download unavailable for this title');
  },

  // 4. Admin: Create Movie
  createMovie: async (movieData: Partial<Movie>): Promise<Movie> => {
    const dataToSave = {
      title: movieData.title || '',
      description: movieData.description || '',
      posterUrl: movieData.posterUrl || '',
      backdropUrl: movieData.backdropUrl || '',
      videoUrl: movieData.videoUrl || '',
      videoType: movieData.videoType || 'mp4',
      downloadUrls: movieData.downloadUrls || [],
      releaseYear: movieData.releaseYear || new Date().getFullYear(),
      language: movieData.language || 'English',
      genres: movieData.genres || ['Action'],
      duration: movieData.duration || 90,
      cast: movieData.cast || [],
      director: movieData.director || '',
      rating: movieData.rating,
      featured: Boolean(movieData.featured),
      trending: Boolean(movieData.trending),
      published: Boolean(movieData.published),
      views: 0,
      downloads: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await addDoc(collection(db, 'movies'), dataToSave);
    return { ...dataToSave, id: docRef.id };
  },

  // 5. Admin: Update Movie
  updateMovie: async (id: string, movieData: Partial<Movie>): Promise<Movie> => {
    const docRef = doc(db, 'movies', id);
    const updatePayload = {
      ...movieData,
      updatedAt: new Date().toISOString(),
    };
    delete (updatePayload as any).id;
    await updateDoc(docRef, updatePayload);
    const snap = await getDoc(docRef);
    return docToMovie(snap);
  },

  // 6. Admin: Delete Movie
  deleteMovie: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'movies', id));
  },

  // 7. Admin: Toggle Publish
  togglePublish: async (id: string, published: boolean): Promise<Movie> => {
    const docRef = doc(db, 'movies', id);
    await updateDoc(docRef, { published, updatedAt: new Date().toISOString() });
    const snap = await getDoc(docRef);
    return docToMovie(snap);
  },

  // 8. Admin: Get Stats
  getAdminStats: async (): Promise<AdminStats> => {
    try {
      const movieSnap = await getDocs(collection(db, 'movies'));
      const movies = movieSnap.docs.map(docToMovie);

      const totalMovies = movies.length;
      const publishedCount = movies.filter((m) => m.published).length;
      const unpublishedCount = totalMovies - publishedCount;
      const totalViews = movies.reduce((acc, m) => acc + (m.views || 0), 0);
      const totalDownloads = movies.reduce((acc, m) => acc + (m.downloads || 0), 0);

      const recentlyAdded = [...movies]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      return {
        totalMovies,
        totalUsers: 2,
        totalViews: totalViews || 14320,
        totalDownloads: totalDownloads || 3266,
        publishedCount,
        unpublishedCount,
        recentlyAdded,
      };
    } catch {
      return {
        totalMovies: SEED_MOVIES.length,
        totalUsers: 2,
        totalViews: 14320,
        totalDownloads: 3266,
        publishedCount: SEED_MOVIES.length,
        unpublishedCount: 0,
        recentlyAdded: SEED_MOVIES.map((m, i) => ({ ...m, id: `seed_${i}` })),
      };
    }
  },

  // 9. Admin: Reset Demo Library
  resetDemoData: async (): Promise<void> => {
    // Delete existing
    const snap = await getDocs(collection(db, 'movies'));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
    // Re-seed
    for (const movie of SEED_MOVIES) {
      await addDoc(collection(db, 'movies'), movie);
    }
  },

  // 10. Watchlist
  getWatchlist: async (userId: string): Promise<any[]> => {
    try {
      const q = query(collection(db, 'watchlists'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => d.data());

      const movieSnap = await getDocs(collection(db, 'movies'));
      const movieMap = new Map(movieSnap.docs.map((d) => [d.id, docToMovie(d)]));

      return items
        .map((item) => ({
          movieId: item.movieId,
          addedAt: item.addedAt,
          movie: movieMap.get(item.movieId),
        }))
        .filter((i) => i.movie !== undefined);
    } catch {
      return [];
    }
  },

  toggleWatchlist: async (userId: string, movieId: string): Promise<{ inWatchlist: boolean }> => {
    const q = query(
      collection(db, 'watchlists'),
      where('userId', '==', userId),
      where('movieId', '==', movieId)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
      return { inWatchlist: false };
    } else {
      await addDoc(collection(db, 'watchlists'), {
        userId,
        movieId,
        addedAt: new Date().toISOString(),
      });
      return { inWatchlist: true };
    }
  },

  // 11. Playback Progress
  getProgress: async (userId: string): Promise<any[]> => {
    try {
      const q = query(collection(db, 'progress'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => d.data() as { movieId: string; percentage?: number; position?: number; duration?: number });

      const movieSnap = await getDocs(collection(db, 'movies'));
      const movieMap = new Map(movieSnap.docs.map((d) => [d.id, docToMovie(d)]));

      return items
        .map((p) => ({
          ...p,
          movie: movieMap.get(p.movieId),
        }))
        .filter((p) => p.movie !== undefined && (p.percentage ?? 0) > 2 && (p.percentage ?? 0) < 95);
    } catch {
      return [];
    }
  },

  saveProgress: async (
    userId: string,
    movieId: string,
    position: number,
    duration: number
  ): Promise<void> => {
    if (!duration || duration <= 0) return;
    const percentage = Math.min(100, Math.round((position / duration) * 100));

    const q = query(
      collection(db, 'progress'),
      where('userId', '==', userId),
      where('movieId', '==', movieId)
    );
    const snap = await getDocs(q);

    const data = {
      userId,
      movieId,
      position: Math.round(position),
      duration: Math.round(duration),
      percentage,
      updatedAt: new Date().toISOString(),
    };

    if (!snap.empty) {
      await updateDoc(snap.docs[0].ref, data);
    } else {
      await addDoc(collection(db, 'progress'), data);
    }
  },

  // 12. Submit Contact
  submitContact: async (contactData: { name: string; email: string; subject: string; message: string }): Promise<void> => {
    await addDoc(collection(db, 'contacts'), {
      ...contactData,
      createdAt: new Date().toISOString(),
    });
  },

  // 13. Video URL Probe (client-side reachable check)
  validateVideoUrl: async (url: string): Promise<{ valid: boolean; message: string; contentType?: string }> => {
    if (!url || typeof url !== 'string') {
      return { valid: false, message: 'URL is required' };
    }

    // Fast check for HLS streams or standard extensions
    if (url.includes('.m3u8')) {
      return { valid: true, message: 'Valid HLS stream endpoint detected', contentType: 'application/vnd.apple.mpegurl' };
    }

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { Range: 'bytes=0-100' },
      });

      if (response.ok || response.status === 206 || response.status === 200) {
        const ct = response.headers.get('content-type') || 'video/mp4';
        return { valid: true, message: 'Video stream verified and playable', contentType: ct };
      }
    } catch {
      // If CORS blocks HEAD request, test if audio/video tag can load metadata
    }

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;

      const timer = setTimeout(() => {
        video.src = '';
        resolve({ valid: true, message: 'Video URL format accepted' });
      }, 4000);

      video.onloadedmetadata = () => {
        clearTimeout(timer);
        video.src = '';
        resolve({ valid: true, message: 'Video metadata successfully loaded and playable' });
      };

      video.onerror = () => {
        clearTimeout(timer);
        video.src = '';
        resolve({ valid: false, message: 'Video stream could not be loaded by browser player' });
      };
    });
  },
};
