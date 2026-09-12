# Submission assets

Generated, not mocked up. Every screenshot is of the deployed site at
<https://recourse-nine.vercel.app> reading Hedera testnet, so the payments and
verdicts visible in them are real.

| File | Use | Size |
| --- | --- | --- |
| `logo.png` | Square logo / icon | 512×512 |
| `logo-padded.png` | Same mark with more breathing room, for platforms that crop to a circle | 512×512 |
| `cover.png` | Cover image | 1280×720 (16:9) |
| `01-hero.png` | Screenshot — the thesis | 2880×1800 |
| `02-problem.png` | Screenshot — x402 today vs with Recourse | 2880×1800 |
| `03-demo-verdict.png` | Screenshot — the replay ending in a refund | 2560×1800 |
| `04-explorer.png` | Screenshot — live payments, disputes, services | 2880×1900 |
| `05-payment-sla.png` | Screenshot — sealed payloads and the clause that broke | 2880×1960 |
| `06-sla-builder.png` | Screenshot — composing an SLA and its commitment hash | 2880×1800 |

**Pick three:** `05-payment-sla`, `03-demo-verdict`, `04-explorer`. Between them
they show the confidential adjudication, the money moving, and that it is all
real on-chain state.

## Regenerating

`capture.ts` drives headless Chrome over the DevTools protocol rather than using
`chrome --screenshot`, which can only photograph the top of a page in whatever
theme the OS reports. Driving it directly allows setting the stored theme before
first paint, scrolling to a named element, and clicking into the live demo.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --hide-scrollbars --remote-debugging-port=9222 \
  --user-data-dir=/tmp/rec-chrome-profile about:blank &
bun assets/capture.ts                      # or: bun assets/capture.ts http://localhost:3000
```

The logo is rendered from `logo.svg` with `rsvg-convert`; the cover from
`cover.html`, captured at 640×360 and 2× so the type is never resampled.
