# Code Analysis Summary

## Overview
This repository is a small Express-based image service that handles image resize, upload, and delete operations against Firebase Storage. The main application logic is centralized in `index.js`, with minimal helper scripts in `test.js` and `jimp-test/test-jimp.js`.

## Production Runtime Context
- Deployment target is a Samsung Netbook NC110 with Intel Atom CPU, 2GB RAM, 250GB SSD.
- OS is Ubuntu Server 24.04.3 LTS.
- Service lifecycle is managed by PM2 in production.
- This hardware profile explains several implementation choices: stream-first processing, explicit resize concurrency control, and optional `jimp` fallback for CPU compatibility.

## Current Architecture
- `index.js` is a thin process entrypoint; application composition is handled in `app.js`.
- Configuration is separated into `config/env.js` and `config/firebase.js`.
- Request handlers are in `controllers/imageController.js`.
- Route wiring is separated into `routes/systemRoutes.js` and `routes/imageRoutes.js`.
- Middleware concerns are separated into `middleware/*` modules.
- File ingestion is handled with `multer` disk storage into a temp directory (`os.tmpdir()`), then streamed to processors/storage.
- Image processing supports two engines:
  - `sharp` (default, stream-based)
  - `jimp` (fallback for CPU compatibility)
- Storage backend is Firebase Storage via Admin SDK bucket APIs.

## API Surface
- `GET /health`: liveness check.
- `GET /debug`: returns client IP and region.
- `POST /resize`: accepts `image` file, resizes to width 1440, outputs JPEG bytes.
- `POST /upload`: uploads original image to `images/` and returns URL (public or signed by config).
- `POST /resize-upload`: resizes to JPEG, uploads, and returns URL (public or signed by config).
- `POST /delete-image`: deletes `images/{imgName}` from bucket.

## Reliability and Security Controls
- CORS allowlist with explicit trusted origins.
- Request throttling via `express-rate-limit` (`defaultLimiter` and `heavyLimiter`).
- File size enforcement via Multer limit + pre-check middleware (`multipartSizeGuard`).
- MIME gate for images and cleanup of temporary files in `finally` blocks.
- Structured JSON logging with runtime log-level filtering.

## Key Strengths
- Good use of streaming (`pipeline`) to reduce memory pressure.
- Concurrency control (`createSemaphore`) for expensive resize operations.
- Consistent validation across upload endpoints.
- Sensible operational env flags (`MAX_FILE_SIZE_MB`, `IMAGE_PROCESSOR`, `FIREBASE_UPLOAD_ACL`).

## Gaps and Improvement Opportunities
- Integration-level endpoint tests are still missing (current coverage is unit-focused).
- Env-only credential loading is now enforced (`FIREBASE_SERVICE_ACCOUNT_PATH` required); keep service-account files outside version control.
- Upload URL strategy is now configurable via env: `FIREBASE_URL_MODE=public|signed` with signed URL TTL support.
- Legacy `crypto` npm dependency was removed; the project now avoids the deprecated package and relies on Node built-ins when needed.
- Low-memory guardrails are now enforced in env config (`LOW_MEMORY_MODE`, capped `MAX_FILE_SIZE_MB`, capped `RESIZE_CONCURRENCY`).

## Supporting Scripts
- `test.js`: simple Node runtime sanity log.
- `jimp-test/test-jimp.js`: isolated Jimp load/read check using sample image.

## Automated Test Coverage
- Formal tests are now configured via `npm test` (`node --test \"tests/**/*.test.js\"`).
- Current tests cover:
  - env parsing defaults/overrides (`tests/env.test.js`)
  - concurrency semaphore behavior (`tests/semaphore.test.js`)
  - multipart size guard logic (`tests/multipartSizeGuard.test.js`)
  - delete-image controller outcomes (`tests/imageController.test.js`)
