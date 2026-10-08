# Portable frontend image

`deploy/Dockerfile` builds this Next.js static export and serves it with Caddy.
The matching backend repository owns `compose.portable.yaml` and the full
deployment, migration, backup, and rollback instructions in `deploy/PORTABLE.md`:

[Portable deployment guide](https://github.com/Cel3brimbor/WatAgent_backend/blob/deploy/tencent-lighthouse/deploy/PORTABLE.md)

Check out the repositories next to each other as `WatAgent/` and
`WatAgent_backend/`, then follow that guide. Record both commit IDs for a release.
This is an alternative to Vercel; it does not modify `vercel.json` or production.

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are accepted as
build arguments. The API URL is always `same-origin`. Changing the Supabase
project requires rebuilding the image. Environment files and desktop artifacts
are excluded from the Docker context using an allowlist.

Caddy routes `/api` to a loopback backend, preserves streaming responses, serves
exported routes directly, and returns 404 for missing routes. Its enforced
security headers match the existing web policy; the Vercel report-only policy
with build-specific script hashes is not copied. The frontend image contains no
Node runtime or admin panel. The default Caddy upstream assumes Linux host
networking as configured by the backend Compose file.

To verify routing and proxy behavior without production credentials or Docker,
install Caddy locally and run `node deploy/check-proxy.mjs /path/to/caddy`.
The check uses temporary files and a mock API on loopback, then removes them.
