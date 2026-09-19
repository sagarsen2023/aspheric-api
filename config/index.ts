export const appConfig = () => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  mongoDBUrl: process.env.MONGODB_URL,
  bcryptSaltRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10'),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpirationTime: Number.parseInt(
    process.env.JWT_EXPIRATION_TIME ?? '604800',
  ), // Default to 7 days in seconds
  nodeEnvironment: process.env.NODE_ENV,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  // ? Redis (BullMQ queue + rate limiting)
  redisHost: process.env.REDIS_HOST ?? '127.0.0.1',
  redisPort: Number.parseInt(process.env.REDIS_PORT ?? '6379'),
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: Number.parseInt(process.env.REDIS_DB ?? '0'),
});

export const validateEnvironment = (
  environment: Record<string, string | undefined>,
) => {
  for (const key of ['MONGODB_URL', 'JWT_SECRET']) {
    if (!environment[key]) throw new Error(`${key} is required`);
  }

  for (const key of ['PORT', 'BCRYPT_SALT_ROUNDS', 'JWT_EXPIRATION_TIME']) {
    const value = environment[key];
    if (value && (!Number.isInteger(Number(value)) || Number(value) <= 0)) {
      throw new Error(`${key} must be a positive integer`);
    }
  }

  return environment;
};
