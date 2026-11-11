# Convene UI audit (before)

Captured from a **production build of the untouched `redesign` branch head** (`2d67434`) in mock mode, so the Next dev overlay is not in the frames. Screenshots: `.design-shots/before/`. Viewports: 390×844 phone, 1920×1080 desktop/projector, 1280×720 stage.
Measured with `document.documentElement.scrollHeight` where a number is given.

## Cross-cutting

| # | Finding | Evidence |
|---|---|---|
| X1 | The look is the stock "dark SaaS + neon emerald" template: `#0b0b10` background, `emerald-400` as the only accent, Geist, rounded-2xl bordered boxes with `white/[0.03]` fill everywhere. Nothing about it says *introductions*; it would fit any dashboard. | every screen |
| X2 | No design tokens. Colours are raw Tailwind opacity classes (`text-white/55`, `border-white/10`) repeated in ~300 places, so contrast and rhythm are accidental. `text-white/45` and `/50` are used for real content (empty states, counts). | `components/*.tsx` |
| X3 | Vocabulary drifts inside one flow: the join button says "Find my people", the next page says "People to meet", the loading state says "matches", the stage says "intros", the organiser says "Intros", the empty state says "introductions". | `JoinForm`, `MeClient`, `StageClient`, `OrganiserClient` |
| X4 | User-facing "demo" everywhere ("Open the live demo", "Join the demo event", "Demo night", "Demo community"). Hard-coded provider wording: "Grok answers with read-only tools…" on the dashboard, `aiProviderName = "xAI"` as a prop default. | `app/page.tsx`, `lib/mocks.ts`, `OrganiserClient.tsx:271` |
| X5 | Motion is one 0.5 s `animate-in-soft` fade-from-above plus Tailwind `animate-ping` on the loading dot. No `prefers-reduced-motion` handling at all. The graph's force simulation never respects it. | `globals.css` |
| X6 | Focus indication is inconsistent: inputs use `focus:border-emerald-400 focus:outline-none` (a 1px colour change, not a visible ring); buttons and links have no explicit focus style. | `inputCls`, `btn` |
| X7 | Touch targets: checkboxes are 20×20, the "List view" toggle is ~36 px tall, example-question chips ~30 px, the dashboard switch 32 px tall, links like `@handle` are bare text. | `JoinForm`, `Graph`, `OrganiserClient` |
| X8 | Client/server rule drift that produces avoidable generic errors: community slug input allows 60 chars but the API accepts 40; X-handle input allows 40 chars but the API requires `^@?[A-Za-z0-9_]{1,15}$`; the user only ever sees "invalid input". (UI-side fix only: tighten `maxLength` and validate inline.) | `CreateEvent`, `JoinForm`, `app/api/events/route.ts`, `lib/types.ts` |

## 1. Homepage + create event (`home-390*`, `home-1920*`, `create-created-*`)

- **Does not meet "create an event without scrolling".** At 390×844 the form starts at ≈y 1850 of a 1850 px page (the 3 explainer cards sit before it). At 1920×1080 the *Event name* field is at y≈930 and the **Create event button is below the fold** (page is 1373 px tall).
- The hero's primary button is "Open the live demo"; the sample room is the hero and the paid-for action (create) is the last thing on the page. Inverted priority.
- The H1 ("The 30-second member intake for live community events") is a category label, not a promise. A first-time visitor has to read three cards to learn what attendees actually *get*. The product's best moment (an intro with quoted reasons) is never shown on the homepage.
- Create form shows **five fields at once** (name, new community name, existing community slug, existing community token, AI toggle). The community trio is jargon for a first-time organiser and the placeholder-as-instruction pattern is used ("…or existing community slug").
- No validation until the server answers; error is a bare red paragraph with no field association.
- **Success screen** is a wall of four raw URLs with no hierarchy or actions: nothing to click except underlined links, no copy button, no QR, no indication of what to do first. The warning that the organiser token is shown once is the same visual weight as the rest. The organiser link is the *only* thing the organiser can't recover, and it is the third item.

## 2. Join (`join-390*`, `join-closed-390`, `join-error-390`, `join-1920`)

- One long 1538 px form: 4 text fields, 3 consent blocks, a button, and a 7-bullet privacy list, all at the same weight. The primary field (the one line that drives the intros) is not visually special; two optional fields compete with it.
- No progress, no sense of "30 seconds". Nothing explains **why** the line matters or that it will be quoted.
- Contact consent is a checkbox + a disabled input inside one box, followed by a different consent box: three decisions visually identical. Contact sharing is not its own plain-language consent.
- Validation is browser-native (`required` bubbles), no live counter for the 280-char limit, no handle format check.
- The privacy list prints raw config keys: ``(`ai_enabled` is off)``, ``(`ai_opt_out`)``. Those are developer identifiers in attendee-facing text.
- Error state is one pill with no recovery guidance; offline is indistinguishable from a server error ("Failed to fetch").
- The closed-doors state is fine but visually unrelated to the rest and offers no next step.

## 3. "My intros" (`me-390*`, `me-loading-390`, `me-empty-390`, `me-error-390`, `me-nojoin-390`)

- The page title is "People to meet" and the card hierarchy is name → their line → bulleted reasons with tiny `✓`. The reasons are the point of the product, but they are at body-text size under a headline that is just a name. The quote highlight is 14 px amber text on a muted-amber chip.
- Reasons don't say **whose** words are quoted. The data allows it (compare the quote with each line) but the UI doesn't.
- Loading is a pulsing dot and "Loading your matches…": that is a *fetch* state, not the honest state. Right after joining, the real situation is "we're comparing your line with everyone here (~10 s)". The page can't tell a returning visitor from a just-joined one.
- Empty state has three sentences and no hierarchy; error state offers Retry but no explanation of what is kept.
- No offline/stale indicator: if the poll fails after data loaded, the page silently shows old data.
- No way to act on an intro beyond the X link (a bare 14 px underlined link).

## 4. Stage (`stage-1920`, `stage-1280`, `stage-390`)

- **Fails "no scrolling" at 1280×720**: document height is 812 px, so the counter and the intro list are cut off (`stage-1280.png`). At 1920×1080 it fits only because the list is a clipped scroller.
- **Not readable at 10 m**: the right-hand 60 % is a force graph whose labels render at ~14 px ("Dr", "Tom"), 5 dots in a 1100×600 box. The actual content of the product, the intro text, is relegated to a 2-line-clamped list at the bottom; the list is a scroll container (nobody scrolls a projector).
- Hierarchy is inverted: decoration (graph) is biggest, the intro is smallest. The QR is correct but the join URL under it is 20 px mono.
- New arrivals have no moment: list items fade in from above and push everything below them down (layout jump), the graph re-heats and drifts.
- On a phone (390×844) the page is **7,218 px tall** (the graph keeps `min-h-[320px] flex-1`, the QR is `size={360}`).
- "Demo night" shown as event name; "2 more below" is a hint to scroll on a screen that can't be scrolled.
- There is no connection indicator: if polling fails the room screen silently freezes.

## 5. Organiser dashboard (`organiser-1920`, `organiser-390`, `organiser-gate-*`)

- No member list at all: the dashboard counts members but cannot show or search them. Speaker candidates exist only in the ranked inbox; there is no flag on members.
- No copy-link buttons anywhere. The organiser must go back to the creation screen (which they may have lost) to get the join link.
- "Close joining" is a 56×32 switch with no visible label; its state is a small grey sentence above it. At a glance you can't tell if people can still join.
- Delete uses `window.prompt()`, an unstyled browser dialog that's blocked in some embedded/PWA contexts, no focus management, no description of what will be lost, and no result state besides one paragraph.
- Exports are three identical outlined buttons prefixed with a `⬇` glyph; the opted-in contact export doesn't say how many people it contains, and "Shared contact: N" in the stat row is the only hint.
- Initial load shows the **token gate** to already-signed-in organisers for a moment (the gate is rendered whenever `!data`, including while the first request is in flight).
- Needs/offers bars use two stacked native `<progress>` per row with colour-only legend (rose vs emerald, which is also unfriendly to red/green deficiency).
- Layout: everything is a same-weight card; the order is stats → end session → Ask → insights → exports → delete, i.e. operational controls (joining, links) are not first.

## 6. Smaller surfaces

- Directory (`directory-*`): same template look; search and pagination work; no empty/skeleton state beyond "No members found."
- 404 and Privacy: plain stacks; Privacy page uses raw `white/70` greys and prints the config-key privacy lines.

## What good looks like (targets for the redesign)

1. Create button + name field visible above the fold at 390×844 and 1920×1080.
2. Intro card with the reasons as the largest text on the phone and on the stage.
3. Stage fits 1920×1080 and 1280×720 with `scrollHeight == innerHeight`; essential text ≥ ~28 px at 1280×720.
4. One vocabulary: **intro** (noun), **Find my intros** (action), **Your intros** (page).
5. No raw config keys, no hard-coded provider/"demo"/"hackathon" copy.
6. Every interactive element ≥ 44 px with a visible 3 px focus ring; `prefers-reduced-motion` removes movement.
