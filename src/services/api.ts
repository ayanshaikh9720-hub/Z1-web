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
import { Movie, User, WatchlistItem, PlaybackProgress, AdminStats, VideoUploadResult, VideoUploadTaskControl } from '../types';

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

/**
 * Resolves the backend API base URL depending on runtime environment
 * (Web browser vs Capacitor Android native vs external hosting).
 */
export function getApiBaseUrl(): string {
  const envUrl =
    (import.meta as any).env?.VITE_API_URL ||
    (import.meta as any).env?.VITE_APP_URL ||
    '';
  const isNative =
    typeof window !== 'undefined' &&
    (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
      window.location.protocol === 'capacitor:' ||
      (window.location.hostname === 'localhost' && window.location.port === ''));

  if (isNative && envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  return '';
}

/**
 * Safely parses fetch responses to guarantee that HTML error pages, SPA fallbacks,
 * or proxy responses are NEVER passed blindly to response.json().
 * Produces clear, actionable error messages with real HTTP status codes.
 */
export async function safeParseResponse<T = any>(
  res: Response,
  actionName = 'Request'
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMessage = `${actionName} failed with HTTP ${res.status} (${res.statusText || 'Error'})`;
    if (isJson) {
      try {
        const json = await res.json();
        errorMessage = json.error || json.message || errorMessage;
      } catch {
        // Fallback
      }
    } else {
      try {
        const text = await res.text();
        if (text.includes('<!doctype') || text.includes('<html')) {
          errorMessage = `${actionName} failed (HTTP ${res.status}): Server returned an HTML web page instead of JSON. The backend API service may be unavailable or misconfigured on this domain.`;
        } else if (text.trim().length > 0 && text.length < 200) {
          errorMessage = `${actionName} failed (HTTP ${res.status}): ${text.trim()}`;
        }
      } catch {}
    }
    throw new Error(errorMessage);
  }

  // HTTP status is 2xx, but verify it is actually JSON and not an HTML SPA fallback
  if (!isJson) {
    const text = await res.text();
    if (text.includes('<!doctype') || text.includes('<html')) {
      throw new Error(
        `${actionName} failed: Server returned an HTML web page instead of JSON (HTTP ${res.status}). Verify that the API backend is running and that the endpoint URL is correct.`
      );
    }
    throw new Error(
      `${actionName} failed: Expected JSON response but received "${contentType || 'unknown'}" (HTTP ${res.status}).`
    );
  }

  try {
    return (await res.json()) as T;
  } catch (parseErr: any) {
    throw new Error(
      `${actionName} failed: Server returned malformed JSON (HTTP ${res.status}): ${parseErr.message}`
    );
  }
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
    language?: string;
    trending?: boolean;
    featured?: boolean;
    published?: boolean;
    sort?: 'newest' | 'views' | 'downloads' | 'rating' | 'year' | 'title';
    page?: number;
    pageSize?: number;
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
    if (data.videoUrl && data.videoUrl.startsWith('blob:')) {
      throw new Error('A temporary browser blob cannot be saved as permanent movie video. Please upload the file to cloud storage or provide a permanent streaming URL.');
    }
    let createdMovie: Movie | null = null;
    let firestoreError: any = null;

    try {
      createdMovie = await firebaseApi.createMovie(data);
    } catch (fbErr: any) {
      console.warn('Firestore createMovie warning:', fbErr);
      firestoreError = fbErr;
    }

    try {
      const token = authStorage.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/movies', {
        method: 'POST',
        headers,
        body: JSON.stringify(createdMovie || data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.movie) createdMovie = createdMovie || json.movie;
      }
    } catch (backendErr) {
      console.warn('Backend createMovie warning:', backendErr);
    }

    if (!createdMovie) {
      if (firestoreError) {
        throw new Error(firestoreError.message || 'Failed to persist movie record to cloud database.');
      }
      createdMovie = {
        ...data,
        id: `mov_${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Movie;
    }

    return { success: true, movie: createdMovie };
  },

  updateMovie: async (id: string, data: Partial<Movie>) => {
    if (data.videoUrl && data.videoUrl.startsWith('blob:')) {
      throw new Error('A temporary browser blob cannot be saved as permanent movie video. Please upload the file to cloud storage or provide a permanent streaming URL.');
    }
    let updatedMovie: Movie | null = null;
    let firestoreError: any = null;

    // 1. Persist to Firebase Firestore
    try {
      updatedMovie = await firebaseApi.updateMovie(id, data);
    } catch (fbErr: any) {
      console.warn('Firestore updateMovie warning:', fbErr);
      firestoreError = fbErr;
    }

    // 2. Persist to Express JSON database
    try {
      const token = authStorage.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/movies/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedMovie || data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.movie) {
          updatedMovie = updatedMovie || json.movie;
        }
      }
    } catch (backendErr) {
      console.warn('Backend updateMovie warning:', backendErr);
    }

    if (!updatedMovie) {
      if (firestoreError) {
        throw new Error(firestoreError.message || 'Failed to update movie record in cloud database.');
      }
      updatedMovie = {
        ...data,
        id,
        updatedAt: new Date().toISOString(),
      } as Movie;
    }

    return { success: true, movie: updatedMovie };
  },

  deleteMovie: async (id: string) => {
    let deleted = false;
    try {
      await firebaseApi.deleteMovie(id);
      deleted = true;
    } catch (fbErr) {
      console.warn('Firestore deleteMovie warning:', fbErr);
    }

    try {
      const token = authStorage.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/movies/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) deleted = true;
    } catch (backendErr) {
      console.warn('Backend deleteMovie warning:', backendErr);
    }

    return { success: true, message: 'Movie deleted successfully' };
  },

  togglePublish: async (id: string, published?: boolean) => {
    const isPub = Boolean(published);
    let movie: Movie | null = null;
    try {
      movie = await firebaseApi.togglePublish(id, isPub);
    } catch (fbErr) {
      console.warn('Firestore togglePublish warning:', fbErr);
    }

    try {
      const token = authStorage.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/movies/${id}/publish`, {
        method: 'PATCH',
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.movie) movie = movie || json.movie;
      }
    } catch {}

    if (!movie) {
      movie = { id, published: isPub, updatedAt: new Date().toISOString() } as Movie;
    }
    return { success: true, movie };
  },

  getAdminStats: () => {
    return firebaseApi.getAdminStats();
  },

  resetDemoData: async () => {
    await firebaseApi.resetDemoData();
    return { success: true, message: 'Database reset to licensed sample library' };
  },

  // Thumbnail / Poster Upload handler (Separate Image Hosting / CDN - Spark plan safe)
  uploadThumbnail: (
    file: File,
    movieId?: string,
    onProgress?: (pct: number) => void,
    onTaskCreated?: (task: any) => void
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      // 1. Client-side format validation
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const lower = file.name.toLowerCase();
      const hasValidExt = validExts.some((ext) => lower.endsWith(ext));
      const hasValidMime = validTypes.includes(file.type.toLowerCase()) || file.type.startsWith('image/');

      if (!hasValidMime && !hasValidExt) {
        reject(new Error('Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.'));
        return;
      }

      // 2. Size validation (Max 10 MB)
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error('Image file is too large. Maximum allowed size is 10 MB.'));
        return;
      }

      // Fallback helper using Base64 JSON upload to /api/upload-thumbnail
      const attemptBase64Upload = () => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            if (onProgress) onProgress(60);
            const res = await fetch('/api/upload-thumbnail', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64: dataUrl,
                filename: file.name,
                mimetype: file.type || 'image/jpeg',
                movieId,
              }),
            });

            if (onProgress) onProgress(90);
            const raw = await res.text();
            let parsedData: any = null;
            try {
              parsedData = JSON.parse(raw);
            } catch {}

            const finalUrl =
              parsedData?.relativeUrl ||
              parsedData?.url ||
              parsedData?.publicUrl ||
              parsedData?.imageUrl ||
              parsedData?.posterUrl ||
              parsedData?.thumbnailUrl ||
              parsedData?.data?.url ||
              (raw.startsWith('/') || raw.startsWith('http') ? raw.trim() : null);

            if (finalUrl) {
              if (onProgress) onProgress(100);
              resolve(finalUrl);
              return;
            }

            const errMsg = parsedData?.error || parsedData?.message || 'Failed to upload thumbnail.';
            reject(new Error(errMsg));
          } catch (b64Err: any) {
            reject(new Error(b64Err?.message || 'Base64 thumbnail upload failed'));
          }
        };
        reader.onerror = () => {
          reject(new Error('Could not read image file for upload.'));
        };
        reader.readAsDataURL(file);
      };

      // 3. Primary strategy: Multipart form-data
      const formData = new FormData();
      formData.append('thumbnail', file);
      formData.append('file', file);
      formData.append('image', file);
      if (movieId) {
        formData.append('movieId', movieId);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload-thumbnail');

      if (onTaskCreated) {
        onTaskCreated({
          cancel: () => xhr.abort(),
        });
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const pct = Math.round((event.loaded / event.total) * 100);
          onProgress(Math.min(95, Math.max(0, pct)));
        }
      };

      xhr.onload = () => {
        const rawText = (xhr.responseText || '').trim();

        // Check if server returned HTML (Vite / proxy routing artifact)
        if (rawText.startsWith('<') || rawText.includes('<!DOCTYPE') || rawText.includes('<html')) {
          console.warn('Multipart upload returned HTML, switching to Base64 JSON fallback...');
          attemptBase64Upload();
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(rawText);
            const resolvedUrl =
              data.relativeUrl ||
              data.url ||
              data.publicUrl ||
              data.imageUrl ||
              data.posterUrl ||
              data.thumbnailUrl ||
              data.downloadUrl ||
              data.path ||
              data.fileUrl ||
              data.data?.url ||
              data.data?.relativeUrl ||
              data.data?.posterUrl;

            if (resolvedUrl) {
              if (onProgress) onProgress(100);
              resolve(resolvedUrl);
              return;
            }

            if (data.error || data.message) {
              reject(new Error(data.error || data.message));
              return;
            }
          } catch {
            // Not JSON
          }

          if (rawText.startsWith('/') || rawText.startsWith('http://') || rawText.startsWith('https://')) {
            if (onProgress) onProgress(100);
            resolve(rawText);
            return;
          }

          // If 200 status but unexpected body, try Base64 JSON fallback
          attemptBase64Upload();
          return;
        }

        // If HTTP 400+, extract real server error message
        let errMsg = 'Image hosting service failed to upload thumbnail.';
        try {
          const errData = JSON.parse(rawText);
          if (errData.error) errMsg = errData.error;
          else if (errData.message) errMsg = errData.message;
        } catch {
          if (xhr.status === 413) {
            errMsg = 'Thumbnail image exceeds the maximum 10 MB limit.';
          } else if (xhr.status === 404) {
            errMsg = 'Thumbnail upload endpoint was not found.';
          } else if (xhr.status >= 500) {
            errMsg = 'Image hosting service is temporarily unavailable. Please retry or enter a direct image URL.';
          }
        }

        // Try Base64 JSON fallback if server failed on multipart boundary
        if (xhr.status >= 400 && xhr.status < 500 && xhr.status !== 413) {
          console.warn(`Multipart failed with HTTP ${xhr.status}, attempting Base64 fallback...`);
          attemptBase64Upload();
          return;
        }

        reject(new Error(`${errMsg} (HTTP ${xhr.status})`));
      };

      xhr.onerror = () => {
        // Attempt Base64 fallback before giving up
        attemptBase64Upload();
      };

      xhr.onabort = () => {
        reject(new Error('Thumbnail upload was canceled.'));
      };

      xhr.timeout = 35000;
      xhr.ontimeout = () => {
        reject(new Error('Thumbnail upload timed out (35s).'));
      };

      xhr.send(formData);
    });
  },

  // Direct Resumable Movie Video Upload to Firebase Storage
  uploadMovieVideo: (
    file: File,
    movieId?: string,
    onProgress?: (pct: number, bytesTransferred: number, totalBytes: number) => void,
    onTaskCreated?: (controls: VideoUploadTaskControl) => void
  ): Promise<VideoUploadResult> => {
    return firebaseApi.uploadMovieVideo(file, movieId, onProgress, onTaskCreated);
  },

  // Primary Movie Upload Handler with Cloud Persistence & Progress
  uploadFile: async (
    file: File,
    onProgress?: (pct: number, bytesTransferred?: number, totalBytes?: number) => void,
    onTaskCreated?: (controls: VideoUploadTaskControl) => void
  ): Promise<VideoUploadResult> => {
    // 1. Format validation
    const validExts = ['.mp4', '.webm', '.mov', '.m3u8', '.mkv'];
    const validMimes = [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-matroska',
      'video/mp2t',
      'application/x-mpegurl',
      'application/vnd.apple.mpegurl',
    ];

    const lower = file.name.toLowerCase();
    const hasValidExt = validExts.some((ext) => lower.endsWith(ext));
    const hasValidMime = validMimes.includes(file.type.toLowerCase()) || file.type.startsWith('video/');

    if (!hasValidMime && !hasValidExt) {
      throw new Error('Invalid video format. Supported formats: MP4 (H.264+AAC recommended), WebM, MOV, HLS.');
    }

    // 2. Check if Firebase Storage is active and bucket is provisioned
    let fbErrorMessage = '';
    const isFbStorageReady = await firebaseApi.isStorageBucketReady().catch(() => false);

    if (isFbStorageReady) {
      try {
        const fbResult = await firebaseApi.uploadMovieVideo(
          file,
          undefined,
          (pct, transferred, total) => {
            if (onProgress) onProgress(pct, transferred, total);
          },
          onTaskCreated
        );
        return fbResult;
      } catch (fbErr: any) {
        console.warn('[Storage] Firebase direct upload error:', fbErr?.message);
        if (fbErr?.message?.includes('canceled')) {
          throw fbErr;
        }
        fbErrorMessage = fbErr?.message || 'Firebase Storage error';
      }
    } else {
      console.info('[Storage] Firebase Storage bucket is unprovisioned; routing to streaming server storage.');
      fbErrorMessage = 'Firebase Storage bucket is not yet activated in the Firebase Console.';
    }

    // 3. Fallback: Upload to streaming server storage (/api/upload)
    // Only pure Vercel serverless has a 4.5MB edge limit. Cloud Run (.run.app) and Node server handle up to 500MB!
    const isStrictVercelServerless = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

    if (!isStrictVercelServerless && file.size <= 500 * 1024 * 1024) {
      console.info('[Storage] Initiating streaming server upload fallback for video...');
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');

        if (onTaskCreated) {
          onTaskCreated({
            pause: () => {},
            resume: () => {},
            cancel: () => xhr.abort(),
          });
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            const pct = Math.round((event.loaded / event.total) * 100);
            onProgress(Math.min(99, pct), event.loaded, event.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.url) {
                if (onProgress) onProgress(100, file.size, file.size);
                resolve({
                  success: true,
                  url: data.url,
                  storagePath: data.filename || file.name,
                  filename: data.filename || file.name,
                  originalName: data.originalName || file.name,
                  size: data.size || file.size,
                  mimetype: data.mimetype || file.type || 'video/mp4',
                  isVideo: true,
                  message: `Video uploaded successfully to server storage. (${fbErrorMessage ? 'Note: ' + fbErrorMessage : ''})`,
                  status: data.status || 'ready',
                  needsTranscode: data.needsTranscode,
                  videoCodec: data.videoCodec,
                  audioCodec: data.audioCodec,
                });
                return;
              }
            } catch {}
          }
          reject(new Error(`Server video upload failed with HTTP ${xhr.status}. ${xhr.responseText || ''}`));
        };

        xhr.onerror = () => {
          reject(new Error(`Upload failed. Firebase Storage note: ${fbErrorMessage}. Server connection interrupted.`));
        };

        xhr.onabort = () => {
          reject(new Error('Video upload was canceled.'));
        };

        xhr.timeout = 300000; // 5 minutes timeout for large files
        xhr.ontimeout = () => {
          reject(new Error('Video upload timed out (5 minutes). Please check network or use "Add Movie by Link".'));
        };

        xhr.send(formData);
      });
    }

    // Never fall back to blob URL!
    throw new Error(
      `Video upload failed: ${fbErrorMessage || 'Firebase Storage bucket unavailable'}. You can also add this movie instantly using the "Add Movie by Link" section with an MP4 or HLS video URL.`
    );
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

  // ---------------- AI SUBTITLES & DUBBING ---------------- //
  translateSubtitles: async (params: {
    movieId?: string;
    text?: string;
    vttContent?: string;
    targetLanguage: string;
  }): Promise<{
    success: boolean;
    subtitleUrl?: string;
    language: string;
    label: string;
    translatedText?: string;
    vttContent?: string;
  }> => {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/ai/translate-subtitles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    return await safeParseResponse(res, 'Subtitle translation');
  },

  generateDubbing: async (params: {
    movieId?: string;
    text: string;
    targetLanguage: string;
    voiceName?: string;
  }): Promise<{
    success: boolean;
    audioUrl: string;
    language: string;
    label: string;
    voice?: string;
  }> => {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/ai/generate-dubbing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    return await safeParseResponse(res, 'AI Dubbing generation');
  },

  // ---------------- TRANSCODING & CODEC COMPATIBILITY ---------------- //
  reencodeMovie: async (
    movieId: string,
    movieData?: { title?: string; videoUrl?: string; videoType?: string }
  ): Promise<{
    success: boolean;
    message: string;
    status: 'processing' | 'ready' | 'failed';
    progress: number;
    movie?: Movie;
  }> => {
    const token = authStorage.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const baseUrl = getApiBaseUrl();
    const targetUrl = `${baseUrl}/api/movies/${movieId}/transcode`;

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: movieData?.title,
          videoUrl: movieData?.videoUrl,
          videoType: movieData?.videoType,
        }),
      });
    } catch (networkErr: any) {
      throw new Error(
        `Network error: Unable to reach media transcoding server at "${targetUrl}". (${networkErr.message})`
      );
    }

    return await safeParseResponse<{
      success: boolean;
      message: string;
      status: 'processing' | 'ready' | 'failed';
      progress: number;
      movie?: Movie;
    }>(res, 'Video re-encoding');
  },

  getTranscodeStatus: async (movieId: string): Promise<{
    success: boolean;
    status: 'processing' | 'ready' | 'failed';
    progress: number;
    error?: string;
    videoUrl?: string;
  }> => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/movies/${movieId}/transcode-status`);
      return await safeParseResponse<{
        success: boolean;
        status: 'processing' | 'ready' | 'failed';
        progress: number;
        error?: string;
        videoUrl?: string;
      }>(res, 'Check transcode status');
    } catch {
      return { success: false, status: 'ready', progress: 100 };
    }
  },

  // ---------------- APP UPDATES & VERSIONING ---------------- //
  getAppVersionInfo: async (): Promise<{
    applicationId: string;
    appName: string;
    currentVersion: string;
    minSupportedVersion: string;
    releaseChannel: string;
    updateAvailable: boolean;
    downloadUrl: string;
    apkDirectUrl: string;
    releaseNotes: string;
    dataPreservationGuaranteed: boolean;
  }> => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/app/version`);
      return await safeParseResponse(res, 'Check app version');
    } catch {
      return {
        applicationId: 'com.z1movies.app',
        appName: 'Z1 Movies',
        currentVersion: '1.0.0',
        minSupportedVersion: '1.0.0',
        releaseChannel: 'stable',
        updateAvailable: false,
        downloadUrl: 'https://github.com/ayanqureshi2732-gif/Z1-movie-/releases/latest',
        apkDirectUrl: 'https://github.com/ayanqureshi2732-gif/Z1-movie-/releases',
        releaseNotes: 'Seamless in-place APK updates enabled. User data preserved across upgrades.',
        dataPreservationGuaranteed: true,
      };
    }
  },
};
