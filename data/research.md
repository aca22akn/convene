# Research: what London community leads deal with today

Gathered with Grok Bot (X search + web) on 22 Oct 2026. Quotes are from public posts. X search reaches back about 30 days.

## Complaints from the partner communities

1. **Charlie Cheesman, Unicorn Mafia (15 Oct 2026), knowing your members.** "Adding new people to WhatsApp contacts. Is this a pain point for others also?" In the replies he says he still adds people by hand.
   - https://x.com/CharlieCheesma1/status/2110628241182507295
   - https://x.com/CharlieCheesma1/status/2110756784860180752
2. **Oli Kingshott, Night Office (around Jul 2026), engagement.** "How will people actually use and engage with what you've been building?" (Weak: framed as a gap Night Office fills.)
   - https://www.linkedin.com/posts/oliland_night-office-is-doubling-in-bookings-every-activity-7488933066401558528-cEH-
3. **Fergus McKenzie-Wilson, Unicorn Mafia (around Jul 2026), introductions.** Communities "create the conditions for exceptional people to find each other." (Reflection, not a complaint.)
   - https://www.linkedin.com/posts/fergtech_some-of-the-best-founders-werent-even-founders-activity-7480270027754119168-k_3B
4. **Francisco Terpolilli, hackathon host (9 Oct 2026), knowing your members.** "Why people join, why they stay..." described as "a common topic across community leads."
   - https://x.com/frankterpo/status/2108541165830275243
   - https://x.com/frankterpo/status/2108541169114259783

## Other London organisers

5. **Hugh Evans, AIDLE / Not Another Pizza (Apr 2025), finding speakers.** Biggest challenges included "finding speakers"; wanted speakers to apply "rather than having to constantly go out chasing them."
   - https://hughevans.dev/not-another-pizza/
6. **Emily Webber, Agile on the Bench (Feb 2016), finding speakers.** "Finding new and interesting speakers and maintaining diversity... a challenge that many organisers face."
   - https://emilywebber.co.uk/diversity-in-public-speaking-help-your-friends-find-their-voice/
7. **Jonny Spicer, EA London Tech (Dec 2023), knowing your members and follow-up.** "It's hard to get good data about your community without a lot of investment" and "we have no systematic way to follow up with them."
   - https://jonnyspicer.com/blog/what-i-learned-in-my-first-year-of-community-building/
8. **Thinkers & Tinkerers, people not mingling.** "Pub meetups where you talk to five people for four minutes each and remember none of them."
   - https://thinkersandtinkerers.com/

## What leads use today

Luma for events and WhatsApp for the community show up almost everywhere.

| Community | Tools |
|---|---|
| Unicorn Mafia | Luma, GitHub README member-company directory, WhatsApp (https://github.com/unicorn-mafia/unicorn-mafia) |
| AI Agents Lab | Luma, own site with community and speaker pages (https://luma.com/aiagentslab, https://www.aiagentslab.uk/community) |
| Night Office | Own venue-booking platform, WhatsApp (https://nightoffice.co/) |
| Hackradar | Discord (2,000+), WhatsApp community; product pulls events from WhatsApp, Luma and Discord (https://hackradar.tech/, https://x.com/keanucz/status/2110353909407498677) |
| The Hack Collective | One WhatsApp group of 1,100+ builders, Luma (https://hackcollective.uk/, https://luma.com/thehackcollective) |
| Corgi | Luma, WhatsApp channel, handwritten paper job board kept offline on purpose (https://www.linkedin.com/posts/claudiamaggi_hiring-want-to-get-hired-theres-a-new-activity-7517185290101526529-EvDe) |
| AI Pilled | Luma with host-approved sign-ups and waitlists, LinkedIn (https://luma.com/ai-pilled) |

## Luma guest CSV export format

- One row per ticket. Each custom registration question gets its own column, and the header is the question's wording.
- Headers confirmed from Luma help pages and code that parses the export: `api_id` (some tools see `guest_id`), `name`, `first_name`, `last_name`, `email`, `phone_number`, `created_at`, `approval_status`, `checked_in_at`, `custom_source`, `qr_code_url`, `amount`, `amount_tax`, `amount_discount`, `currency`, `coupon_code`, `eth_address`, `solana_address`, `survey_response_rating`, `survey_response_feedback`, `ticket_type_id`, `ticket_name`, `utm_source`.
- Importer rule: any column not in that list is a custom question; the first free-text one becomes the member's line. Accept `api_id` or `guest_id`.
- Test fixture: `data/sample_luma_export.csv`.
- Source links: in the Grok Bot chat (Luma export help page, BonBadge docs). Add them here before submission.

## Existing tools (the "better than today" comparison)

| Tool | Model | Price / limits |
|---|---|---|
| Brella | Conference matchmaking, contact sales | Estimated $5k to $25k+ per event (Converve roundup) |
| Grip | Conference matchmaking, contact sales | Licensed in bundles from 1,000 active participants |
| Swapcard | Event platform | From $610 a year, rises with attendees |
| Matchbox | Hosted | Free up to 50 people |
| 1Degree | Hosted, works on top of Luma, intros over WhatsApp | Free under 100 people |
| Pond | Hosted | First event free up to 15 people |
| Socratica matchmaking | Open-source Python script over a Luma CSV | Interest matching only |
| aiDotEngineer/network | Open-source event app with AI matching | Last updated 2023 |
| Atria | Self-hosted event platform (AGPL) | Attendee connections |

Source links: in the Grok Bot chat. Add them here before submission.

### Where Convene differs (be honest in the pitch)

- **1Degree is the closest competitor** (Luma-based, WhatsApp intros, free under 100). Convene's difference: open source and self-hosted (the community owns its member data), grounded reasons that quote what people wrote, optimal assignment instead of greedy, a speaker inbox, a contacts export for WhatsApp, and community memory across events queryable by any agent over MCP.
- Socratica's script and aiDotEngineer/network are open source but are batch or unmaintained; neither runs live in the room.
