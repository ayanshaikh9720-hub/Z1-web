import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import app from './src/server/app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.resolve(UPLOADS_DIR, 'thumbnails');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBNAILS_DIR)) {
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
}

// Multer storage setup for local/server direct uploads
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
    fileSize: 1024 * 1024 * 500, // 500MB
  },
});

// Dedicated thumbnail storage (Max 10MB, JPG/PNG/WebP)
const thumbnailStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, THUMBNAILS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `poster_${safeBase}_${uniqueSuffix}${ext}`);
  },
});

const uploadThumbnail = multer({
  storage: thumbnailStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (validMimes.includes(file.mimetype) || validExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.'));
    }
  },
});

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

// Static route for thumbnail images
app.get('/uploads/thumbnails/:filename', (req: Request, res: Response) => {
  const filePath = path.join(THUMBNAILS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('Thumbnail not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  fs.createReadStream(filePath).pipe(res);
});

// Video upload endpoint
app.post('/api/upload', upload.single('video'), (req: Request, res: Response) => {
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

// Dedicated Thumbnail upload endpoint (Standalone Image Hosting / CDN)
app.post('/api/upload-thumbnail', uploadThumbnail.single('thumbnail'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file uploaded' });
    return;
  }

  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
  const protocol = (forwardedHost.includes('run.app') || forwardedHost.includes('vercel.app')) ? 'https' : forwardedProto;
  
  const publicUrl = `${protocol}://${forwardedHost}/uploads/thumbnails/${req.file.filename}`;

  res.json({
    success: true,
    url: publicUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    message: 'Thumbnail uploaded and hosted successfully on CDN',
  });
});

// Vite & Static file serving
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
