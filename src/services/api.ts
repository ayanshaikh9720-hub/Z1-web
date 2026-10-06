import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, firebaseApi, isUserAdmin } from './firebase';
import { Movie, User, WatchlistItem, PlaybackProgress, AdminStats } from '../types';

const USER_KEY = 'z1_movies_user';
const TOKEN_KEY = 'z1_movies_token';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  getUser: (): User | null => {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setUser: (user: User) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
};

// Convert Firebase User to App User format
async function mapFirebaseUser(fbUser: FirebaseUser): Promise<User> {
  const isAdmin = isUserAdmin(fbUser.email);
  const token = await fbUser.getIdToken();
  authStorage.setToken(token);

  let name = fbUser.displayName || (isAdmin ? 'Chief Curator' : 'Cinema Enthusiast');
  const role: 'admin' | 'user' = isAdmin ? 'admin' : 'user';

  const userDocRef = doc(db, 'users', fbUser.uid);
  try {
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      await setDoc(userDocRef, {
        id: fbUser.uid,
        email: fbUser.email,
        name,
        role,
        createdAt: new Date().toISOString(),
      });
    } else {
      const data = docSnap.data();
      if (data.name) name = data.name;
    }
  } catch (e) {
    // If Firestore rules or offline
  }

  const userObj: User = {
    id: fbUser.uid,
    name,
    email: fbUser.email || '',
    role,
    createdAt: new Date().toISOString(),
  };

  authStorage.setUser(userObj);
  return userObj;
}

export const api = {
  // ---------------- INITIAL DATA ---------------- //
  ensureInitialData: () => {
    return firebaseApi.ensureInitialData();
  },

  // ---------------- MOVIES ---------------- //
  getMovies: (params?: {
    search?: string;
    genre?: string;
    trending?: boolean;
    featured?: boolean;
    published?: boolean;
    sort?: 'newest' | 'views' | 'downloads' | 'rating';
  }) => {
    return firebaseApi.getMovies(params);
  },

  getMovie: async (id: string) => {
    const movie = await firebaseApi.getMovieById(id);
    return { movie };
  },

  trackDownload: (movieId: string, quality: string) => {
    return firebaseApi.trackDownload(movieId, quality);
  },

  // ---------------- VIDEO PROBE & VALIDATION ---------------- //
  validateVideoUrl: (url: string) => {
    return firebaseApi.validateVideoUrl(url);
  },

  // ---------------- ADMIN ACTIONS ---------------- //
  createMovie: async (data: Partial<Movie>) => {
    const movie = await firebaseApi.createMovie(data);
    return { success: true, movie };
  },

  updateMovie: async (id: string, data: Partial<Movie>) => {
    const movie = await firebaseApi.updateMovie(id, data);
    return { success: true, movie };
  },

  deleteMovie: async (id: string) => {
    await firebaseApi.deleteMovie(id);
    return { success: true, message: 'Movie deleted successfully' };
  },

  togglePublish: async (id: string, published?: boolean) => {
    const movie = await firebaseApi.togglePublish(id, Boolean(published));
    return { success: true, movie };
  },

  getAdminStats: () => {
    return firebaseApi.getAdminStats();
  },

  resetDemoData: async () => {
    await firebaseApi.resetDemoData();
    return { success: true, message: 'Database reset to licensed sample library' };
  },

  // Thumbnail / Poster Upload handler (Firebase Storage)
  uploadThumbnail: async (file: File, onProgress?: (pct: number) => void): Promise<string> => {
    return firebaseApi.uploadThumbnail(file, onProgress);
  },

  // Local/Direct File Upload handler
  uploadFile: (file: File, onProgress?: (pct: number) => void): Promise<{
    success: boolean;
    url: string;
    filename: string;
    originalName: string;
    size: number;
    mimetype: string;
    isVideo: boolean;
    message: string;
  }> => {
    return new Promise((resolve, reject) => {
      // In web app, we can generate an object URL or simulate file read for testing
      if (onProgress) {
        let p = 0;
        const interval = setInterval(() => {
          p += 25;
          onProgress(p);
          if (p >= 100) {
            clearInterval(interval);
            const objectUrl = URL.createObjectURL(file);
            resolve({
              success: true,
              url: objectUrl,
              filename: file.name,
              originalName: file.name,
              size: file.size,
              mimetype: file.type || 'video/mp4',
              isVideo: true,
              message: 'Video file ready for player streaming',
            });
          }
        }, 150);
      } else {
        const objectUrl = URL.createObjectURL(file);
        resolve({
          success: true,
          url: objectUrl,
          filename: file.name,
          originalName: file.name,
          size: file.size,
          mimetype: file.type || 'video/mp4',
          isVideo: true,
          message: 'Video file ready for player streaming',
        });
      }
    });
  },

  // ---------------- AUTHENTICATION ---------------- //
  login: async (email: string, password: string) => {
    try {
      const cleanEmail = email.trim();
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (signInErr: any) {
        // If user not found, auto-create for demo/admin testing
        if (
          signInErr.code === 'auth/user-not-found' ||
          signInErr.code === 'auth/invalid-credential' ||
          signInErr.code === 'auth/invalid-email'
        ) {
          try {
            credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('Invalid email or password.');
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }

      const user = await mapFirebaseUser(credential.user);
      const token = await credential.user.getIdToken();
      return { success: true, token, user };
    } catch (err: any) {
      console.error('Firebase Auth Login Error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password.');
      }
      if (err.code === 'auth/network-request-failed') {
        throw new Error('Authentication service is unavailable. Please try again.');
      }
      if (err.code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please try again later.');
      }
      throw new Error(err.message || 'Authentication service is unavailable. Please try again.');
    }
  },

  register: async (name: string, email: string, password: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = await mapFirebaseUser(credential.user);
      user.name = name.trim();
      authStorage.setUser(user);

      // Save custom name to Firestore
      try {
        await setDoc(doc(db, 'users', credential.user.uid), {
          id: credential.user.uid,
          email: credential.user.email,
          name: name.trim(),
          role: user.role,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        // Firestore rules fallback
      }

      const token = await credential.user.getIdToken();
      return { success: true, token, user };
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email already exists.');
      }
      if (err.code === 'auth/weak-password') {
        throw new Error('Password must be at least 6 characters.');
      }
      throw new Error(err.message || 'Registration failed. Please try again.');
    }
  },

  loginWithGoogle: async () => {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const user = await mapFirebaseUser(credential.user);
    const token = await credential.user.getIdToken();
    return { success: true, token, user };
  },

  getMe: async (): Promise<User | null> => {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        unsubscribe();
        if (fbUser) {
          const user = await mapFirebaseUser(fbUser);
          resolve(user);
        } else {
          resolve(null);
        }
      });
    });
  },

  logout: async () => {
    authStorage.clearToken();
    try {
      await signOut(auth);
    } catch {}
  },

  // ---------------- WATCHLIST ---------------- //
  getWatchlist: async () => {
    const current = auth.currentUser;
    if (!current) return { watchlist: [] };
    const watchlist = await firebaseApi.getWatchlist(current.uid);
    return { watchlist };
  },

  toggleWatchlist: async (movieId: string) => {
    const current = auth.currentUser;
    if (!current) throw new Error('Authentication required');
    const result = await firebaseApi.toggleWatchlist(current.uid, movieId);
    return { success: true, inWatchlist: result.inWatchlist };
  },

  // ---------------- PLAYBACK PROGRESS ---------------- //
  getProgress: async () => {
    const current = auth.currentUser;
    if (!current) return { progress: [] };
    const progress = await firebaseApi.getProgress(current.uid);
    return { progress };
  },

  saveProgress: async (movieId: string, position: number, duration: number) => {
    const current = auth.currentUser;
    if (!current) return { success: false };
    await firebaseApi.saveProgress(current.uid, movieId, position, duration);
    return {
      success: true,
      progress: {
        movieId,
        position,
        duration,
        percentage: Math.round((position / duration) * 100),
        updatedAt: new Date().toISOString(),
      },
    };
  },

  // ---------------- CONTACT ---------------- //
  submitContact: async (data: { name: string; email: string; subject: string; message: string }) => {
    await firebaseApi.submitContact(data);
    return { success: true, message: 'Your message has been received by the Z1 Movies team.' };
  },
};
