# Color Match Tool for Keyflow

Client-side color matching workstation that extracts Rec. 709 tonal and chromatic characteristics from a reference image and packages them into an importable Keyflow plugin (`.kfplug`). Runs entirely in the browser with zero server uploads.

* **Live Web App:** [https://keyflow-color-match-tool.pages.dev](https://keyflow-color-match-tool.pages.dev)
* **Current Version:** `v0.9.0-beta`
* **Developer:** TFBAGAS
* **Support Development:** [https://sociabuzz.com/tfbagas/support](https://sociabuzz.com/tfbagas/support)

## Capabilities

* **Multi-Engine Color Matching (`v1`, `v2`, `v3 Cinema Pro`):** Switch between Fast RGB (`v1`), Balanced (`v2`), and Cinema Pro (`v3` perceptual OKLab with skin-tone protection and AgX highlight roll-off) inside a Web Worker with 1:1 parity across WebGL preview, CPU canvas, `.kfplug`, and 3D LUTs.
* **Camera RAW, Video & LUT Support:** Decodes Camera RAW (`.cr2`, `.nef`, `.arw`, `.dng`, `.raf`, `.orf`, `.rw2`, `.pef`, `.srw`), plays graded MP4/MOV/WEBM videos in WebGL with frame stepping and `Match Current Frame`, and imports/exports 33x33x33 `.cube` and `.lut` files.
* **Pro Scopes & WebGL Exposure Tools:** Includes Luma/RGB Histogram, RGB Parade, Vectorscope with skin-tone line, WebGL `Zebra / Clipping` and `False Color IRE` overlays, Touch Eyedropper (`RGB / IRE`), interactive 3-Way Color Wheels, Master Match Strength (`0% - 150%`), A/B Full Snapshots, and 25-step Undo/Redo.
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
