# Lone X resource API

The backend keeps version metadata in the MongoDB Atlas database `lone_x` and serves files from a private Cloudflare R2 bucket. Desktop conversations and local accounts remain in SQLite.

## Run locally

Use Node.js 22 or newer.

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix backend test
npm.cmd --prefix backend start
```

Set these variables in the backend process environment before starting it.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas connection string for an account scoped to the resource database |
| `MONGODB_DATABASE` | Optional database name. Defaults to `lone_x` because MongoDB database names cannot contain spaces |
| `R2_ACCOUNT_ID`, `R2_BUCKET` | Cloudflare account and private resource bucket |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Bucket-scoped object read credentials |
| `RESOURCE_READ_TOKEN`, `RESOURCE_ADMIN_TOKEN` | Distinct random service tokens of at least 32 characters |
| `HOST`, `PORT` | Listener address and port. Defaults to `127.0.0.1` and `3000` |

For Railway, set the service root to `backend` and `HOST` to `0.0.0.0`. Keep all credentials in server variables and access the API through HTTPS.

## Register and download a resource

1. Upload the file to the private bucket at `resources/<id>/<version>/<filename>`.
2. Send its metadata to `POST /v1/resources` with the administrator bearer token. Include `id`, `version`, `filename`, `size` in bytes, and the lowercase hex `sha256`. The API hashes the uploaded object and rejects duplicates of the same ID and version.
3. Use the reader token with `GET /v1/resources` to list the latest 100 available registrations or `GET /v1/resources/<id>/<version>` to fetch one version.
4. Use the reader token with `GET /v1/resources/<id>/<version>/download`. Compare the downloaded file's size and SHA-256 with the metadata before using it. The API refuses objects whose registered ETag or size changed.

`GET /health` reports process availability without authentication. The tests run with simulated storage. A live smoke test requires an Atlas connection and an R2 test object.

An administrator can send `POST /v1/resources/<id>/<version>/withdraw` with the administrator bearer token to remove one version from the catalog and block new downloads. The registration and R2 file are retained. Repeating the request returns the original withdrawal timestamp. Administrators can still read the withdrawn metadata. Publish any replacement under a new version.

## Connect the Windows app

Set `LONEX_RESOURCE_API_URL` to the HTTPS service origin and `LONEX_RESOURCE_READ_TOKEN` to the reader token in the process environment before launching Lone X. Local testing also accepts an HTTP origin on `127.0.0.1`. Open **Settings → Resources**, select a registered version, and click **Download**. Lone X verifies the bytes before saving the file under **Downloads → Lone X Resources**.

## Verify live Atlas and R2 access

With the API running against Atlas and R2, register a small test object using the steps above. Set `LONEX_RESOURCE_TEST_ID` and `LONEX_RESOURCE_TEST_VERSION` to that registration, alongside the API URL and reader token. Then run this from the repository root:

```powershell
node tests/live-resources.cjs
```

The check confirms that anonymous access is rejected and that the registered version downloads with the expected size and SHA-256. It only reads the existing registration and streams the response into a checksum.
