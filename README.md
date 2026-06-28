# Photogram Backend

Express/Firebase Admin backend for Photogram image workflows. The current provider-backed MVP keeps Firebase Auth for identity, stores image metadata in SQLite, stores processed image files on the local filesystem, and preserves legacy Firebase Storage endpoints for compatibility.

Current MVP provider mode:

```env
AUTH_PROVIDER=firebase
DATABASE_PROVIDER=sqlite
STORAGE_PROVIDER=local
```

Firebase Auth verifies ID tokens. SQLite stores normalized image metadata. Local storage keeps processed image files under `LOCAL_STORAGE_ROOT`. Firebase Storage is no longer required for local-storage MVP startup, but legacy Firebase Storage routes still work when bucket config is provided.

## Architecture

```text
Frontend
  -> Photogram backend API
      -> Firebase Auth provider
      -> SQLite image repository
      -> local filesystem storage provider
      -> image processor
```

Provider selection is centralized in:

```text
config/env.js
config/container.js
config/providerRegistry.js
```

Controllers, routes, and services should receive dependencies from the container. They should not branch on provider env values or dynamically load provider modules from env variables.

More detail:

- `docs/photogram-provider-agnostic-system-spec.md`
- `docs/photogram-mvp-implementation-plan.md`
- `docs/backend-mvp-validation.md`

## Environment Variables

Local MVP `.env` example, using backend port `3003`:

```env
NODE_ENV=development
PORT=3003

AUTH_PROVIDER=firebase
DATABASE_PROVIDER=sqlite
STORAGE_PROVIDER=local

FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json

SQLITE_PATH=./data/photogram.sqlite
LOCAL_STORAGE_ROOT=./data/images
PUBLIC_MEDIA_BASE_URL=http://localhost:3003/media

LOW_MEMORY_MODE=true
IMAGE_PROCESSOR=jimp
MAX_FILE_SIZE_MB=5
RESIZE_CONCURRENCY=1
HEAVY_RATE_LIMIT_MAX=8
ENABLE_DEBUG_ENDPOINT=false

FIREBASE_URL_MODE=signed
FIREBASE_SIGNED_URL_EXPIRES_SECONDS=120
```

Notes:

- `FIREBASE_SERVICE_ACCOUNT_PATH` must point to a real Firebase service-account JSON file outside this repo.
- Do not commit service-account JSON files or `.env`.
- `SQLITE_PATH` and `LOCAL_STORAGE_ROOT` must be backed up together.
- `PUBLIC_MEDIA_BASE_URL` must match the backend URL used by clients.
- `IMAGE_PROCESSOR=jimp` is the safer NC110 fallback if `sharp` has native or CPU compatibility issues.
- `FIREBASE_STORAGE_BUCKET` is needed only for legacy Firebase Storage behavior or future Firebase storage mode, not for local-storage MVP startup.
- If you set `FIREBASE_STORAGE_BUCKET`, use the bucket name only. Do not include `gs://`.

## Install And Run

```bash
npm install
npm test
npm start
```

One-shot local MVP run:

```bash
PORT=3003 \
AUTH_PROVIDER=firebase \
DATABASE_PROVIDER=sqlite \
STORAGE_PROVIDER=local \
SQLITE_PATH=./data/photogram.sqlite \
LOCAL_STORAGE_ROOT=./data/images \
PUBLIC_MEDIA_BASE_URL=http://localhost:3003/media \
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json \
LOW_MEMORY_MODE=true \
IMAGE_PROCESSOR=jimp \
MAX_FILE_SIZE_MB=5 \
RESIZE_CONCURRENCY=1 \
HEAVY_RATE_LIMIT_MAX=8 \
ENABLE_DEBUG_ENDPOINT=false \
npm start
```

## Canonical API Routes

Provider-backed routes:

```text
GET    /images/public
GET    /images/me
POST   /images
DELETE /images/:imageId
PATCH  /images/:imageId/visibility
POST   /images/:imageId/archive
POST   /images/:imageId/unarchive
GET    /media/*
```

Auth requirements:

- `GET /images/public` — no auth; lists public, non-archived image DTOs.
- `GET /images/me` — Firebase ID token required; lists current user's images. Supports `?archived=true` and `?includeArchived=true`.
- `POST /images` — Firebase ID token required; uploads one image using multipart field `image`.
- `DELETE /images/:imageId` — Firebase ID token required; deletes owned storage objects and soft-deletes metadata.
- `PATCH /images/:imageId/visibility` — Firebase ID token required; updates `isPublic` for an owned image.
- `POST /images/:imageId/archive` — Firebase ID token required; archives an owned image without deleting files.
- `POST /images/:imageId/unarchive` — Firebase ID token required; restores an archived owned image.
- `GET /media/*` — public local media serving when `STORAGE_PROVIDER=local`.

DTO responses intentionally hide provider internals such as `storageKey`, `thumbnailKey`, filesystem paths, bucket names, and signed URL internals.

## Legacy Routes

These compatibility routes remain preserved:

```text
/health
/resize
/upload
/resize-upload
/delete-image
```

Legacy `/upload`, `/resize-upload`, and `/delete-image` use Firebase Storage behavior and may require `FIREBASE_STORAGE_BUCKET`.

## Manual Validation

Health:

```bash
curl http://localhost:3003/health
```

Public gallery:

```bash
curl http://localhost:3003/images/public
```

User gallery:

```bash
curl -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3003/images/me
```

Upload:

```bash
curl -X POST \
  -H "Authorization: Bearer <firebase-id-token>" \
  -F "image=@/path/to/photo.jpg" \
  -F "description=Provider-backed upload" \
  -F "isPublic=true" \
  http://localhost:3003/images
```

Hide or show:

```bash
curl -X PATCH \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"isPublic":false}' \
  http://localhost:3003/images/<image-id>/visibility
```

Archive:

```bash
curl -X POST \
  -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3003/images/<image-id>/archive
```

Archived view:

```bash
curl -H "Authorization: Bearer <firebase-id-token>" \
  "http://localhost:3003/images/me?archived=true"
```

Unarchive:

```bash
curl -X POST \
  -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3003/images/<image-id>/unarchive
```

Delete:

```bash
curl -X DELETE \
  -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3003/images/<image-id>
```

Media:

```bash
curl http://localhost:3003/media/users/<uid>/images/<image-id>.jpg
```

Legacy upload check:

```bash
curl -X POST \
  -F "image=@/path/to/photo.jpg" \
  http://localhost:3003/resize-upload
```

Upload edge cases to validate before deployment: valid image, non-image file, empty payload, and oversize payload using `MAX_FILE_SIZE_MB`.

## CORS

Local frontend origins should be allowed:

```text
http://localhost:3000
http://127.0.0.1:3000
```

CORS methods must include:

```text
GET,POST,PATCH,DELETE,OPTIONS,HEAD
```

CORS headers must include:

```text
Content-Type,Authorization
```

Preflight check:

```bash
curl -i -X OPTIONS \
  'http://localhost:3003/images/test-image-id/visibility' \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: PATCH' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Allowed origins and methods are configured in `middleware/cors.js`.

## NC110 Deployment Notes

- Run the service under PM2, for example `pm2 start index.js --name photogram-backend`.
- Keep `LOW_MEMORY_MODE=true`.
- Keep `RESIZE_CONCURRENCY=1`.
- Prefer `IMAGE_PROCESSOR=jimp` if `sharp` is unstable on the Atom CPU.
- Keep `MAX_FILE_SIZE_MB=5` unless the host has been tested under load.
- Verify with `pm2 status` and `pm2 logs photogram-backend` after deployment.
- Back up the SQLite DB and local image directory together.
- Keep the Firebase service-account JSON outside the repo.
- Consider Nginx/Caddy for `/media` later if traffic grows beyond low-volume use.

## Testing

```bash
npm test
```

Current test coverage includes:

- env parsing
- provider container
- Firebase Auth provider
- SQLite repository
- local storage provider
- image presenter, image service, and upload service
- canonical image routes
- static media
- CORS
- legacy route preservation

## Safety

Do not commit:

```text
.env
secrets/
service-account JSON
data/
SQLite DB files
uploaded images
node_modules/
firebase-debug.log
```

The repo ignores common local-only files, but review `git status --ignored --short` before committing deployment changes.

## Breaking Changes Since v2.0.0

- `FIREBASE_SERVICE_ACCOUNT_PATH` is required for Firebase Auth.
- Runtime defaults favor low-memory operation.
- `/debug` is disabled unless `ENABLE_DEBUG_ENDPOINT=true`.
- Provider-backed gallery/upload/delete/archive/visibility flows now use backend APIs and SQLite/local storage in MVP mode.
