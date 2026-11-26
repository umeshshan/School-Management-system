import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import authRoutes from './src/routes/authRoutes.ts';
import adminRoutes from './src/routes/adminRoutes.ts';
import teacherAndMarksRoutes from './src/routes/teacherAndMarksRoutes.ts';
import portalAndAnalyticsRoutes from './src/routes/portalAndAnalyticsRoutes.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', teacherAndMarksRoutes);
  app.use('/api', portalAndAnalyticsRoutes);

  // Error handler for Multer / API routes
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Unhandled API error:', err);
      res.status(400).json({ error: err.message || 'Request failed.' });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Acadexia School Portal listening on http://localhost:${PORT}`);
  });
}

startServer();
