import Joi from 'joi';

/**
 * Environment contract. The application refuses to start when a required
 * variable is missing or malformed — misconfiguration must fail loudly at boot,
 * not silently at the first request.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('0.0.0.0'),
  APP_TIMEZONE: Joi.string().default('Asia/Tashkent'),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:5173'),
  TRUST_PROXY: Joi.boolean().default(false),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_MIGRATIONS_RUN: Joi.boolean().default(true),
  DB_POOL_SIZE: Joi.number().integer().min(2).max(100).default(20),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),
  COOKIE_SECURE: Joi.boolean().default(false),

  SUPERADMIN_LOGIN: Joi.string().min(3).max(64).required(),
  SUPERADMIN_PASSWORD: Joi.string().min(6).max(128).required(),
  SUPERADMIN_NAME: Joi.string().max(120).default('Суперадмин'),

  UPLOAD_DIR: Joi.string().default('uploads'),
  SWAGGER_ENABLED: Joi.boolean().default(false),

  // Pictures: on this machine ("local") or in Bunny Storage ("bunny").
  // Choosing bunny without its three keys is a configuration error, so the
  // app refuses to start instead of failing at the first upload.
  STORAGE_DRIVER: Joi.string().valid('local', 'bunny').default('local'),
  BUNNY_STORAGE_HOST: Joi.string().default('storage.bunnycdn.com'),
  // The branches are written whole, not as `base.when(...)`: a base with
  // `.allow('').default('')` would satisfy `required()` with an empty string
  // and the app would start with a CDN it cannot talk to.
  BUNNY_STORAGE_ZONE: Joi.when('STORAGE_DRIVER', {
    is: 'bunny',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  BUNNY_STORAGE_PASSWORD: Joi.when('STORAGE_DRIVER', {
    is: 'bunny',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  BUNNY_PULL_ZONE_URL: Joi.when('STORAGE_DRIVER', {
    is: 'bunny',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  BUNNY_FOLDER: Joi.string().allow('').default(''),
});
