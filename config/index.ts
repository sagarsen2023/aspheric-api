export const appConfig = () => ({
  port: process.env.PORT,
  mongoDBUrl: process.env.MONGODB_URL,
  bcryptSaltRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10'),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpirationTime: Number.parseInt(
    process.env.JWT_EXPIRATION_TIME ?? '604800',
  ), // Default to 7 days in seconds
  nodeEnvironment: process.env.NODE_ENV,

  // ? Cloudflare R2 storage
  r2Endpoint: process.env.R2_ENDPOINT,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
});
