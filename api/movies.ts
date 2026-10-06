import type { Request, Response } from 'express';
import crypto from 'crypto';
import { loadDB, saveDB, verifyToken, TokenPayload } from '../src/server/db';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const db = loadDB();

  if (req.method === 'GET') {
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

    return res.status(200).json({ movies: list, total: list.length });
  }

  if (req.method === 'POST') {
    // Admin check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = verifyToken(authHeader.split(' ')[1]);
    if (!payload || payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
    }

    let data = req.body;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { data = {}; }
    }

    if (!data.title || !data.videoUrl) {
      return res.status(400).json({ error: 'Title and Video URL are required' });
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

    return res.status(201).json({ success: true, movie: newMovie });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
