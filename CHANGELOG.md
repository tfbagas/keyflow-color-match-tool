# Changelog

All notable changes to **Color Match for Keyflow** are documented in this file.

## [v0.9.5-beta] - 2026-11-17

Consolidates the `v0.9.0` and `v0.9.5 Beta` feature milestones into a unified release.

### Added
- **Full Bilingual Support (`EN | ID`):** Instant `EN | ID` segmented language switcher in the top header, Settings, and Spotlight Command Bar (`Ctrl+K`), with natural Bahasa Indonesia editing terminology across every component, modal, toast, and the `2400x1350` Release Poster.
- **Polaris v3 PRO Cinema Engine + Auto-Normalize:** 3D polynomial + OKLab color matching with skin-tone ellipsoid guard, deep blacks toe, and optional `Auto-Normalize Target` pre-match exposure/white-balance balancing.
- **Camera Log Input Profiles + Smart Video Sampler:** Built-in mathematical linearization for `Sony S-Log3`, `Canon C-Log3`, `DJI D-Log M`, and `Apple Log`, plus multi-frame median video reference sampling and 1-frame stepping (`-1f` / `+1f` + `Match Current Frame`).
- **Two-Way After Effects `.ffx` & Direct Converter:** Native binary RIFX `.ffx` parser and exporter, plus `Export All-in-One Pack (.zip)` bundling `.kfplug`, `.ffx`, `.cube`, and a `16:9` Promo Card.
- **Hardware WebCodecs `.mp4` Video Exporter:** Client-side hardware-accelerated H.264 + AAC video rendering with `Graded Only` and `Before / After Split` layouts.
- **Storefront Promo Card with Scannable QR:** Export `16:9`, `4:5`, and `9:16` showcase cards with 5 extracted palette droplets and scannable QR links (`Live Grade #g` or `Custom Store URL`).
- **Release Poster Generator (`2400x1350` PNG):** 6-module Apple Liquid Glass Bento Grid release poster modal with live `EN | ID` switching.
- **Optical Loupe (`2x / 4x`), Spotlight Command Bar (`Ctrl+K`), Looks Library & Apple Liquid Glass UI:** Precision pixel loupe, 2-finger pinch-to-zoom (`1x - 4x`), 7 built-in + unlimited saved looks with `Batch Pack (.zip)`, and unified obsidian Liquid Glass workspace.

### Fixed
- Fixed top header navigation active tab pill background and `EN | ID` toggle contrast while keeping sticky header `backdrop-filter` intact.

## [v0.8.1-beta]

- Optimized Pro Scopes (`1x` DPR, deferred drag calculations, 6fps video scope throttling) and WebGL video playback (`requestVideoFrameCallback`).
- Rebuilt Side by Side comparison into a single-pass WebGL shader view.

## [v0.8.0-beta]

- Added Camera RAW decoding, real-time 60fps WebGL video preview, 3D LUT `.cube`/`.lut` I/O, Pro Scopes, 3-Way Color Wheels, and A/B snapshot slots.
