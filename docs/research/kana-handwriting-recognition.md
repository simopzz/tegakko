# Kana Handwriting Recognition & Stroke-Order Evaluation

Research for [tegakko](../../README.md) ([Map #77](https://github.com/simopzz/tegakko/issues/77), [Ticket #78](https://github.com/simopzz/tegakko/issues/78)).

## 1. Problem & Domain Constraints

- **Catalog scope** ([`src/domain/cards.ts`](../../src/domain/cards.ts)): **208 kana cards** — 71 base hiragana (46 seion + 25 dakuten/handakuten), 71 base katakana, 33 hiragana yoon, and 33 katakana yoon.
- **Input representation** ([`src/domain/ink.ts`](../../src/domain/ink.ts), [ADR-0002](../adr/0002-ink-adapter-owns-its-canvas.md)): `Stroke[]`, where each stroke is an ordered array of `{ x, y, pressure }` with `x, y` normalized to `0..1` across the writing row. For two-kana **yoon** (e.g. `きゃ`, `チョ`), the genkouyoushi grid gives each kana its own cell, with the small suffix (`ゃ/ゅ/ょ/ャ/ュ/ョ`) rendered at ~half size.
- **Grading requirements** (Map #77):
  1. **Accuracy first, then speed.** Online (via a thin, zero-account Cloudflare Worker proxy) should be chosen only if its accuracy meaningfully overshadows local-only.
  2. **Grapheme accuracy (pass/fail):** Must distinguish lookalikes (`シ`/`ツ`, `ソ`/`ン`, `あ`/`お`, `ぬ`/`め`, `わ`/`ね`/`れ`) and two-kana yoon (`きゃ` vs `きや`). **Must not fail a valid grapheme solely for wrong stroke order.**
  3. **Stroke-order accuracy (advisory hint only):** Never fails the attempt; detects wrong stroke count, swapped stroke order, or reversed stroke direction.
- **License constraint** ([`package.json`](../../package.json), [`license-options.md`](./license-options.md)): The repo is **`GPL-3.0-only`**. Any bundled models or stroke datasets must be license-compatible with `GPL-3.0-only`.

---

## 2. Key Architectural Insight: Decouple Grapheme Recognition from Stroke Order

Combining grapheme grading and stroke-order checking into a single stroke-sequence recognizer (such as Zinnia) creates a conflict: **a valid grapheme written in the wrong stroke order will fail grapheme recognition**, violating Map #77's rule that stroke order is advisory only.

Instead, the two concerns map cleanly to different representations:

1. **Grapheme recognition** is best served by a **stroke-order-invariant** recognizer (Vision LLM or raster CNN) that evaluates the final rendered ink (and optionally cell-level proportions for yoon).
2. **Stroke-order evaluation** is inherently a **`Stroke[]` sequence** problem: a static raster cannot tell whether `十` was drawn vertical-first or whether `シ`'s long stroke was drawn bottom-up vs. top-down. Local geometric comparison of `Stroke[]` against reference stroke polylines runs in **< 5 ms**, works **100% offline**, and costs **$0**.

---

## 3. Grapheme Recognition: Local-Only Candidates

| Candidate | Accuracy (Kana & Lookalikes) | Yoon Support | Client Footprint & Cold Start | Latency | License & Fit |
| --- | --- | --- | --- | --- | --- |
| **KanjiCanvas** (`asdfjkl/kanjicanvas`) | Moderate on base kana; weak on subtle angle/alignment lookalikes (`シ`/`ツ`, `ソ`/`ン`) | Requires manual cell splitting | ~tens of KB pure JS | < 10 ms | **MIT** ([GitHub](https://github.com/asdfjkl/kanjicanvas)). Designed for IME top-N candidate picking, not strict pass/fail grading. |
| **Zinnia WASM** + `handwriting-ja.model` | High *if* stroke order is standard; **breaks on wrong stroke order** | Requires manual cell splitting | ~26 MB model + WASM ([GitHub](https://github.com/taku910/zinnia)) | < 10 ms | Engine **BSD-3-Clause**, model **LGPLv2.1**. Model is 26 MB (includes 6,400+ kanji) and strictly stroke-order dependent — poor fit. |
| **Tesseract.js** (`jpn.traineddata`) | Poor (< 30–50% on isolated handwritten characters) | Poor | 10–15 MB (`tessdata_fast`) to 30–50+ MB (`tessdata_best`) ([Docs](https://tesseract-ocr.github.io/tessdoc/Data-Files.html)) | 200–800 ms | **Apache-2.0**. Trained on printed text with dictionary context; unsuitable for isolated handwriting. |
| **Custom Kana CNN** (`onnxruntime-web` or `tfjs-backend-wasm`) | **96–99%** on standard isolated kana benchmarks (ETLDB) | Requires cell-splitting + bounding-box size heuristic for small kana | **ONNX:** ~106 KB JS + **8–10+ MB** `.wasm` ([ONNX Runtime](https://onnxruntime.ai/docs/build/web.html))<br>**TF.js WASM:** **1–2 MB** `.wasm` + custom-module JS ([TF.js](https://www.tensorflow.org/js/guide/platform_environment))<br>**Model (INT8):** ~1–3 MB | 5–30 ms (after cold start) | **Training-data risk:** ETL Character Database (ETL-1/4/5/8/9) requires AIST registration for academic/research use and restricts redistribution. Can still confuse `シ`/`ツ` and `ソ`/`ン` without explicit angle/direction features. |

### Local-Only Summary
- **No off-the-shelf local model** gives high-confidence pass/fail grading across all 208 kana cards (including `シ`/`ツ`, `ソ`/`ン`, and two-kana yoon proportions) with a small bundle and clean `GPL-3.0-only` provenance.
- A **custom CNN** in TF.js WASM (`tfjs-backend-wasm` ~1–2 MB + ~1–3 MB quantized weights) is technically viable and fast, *if* trained on cleanly licensed synthetic/augmented data (e.g. `animCJK` + Klee One / Noto Sans with elastic distortions) rather than raw ETLDB, and paired with cell-splitting for yoon.

---

## 4. Grapheme Recognition: Online Candidates (Cloudflare Worker Proxy)

Tegakko already deploys via `wrangler.jsonc` (`"assets": { "directory": "./dist" }`), so adding a same-origin Cloudflare Worker (`"main": "src/worker.ts"`) requires zero extra hosting infrastructure and supports native IP rate limiting (`ratelimits` binding) without user accounts ([Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).

| Candidate | Accuracy (Kana, Lookalikes, Yoon) | Latency | Cost (per 1,000 checks, est. ~250 input + ~40 output tokens) | Rate Limits / Terms |
| --- | --- | --- | --- | --- |
| **OpenAI `gpt-4.1-mini`** | **High** (strong on `シ`/`ツ`, `ソ`/`ン`, and two-kana yoon proportion in one image) | ~500–1,200 ms | **$0.40/1M in, $1.60/1M out** ([OpenAI](https://platform.openai.com/docs/pricing)) → **~$0.16 / 1,000 checks** (32×32px patches) | Standard API key in Worker secret; pay-as-you-go. |
| **OpenAI `gpt-4.1-nano`** | Moderate–High (needs empirical check on lookalikes vs `mini`) | ~400–900 ms | **$0.10/1M in, $0.40/1M out** → **~$0.04 / 1,000 checks** | Standard API key in Worker secret. |
| **Google `gemini-2.5-flash`** | **High** (strong multimodal OCR & Japanese script accuracy) | ~500–1,200 ms | **$0.30/1M in, $2.50/1M out** ([Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing)) → **~$0.18 / 1,000 checks** | Free tier available in AI Studio; pay-as-you-go for production. |
| **Google `gemini-2.5-flash-lite`** | Moderate–High (needs empirical check on lookalikes) | ~400–800 ms | **$0.10/1M in, $0.40/1M out** → **~$0.04 / 1,000 checks** | Pay-as-you-go / AI Studio. |
| **Cloudflare Workers AI** (`@cf/meta/llama-3.2-11b-vision-instruct`) | Lower on isolated Japanese kana lookalikes (`11B` open-weight VLM) | ~500–1,500 ms | **10,000 Neurons/day free**, then **$0.011 / 1,000 Neurons** ([CF Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)) | Native `env.AI.run()` binding, no external API key. |
| **MyScript Cloud iink API** | **Very High** (purpose-built `ja_JP` stroke recognizer) | ~200–500 ms | **2,000 req/mo free** ("Build"); production requires **custom enterprise contract** ([MyScript](https://developer.myscript.com/)) | Poor fit for a zero-account OSS portfolio PWA. |
| **Google Cloud Vision API** (`TEXT_DETECTION`) | Moderate on isolated single kana (tuned for scene/document text) | ~300–700 ms | **1,000/mo free**, then **$1.50 / 1,000 images** ([GCP Vision](https://cloud.google.com/vision/pricing)) | ~10× more expensive than Flash/Mini LLMs; no yoon rubric reasoning. |
| **Azure AI Vision Read API** | Weak–Moderate on isolated Japanese handwriting (strongest on Latin) | ~300–700 ms | **5,000/mo free (F0)**, then **$1.00–$1.50 / 1,000 tx** ([Azure Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/computer-vision/)) | Less suitable for isolated kana grading. |

---

## 5. Stroke-Order Evaluation (Advisory Hint)

Because `Attempt.strokes` already captures grid-relative `0..1` `Stroke[]` in drawing order:

- **Dataset license check (Critical):**
  - **KanjiVG** (`KanjiVG/kanjivg`) is licensed under **CC BY-SA 3.0** ([GitHub](https://github.com/KanjiVG/kanjivg)), which is **strictly incompatible with `GPL-3.0-only`** (only CC BY-SA **4.0** has a one-way GPLv3 bridge; [Creative Commons FAQ](https://creativecommons.org/faq/#can-i-combine-material-under-a-creative-commons-license-with-material-under-another-license)).
  - **AnimCJK** (`parsimonhi/animCJK`, `svgsJaKana/`): Kana SVGs are explicitly dual-licensed under **Arphic Public License or LGPL** ([`licenses/COPYING.txt`](https://github.com/parsimonhi/animCJK/blob/master/licenses/COPYING.txt)), which **is compatible with `GPL-3.0-only`**.
  - **StrokeSVG** (`zhengkyl/strokesvg`): Kana stroke SVGs derived from Klee One under **SIL OFL 1.1** ([GitHub](https://github.com/zhengkyl/strokesvg)).
- **Recommended local algorithm (< 5 ms, offline):**
  1. At build time, extract `animCJK/svgsJaKana` `<path>` elements into normalized `0..1` reference polylines (~50–150 KB JSON for all base+dakuten kana; yoon reuses the two component kana in left/right cells).
  2. At grade time, compare `attempt.strokes` against the target card's reference strokes:
     - **Stroke count check:** `attempt.strokes.length === ref.length`.
     - **Stroke order & direction check:** Resample each stroke to *N* points (e.g. 16) and compute Euclidean / DTW distance + start-to-end direction cosine similarity between `attempt.strokes[i]` and `ref[i]`. If a stroke matches `ref[j]` (`j ≠ i`) better than `ref[i]`, report swapped order; if direction cosine < 0, report reversed stroke direction.
  3. **Bonus for `シ`/`ツ` and `ソ`/`ン`:** Canonical stroke direction distinguishes these pairs (e.g., `シ`/`ン` draw the long stroke bottom-to-top, whereas `ツ`/`ソ` draw it top-to-bottom), giving the learner actionable stroke-direction feedback even when the static shape looks ambiguous.

---

## 6. Recommendation

1. **Stroke-order advisory hint:** Implement **100% locally** using `Stroke[]` geometric matching against build-time extracted **`animCJK/svgsJaKana`** polylines (LGPL, `GPL-3.0-only`-compatible, < 5 ms, offline).
2. **Grapheme recognition:**
   - **Online (recommended primary if online is acceptable):** A thin, zero-account **Cloudflare Worker proxy** (`/api/grade` with `ratelimits` binding) calling **`gemini-2.5-flash` or `gpt-4.1-mini`** (with `flash-lite` / `nano` as faster/cheaper candidates to benchmark). It requires **0 KB** client ML bundle, handles **yoon proportions and lookalikes** (`シ`/`ツ`, `ソ`/`ン`, `あ`/`お`, `ぬ`/`め`) natively, costs **~$0.04–$0.18 per 1,000 checks**, and degrades cleanly to manual `Self-grade` when offline.
   - **Local-only fallback / alternative:** If zero-network is preferred over maximum accuracy, train a compact **quantized CNN** (~1–3 MB) on `animCJK`/font-derived synthetic kana + elastic distortion and run it via **`@tensorflow/tfjs-backend-wasm`** (~1–2 MB `.wasm`).
3. **Next empirical step:** Before committing to a specific VLM model (`gpt-4.1-mini` vs `gpt-4.1-nano` vs `gemini-2.5-flash` vs `gemini-2.5-flash-lite`) or local CNN, run a small benchmark on ~30–50 real `Stroke[]` samples covering lookalikes (`シ`/`ツ`, `ソ`/`ン`, `あ`/`お`, `ぬ`/`め`), messy handwriting, and yoon (`きゃ`, `チョ`).
