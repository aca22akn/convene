# Security policy

## Reporting

Please do not disclose a suspected vulnerability in a public issue. Use the repository's private GitHub vulnerability-reporting flow when it is available. If private reporting is unavailable, contact the repository owner privately with reproduction steps, impact, affected route or commit, and any proposed mitigation. Allow time for a fix before public disclosure.

## Threat model

Convene treats attendee-provided profile text, contacts, organiser tokens, and Supabase credentials as sensitive. It defends against unauthenticated reads of application tables, event-token scope escalation, token leakage through URLs, malicious CSV/vCard values, oversized or repeated requests, prompt injection, and concurrent intro commits that could exceed capacity. It does not make user-entered free text trustworthy; organisers must tell attendees that their name and line can appear in the event experience.

Server-side routes use the Supabase service role; browser clients use only the public anon key. Private tables deny anon REST reads, and live changes are delivered as private broadcast notifications rather than row-level database subscriptions. Rate limits and AI budgets are Postgres-backed. These controls reduce abuse but do not replace operational monitoring, account security, or a review of self-hosted proxy configuration.

## Token model

New organiser and community tokens are high-entropy values shown once and stored as SHA-256 hashes. Event tokens authorize only that event; community tokens authorize that community and its events. Organiser links carry a token only in the URL fragment, then exchange it for a 12-hour `HttpOnly`, `Secure`, `SameSite=Strict` server-side session cookie. API routes do not accept token query parameters. The manual token contract migration must wait until legacy organiser links have been verified through this exchange flow.

## Public data

The public stage receives first-name display data and introduction headlines, not private member rows. The public community directory contains only attendees who explicitly set `directory_consent`; it does not include contacts. Matched attendees and authorised organisers receive the fields needed for their view. `docs/DATA.md` lists each stored member field, its readers, xAI handling, and retention. When AI is enabled for an event, attendees may set `ai_opt_out` so their text is excluded from external AI prompts.

## Deployment responsibilities

Keep `PERSON_KEY_PEPPER`, `PUBLIC_ID_SECRET`, `CRON_SECRET`, the service-role key, and organiser tokens in a secure secret manager. Set required secrets for both Production and Preview, back them up, restrict Vercel and Supabase access, and follow [`docs/DEPLOY-HARDENING.md`](docs/DEPLOY-HARDENING.md) before migrating an existing installation.
