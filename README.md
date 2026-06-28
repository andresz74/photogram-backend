# Photogram Backend (Image Upload Service)

Express service for resizing, uploading, deleting, and listing Photogram images. Legacy Firebase Storage endpoints remain available, and the provider-backed MVP can run with Firebase Auth, SQLite metadata, and local filesystem storage.

## Features
- Resize to 1440px width and compress to JPEG (quality 80) via `/resize`.
- Upload original image to Firebase Storage via `/upload`.
- Resize then upload via `/resize-upload`.
- Delete images from Firebase Storage via `/delete-image`.
- Provider-backed image API at `/images/*` for local MVP mode.
- Public local media serving at `/media/*` when `STORAGE_PROVIDER=local`.
- Health/debug endpoints plus size limits and a CORS allowlist.

## Prerequisites
- Node.js 18+
- Firebase project with Storage enabled.
- Firebase service account JSON file available on disk.

## Configuration
Set environment variables as needed:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `AUTH_PROVIDER` | Auth provider (`firebase` or future `local`) | `firebase` |
| `DATABASE_PROVIDER` | Metadata provider (`sqlite` or future `firebase`) | `sqlite` |
| `STORAGE_PROVIDER` | Image storage provider (`local` or future `firebase`) | `local` |
| `SQLITE_PATH` | SQLite metadata database path for local MVP mode | `./data/photogram.sqlite` |
| `LOCAL_STORAGE_ROOT` | Local image storage root | `./data/images` |
| `PUBLIC_MEDIA_BASE_URL` | Public URL base for local media URLs | `http://localhost:3000/media` |
| `MAX_FILE_SIZE_MB` | Upload limit (in MB) | `5` |
| `RESIZE_CONCURRENCY` | Max concurrent resize jobs (guardrailed by memory profile) | `1` |
| `LOW_MEMORY_MODE` | Memory profile mode (`true` or `false`) used for safety caps | `true` |
| `DEFAULT_RATE_LIMIT_MAX` | Per-minute limit for light endpoints | `60` |
| `HEAVY_RATE_LIMIT_MAX` | Per-minute limit for heavy endpoints (`/resize`, `/resize-upload`, `POST /images`) | `8` |
| `ENABLE_DEBUG_ENDPOINT` | Enable `/debug` endpoint (`true` or `false`) | `false` |
| `UPLOAD_TEMP_CLEANUP_ENABLED` | Enable periodic cleanup of stale temp upload files | `true` |
| `UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS` | Temp cleanup interval in seconds | `300` |
| `UPLOAD_TEMP_STALE_AGE_SECONDS` | File age threshold for deletion in seconds | `900` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON | **required** (no fallback) |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name; required when `STORAGE_PROVIDER=firebase` | none |
| `IMAGE_PROCESSOR` | Image engine for `/resize` + `/resize-upload` (`sharp` or `jimp`) | `sharp` |
| `FIREBASE_UPLOAD_ACL` | GCS predefined ACL for uploads (`publicRead`, etc). Set `none` to rely on bucket policy. | `publicRead` |
| `FIREBASE_URL_MODE` | Upload response URL type (`public` or `signed`) | `signed` |
| `FIREBASE_SIGNED_URL_EXPIRES_SECONDS` | Signed URL TTL in seconds (used when `FIREBASE_URL_MODE=signed`) | `300` |

## Provider-Backed MVP Mode
Use this mode for the current Samsung NC110 target while keeping Firebase Auth:

```bash
AUTH_PROVIDER=firebase \
DATABASE_PROVIDER=sqlite \
STORAGE_PROVIDER=local \
SQLITE_PATH=./data/photogram.sqlite \
LOCAL_STORAGE_ROOT=./data/images \
PUBLIC_MEDIA_BASE_URL=http://localhost:3000/media \
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/photogram/firebase-service-account.json \
LOW_MEMORY_MODE=true \
MAX_FILE_SIZE_MB=5 \
RESIZE_CONCURRENCY=1 \
HEAVY_RATE_LIMIT_MAX=8 \
ENABLE_DEBUG_ENDPOINT=false \
IMAGE_PROCESSOR=sharp \
npm start
```

Canonical provider-backed routes:

- `GET /images/public`
- `GET /images/me`
- `POST /images`
- `DELETE /images/:imageId`
- `PATCH /images/:imageId/visibility`
- `POST /images/:imageId/archive`
- `POST /images/:imageId/unarchive`
- `GET /media/*`

Quick validation:

```bash
npm install
npm test
node --check index.js
node --check app.js

curl http://localhost:3000/health
curl http://localhost:3000/images/public
curl -H "Authorization: Bearer <firebase-id-token>" http://localhost:3000/images/me
curl -X POST -H "Authorization: Bearer <firebase-id-token>" \
  -F "image=@/path/to/photo.jpg" \
  -F "description=Provider-backed upload" \
  -F "isPublic=true" \
  http://localhost:3000/images
curl -X DELETE -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/<image-id>
curl -X PATCH -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"isPublic":false}' \
  http://localhost:3000/images/<image-id>/visibility
curl -X POST -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/<image-id>/archive
curl -X POST -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/<image-id>/unarchive
curl http://localhost:3000/media/users/<uid>/images/<image-id>.jpg
```

Upload edge cases to validate before deployment: valid image, non-image file, empty payload, and oversize payload using `MAX_FILE_SIZE_MB`.

## Setup
```bash
npm install
```

Start the server (example with PM2):
```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/path/service-account.json PORT=3000 MAX_FILE_SIZE_MB=5 pm2 start index.js --name photogram-backend
```

## API
All endpoints expect `multipart/form-data` with the file field named `image` unless noted.

- `POST /resize` — Resize/compress and return the JPEG bytes. Response `Content-Type: image/jpeg`.
- `POST /upload` — Upload original image to Firebase Storage and return `{ url }`.
- `POST /resize-upload` — Resize/compress, upload to Storage, and return `{ url }`.
- `POST /delete-image` — JSON body `{ "imgName": "file-name.jpg" }` to delete from `images/` in the bucket.
- `GET /images/public` — List public provider-backed image DTOs.
- `GET /images/me` — List authenticated user's provider-backed image DTOs.
- `POST /images` — Authenticated provider-backed upload using the `image` form field.
- `DELETE /images/:imageId` — Authenticated provider-backed delete.
- `PATCH /images/:imageId/visibility` — Authenticated owner visibility update.
- `POST /images/:imageId/archive` — Authenticated owner archive action.
- `POST /images/:imageId/unarchive` — Authenticated owner unarchive action.
- `GET /media/*` — Serve local media only when local storage is selected.
- `GET /health` — Returns `OK`.
- `GET /debug` — Returns basic request info (IP, region).

## CORS
Allowed origins are defined in `middleware/cors.js` (`apps.andreszenteno.com`, localhost, LAN IPs). Update `allowedOrigins` there if your frontend runs elsewhere.

## Notes
- Only image uploads are accepted; non-image requests are rejected with `400`.
- On low-memory hosts (`LOW_MEMORY_MODE=true`), runtime guardrails clamp `MAX_FILE_SIZE_MB` to `10` and `RESIZE_CONCURRENCY` to `1`.
- Heavy endpoint rate limit is also clamped in low-memory mode (`HEAVY_RATE_LIMIT_MAX` cap `12`, default `8`).
- `FIREBASE_SERVICE_ACCOUNT_PATH` is required. Do not rely on in-repo credential files.
- For private workflows, set `FIREBASE_URL_MODE=signed` so upload endpoints return time-limited signed URLs instead of public object URLs.
- `/debug` is disabled by default unless `ENABLE_DEBUG_ENDPOINT=true`.
- Some very old CPUs (e.g. Atom-era netbooks) may crash when loading `sharp`/libvips (`invalid opcode` / `SIGILL`). If that happens, set `IMAGE_PROCESSOR=jimp` (higher CPU/RAM), or rebuild `sharp` on that machine against a compatible libvips.

## Breaking Changes (v2.0.0)
- `FIREBASE_SERVICE_ACCOUNT_PATH` is now required. Startup will fail if it is missing or invalid.
- Runtime defaults now include low-memory guardrails:
  - `LOW_MEMORY_MODE=true`
  - low-memory clamp for `MAX_FILE_SIZE_MB` (cap `10`)
  - low-memory clamp for `RESIZE_CONCURRENCY` (cap `1`)
- Rate limits are now configurable and guardrailed:
  - `DEFAULT_RATE_LIMIT_MAX`
  - `HEAVY_RATE_LIMIT_MAX` (defaults lower on low-memory hosts, with caps)
- `/debug` endpoint behavior changed:
  - `ENABLE_DEBUG_ENDPOINT=false` disables it unless explicitly enabled.
