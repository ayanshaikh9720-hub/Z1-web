import { Movie, User, WatchlistItem, PlaybackProgress, AdminStats, DownloadOption } from '../types';

const TOKEN_KEY = 'z1_movies_token';
const USER_KEY = 'z1_movies_user';

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

async function fetchJSON<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error) errorMsg = errData.error;
      else if (errData.message) errorMsg = errData.message;
    } catch {
      // Fallback
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Movies
  getMovies: (params?: {
    search?: string;
    genre?: string;
    trending?: boolean;
    featured?: boolean;
    published?: boolean;
    sort?: 'newest' | 'views' | 'downloads' | 'rating';
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.genre) query.set('genre', params.genre);
    if (params?.trending !== undefined) query.set('trending', String(params.trending));
    if (params?.featured !== undefined) query.set('featured', String(params.featured));
    if (params?.published !== undefined) query.set('published', String(params.published));
    if (params?.sort) query.set('sort', params.sort);
    if (params?.limit) query.set('limit', String(params.limit));

    const qs = query.toString();
    return fetchJSON<{ movies: Movie[]; total: number }>(`/api/movies${qs ? `?${qs}` : ''}`);
  },

  getMovie: (id: string) => {
    return fetchJSON<{ movie: Movie }>(`/api/movies/${id}`);
  },

  trackDownload: (movieId: string, quality: string) => {
    return fetchJSON<{
      success: boolean;
      downloadUrl: string;
      quality: string;
      format: string;
      fileSize?: string;
    }>(`/api/movies/${movieId}/download-click`, {
      method: 'POST',
      body: JSON.stringify({ quality }),
    });
  },

  // Video Probe & Validation
  validateVideoUrl: (url: string) => {
    return fetchJSON<{
      valid: boolean;
      status: number;
      contentType?: string;
      contentLength?: string;
      message: string;
    }>('/api/validate-video-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  // Admin Movie Management
  createMovie: (data: Partial<Movie>) => {
    return fetchJSON<{ success: boolean; movie: Movie }>('/api/movies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateMovie: (id: string, data: Partial<Movie>) => {
    return fetchJSON<{ success: boolean; movie: Movie }>(`/api/movies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteMovie: (id: string) => {
    return fetchJSON<{ success: boolean; message: string }>(`/api/movies/${id}`, {
      method: 'DELETE',
    });
  },

  togglePublish: (id: string, published?: boolean) => {
    return fetchJSON<{ success: boolean; movie: Movie }>(`/api/movies/${id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    });
  },

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
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('video', file);

      xhr.open('POST', '/api/upload');

      const token = authStorage.getToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('Invalid response from upload server'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during file upload'));
      xhr.send(formData);
    });
  },

  // Auth
  login: async (email: string, password: string) => {
    const data = await fetchJSON<{ success: boolean; token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    return data;
  },

  register: async (name: string, email: string, password: string) => {
    const data = await fetchJSON<{ success: boolean; token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    return data;
  },

  getMe: async () => {
    const data = await fetchJSON<{ user: User }>('/api/auth/me');
    authStorage.setUser(data.user);
    return data.user;
  },

  logout: () => {
    authStorage.clearToken();
  },

  // Watchlist
  getWatchlist: () => {
    return fetchJSON<{ watchlist: WatchlistItem[] }>('/api/user/watchlist');
  },

  toggleWatchlist: (movieId: string) => {
    return fetchJSON<{ success: boolean; inWatchlist: boolean }>('/api/user/watchlist', {
      method: 'POST',
      body: JSON.stringify({ movieId }),
    });
  },

  // Playback Progress
  getProgress: () => {
    return fetchJSON<{ progress: PlaybackProgress[] }>('/api/user/progress');
  },

  saveProgress: (movieId: string, position: number, duration: number) => {
    return fetchJSON<{ success: boolean; progress: PlaybackProgress }>('/api/user/progress', {
      method: 'POST',
      body: JSON.stringify({ movieId, position, duration }),
    });
  },

  // Admin Stats
  getAdminStats: () => {
    return fetchJSON<AdminStats>('/api/admin/stats');
  },

  resetDemoData: () => {
    return fetchJSON<{ success: boolean; message: string }>('/api/admin/reset-demo', {
      method: 'POST',
    });
  },

  // Contact
  submitContact: (data: { name: string; email: string; subject: string; message: string }) => {
    return fetchJSON<{ success: boolean; message: string }>('/api/contact', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
