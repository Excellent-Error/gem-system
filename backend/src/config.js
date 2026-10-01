import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader (zero-dependency)
const envFile = process.env.ENV_FILE || path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    val = val.replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresSeconds: num(process.env.JWT_EXPIRES_SECONDS, 8 * 60 * 60),
  dbDriver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
  dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  publicRateLimitMax: num(process.env.PUBLIC_RATE_LIMIT_MAX, 30),
  loginRateLimitMax: num(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  rateLimitWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  maxBodyBytes: num(process.env.MAX_BODY_BYTES, 100 * 1024),
};

if (config.env === 'production') {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
  if (!config.cookieSecure) {
    console.error('FATAL: COOKIE_SECURE=true is required in production.');
    process.exit(1);
  }
  if (!config.corsOrigins.length || config.corsOrigins.includes('*')) {
    console.error('FATAL: CORS_ORIGINS must contain explicit trusted origins in production.');
    process.exit(1);
  }
}
if (!config.jwtSecret) {
  config.jwtSecret = 'dev-only-insecure-secret-change-me';
  if (config.env !== 'test') {
    console.warn('WARNING: JWT_SECRET not set — using an insecure development secret. Set JWT_SECRET in .env');
  }
}
