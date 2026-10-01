# The Shuttle Social — design brief

Approved direction: **V5** (design canvas, 30 September 2026). This file is the source of truth for how
The Shuttle Social looks and moves. It replaces the earlier "clean minimal" brief, which argued against
gradients, pill buttons and colour; the club chose a bolder, more energetic look, and future work should
build on it rather than pull it back.

Reference code: `app/site/site.css` (tokens and components) and `app/site/page.tsx` (the homepage).

---

## 1. Personality

Social, energetic, welcoming to beginners, a little competitive. The site should feel like the night itself:
green, bright, moving, full of people. It should never feel like a generic SaaS template.

Inspiration the club liked: beans.tech (rotating highlighted word, colourful stats, sticker-like chips),
fitcoin.co (gradient hero, sliding strip, floating UI chips), landonorris.com (clean sections, dynamic
details, slight gradient highlights). Take the patterns, never copy them.

## 2. Typography

- **One typeface: Urbanist** (Google Fonts, self-hosted through `next/font`, `display: swap`).
  The club rejected Instrument Serif, Bricolage Grotesque and Hanken Grotesk.
- Weights: hero headline **900**, section headings **800**, body **500**, labels 600–700.
- **Numbers and stats: 900 italic.**
- Headings: tight line-height (~0.95) and letter-spacing (−0.035em).
- Kickers (small labels above things): uppercase, 0.14em letter-spacing, 700.
- Step numbers (01 / 02 / 03): small caps.
- The whole scale is fluid with `clamp()`, defined once as CSS variables. No fixed px font sizes.
- Keep body text to ~34–40 characters wide in heroes and ~60–70 elsewhere.

## 3. Colour

Brand greens, one lime accent, cream. All defined as tokens on `.tss`.

| Token | Light | Use |
|---|---|---|
| ink | `#0F2A1A` | text, dark surfaces |
| forest | `#0E3B24` | dark sections, hero start |
| lime | `#D9F46B` | the accent: highlights, stat numbers on dark, Book button |
| cream / page | `#F6F7F1` | page background |
| muted | `#4A5A45` | secondary text |
| on-dark | `#F4F7EC` | text on green |

- **Gradients are part of the brand**: the hero (forest → green → light green), the FAQ section,
  the Book button, the stat tiles. Keep them within the green–lime–mint family. No purple, blue or neon.
- **Stats get their own harmonising colours**, one per stat, from this palette:
  lime, cream, mint, teal-mint, forest, pale sage (plus ink for chips). Never all one colour.
- **Dark mode** is supported everywhere: it follows the device, the visitor can switch it,
  and the choice is remembered in their browser. Every colour pairing must work in both.

## 4. Section rhythm

Each major section has its own background so scrolling feels like moving through distinct spaces:

hero (forest gradient) → This week (cream) → stats (deep green) → How it works (mint) →
FAQs (green gradient) → Real nights (lime tint) → closing call to action (near-black with a lime glow).

One idea per section: one headline, one supporting sentence, one visual. Generous vertical padding:
`clamp(5rem, 12vh, 10rem)` on desktop, less on phones.

## 5. Shape and components

- Rounded, friendly geometry: large radii on sections and tiles (~28–44px), pills for buttons and chips.
- **Book a session is the one primary action** and looks unlike anything else: lime → mint gradient,
  soft lime glow, dark arrow circle, a slow shine. Every other button is secondary (ghost, cream or outlined).
  Don't give other buttons the Book treatment.
- Stats: an oversized heavy-italic number with a short caption in a speech-bubble pill.
- Floating chips (e.g. "Checked in", "Next up · new partner") show the live-session product.
- The hero's signature element is the **interactive green feather shuttlecock** beside the
  live-session phone. It follows the pointer and turns slowly.
- Hover states on cards: scale ~1.03 over 300ms.

## 6. Motion

Motion is a key part of the site: dynamic, never still, but never in the way.

- Animate only `transform` and `opacity`.
- **Scroll reveals:** one reusable IntersectionObserver utility. `[data-reveal]` starts at opacity 0,
  translateY(30px), animates in over 600–800ms with a soft ease-out, once only.
  `[data-reveal-stagger]` staggers children 80ms apart.
- **Sticky steps:** How it works pins the heading and visual while the steps scroll (pure CSS sticky).
- **Accordion** for FAQs: numbered 01, 02…, animated height, lift on open, content fades in ~100ms later,
  real `<button>`s with `aria-expanded` / `aria-controls`.
- **Count-up stats:** from zero over ~1.2s with ease-out when they come into view.
- **Marquee:** CSS-only infinite strip, pauses on hover.
- **Parallax:** decorative elements only, at 0.3–0.5× scroll speed, rAF-throttled.
- **Horizontal gallery** for Real nights, with captions under each clip.
- Below 768px: no parallax, no pinning, galleries become native swipes. Reveals stay.
- `prefers-reduced-motion`: everything appears instantly, nothing moves.
- No heavy animation library unless there's a clear reason (agree it first).

## 7. Content rules

- Never invent stats, testimonials or quotes. Stats come from the attendance tracker, bookings or the club.
  The sessions count is live; the club-supplied figures live in `lib/site/stats.ts`.
- Photos and videos are the club's own, self-hosted as muted loops (no embeds that set tracking cookies).
  Get consent from people in them. Until then, use clearly marked placeholders.
- Plain, friendly British English. "Come on your own." Short sentences.
- No tracking cookies.

## 8. Accessibility and quality

- Semantic HTML, keyboard navigable, visible focus states (lime outline), skip link.
- Sufficient contrast for every colour pairing, in light and dark mode.
- Decorative motion and chips are hidden from screen readers; rotating text has a full-sentence
  equivalent for them.
- Phone-first: check every screen at 390px. Touch targets at least 44px.
- Lighthouse performance above 90.

## 9. Scope and where things live

Everything uses this system: the marketing site (theshuttlesocial.com) and every app screen on
tickets.theshuttlesocial.com (tickets, My portal and player pages, live-session screens, lead, staff, admin).

- `app/_design/tss.css`: tokens, dark mode (including the always-dark `.is-dark` area), type, buttons.
- `app/_design/app.css`: app components (fields, notes, pop-ups, the deep green `.deep` card, compact header).
- `app/_design/theme.ts`: inline-style helpers (`T`, `inp`, `btn`, `cardStyle`, `stripeAppearance`) on the same tokens.
- Layouts: `AppFrame` (compact green header) for player and staff pages, `BareFrame` (no header) for court
  screens, the TV board, lead and admin. The marketing site has its own layout in `app/site`.
- Marketing pages: `app/site/{community,join-us,contact,terms}`. The header bar links to homepage sections (Sessions, About us = Our story, How it works, FAQs); the menu button lists every page. `/sessions` and `/about` redirect to those sections. They share the header
  (with a phone menu), green page banner and footer in `app/site/_components/SiteChrome.tsx`; links are in
  `lib/site/links.ts`. Words the club still has to supply are wrapped in `<Ph>` (dashed lime highlight).
  Contact, Join us and suggestions forms post to `/api/contact`, which emails the club inbox (reply-to the sender).
  Inner pages reuse the homepage motion: pointer glow, floating chips and a chip strip in the banner (`PageHero`),
  rotating words, sticky steps (`HowItWorks`), accordions (`FaqList`), count-ups, scroll-lit story text (`ScrollText`)
  and parallax shapes. No white cards: cards use the palette (`.c-mint`, `.c-lime`, `.c-sage`, `.c-teal`, `.c-forest`,
  `.card-deep`). Icons are line SVGs (`Icon.tsx`), never emoji.
  Terms shows the same text as the booking pop-up (Admin → Settings). Local preview: http://site.localhost:3000.
- "Real nights" clips: `public/videos/*.mp4` (H.264, no audio, 540 px wide portrait or 960 px wide landscape, about 1.2–1.6 Mbps) with a `.jpg` cover each, listed in `CLIPS` in `app/site/page.tsx`. They load and play only when on screen; with reduced motion they show the cover and controls.
- Functional screens use the same type, colours and components with less decorative motion. The TV board is
  always dark. QR codes stay black on white.
- Emails (`lib/email.ts`) still use the older look; bring them in line separately.
