import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import app from './src/server/app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

