# Deployment hardening runbook

Use this runbook for a new production deployment and, in full, before upgrading an existing installation. Do not copy secrets into tickets, shell history, or source control.

## New environment variables

Configure these new variables in this order:

1. `PERSON_KEY_PEPPER` — a persistent, high-entropy secret used to hash person keys.
2. `PUBLIC_ID_SECRET` — a separate persistent, high-entropy secret for opaque public IDs.
3. `CRON_SECRET` — a high-entropy bearer secret for the scheduled retention endpoint.
4. `MAX_MEMBERS_PER_EVENT` — room capacity; the default is `200`.
5. `AI_DAILY_CALL_LIMIT` — global UTC-day AI call budget; the default is `3000`.
6. `RETENTION_DAYS` — event-data retention period; the default is `365`.

The production build throws without `PERSON_KEY_PEPPER` and `PUBLIC_ID_SECRET`. Set both values for **Production** and **Preview**, and back them up in the approved secret manager before deploying. Back up `PERSON_KEY_PEPPER` and `PUBLIC_ID_SECRET` separately and keep each stable: losing the pepper makes existing person keys unrecoverable, while changing either value breaks its respective stable identifiers. Set `CRON_SECRET`, `MAX_MEMBERS_PER_EVENT`, `AI_DAILY_CALL_LIMIT`, and `RETENTION_DAYS` for the environments that run the app. Also configure the Supabase variables and `NEXT_PUBLIC_BASE_URL` from `.env.example`.

## Existing-installation rollout

Before applying migrations, authenticate and link the intended Supabase project:

```sh
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

Then apply migrations with `npx supabase db push --remote`. Supabase CLI v3 targets the local stack by default without `--remote`.

1. **Back up and export the production project.** Take a recoverable Supabase database export, record the currently deployed Vercel configuration, and confirm the secret-manager backups before making any schema or application change. Preserve the exact `PERSON_KEY_PEPPER` for the rehash command and every new app instance.
2. **Prove migrations outside production first.** Apply the timestamped migrations with `npx supabase db push --remote` to a throwaway Supabase project, configure its required secrets, and smoke-test creating an event, joining, organiser exchange, matching, and retention. Investigate any migration or policy failure there before touching the production project.
3. **Migrate and rehash production while writes are paused.** Pause joins and imports, wait for old application instances to drain, and apply the same timestamped migrations to production with `npx supabase db push --remote`. Keep writes paused. Run `npm run rehash:people:dry-run`, review its counts, then run `npm run rehash:people` for real. Complete both commands with the backed-up pepper **before deploying code that expects hashed keys**.

## Deploy the application

Deploy the new application with the same backed-up secrets. Verify that an organiser can create an event, an attendee can join, a returning attendee retains identity, and matching works before reopening writes.

Apply `supabase/migrations/20261102120000_token_sessions_contract.sql.manual` manually only after verifying legacy organiser links through the fragment-to-session exchange flow on the deployed hash-based application. Do not remove the legacy plaintext token columns before that check succeeds.

## Verify public data boundaries

Confirm that anon REST access to `members` is denied on the real project (substitute the real public URL and anon key; do not put the key in a ticket):

```sh
curl -i "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/members?select=id" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
```

Expect a denial response (401 or 403), not member data. If it returns rows or another successful response, stop and repair the real project's grants and RLS before reopening joins.

## Confirm the retention cron

Confirm the retention cron is scheduled in the Vercel dashboard after deployment. `vercel.json` must show `/api/cron/retention` at `0 3 * * *`, and the production endpoint must have the configured `CRON_SECRET`. The job removes expired event data and orphan people, expired sessions and LLM tokens, and rate-limit windows older than two days.

## Rollback notes

Keep the previous deployment available until the smoke checks and access-boundary check pass. If deployment verification fails before the manual contract migration, roll back the Vercel deployment, keep writes paused, and restore the database only from the pre-change export after assessing the changed rows. Do not roll back to an application that writes raw person keys after the rehash; instead, fix forward with the same pepper or restore the matching pre-rehash backup under a deliberate incident plan. The manual contract migration is irreversible without a backup, which is why it comes last.

## Re-run the eval with a real AI_API_KEY

Set `AI_API_KEY` (or the legacy `XAI_API_KEY`) in `.env.local` through the approved secret workflow, then run:

```sh
npm run eval
```

The command in `package.json` runs `scripts/eval.ts` and updates the README evaluation table between its `EVAL` markers. Because Phase 4 changed the rerank prompt format, run this with a real key and update the README eval table with the newly measured results; review and commit that documentation change separately.
