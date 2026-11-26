import { isAbsolute, resolve } from 'node:path';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  timezone: string;
  corsOrigins: string[];
  trustProxy: boolean;
  uploadDir: string;
  swaggerEnabled: boolean;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
  ssl: boolean;
  logging: boolean;
  migrationsRun: boolean;
  poolSize: number;
}

export interface AuthConfig {
  accessSecret: string;
  accessTtl: string;
  refreshTtlDays: number;
  cookieSecure: boolean;
  superadmin: { login: string; password: string; fullName: string };
}

/** Where uploaded pictures are kept. */
export type MediaDriver = 'local' | 'bunny';

export interface BunnyConfig {
  /** storage.bunnycdn.com, or the regional host of the zone (se., ny., …). */
  storageHost: string;
  storageZone: string;
  /** Storage-zone password; write access, never sent to the browser. */
  accessKey: string;
  /** Pull-zone origin the pictures are served from. */
  pullZoneUrl: string;
  /** Optional prefix inside the zone, so one zone can hold several venues. */
  folder: string;
}

export interface MediaConfig {
  driver: MediaDriver;
  uploadDir: string;
  bunny: BunnyConfig;
}

export interface Config {
  app: AppConfig;
  db: DatabaseConfig;
  auth: AuthConfig;
  media: MediaConfig;
}

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === '' ? fallback : value === 'true';

const num = (value: string | undefined, fallback: number): number =>
  value === undefined || value === '' ? fallback : Number(value);

/**
 * Typed view over process.env. Values are already validated by Joi
 * (see env.validation.ts); defaults here mirror the schema defaults.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const uploadDir = env.UPLOAD_DIR || 'uploads';
  return {
    app: {
      env: (env.NODE_ENV as AppConfig['env']) || 'development',
      port: num(env.PORT, 3000),
      host: env.HOST || '0.0.0.0',
      timezone: env.APP_TIMEZONE || 'Asia/Tashkent',
      corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      trustProxy: bool(env.TRUST_PROXY, false),
      uploadDir: isAbsolute(uploadDir)
        ? uploadDir
        : resolve(process.cwd(), uploadDir),
      swaggerEnabled: bool(env.SWAGGER_ENABLED, false),
    },
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: num(env.DB_PORT, 5432),
      username: env.DB_USERNAME ?? 'postgres',
      password: env.DB_PASSWORD ?? '',
      name: env.DB_NAME ?? 'burgutpos',
      ssl: bool(env.DB_SSL, false),
      logging: bool(env.DB_LOGGING, false),
      migrationsRun: bool(env.DB_MIGRATIONS_RUN, true),
      poolSize: num(env.DB_POOL_SIZE, 20),
    },
    media: {
      driver: (env.STORAGE_DRIVER as MediaDriver) || 'local',
      uploadDir: isAbsolute(uploadDir)
        ? uploadDir
        : resolve(process.cwd(), uploadDir),
      bunny: {
        storageHost: env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com',
        storageZone: env.BUNNY_STORAGE_ZONE ?? '',
        accessKey: env.BUNNY_STORAGE_PASSWORD ?? '',
        pullZoneUrl: (env.BUNNY_PULL_ZONE_URL ?? '').replace(/\/+$/, ''),
        folder: (env.BUNNY_FOLDER ?? '').replace(/^\/+|\/+$/g, ''),
      },
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET ?? '',
      accessTtl: env.JWT_ACCESS_TTL || '15m',
      refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 30),
      cookieSecure: bool(env.COOKIE_SECURE, false),
      superadmin: {
        login: env.SUPERADMIN_LOGIN ?? '',
        password: env.SUPERADMIN_PASSWORD ?? '',
        fullName: env.SUPERADMIN_NAME || 'Суперадмин',
      },
    },
  };
}
