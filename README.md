# Color Match Tool for Keyflow

Client-side color matching workstation that extracts Rec. 709 tonal and chromatic characteristics from a reference image and packages them into an importable Keyflow plugin (`.kfplug`). Runs entirely in the browser with zero server uploads.

* **Live Web App:** [https://keyflow-color-match-tool.pages.dev](https://keyflow-color-match-tool.pages.dev)
* **Current Version:** `v0.6.5-beta`
* **Developer:** TFBAGAS

## Capabilities

* **Reference Color Extraction:** Computes Rec. 709 luminance, contrast pivot, exposure, white balance (temperature and tint), saturation, vibrance, and 3-Way Color Wheels (Lift, Gamma, Gain) inside a background Web Worker.
* **Monochrome Liquid Glass Workstation:** Neutral dark interface (`R=G=B`, zero color cast) designed to prevent simultaneous contrast bias during color grading.
* **Real-Time Canvas Preview:** Supports Split Slider, Side-by-Side, and Split Result comparison modes alongside instant `Hold Before` (`\`) toggling and a live RGB/Luma histogram.
* **Analysis Recovery & Calibration:** Includes one-click `Reload Analysis` restoration after resets, synthetic Canvas/Worker self-calibration, and `.kfplug` output multipliers in Settings.
* **Direct `.kfplug` Packaging:** Generates valid Keyflow plugin archives locally using JSZip with sanitized metadata.

## Tech Stack

* React, Vite, Tailwind CSS
* HTML5 Canvas 2D & Web Workers
* JSZip

## Local Development

```bash
cd web
npm install
npm run dev
```

```bash
cd web
npm run build
```
