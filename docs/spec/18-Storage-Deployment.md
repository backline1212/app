# 18 - Storage Architecture & Deployment

## 18.1 Cloudflare R2 Folder Structure

```
r2://backline-prod/
  screenshots/{workspace_id}/{project_id}/{uuid4}.jpg
  uploads/{workspace_id}/{project_id}/{uuid4}.{ext}             # generalized comment uploads
  snapshots/{project_id}/{revision_id}/snapshot.json.gz
  snapshots/{project_id}/{revision_id}/crops/{node_id}.png     # Tier 3 visual fingerprint, v-next
  exports/{workspace_id}/{export_id}.zip                        # v-next data export feature
```

## 18.2 Signed URLs

- **Uploads**: SDK never gets R2 credentials. `POST /uploads` returns a short-lived (5 min) pre-signed PUT URL scoped to a single key, generated server-side after validating the requester's session/permission for that project.
- **Reads**: screenshots served via signed GET URLs (1 hour TTL) generated on-demand when the dashboard/widget fetches a comment - not public bucket access, since screenshots may contain team-only-adjacent context even for client-visible comments (page content the agency doesn't intend to be publicly enumerable).

## 18.3 Lifecycle & Compression

- Screenshots: compressed to JPEG (quality 80) client-side before upload where the browser supports `OffscreenCanvas`/`toBlob` quality control, to keep upload size and R2 storage cost down.
- Snapshots: gzip-compressed JSON; lifecycle rule deletes snapshot blobs for revisions older than the 5 most recent per page **once** no comment references that revision as its `snapshot_ref` - comments that still point at an old revision keep it alive (never delete a snapshot a live comment's anchor depends on).
- CDN caching: screenshot signed-GET responses set `Cache-Control` short (5 min) since URLs are signed and rotate; snapshot blobs (fetched only by backend jobs, never browser-cached) have no CDN caching concern.
- Destructive cleanup: confirmed project hard-delete writes durable bucket/key
  tombstones, retries idempotent object deletion through Arq, and does not delete Mongo
  dependents until every project object is deleted. Accepted project prefixes include
  both `screenshots/` and `uploads/` UUID layouts so legacy/current uploads remain
  cleanable. See TDR-0014.

## 18.4 Environments & Provisioning

| Env | Frontend | Backend | DB | Redis | R2 bucket |
|---|---|---|---|---|---|
| local | `pnpm dev` | `uvicorn --reload` | native `mongod` (or Docker Compose Mongo) | native `redis-server` (or Docker Compose Redis) | local MinIO (R2-compatible) |
| preview | Vercel PR preview | Railway PR service | Atlas `preview` cluster | Railway Redis addon | `backline-preview` bucket |
| staging | Vercel `staging` | Railway `staging` | Atlas `staging` cluster | Railway Redis | `backline-staging` bucket |
| production | Vercel `main` | Railway `production` | Atlas `production` (backed up daily) | Railway Redis (persistence on) | `backline-prod` bucket |

## 18.5 Environment Variables (backend, representative - full list maintained in `.env.example`)

```
MONGO_URI=
REDIS_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
JWT_SIGNING_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
RESEND_API_KEY=
CLICKUP_OAUTH_CLIENT_ID=
CLICKUP_OAUTH_CLIENT_SECRET=
TRELLO_API_KEY=
ENVIRONMENT=local|preview|staging|production
```
Secrets are never committed; `.env.example` documents names/shapes only. Railway/Vercel environment variable stores hold actual values per environment.

## 18.6 Local Dev Services

`docker-compose.yml` provisions MongoDB, Redis, and MinIO (R2-API-compatible) for machines with Docker available. On machines without Docker (see TDR-0001), `infra/local/*.sh` scripts start native `mongod`/`redis-server`/`minio` binaries against the same ports and data-dir layout, so the application code and env vars are identical either way. Backend and frontend run natively (not containerized) in local dev for fast reload; they're containerized only for Railway deployment (`backend/Dockerfile`).

## 18.7 Feature Flags

A minimal flag system from day one (not a full LaunchDarkly-style service pre-MVP): a `feature_flags` collection (`{ key, workspace_id?, enabled }` - `workspace_id: null` means global default), read once at request-start into a request-scoped context, exposed via a `use_feature_flag(key)` dependency on the backend and a `useFeatureFlag(key)` hook on the frontend (backed by a value returned in the auth/bootstrap response, not a separate polled endpoint). Used for staged rollout of new integrations (e.g., Asana when it's implemented) without a full deploy-gated release.

## 18.8 Deployment Pipeline Summary (detail in `19-Testing-CI.md`)

`main` push -> Vercel auto-deploys the frontend and Railway auto-deploys services whose
watch paths match the commit, using each platform's GitHub integration. GitHub Actions
is intentionally disabled (TDR-0027), so contributors run the documented local
verification before merge and the operator runs the smoke test after significant
deployments.
