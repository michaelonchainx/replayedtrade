# Decisions & deviations

## PnL end card

- The video ends on a dedicated result card.
- **Timing:**
  - Candles stream over 0–78% of the video, including the post-roll after the close.
  - At 80% (never earlier than 1 s after the final exit, and always leaving at least 2.5 s on screen), a green tape-wipe sweeps the card in.
- **Card contents:**
  - a typed `■ TRADE CLOSED · HYPE · LONG 2×` kicker
  - the huge PnL counting up from 0 and slamming into place
  - return % · duration
  - IN → OUT (averages when there are several fills)
  - a mini line chart of the whole session with the trade segment in the result colour and IN/OUT points
  - handle/avatar, then REC + `replayed.trade`
- "% only" mode shows the return as the huge number.

## Zoom-out camera (replaces the ghosted-future motif)

- At the owner's request, the chart is **not** pre-shown anymore. Only candles that have printed are drawn, so the 16% "unplayed" ghost candles from the brand motif are gone.
- **X:** the plot is sized for `max(candles so far, 10)` candles. The replay opens on ~5 large candles (≈97 px slots at 1080p), and every new candle zooms the view out continuously. The live candle and the green playhead stay at the right edge.
- **Y:** fits what has printed plus the average entry, with 10% padding, eased by a critically damped spring (ω = 5 rad/s) so the vertical zoom never snaps.
- Wicks are a touch thicker while zoomed in and settle at the brand's 2 px.
- The playhead's time chip flips to the left before it reaches the price-tag column.

## Size in tokens

- "Size in" has three modes: **USD** (max position notional), **Margin** (USD), and **the coin itself** (e.g. HYPE). The token amount is used as-is, with no price conversion.
- Switching modes re-expresses the trade's current size in the new unit (`lib/sizing.ts → sizeIn`), so the position never jumps.
- In token mode, entry sizes in the executions table are entered in coin units too.
- **Exit size unit** (executions table header): **%** of the open position, an exact **token** amount, or an exact **USD** amount (converted at that exit's price).
  - Partial exits are capped at 99.9% of what's open, so they can't swallow later exits.
  - The last exit always closes the rest and shows how much in the chosen unit.
- Picked prices are rounded to the pair's tick precision.

## X profile picture from the handle

- The handle field is the user's **X handle**. Typing a valid one (1–15 letters, digits or `_`) loads its profile picture after a 600 ms pause, and it becomes the video avatar.
- **Source: unavatar.io** (`https://unavatar.io/x/{handle}?fallback=false`). X's own API needs paid, authenticated access, and scraping x.com isn't reliable. unavatar is free, returns 404 for unknown handles, and sends `Access-Control-Allow-Origin: *`.
- The browser calls it **directly** rather than through our server. Rate limits then apply per visitor instead of to one shared server IP, and the image is fetched as a blob, so the export canvas stays exportable (not tainted).
- **Order of precedence:** an uploaded picture wins over the X picture. "Use pixel avatar" turns the X lookup off. A missing picture or a failed request falls back to the pixel identicon, and the status line says so.
- The handle travels in share links, so a shared replay re-fetches the same picture. The picture itself is never put in the link.
- Privacy: the typed handle is sent to unavatar.io. It's a public username, nothing else is sent.

## v3 — chart picking only

- **Wallet import removed** at the owner's request. Trades are only picked on the chart.
- Gone with it:
  - the Hyperliquid fill reconstruction and leverage lookup
  - the Lighter account/trades routes and the read-only token flow
  - the Verified badge and video chip
  - share-link re-verification
- `Trade` lost `verified`, `wallet`, `accountIndex`, `txRef` and `realizedPnlUsd`. PnL is always computed from the executions.
- What remains of the venues is the **price feed** for the chart: Hyperliquid candles, called directly via CORS with a fallback proxy limited to `meta` + `candleSnapshot`, or Lighter candles via `/api/lighter/{markets,candles}`.
- The v1/v2 notes below about wallets, Lighter auth and verification are historical.

## Rebrand v2 ("Tape × Signal", from `design_handoff_rebrand/`)

- **Venue branding removed.** The video's top-left is now the `replayed.trade` wordmark. The venue picker is just a *data source* toggle (Hyperliquid / Lighter). Breakout and "Other…" were only branding, so they're gone.
- **Video redesigned to the brand.**
  - Look: Tape Black + 50px grid background (the ribbons are gone because the brand says no gradients), Archivo 900 for the single huge PnL number, JetBrains Mono for everything else, square tags.
  - Header: the ticker as an outline tag and LONG as a green tag. SHORT uses a paper (ink) tag, since red is reserved for losses.
  - Chart: the motif chart with a green playhead + timecode chip, all candles laid out from frame 0 with the unplayed ones ghosted at 16%, and a static camera.
  - Footer: a progress bar, and a REC dot + video timecode.
- **Entry/exit effects.** Each execution gets:
  - a vertical scan flash at its candle,
  - two expanding square ripples,
  - an IN (green) or OUT (paper) tag that pops in,
  - a typed terminal-style banner ("LONG OPENED", "ADDED", "TRIMMED 50%", "CLOSED · +$x").
  
  On entry, the average-entry line draws outward from the candle and the number snaps from neutral to coloured. On close, the number slams (1.08→1) with a short tape-glitch channel split and the whole frame edge flashes in the result colour.
- **Multiple entries/exits.**
  - `Trade.fills?: Fill[]` (`kind: in|out`, `t`, `px`, `sz`). Aggregates are derived (`lib/fills.ts → withFills`): entry/exit px = size-weighted averages, entryTime = first in, exitTime = last out, sizeBase = max position.
  - PnL uses average-cost accounting; fees are spread across executions by notional. The last exit always closes whatever is left.
  - Wallet imports keep each execution when a round trip had more than one in or out.
  - In the chart picker you add executions with "+ Add entry / + Add exit" and a click. Entries are sized in USD and partial exits in % of the open position. Handles stay draggable, and "Max position" rescales all executions together.
- Picked executions sit **mid-candle** (open + half the chart interval) so they land inside the same bar in the replay at any interval.
- The hero PnL font size is fixed per replay, sized from the largest value it will show, so it never jitters while ticking.
- `▶ ■ ✓` aren't in the latin font subsets, so the renderer draws them as shapes.
- Site: centered 1280px container, big preview with export controls first, then **01 Your trade** (full-width 560px chart) and **02 Make it yours**. Favicons and the OG image come from the brand kit.

## v1

Defaults I picked where the spec left room, and places where the spec turned out to be wrong or impossible.

## Spec conflicts found (and what I did)

- **Bitrate vs. file size.** "~8 Mbps for 1080p30" and "under ~15 MB for 25 s" can't both hold (8 Mbps × 25 s ≈ 25 MB; a real 8 Mbps export measured 21.5 MB). I use **4.5 Mbps** → 25 s 1080p ≈ 12.8 MB, no visible loss on this flat, dark content. Change `BITRATE` in `lib/export/encode.ts` to go back to 8 Mbps.
- **`yuv420p`.** Feeding Chrome's encoder canvas frames (Mediabunny `CanvasSource`) produced **full-range `yuvj420p`**, not `yuv420p`. The exporter now converts each frame to **BT.709 limited-range I420** itself (`lib/export/yuv.ts`) and feeds `VideoSampleSource`. ffprobe: `h264 High, yuv420p, tv, bt709, 1920x1080, 30/1, 750 frames, 25.000 s`.
- **Module worker.** `new Worker(url, { type: 'module' })` fails under Next's webpack output (`importScripts` in module scripts). The export worker is a classic worker. Inside the worker, URL-sourced `FontFace`s and `fonts.ready` stalled, so Inter is loaded from fetched bytes and `ready` is only awaited in documents. If the worker fails before its first frame, export falls back to the main thread (yielding every 2 frames).
- **Reference vs. written spec.** The frames are the ground truth, so where they differed I followed them:
  - The avatar is a **circle** with a grey ring, not a rounded square.
  - Max candle slot is **~39 px**, not ~70. The chart starts with ~6 candles at ~39 px each and compresses once they fill the plot.
  - The chart's vertical padding is ~130 px top and bottom inside the panel, not 8%.
  - Numbers use Inter's **proportional** figures, like the reference. Canvas has no `font-variant-numeric`, and tabular digits made the pill visibly wider than the reference. The pill-width easing hides the per-frame width changes. The HTML UI still uses `tabular-nums`.
- **Lighter `/trades` auth.** Docs say an `authorization` header is required. A live unauthenticated call (`/trades?account_index=…`) **returned trades (code 200)**. So the token field is optional and hidden by default. It's shown, with the "Lighter needs a read-only token…" message, only when Lighter answers 401/403 or an auth error code. The token travels in an `x-lighter-auth` header to our route and in `authorization` upstream, never in a URL. It is never stored or logged.
- **Lighter candles.** The live API takes `start_timestamp`/`end_timestamp` in **seconds** and returns `t` in **milliseconds**. `/candlesticks` returned nothing; `/candles` works.
- **Lighter fees.** `maker_fee`/`taker_fee` look like integers in millionths of notional (e.g. `36` = 0.0036%). Fee USD = size × price × fee / 1e6. Realized PnL = Σ `ask/bid_account_pnl` − fees. The docs don't say whether `*_account_pnl` is net of fees.
- **Hyperliquid `aggregateByTime`.** On a live HIP-3 market (`xyz:SNDK`), aggregation merged a close and a re-open at the same millisecond into one fill labelled with the first fill's `dir` ("Close Long") while sizes flip the position. The walk follows `startPosition` + signed size, which is correct. The `dir` cross-check stays strict in the unit tests (synthetic fills) and is report-only on live data.
- **Hyperliquid first page.** `userFillsByTime` returns the *earliest* ≤2000 fills in a window, which is slow to page backwards on busy wallets. The first page uses `userFills` (most recent ≤2000, one request). "Load more" pages backwards with `userFillsByTime`, shrinking the window when a response is full so there are no gaps. Capped at 10,000 fills.
- **HIP-3 pairs in the picker.** `{"type":"meta"}` lists only the main dex, so the chart-picker combobox lists main-dex perps. Wallet-imported HIP-3 trades (`dex:COIN`) still work when `candleSnapshot` returns data for them; otherwise you get "No price data for this period".

## Demo trade

- Real Hyperliquid **HYPE 5m** candles, 27 Oct 2026 06:20–17:50 UTC (139 candles). I found the window by scanning the last ~17 days for one whose close-to-close move between candle 13 and candle 121 (9 h apart) matched the reference's +2.88% and whose shape matched (start below entry, dip, rally into the exit).
- The prices are mapped with an **affine transform** `p' = a·p + b` (a ≈ 1.0149, b ≈ −0.948), so the entry candle closes at exactly 77.9660 and the exit candle at 80.2090. Both candles contain those prices (tested). a ≈ 1 means the shape is essentially untouched.
- Entry = candle 13 open + 2 min (07:27 UTC), exit = entry + 9 h 2 m. sizeBase 933.937, 2×, fees $52.35 → **+$2,042.47 / +5.61%** (tested).
- The demo shows 4 price decimals to match the reference, although HYPE ticks at 3.

## Rendering

- Phase timing: candles reveal at one constant rate over 0–92% of the video, then hold. Entry and exit land wherever their candles fall: ~6% and ~80% for the demo, since 12%/15% pre/post-roll plus the "≥6 candles" rule decide it.
- Frame 0 already shows 5 closed candles plus the forming one, as in the reference.
- The forming candle follows o→l→h→c (bull) or o→h→l→c (bear), eased. The entry and exit candles get an extra waypoint at the exact entry/exit price and time, so the live price passes through the fill price at the moment B/S pops and PnL doesn't jump.
- If a trade closed recently and the post-roll is cut short at "now", the reveal ends proportionally earlier and the final hold gets longer.
- Y camera: critically damped spring (ω = 7 rad/s), precomputed per frame in the timeline.
- "% only" hides the Net PnL label group and the Size row. Entry/Exit/Current *prices* stay visible because they are prices, not amounts.
- The verified chip sits next to the username, or on the line above it when it would run into the chart panel.
- Identicon: symmetric 8×8 grid, seeded from the username, green palette plus dark cells.

## UX defaults

- The venue dropdown sits above both tabs, because it also decides the picker's pair list (Lighter markets) and the branding. Picking Breakout or Other… switches to "Pick on chart".
- The chart picker's Auto interval is the finest one that keeps the chart under ~500 candles and inside Hyperliquid's 5000-candle history. Exit must land on a later candle than entry, otherwise the hint shakes. The handles also move with the arrow keys (Shift = bigger steps).
- Manual trades default to 2×, position size $72,815 (the demo's notional) and $0 fees.
- The trade list's return % uses 1× until a row is opened, because Hyperliquid's leverage setting is only fetched per coin on click.
- Share links: `verified` from a URL is **never trusted**. The trade loads unverified, and the badge appears only after the wallet's fills are re-fetched and a round trip with the same `txRef`, coin, side, entry/exit price/time and size is rebuilt. Lighter links can't be re-verified without a token, so they drop the badge.
- Venue logos: `public/venues/{hyperliquid,lighter,breakout}.svg` aren't in the repo yet, so the renderer falls back to the generic chart icon plus a wordmark.
