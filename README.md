# Color Match for Keyflow

Client-side cinema color grading and Keyflow plugin studio that extracts perceptual tonal and chromatic characteristics from any reference image, video, `.ffx`, or 3D LUT and packages them into importable `.kfplug` shaders, After Effects `.ffx` presets, `.cube`/`.lut` 3D LUTs, and hardware-accelerated `.mp4` videos. Runs 100% in the browser with zero server uploads.

* **Live Web App:** [https://keyflow-color-match-tool.pages.dev](https://keyflow-color-match-tool.pages.dev)
* **Current Version:** `v0.9.5 Beta`
* **Developer:** TFBAGAS
* **Support Development:** [https://sociabuzz.com/tfbagas/support](https://sociabuzz.com/tfbagas/support)

## Key Features (v0.9.5 Beta)

* **3 Color Science Engines (`Altair v1`, `Vega v2`, `Polaris v3 PRO`):** Switch instantly (or via `1` / `2` / `3` hotkeys) between Fast RGB (`Altair v1`), Balanced (`Vega v2`), and Cinema Pro (`Polaris v3 PRO` - 3D polynomial + OKLab gamut compression with skin-tone protection and deep blacks toe) inside a Web Worker with 1:1 parity across WebGL preview, CPU canvas, `.kfplug`, `.ffx`, and 3D LUTs.
* **Auto-Normalize Target:** Optional pre-match normalization that balances target mid-gray exposure and white balance before running color transfer.
* **Camera Log Input Profiles & Smart Video Sampler:** Built-in mathematical input transforms for `Rec.709`, `Sony S-Log3`, `Canon C-Log3`, `DJI D-Log M`, and `Apple Log`, plus multi-timestamp `Smart Video Sampler` and 1-frame video stepping (`-1f` / `+1f`) with `Match Current Frame`.
* **Two-Way After Effects `.ffx` Engine & Direct Converter:** Native binary RIFX `.ffx` parser and exporter - import `.ffx` presets or convert directly between `.ffx`, `.cube`, `.lut`, and `.kfplug`.
* **Hardware WebCodecs `.mp4` Video Exporter:** Client-side hardware-accelerated H.264 + AAC graded video export (Graded Only or Before/After Split) alongside full-resolution `PNG`, `JPG`, and `WEBP` exports.
* **Pro Scopes & Optical Inspection:** Real-time Luma/RGB Histogram, RGB Parade, Vectorscope with Rec.709 Skin-Tone `I-Line`, WebGL `Zebra / Clipping` and `False Color IRE` overlays, Touch Eyedropper (`RGB / IRE`), `2x / 4x` Optical Glass Pixel Loupe, and 2-finger Pinch-to-Zoom (`1x - 4x`).
* **Looks Library, Batch Pack & Storefront Promo Card with QR:** 7 built-in cinema looks, unlimited local saved looks, `.json` import/export, `Batch Pack (.zip)`, and shareable Storefront Promo Cards (`16:9`, `4:5`, `9:16`) with 5 extracted palette droplets and scannable QR codes.
* **Release Poster Generator (`2400x1350` PNG):** Built-in 6-module Apple Liquid Glass Bento Grid release poster renderer in English and Bahasa Indonesia.
* **Full Bilingual UI (`EN | ID`) & Apple Liquid Glass:** Instant language switcher between English and natural Bahasa Indonesia without reloading, Spotlight Command Bar (`Ctrl+K` / `Cmd+K`), 25-step Undo/Redo, A/B snapshot slots, and session auto-recovery.

## Tech Stack

* React, Vite, Tailwind CSS
* WebGL2 / GLSL ES 1.00, WebCodecs (`VideoEncoder` / `AudioEncoder`), HTML5 Canvas 2D & Web Workers
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
