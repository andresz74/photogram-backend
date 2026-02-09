# Release Notes v2.0.0

## Summary
This release is a major operational hardening update with modular architecture, stronger credential handling, low-memory guardrails, and formal automated tests.

## Breaking Changes
- `FIREBASE_SERVICE_ACCOUNT_PATH` is now mandatory.
- Startup exits if the service account path is missing or invalid.
- Runtime defaults/limits now enforce low-memory-safe behavior when `LOW_MEMORY_MODE=auto|true`.
- `/debug` is disabled by default in production (`ENABLE_DEBUG_ENDPOINT=auto`).

## New Runtime Controls
- `LOW_MEMORY_MODE`
- `MAX_FILE_SIZE_MB` (with low-memory cap)
- `RESIZE_CONCURRENCY` (with low-memory cap)
- `DEFAULT_RATE_LIMIT_MAX`
- `HEAVY_RATE_LIMIT_MAX` (with low-memory cap)
- `UPLOAD_TEMP_CLEANUP_ENABLED`
- `UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS`
- `UPLOAD_TEMP_STALE_AGE_SECONDS`
- `FIREBASE_URL_MODE` and `FIREBASE_SIGNED_URL_EXPIRES_SECONDS`

## Security and Reliability
- Removed in-repo Firebase credential fallback.
- Added temp upload directory stale-file cleanup loop.
- Added configurable signed URL responses for private workflows.
- Added production-safe debug route gating.

## Quality
- Added formal test suite using Node test runner.
- Current test status: passing on branch before release tag.
