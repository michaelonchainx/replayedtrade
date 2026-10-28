# Handoff: replayed.trade rebrand ("Tape × Signal")

## Overview
New brand identity for replayed.trade, a web app that turns a trade into a shareable video replay. The task is to **rebrand the existing website** with this identity: colors, type, logo, favicon, OG image, and the signature "chart + playhead" motif. The social assets in `assets/social/` are finished and ready to post. They are included as the visual reference for tone.

## About the design files
`reference/replayed.trade X Post Pack.dc.html` is a **design reference built in HTML**. It is not production code. Open it in a browser to inspect exact values. Recreate the look in the site's existing stack (React/Next/Tailwind/etc.) using its own patterns. Do not ship the HTML.

## Fidelity
**High fidelity.** Colors, fonts, weights, tracking and motif rules are final. Page layouts are not designed. Apply the system to the existing page structure.

## Brand in one sentence
A dark trading terminal (mono type, timecodes, a red "REC" dot) combined with loud Swiss typography (huge Archivo 900 headlines and numbers) and a single phosphor green accent.

## Design tokens
All tokens are in `tokens.css`. Import it globally or map it into the Tailwind theme.

| Token | Value | Use |
|---|---|---|
| bg | `#0A0C0B` | page background (site is dark-only) |
| surface | `#111513` | cards, inputs |
| line | `#222A24` | 1px borders, dividers, progress track |
| ink | `#E8EDE9` | primary text |
| ink-2 | `#9AA39C` | secondary text |
| ink-3 | `#7D877F` | labels / meta |
| green | `#6EF278` | brand, up candles, playhead, primary buttons, links |
| red | `#F84C45` | down candles, losses, the REC dot. Never decorative |
| on-green | `#0A0C0B` | text on green |

**Typography**
- Display: **Archivo 900**, letter-spacing `-0.05em`, line-height `0.9`. Used for headlines and big numbers (`+3.1R`, `+$2,480`).
- Everything else: **JetBrains Mono** 400/500/700/800. Body 18px/1.6. Labels 14–20px, UPPERCASE, letter-spacing `0.1em`.
- Rule: one huge display element per section; everything around it is mono.
- Headline pattern: line 1 in ink, line 2 in green. Example: "Your trade. / **As a video.**"

**Shape**
- Border radius **0** everywhere. Square buttons, square tags.
- Borders 1px `line`. Featured/active elements use a 2px `green` border.
- No shadows, no gradients. The only background texture is the 50px grid (`.rt-grid-bg`, white at 3% opacity) on hero areas.

## Components

**Primary button**: bg green, text on-green, JetBrains Mono 800, 20–24px, padding 14px 22px, radius 0. Label pattern: `Get started →`. Hover: bg `#E8EDE9`. Active: translateY(1px).

**Secondary button**: transparent, 2px border ink, text ink, mono 700. Hover: border and text green.

**Tag / chip**: mono 800, 18–20px, uppercase, padding 6px 14px. Variants: green fill (LONG / NOW LIVE), red fill (STOPPED / loss), outline ink (ticker, e.g. `NQ1!`).

**REC label**: 14px red circle + `REPLAY` in mono, uppercase, tracking 0.1em. Use top-left in the nav or hero.

**Timecode chip**: `▶ 14:17` in mono 800, green bg, dark text, padding 4px 10px.

**Progress bar**: 6px track `line`, fill green. Pair it with a timecode.

**Nav**: dark bg, 1px bottom border `line`. Logo wordmark left, mono links (ink-2, hover ink), primary button right.

**Links**: green, no underline. Hover: underline, or ink color.

## Signature motif: chart + playhead
Use this in the hero, in the empty states and in loading states. Reference: `assets/og-image.png` and `assets/social/01-header.png`.
- Candlestick chart, about 44 candles. Body width is 60% of its slot. Wick 2px.
- Up candles: green fill. Down candles: red fill.
- A vertical **playhead** line (3px, green) sits at about 68%, with a timecode chip at the top.
- Candles left of the playhead are at full opacity. Candles right of it are at **16% opacity** ("not yet played").
- Optional animation for the hero: move the playhead from 0 to 100% over about 8s, linear, revealing candles as it passes. Loop with a 1s pause. Respect `prefers-reduced-motion`; if set, show a static frame at 68%.
- Reference generator: the `data()` and `theme()` methods in the reference DC's logic class. It is a seeded random walk, normalized to 0–100%.

## Logo
- Mark: lowercase **"r."** in Archivo 900 (tracking -0.06em) on a green square. The alternate version is green on black.
- Wordmark: `replayed` in ink + `.trade` in green, Archivo 900, tracking -0.05em.
- Use on dark backgrounds only. Clear space equals the height of the "r".
- Best practice is to build the wordmark as live text in the site using the fonts above. The PNGs are fallbacks.

## Assets
```
assets/
  logo/
    logo-mark-green-512.png        app icon / avatar
    logo-mark-dark-512.png         alternate
    logo-wordmark-on-dark@2x.png   2400×480, transparent bg, for dark backgrounds
  favicon/
    favicon-16.png, favicon-32.png, favicon-48.png
    apple-touch-icon.png (180)
    favicon-192.png, favicon-512.png  (web manifest)
  og-image.png                     1200×630, set as og:image + twitter:image
  social/                          finished X assets (header, profile pictures, 13 posts, brand guide)
```
Suggested `<head>`:
```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0A0C0B">
<meta property="og:image" content="/og-image.png">
<meta name="twitter:card" content="summary_large_image">
```

## Copy voice
Short, declarative, two-beat lines. English. Examples from the kit:
- "Your trade. As a video. In seconds."
- "Screenshots show the result. Replays show the trade."
- "Stop posting screenshots. Post the replay."
- "Upload. Pick a theme. Share."
- "Losses deserve replays too."

## Implementation checklist
1. Add `tokens.css` (or map it into the Tailwind config) and load both Google Fonts.
2. Switch the site to the dark theme globally (`bg`, `ink`).
3. Replace the logo, favicons, OG image and theme-color.
4. Restyle buttons, tags, inputs (surface bg, 1px line border, radius 0, green focus ring 2px) and nav.
5. Rebuild the hero: REC label + timecode chip, a two-line Archivo headline (second line green), the chart + playhead motif, and a primary CTA.
6. Audit for leftover radius, shadows and old brand colors. Red only for loss/down.

## Files
- `tokens.css`: CSS variables
- `reference/replayed.trade X Post Pack.dc.html`: source of all assets. Open it in a browser with `support.js` next to it.
- `assets/`: exported images
