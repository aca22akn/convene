# Data flows and retention

Event data is retained for `RETENTION_DAYS` days (365 by default) and removed daily by the `/api/cron/retention` Vercel cron. Organisers can delete an event earlier. Session and LLM access tokens are deleted after expiry; old rate-limit windows are cleaned after two days.

<!-- AI-PROVIDER:START -->
`members` rows are private to server-side routes and authorised organisers. Public directory rows are available only when `directory_consent` is true, and the public live screen has a reduced projection. xAI receives attendee text only when the event has `ai_enabled = true` and that attendee has `ai_opt_out = false`.

## AI processing decision

`events.ai_enabled` controls whether an event may call xAI. If it is false, extraction, reranking, and Ask use no external AI. When it is true, `members.ai_opt_out` lets an attendee keep their text out of external AI: opted-out people are excluded both as the subject and as candidates in AI prompts, and receive keyword/tag-based matching. The public join notice and README privacy section describe the same rule.

| Column | Stored as | Read by | Sent to xAI | Retention / handling |
|---|---|---|---|---|
<!-- AI-PROVIDER:END -->
| `id` | UUID primary key | Organiser, attendee, server matching | Yes, as the authorised `member_id` in Ask/MCP tools | Deleted with event |
| `event_id` | UUID event foreign key | Organiser, attendee, server matching | No | Deleted with event |
| `person_id` | UUID community person foreign key | Organiser and server-side community tools | No | Person row removed when no members remain |
| `name` | Text | Organiser; matched attendee; opted-in public directory | Only when AI is enabled and attendee has not opted out | Deleted with event |
| `line` | Text | Organiser; matched attendee; room screen quote; opted-in public directory | Only when AI is enabled and attendee has not opted out | Deleted with event |
| `x_handle` | Text | Organiser; matched attendee; opted-in public directory | Ask/MCP may include it when AI is enabled and attendee has not opted out | Deleted with event |
| `speak_on` | Text | Organiser and opted-in public directory | Only when AI is enabled and attendee has not opted out | Deleted with event |
| `contact` | Text, nullable | Organiser only, when consented | No | Stored only with contact consent; deleted with event |
| `contact_consent` | Boolean | Organiser and server | No | Deleted with event |
| `offers` | Text array | Organiser, matched attendee, server-side matching/tools | Ask/MCP may include it when AI is enabled and attendee has not opted out | Deleted with event |
| `seeks` | Text array | Organiser, matched attendee, server-side matching/tools | Ask/MCP may include it when AI is enabled and attendee has not opted out | Deleted with event |
| `topics` | Text array | Organiser and server-side matching/tools | No; retained for server-side matching | Deleted with event |
| `speak_topics` | Text array | Organiser and server-side speaker tools | No; retained for server-side matching | Deleted with event |
| `is_sample` | Boolean | Organiser and server-side matching | No | Deleted with event |
| `created_at` | Timestamp | Organiser and server-side matching | No | Drives event retention; deleted with event |
| `directory_consent` | Boolean | Organiser and directory filter | No | Deleted with event |
| `ai_opt_out` | Boolean | Organiser and server-side AI filtering | No | Deleted with event |
| `source_guest_id` | Text, nullable | Server-side Luma import deduplication | No | Deleted with event |
