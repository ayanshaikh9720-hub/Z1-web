import type { Request, Response } from 'express';
import { loadDB, verifyToken } from '../../src/server/db';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifyToken(authHeader.split(' ')[1]);
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
  }

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

  return res.status(200).json({
    totalMovies,
    totalUsers,
    totalViews,
    totalDownloads,
    publishedCount,
    unpublishedCount,
    recentlyAdded,
  });
}
