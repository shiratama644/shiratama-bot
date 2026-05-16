import type { Hono } from 'hono';

export function registerCorsMiddleware(app: Hono): void {
  app.use('*', async (c, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = c.req.header('origin');

    if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) {
      return c.json({ error: 'Origin not allowed.' }, 403);
    }

    if (c.req.method === 'OPTIONS') {
      if (allowedOrigin && requestOrigin === allowedOrigin) {
        c.header('Access-Control-Allow-Origin', allowedOrigin);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Headers', 'Content-Type');
        c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      }
      return c.body(null, 200);
    }

    await next();

    if (allowedOrigin && requestOrigin === allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', 'Content-Type');
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    }
  });
}
