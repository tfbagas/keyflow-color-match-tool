# Color Match Tool for Keyflow

Client-side color matching workstation that extracts Rec. 709 tonal and chromatic characteristics from a reference image and packages them into an importable Keyflow plugin (`.kfplug`). Runs entirely in the browser with zero server uploads.

* **Live Web App:** [https://keyflow-color-match-tool.pages.dev](https://keyflow-color-match-tool.pages.dev)
* **Current Version:** `v0.8.0-beta`
* **Developer:** TFBAGAS
* **Support Development:** [https://sociabuzz.com/tfbagas/support](https://sociabuzz.com/tfbagas/support)

## Capabilities

* **Color Match Engine v2 & Shared Shader Parity:** Computes Rec. 709 tonal curve fitting, contrast pivot, exposure, white balance, saturation, vibrance, and 3-Way Color Wheels (Lift, Gamma, Gain) inside a Web Worker with 1:1 parity across WebGL video preview, CPU canvas, `.kfplug`, and 3D LUTs.
* **Camera RAW, Video & LUT Support:** Decodes Camera RAW (`.cr2`, `.nef`, `.arw`, `.dng`, `.raf`, `.orf`, `.rw2`, `.pef`, `.srw`), plays graded MP4/MOV/WEBM videos in WebGL, and imports/exports 33x33x33 `.cube` and `.lut` files.
* **Pro Scopes & Grading Workstation:** Includes Luma/RGB Histogram, RGB Parade, Vectorscope with skin-tone line, interactive 3-Way Color Wheels, Master Match Strength (`0% - 150%`), A/B Snapshot Slots, Hover RGB/IRE readout, and full-res PNG frame export.
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
