# Convene design system

Generator output (unmodified): [`generator-output.md`](./generator-output.md), produced with
`search.py "live event networking attendee matching community meetup projector" --design-system -p Convene`.
Supporting searches (style / product / colour / typography / UX / Next.js stack) informed the critique below.

## 1. What the generator recommended, and why most of it was rejected

| Generator said | Verdict | Reason |
|---|---|---|
| **Pattern: Hero-Centric**, full-bleed hero + sticky nav CTA | **Changed** | Right instinct (one primary CTA above the fold) but "full-bleed hero visual" is the SaaS-landing default. Convene's best asset is not a hero image, it is the *output*: an intro with quoted reasons. The hero shows a sample intro card next to the create form. |
| **Style: Vibrant & Block-based** (bold, playful, geometric blocks, duotone, "youth/gaming/consumer") | **Rejected** | Matched on the keyword "event". The real context is a dim London tech/AI meetup, people reading on a phone at arm's length, and a projector read from 10 m. Saturated colour blocks are tiring in a dark room and compete with the one thing that matters (two quoted sentences). Also exactly what an "events app" template looks like. |
| **Colours: purple `#7C3AED` + orange `#EA580C` on lavender `#FAF5FF`** | **Rejected** | A *light* lavender canvas is wrong for a dim room (glare on a phone, washed-out on a projector). Purple + orange is the default "excitement" palette for the category. The current UI's neon emerald-on-black is the other default ("dark dev tool"), so both were avoided. |
| **Type: Inter / Playfair Display** | **Rejected** | Inter is the default UI face and Playfair is the default "editorial" face; the pair is what every generated landing page uses. |
| Product search: "Event Management → Vibrant & Block + Motion-Driven; Hero-Centric + Feature-Rich" | **Rejected** | Feature-rich landing pages scroll; ours must not. "Motion-driven" is the opposite of what a stage that people glance at needs. |
| Style search: *Dark Mode (OLED)* ("deep black, neon accents") | **Partly kept** | Dark is correct for a dim room, so the canvas stays dark. Pure-black + neon is the generic "dev tool" look, so the canvas is a warm-neutral ink and there is no neon. |
| Colour search: *Digital Signage / Kiosk* ("high contrast dark, large touch targets") | **Kept in spirit** | Informs the stage: high contrast, large type, no thin greys. Its red accent is not used (red reads as error). |
| UX: progress indicators; labels not placeholders; reduced motion; "animate 1–2 key elements per view"; cancellable transitions | **Adopted** | See motion and forms below. |
| Stack: `next/font`, set fonts in the root layout | **Adopted** | |

## 2. Concept: *the introduction card*

Convene's job is the sentence "you two should talk, because *she wrote this* and *he wrote that*". So the whole system is built to make **people's own words** the most prominent thing on every surface:

- **Two voices.** *The app* speaks in a humanist sans. *People* speak in a serif. Anything a person wrote (their line, a quoted reason, a talk topic) is set in the serif and highlighted like a marker pass over a printed page. You can tell at a glance, even from across a room, which words are the system's and which are somebody's.
- **The intro is a physical object.** A warm paper "intro card" on an ink-dark room. It is the brightest, largest thing on the phone, on the stage and in the sample on the homepage. Everything else is quiet ink.
- **One accent: marigold highlighter.** Used for the primary action, the quote highlight, the focus ring and "new" moments. Never for decoration.

Why this fits this audience: the room is dark, so the canvas is dark and the card is the light source; the serif/sans split is a functional rule, not a flourish; and London meetup crowds read a lot of text on small screens, so legibility is the brand.

## 3. Tokens

Defined as CSS custom properties in `app/globals.css`, exposed to Tailwind via `@theme`. A unit test (`tests/design-tokens.test.ts`) parses them and fails if any text/surface pair drops below WCAG AA.

### Colour

| Token | Value | Use | Contrast (on) |
|---|---|---|---|
| `ink-950` | `#0F1117` | page | — |
| `ink-900` | `#161922` | surface | — |
| `ink-800` | `#1F2330` | raised surface / inputs | — |
| `ink-700` | `#2C3140` | hairline / divider (decorative) | — |
| `edge` | `#8A91A6` | input / control borders (non-text UI ≥ 3:1) | ≥ 3:1 on ink-900 |
| `text` | `#F3EFE6` | primary text | 16.4 : 1 on ink-950 |
| `text-2` | `#C4C1B7` | secondary text | 10.5 : 1 |
| `text-3` | `#9D9A91` | tertiary / meta (never below this) | 6.7 : 1 |
| `paper` | `#F1EBDD` | intro card | — |
| `paper-ink` | `#1C1913` | text on paper | 14.8 : 1 |
| `paper-2` | `#5B5445` | secondary on paper | 6.3 : 1 |
| `gold` | `#F2B33D` | accent, primary button fill, highlighter | 10.2 : 1 on ink-950 |
| `on-gold` | `#1B1405` | text on gold | 9.8 : 1 |
| `thread` | `#9DB8FF` | links, people, connections | 9.0 : 1 on ink-900 |
| `danger` | `#FF8E85` | error text on ink | 7.9 : 1 |
| `danger-solid` | `#B3302B` | destructive button fill (white text) | ≥ 5 : 1 |
| `ok` | `#7BD9A4` | "open" status dot/text | 10.3 : 1 |

Rules: gold is never text on paper (1.6 : 1); on paper it is a highlighter *background* behind `paper-ink` text. Status is never colour-only (dot + word).
Dark only. A light theme is deliberately not offered: the product is used in dim rooms and on a projector.

### Type (all via `next/font/google`, self-hosted at build, variable, `display: swap`)

| Role | Face | Why |
|---|---|---|
| App voice (UI, headings, labels) | **Atkinson Hyperlegible Next** 400–800 | Designed by the Braille Institute for maximum character distinction at small sizes and in poor viewing conditions: the exact conditions of a dim, busy room. Not Inter/Geist. |
| People's voice (lines, quotes, talk topics, intro reasons) | **Newsreader** (variable, `opsz`) 400–600 + italic | Built for on-screen reading; optical size gives a sturdy display cut on the stage and a sturdy text cut on a phone. |
| Tokens / URLs | system `ui-monospace` stack | No third font download. |

Scale (phone): 14 / 16 / 18 / 22 / 28 / 36 · line-height 1.5 body, 1.15 display. Stage: sizes in `em` over a viewport-derived root so 1920×1080 and 1280×720 share one layout.

### Space, shape, elevation

4-px base (4, 8, 12, 16, 24, 32, 48, 64). Radii: 10 controls, 16 cards, 20 intro card. Elevation is expressed with surface step + hairline, not blur; the intro card alone gets a soft shadow so it lifts off the page.
Touch targets: min 44 × 44 for every button, link-button, checkbox row, chip button. Focus: 3 px gold ring with 2 px offset on every interactive element (`:focus-visible`).

### Motion language: "settle and mark"

Motion exists for two reasons only: **orientation** (where did this come from / where did it go) and **a real change** (a new person, a new intro).

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` (fast start, soft landing) |
| `--dur-quick` | 160 ms (hover, press, toggles) |
| `--dur-base` | 280 ms (panel/step changes) |
| `--dur-arrive` | 520 ms (a card arriving) |
| `--dur-mark` | 700 ms (highlighter sweep) |

- **Step change (join):** content slides 12 px in the direction of travel with a fade; back reverses. Focus moves to the new step's heading.
- **Intro arrives:** card rises 12 px and fades in (`--dur-arrive`), then the **highlighter sweeps across the quotes** left → right (`--dur-mark`, 250 ms delay). That sweep is the signature moment, the visual of "this is why". Used on the phone, the stage's featured intro and the homepage sample.
- **Person arrives (stage):** the name chip scales 0.9 → 1 with a gold ring that fades over 2.4 s. Nothing else moves; the roster is a fixed-height region so nothing reflows.
- **Exit is faster than enter** (~60 %). **Only `transform` and `opacity`** are animated, plus `background-size` on the highlighter.
- **`prefers-reduced-motion: reduce`:** all transform movement is removed, durations collapse, the highlighter is drawn fully with no sweep, the new-person ring is a static outline for 2.4 s. State is always set directly; no logic waits for an animation to end.

## 4. Layout rules

- **Phone (390 × 844):** single column, 16-px gutters, max content width 480. Sticky bottom action area on the join flow so the primary action is always under the thumb; safe-area padding.
- **Home:** two columns ≥ 1024 (pitch + sample intro | create card), single column below with the create card directly under the headline. Create button above the fold at 390 × 844 and 1920 × 1080.
- **Stage:** a fixed three-band layout that never scrolls: header · (QR panel | featured intro + two earlier intros) · footer roster. Dimensions in `em` from `min(1.1vw, 1.95vh)`. Below 1024 px wide it stacks and may scroll (a phone is not a stage).
- **Dashboard:** operational first. Room controls (joining state, links, stage) → stats → members (search) → insights → data (export/import) → danger zone last, separated.

## 5. Vocabulary (one name per thing, per flow)

| Concept | Word | Never |
|---|---|---|
| The product output | **intro** / **intros** | match, introduction, people to meet |
| Join submit | **Find my intros** | Find my people, Join |
| Phone results page | **Your intros** | People to meet |
| Stage list | **Latest intro** / **Earlier intros** | |
| Seeded example | **sample event** | demo |
| Organiser who may speak | **speaker candidate** | volunteer |
| Joining | **Joining is open / closed** (control: **Close joining**) | doors (kept only where a test pins it; see change log) |

Privacy copy: `lib/privacy.ts` stays the single source and is **not edited** (it is privacy logic and the README/docs tests compare against it). The UI renders every sentence verbatim, in a "How your data is used" disclosure, with backticked config keys rendered as `<code>`. The short consent sentences next to each checkbox are new UI copy that restates (never extends) what the notice already says.
