# Swarm CAPTCHA-Breaker

**A single real fruit-fly brain can't reliably read a distorted CAPTCHA. Five of them, seeing five independently-distorted versions of the same code and voting together, can — across every major CAPTCHA category, not just distorted text.**

This document is a build spec, written to be handed to an autonomous coding agent (e.g. Antigravity) and implemented directly. Every section defines concrete inputs, outputs, and pass/fail conditions rather than leaving design choices open.

---

## 1. Context

On September 3, 2026, HHMI Janelia and Google Research released **MaleCNS v1.0** — the first complete connectome of an entire male fruit fly's central nervous system: **166,700 neurons, ~25.6 million connections**, covering the central brain, optic lobes, and ventral nerve cord. It went viral within days — Doom, Minecraft, Beat Saber, bitcoin trading, all wired to the frozen, untrained connectome by driving its real sensory neurons and reading its real motor-command neurons.

One of these projects, **FlyOCR**, fed document glyphs into the fly's real photoreceptors, ran the connectome forward in time, and trained a small readout on the downstream spikes — ~87% accuracy on clean, single-glyph characters.

**This project is the sequel FlyOCR set up but didn't build.** A single fly reading a clean glyph is a neat trick. A single fly reading a CAPTCHA — engineered specifically to defeat single OCR readers — should fail, or at best perform poorly. The real question: can a swarm of them, each individually unreliable, pool partial information and succeed anyway, **across every real category of CAPTCHA, not just distorted text**?

This project is independent of [[phanesys]], and supersedes an earlier direction on this same project (a FlyHash-style vector search benchmark), dropped after research showed the core "real vs. random connectome wiring" question had already been answered publicly with a negative result.

---

## 2. The core idea

1. Generate a batch of CAPTCHA challenges, across all categories in §3, each with a known ground-truth answer.
2. For each hidden ground truth, generate **N independently-varied renders** — different noise, warping, rotation, image selection, or gap position, same underlying answer.
3. Feed **one render to one simulated MaleCNS v1.0 connectome**. Each fly only ever sees its own single render.
4. Each fly's task-appropriate readout (see §5) produces a best guess and a confidence score.
5. **Single-fly condition (baseline):** report that one fly's guess alone.
6. **Swarm condition:** pool all N flies' guesses via the aggregation strategy for that CAPTCHA type (see §5), weighted by confidence.
7. Compare single-fly vs. swarm accuracy, per type and overall.

**Every CAPTCHA category gets handled on its own terms.** Treating a slider drag and a distorted-text read as the same problem would be dishonest — this spec defines a distinct readout head per category, sharing only the common front end (receptor encoding + connectome forward pass).

---

## 3. CAPTCHA categories covered, and what each one actually requires

| Type | What a human does | Underlying computation | Readout head (§5) |
|---|---|---|---|
| **Text** | Type the distorted characters | Character classification | Classification head |
| **Math** | Solve a distorted arithmetic expression | Character classification (digits + operator), then trivial arithmetic | Classification head + evaluator |
| **Scatter** | Read highlighted letters among noise | Character classification, after a pre-filter | Classification head (with pre-filter) |
| **Grid/select** | Click every image matching a word | Per-cell semantic image classification | Category head |
| **Rotate** | Turn each image upright | 4-way rotation-angle classification | Rotation head |
| **Tiles** | Click the tiles that are "out of place" | Per-tile familiarity/novelty scoring | Novelty head |
| **Broken circle** | Click the circle with a gap | Localize a gap position on a ring | Spatial population-vector head |
| **Slider** | Drag a puzzle piece into a gap | Closed-loop visual-error correction | Motor/steering head |

No category is deferred. Text/math/scatter/grid/rotate/tiles/broken-circle all reduce to a **single forward pass** through the connectome per render (same shape as FlyOCR). Slider is the one genuine exception — it needs a **closed control loop**, because dragging is an action performed over time, not a single classification. That's a real, principled difference, not a gap in the design.

---

## 4. Sourcing the CAPTCHAs

**We do not scrape or target live production anti-bot systems** (Google reCAPTCHA, hCaptcha, Cloudflare Turnstile). Two independent reasons: those services generate a brand-new random challenge every load, so you can never get N independent renders of the *same* hidden answer from them (which every comparison in this spec depends on); and building something that defeats production anti-abuse infrastructure isn't the same demo anymore, whatever the framing.

**What we do instead — self-hosted, open-source generators, run locally:**
- `joshuavanderpoll/laravel-captchas` — covers **broken_circle, scatter, rotate, slider, grid, tiles** natively.
- `Dev-3bdulrahman/Laravel-Captcha` — covers **image, math, text, slider** natively, with adjustable difficulty (easy/medium/hard) — use this for the distortion-severity ablation in §7.4.
- Both are PHP/Laravel packages — run each as a tiny local generation microservice behind a simple HTTP endpoint (`GET /generate?type=slider&difficulty=hard` → returns image + ground truth JSON). The rest of the pipeline is language-agnostic; we only need PNGs and labels out of this step, so PHP here is an implementation detail, not a project-wide dependency.

**Automating volume generation — jev and webcmd, pointed at our own local server, never a third party:**
- **jev** (TypeSafe's fast browser agent) drives the repetitive loop: load the local generator page, trigger a new challenge, screenshot/save the image, record the ground truth, repeat — hundreds of times per type. This is exactly jev's designed use case (one fast decision per page state), just aimed at infrastructure we control.
- **webcmd** compiles jev's first pass into a fast, deterministic script for "grab N more of type X at difficulty Y" — so building out the full dataset later is a script run, not an agent loop.
- Target minimum: **300 unique ground-truth challenges per type, 5 renders each** (1,500 images per type, ~12,000 total across 8 types) — enough for a real accuracy number with a defensible confidence interval (§7.4).

---

## 5. Shared architecture

```
                    Ground truth answer (varies by type: text,
                    category label, angle, gap position, etc.)
                                │
                                ▼
                ┌───────────────────────────┐
                │  Local generator (self-hosted) │
                │  N independent renders          │
                └──────────────┬──────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
          Render 1          Render 2    ...    Render N
              │                 │                 │
              ▼                 ▼                 ▼
     ┌──────────────┐  ┌──────────────┐   ┌──────────────┐
     │ Receptor       │  │ Receptor       │   │ Receptor       │
     │ encoding       │  │ encoding       │   │ encoding       │
     │ (pixels →      │  │ (pixels →      │   │ (pixels →      │
     │  photoreceptor │  │  photoreceptor │   │  photoreceptor │
     │  activations)  │  │  activations)  │   │  activations)  │
     └──────┬───────┘  └──────┬───────┘   └──────┬───────┘
            ▼                 ▼                  ▼
     ┌──────────────┐  ┌──────────────┐   ┌──────────────┐
     │ MaleCNS v1.0   │  │ MaleCNS v1.0   │   │ MaleCNS v1.0   │
     │ forward pass   │  │ forward pass   │   │ forward pass   │
     │ (flybrain,     │  │ (flybrain,     │   │ (flybrain,     │
     │  batch mode)   │  │  batch mode)   │   │  batch mode)   │
     └──────┬───────┘  └──────┬───────┘   └──────┬───────┘
            ▼                 ▼                  ▼
     ┌────────────────────────────────────────────────┐
     │      Type-specific readout head (below)          │
     │  guess + confidence, per fly                      │
     └───────────────────────┬────────────────────────┘
                              ▼
              ┌────────────────────────────────┐
              │  Type-specific aggregation        │
              │  strategy (below)                  │
              └────────────────┬───────────────┘
                                ▼
                     Swarm's combined answer
                                │
                                ▼
              Compare vs. ground truth AND vs.
              each individual fly's own guess
```

### 5.1 Classification head — text, math, scatter
- Same recipe FlyOCR proved out: split into glyphs, present each to the connectome for a fixed window (start at 100ms, matching FlyOCR), collect downstream spike counts from a fixed population, train a compact linear/logistic classifier (36 classes: A–Z, 0–9, plus `+ - × ÷ =` for math).
- **Math-specific step:** once each character/operator is classified, evaluate the arithmetic with ordinary code — the hard part of a math CAPTCHA is reading distorted digits, not doing arithmetic, so don't overbuild this part.
- **Scatter-specific step:** apply a simple pre-filter (color/contrast threshold) to isolate the highlighted letters from background noise before glyph-splitting.
- **Aggregation:** per-character-position confidence-weighted majority vote across the swarm (same as the original text-only design).
- **Single-fly failure mode:** high character error rate on heavily distorted/scattered renders — this is your baseline.

### 5.2 Category head — grid/select
- Per grid cell, encode the cell's image into receptor activations, run the connectome forward, train a classifier over the candidate category labels (e.g. "car," "crosswalk," "storefront" — whatever categories your generator's grid set uses).
- **Aggregation:** for each cell, majority-vote the swarm's yes/no ("does this match the target word") across N independent renders of the same grid (if your generator supports re-rendering the same grid with different image noise/rotation per fly; if it only produces one grid per ground truth, run each fly on a different **crop/zoom/rotation augmentation** of the same grid image as your N "independent renders" — document which approach you used, since it changes what "independent" means here).
- **Single-fly failure mode:** misses on categories where the connectome's readout is weak, or on cells with partial/occluded objects.

### 5.3 Rotation head — rotate
- 4-way (0°/90°/180°/270°) classifier trained the same way as §5.1, just with rotation-angle labels instead of character labels.
- **Aggregation:** majority vote over N renders (each independently re-noised, same underlying image and correct angle).
- **Single-fly failure mode:** near-symmetric images (a circle, a plain square) where the connectome's visual features don't distinguish angles well — flag these separately in results, since they're a hard case for *any* method, biological or not.

### 5.4 Novelty head — tiles
- This is the one category where the biology's actual specialization is directly relevant, not just repurposed: the mushroom body's sparse coding is a real, published mechanism for **novelty detection** (an input's spike pattern overlap with previously-seen "familiar" patterns). Use this directly: present all tiles in a set to the connectome, measure each tile's response-pattern distance from the swarm/population's own average response — the outlier tile(s) are your novelty flags.
- **Aggregation:** average each tile's novelty score across the swarm's N independent renders, flag tiles above a set threshold.
- **Single-fly failure mode:** a single fly's own baseline "familiar" pattern is noisy with only one render to compare against — the swarm's benefit here comes from averaging out that per-instance noise, not from voting on discrete guesses.

### 5.5 Spatial population-vector head — broken circle
- Encode the ring image; instead of a discrete classifier, train a **population-vector readout** (a well-established technique in real fly navigation research — the same style used to read heading direction out of the central complex) that outputs a continuous angle estimate for where the gap sits on the ring.
- **Aggregation:** circular mean of the swarm's N angle estimates, weighted by each fly's confidence (use circular statistics — a plain arithmetic mean breaks near the 0°/360° wraparound).
- **Single-fly failure mode:** single-render angle estimates with high variance, especially on rings with heavy background noise.

### 5.6 Motor/steering head — slider (the closed-loop exception)
This is the one category that is not a single forward pass. A slider CAPTCHA requires an action performed over time, so the fly's role is **continuous course-correction**, modeled on real fly visual-fixation/steering behavior (the same kind of proportional visual-error-driven steering used in fly optomotor research):

1. Render the current frame (puzzle piece position vs. gap position).
2. Encode the **visual error** (horizontal offset between piece and gap) into receptor activations — not a static image, a continuously updating one.
3. Step the connectome forward a short window, read a steering-relevant descending neuron population (a real fly's steering/course-correction descending neurons), and convert its output into a "move left / move right / stop" signal.
4. Apply that signal to the puzzle piece's position, re-render, and repeat until the piece is within a tolerance of the gap or a step-count timeout is hit (see §6 for the timeout value).
5. **Per-fly result:** did it settle inside the gap tolerance before timeout?
6. **Aggregation:** run N flies on N independently-noised renders of the same slider challenge (varying background image and initial piece offset); the swarm's answer is the **median final position** across all N flies' attempts, checked against the gap tolerance.
- **Single-fly failure mode:** overshoot/oscillation on a single noisy render, or getting stuck against a locally-misleading visual feature — expect single-fly success rate to be materially lower than the swarm's median-position result.

---

## 6. Edge cases to handle explicitly

Build these in from the start — they're not corner cases you'll get to later, they're required for any of the numbers in §7 to mean anything:

- **No majority / tied vote (classification types):** if the swarm's per-character or per-cell vote ties, fall back to the single highest-confidence fly's guess for that position rather than picking arbitrarily — log every tie so you can report how often it happens.
- **Low-confidence swarm result:** define a minimum aggregate-confidence threshold below which the swarm reports "unsolved" rather than a low-confidence guess — report both the accuracy *and* the unsolved rate, since a method that abstains often but is right when it answers is a different (and reportable) result from one that's always wrong.
- **Slider timeout:** cap the closed-loop correction at a fixed step budget (start at 50 steps); if no fly in the swarm settles within budget, the challenge is logged as a swarm failure, not silently dropped from the dataset.
- **Generator failures:** the local PHP generator service can time out or return a malformed image — retry once, then log and skip that sample rather than crashing the run; report the skip rate.
- **Swarm size of 1:** every aggregation strategy above must degrade gracefully to "just report that one fly's answer" when N=1, since this is your own baseline condition, not a special case to special-case around.
- **Category imbalance (grid/select, tiles):** if your generator's category or novelty-tile distribution is skewed (e.g. "storefront" appears far more than "crosswalk"), report per-category accuracy, not just an aggregate — an aggregate number can hide a method that only works on the majority category.
- **Near-symmetric rotate images:** as noted in §5.3, flag and report these separately rather than averaging them into the main rotation accuracy number, since they're a known hard case independent of method.

---

## 7. Build plan

1. Stand up the two local Laravel generator services; confirm each type in §3 produces an image + machine-readable ground truth via a simple HTTP call.
2. `pip install flybrain`; run the package's own quickstart example as a smoke test before touching any CAPTCHA data.
3. Build the shared receptor-encoding + connectome-forward-pass utility (§5's common front end), parameterized by presentation window and neuron-population readout — this is reused by every type except slider.
4. Implement the six single-forward-pass readout heads (§5.1–§5.5) one at a time, text first (closest to FlyOCR, lowest risk), tiles and broken-circle last (least precedent to build from).
5. Implement the slider closed-loop head (§5.6) separately — budget more time here, it's the one genuinely novel control-loop piece.
6. Build the jev-driven harvesting script against the local generators; target the per-type sample counts in §4.
7. Implement all edge-case handling from §6 before running any full-scale evaluation — retrofitting these after the fact risks silently invalidating early numbers.
8. Run the full single-fly-vs-swarm comparison per type (§8).

---

## 8. What to measure

### 8.1 Core comparison, per type
For every one of the 8 types: single-fly accuracy vs. swarm accuracy, using the type-appropriate correctness definition (exact-match for text/math/scatter, per-cell F1 for grid/select, angle accuracy for rotate, precision/recall for tiles novelty-flagging, angular error for broken-circle, settle-success-rate for slider).

### 8.2 Swarm-size ablation
For each type, accuracy at N = 1, 2, 3, 5, 8 flies. Expect (and report honestly whether you find) a curve that climbs and plateaus, not just one N=5 number.

### 8.3 Distortion-severity ablation
Using the difficulty levels the generators expose (easy/medium/hard), confirm whether the swarm's advantage over a single fly grows as distortion increases. Report this per type — it may hold for some categories and not others, and that difference is itself a finding.

### 8.4 Statistical rigor
- Minimum sample sizes from §4 (300 unique ground truths per type).
- Report accuracy with a confidence interval (Wilson interval is fine for proportions).
- No leakage: readout training samples and evaluation samples must be disjoint per type.

### 8.5 Resource/performance measurements
- Wall-clock and peak memory for a single-fly forward pass and for a full swarm batch (via `flybrain`'s `batch` parameter), per type.
- Confirm everything runs comfortably within the target laptop (i7-11850H, 16GB RAM, RTX A2000 4GB) — report the real numbers, don't assume.

### 8.6 Non-biological baseline
Run the same test sets through a conventional baseline per type where a natural one exists (Tesseract for text/math/scatter; a simple off-the-shelf CNN classifier for grid/select and rotate) at both single-view and majority-vote-of-N conditions. This calibrates whether any swarm benefit is specific to the connectome's structure or is the generic, well-known benefit of ensembling any noisy classifier — report this honestly either way.

---

## 9. Tech stack

- `flybrain` — MaleCNS v1.0 simulation (CPU via numba; optional GPU via CuPy)
- `joshuavanderpoll/laravel-captchas`, `Dev-3bdulrahman/Laravel-Captcha` — local multi-type CAPTCHA generation (run as local PHP services)
- **jev** (TypeSafe) — fast automated harvesting against the local generators
- **webcmd** — compiled fast-path scripts for repeat harvesting runs
- `numpy` — receptor encoding, vote/aggregation logic
- `scikit-learn` — classification/rotation readout heads
- Circular-statistics utilities (e.g. `scipy.stats.circmean`) — for the broken-circle head
- `pytesseract` — non-biological baseline for text/math/scatter
- `psutil` — resource profiling

---

## 10. What "success" looks like

Report per-type, not just in aggregate — different categories may land in different places, and that's a real result, not a mixed message:
- **Best case per type:** single-fly accuracy poor, swarm accuracy dramatically higher, gap widening with distortion severity.
- **Interesting middle case:** swarm helps by roughly the margin a generic ensemble would — still worth showing, with the non-biological baseline comparison making that explicit rather than overclaiming.
- **Null case per type:** no meaningful swarm advantage — also reportable, and worth distinguishing whether the type was too easy (single fly already fine) or too hard (swarm can't recover enough signal either).
