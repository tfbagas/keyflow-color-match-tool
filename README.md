# ToneBench

**ToneBench `v1.0.0`** - Deterministic 3D OKLab color transfer, editable LUT lab, Pro Scopes, and universal `.cube` / `.lut` / `.ffx` / `.kfplug` export.

ToneBench extracts the tonal and chromatic character of any reference image, video, `.ffx`, or 3D LUT and applies it to your footage. It runs 100% in the browser with zero server uploads.

* **Developer:** TFBAGAS
* **Support Development:** [https://sociabuzz.com/tfbagas/support](https://sociabuzz.com/tfbagas/support)

## Features

* **Deterministic solver:** Source Normalize + 16-direction 3D OKLab Optimal Transport + Sigma Style Transfer, baked into a 32³ tetrahedral LUT.
* **Editable LUT lab:** 5-zone tonal curve, 3-way color wheels, 6-vector Hue 6V, and Rec.709 I-Line skin-tone protection.
* **Camera log input profiles:** Rec.709, Sony S-Log3, Canon C-Log3, DJI D-Log M, and Apple Log, with a multi-timestamp video sampler.
* **Pro Scopes:** Luma/RGB Histogram, RGB Parade, Vectorscope, Zebra / Clipping and False Color IRE overlays, eyedropper, and pixel loupe.
* **Universal export:** `.cube`, `.lut`, After Effects `.ffx`, Keyflow `.kfplug` (GLSL ES 1.00), plus `PNG` / `JPG` / `WEBP` stills and hardware WebCodecs `.mp4`.
* **Looks library and batch pack:** built-in looks, local saved looks, `.json` import/export, and `.zip` batch export.
* **Bilingual UI (`EN | ID`)**, command bar (`Ctrl+K` / `Cmd+K`), Undo/Redo, A/B snapshots, and session recovery.

## Tech Stack

* React, Vite, Tailwind CSS
* WebGL2 / GLSL ES 1.00, WebCodecs, HTML5 Canvas 2D, and Web Workers
* JSZip

## Local Development

```bash
cd web
npm install
npm run dev
```

```bash
cd web
npm run lint && npm run build
```