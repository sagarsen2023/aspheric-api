# Aspheric API

NestJS API for Aspheric authentication, email delivery, and queued website audits.

## Requirements

- Node.js 24+
- MongoDB
- Redis

Copy the environment variables used by `config/index.ts` into `.env`. At minimum,
`MONGODB_URL` and `JWT_SECRET` are required. Set `CORS_ORIGINS` to a comma-separated
list of allowed console origins.

## Commands

```bash
npm install
npm run start:dev
npm run lint
npm run build
```

## API areas

- `POST /auth/*`: registration, login, password recovery, and sessions
- `GET|POST /audit/*`: queue and read website readiness audits

There is intentionally no generic public user CRUD API. Profile reads and updates
are available only through authenticated `/auth/profile` endpoints.

## Audit processing

Audit jobs run through BullMQ. Redis also backs request limits and the per-client
in-flight audit lock. MongoDB stores audit reports for 30 days.

Set `LIGHTHOUSE_PROVIDER=local` to run Lighthouse locally or leave it unset to use
PageSpeed Insights. Local Lighthouse requires a Chrome installation.
