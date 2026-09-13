export const appConfig = () => ({
  port: process.env.PORT,
  mongoDBUrl: process.env.MONGODB_URL,
  bcryptSaltRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10'),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpirationTime: Number.parseInt(
    process.env.JWT_EXPIRATION_TIME ?? '604800',
  ), // Default to 7 days in seconds
  nodeEnvironment: process.env.NODE_ENV,

  // ? Redis (BullMQ queue + rate limiting)
  redisHost: process.env.REDIS_HOST ?? '127.0.0.1',
  redisPort: Number.parseInt(process.env.REDIS_PORT ?? '6379'),
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: Number.parseInt(process.env.REDIS_DB ?? '0'),
});
