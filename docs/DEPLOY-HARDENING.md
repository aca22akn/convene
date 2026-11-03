# Deployment runbook

## Before the first Vercel deploy

1. Generate independent, high-entropy values for `PERSON_KEY_PEPPER` and `PUBLIC_ID_SECRET`.
2. In Vercel Project Settings → Environment Variables, set both variables for **Production** and **Preview** before triggering the first deployment. The production build fails when `PERSON_KEY_PEPPER` is missing; `PUBLIC_ID_SECRET` is required in production when opaque live IDs are generated.
3. Back up `PERSON_KEY_PEPPER` in the approved secret manager or another secure backup. Keep it unchanged across deployments and maintenance commands. Losing it makes existing person keys unrecoverable; changing it requires rehashing the stored person keys.
4. Keep `PUBLIC_ID_SECRET` stable across deployments so opaque live member IDs do not change. It is separate from `SUPABASE_SERVICE_ROLE_KEY` and must not be derived from it.
5. Configure the remaining values from `.env.example` in the environments that need them. Set `NEXT_PUBLIC_BASE_URL` to the deployment's public URL.

## Existing installations

Before deploying a version that hashes person keys, use the same backed-up `PERSON_KEY_PEPPER` for the maintenance command and every app instance. Apply the standard timestamped migrations with `npx supabase db push`. Pause joins and imports, wait for old app instances to drain, and keep writes paused through the rehash and deployment. Run `npm run rehash:people:dry-run`, review the counts, then run `npm run rehash:people`. Deploy with the same pepper, verify organiser links and returning-member identity, and resume writes. Apply `supabase/migrations/20261102120000_token_sessions_contract.sql.manual` only after verifying the hash-based app and legacy organiser-link exchange flow.
