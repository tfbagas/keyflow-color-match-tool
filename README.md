# Color Match Tool for Keyflow
> **Target Engine:** Keyflow Mobile 1.5.x+ (Package: `com.angkin.keyflow`)  
> **UI Framework:** PySide6 (Qt) — Liquid Glass & Monochrome SVG Icon System  
> **Threading Model:** Dedicated `QThread` Non-blocking Background Worker Pipeline  
> **Color Grading Architecture:** Rec. 709 Computer Vision + Native GLSL Fragment Pipeline  
> **Credit & Development:** **TFBAGAS**

---

## 🚀 Performance & Freeze-Proof Multithreading

The application features an asynchronous background architecture:
- **Zero GUI Freezing:** Heavy image decoding, preview cache creation, statistical luminance/color analysis, and look matching are handled on a background `QThread` (`ColorMatchWorker`).
- **100% Fluid GUI Event Loop:** The main window remains fully responsive at all times — draggable, resizable, minimizable, with continuous Liquid Glass mouse hover reflections even while processing 4K/high-resolution images.
- **Dynamic Stage Status:** Non-blocking real-time status updates:
  - `Reading image...`
  - `Optimizing preview cache...`
  - `Analyzing colors & luminance...`
  - `Extracting grading characteristics...`
  - `Calculating grading parameters...`
  - `Finalizing preview...`
- **Cached Simulation & Debounced Sliders:** High-res images are cached to a dedicated 1280px preview buffer, reducing preview simulation runtime to ~10ms CPU time. Live slider adjustments are debounced (35ms), enabling silky-smooth 60 FPS live grading previews.

---

## 🎨 Liquid Glass & Monochrome Visual System

The interface features the **Dark Emerald Liquid Glass** design specification:
- **Liquid Glass Panels:** Translucent surfaces (`rgba(17, 26, 23, 0.78)`) with diffuse caustic ambient background lighting (`liquid_glass_bg.png`), thin 1px glass edge borders with specular top-edge highlights (`rgba(255, 255, 255, 0.18)`), and interactive cursor hover reflections.
- **Strict Monochrome Icon System (Zero Emojis):** Standardized on Lucide-style vector monochrome SVG line icons with 1.8–2.0px stroke width. Muted white/gray (`#91A69A` / `#E8F2ED`) in resting state, glowing neon emerald (`#00E987`) in active state.
- **Universal English Interface:** 100% international English terminology across all panels, tooltips, dialogs, and notifications.

---

## ✨ Features & Architecture

### 1. 📥 Reference & Target Image Cards (Side-Stack Actions)
- **Drag & Drop:** Directly drop any image file (`PNG`, `JPG`, `WEBP`, `BMP`) from Windows Explorer into the card.
- **Side-Stacked Actions:** The preview image is displayed on the left, with vertically stacked action buttons on the right:
  - `[ Replace ]` (Browse new image)
  - `[ Remove ]` (Clear loaded image)
- **Rich Metadata:** Displays filename, exact pixel resolution (e.g. `1280×720 px`), format, and filesize in MB.
- **Status Indicator:** Green `✓ Loaded` badge when image is ready. Reference Image is required; Target Image is optional for simulation.

### 2. 🎛️ Interactive Grading Parameters (Sliders + Spinbox + Reset All)
- **9 Core Grading Parameters:**
  - `Exposure (EV)` (-2.00 to +2.00)
  - `Contrast` (0.20 to 2.00)
  - `Contrast Pivot` (0.10 to 0.90)
  - `Shadows Tint/Level` (-0.50 to +0.50)
  - `Highlights Tint/Level` (-0.50 to +0.50)
  - `Color Temperature` (-1.00 to +1.00)
  - `Color Tint` (-1.00 to +1.00)
  - `Saturation` (0.00 to 2.00)
  - `Vibrance` (-0.80 to +0.80)
- **Controls per parameter:** Real-time glowing neon green slider + glass numeric spinbox.
- **`[ Reset All ]`:** Instant one-click reset to restore all parameters to the automatically extracted values.

### 3. 🎨 3-Way Color Wheels Swatches
- Dedicated swatch cards for **Shadows (Lift)**, **Midtones (Gamma)**, and **Highs (Gain)**.
- Displays rounded color rectangle preview.
- **HEX & Copy Button:** `#2F3A4A` with instant clipboard copy.
- **RGB Values:** Numeric RGB readouts (`32, 58, 74`).
- **Clickable Color Picker:** Clicking the color rectangle opens a native `QColorDialog` to manually fine-tune or pick any color.

### 4. 🖼️ Visual Preview (Before / After Comparison)
- **Split Slider Mode:** Interactive vertical neon green divider line with a draggable circular `< | >` handle to compare before and after seamlessly.
- **Side by Side Mode:** View both frames simultaneously.

### 5. 📦 Export Plugin (.kfplug)
- **Look / Preset Name:** Set custom look name (e.g. `Breaking Bad 2`).
- **Author / Made By:** Fill custom creator identity (e.g. `TFBAGAS`), replacing the generic "Keyflow Creator" in Keyflow Mobile. Can also be saved in Settings as the default.
- **Plugin Description:** Customize the description text shown inside Keyflow Mobile (auto-suggests a matching description or accepts any custom description).
- **Multi-Plugin Co-existence:** Auto-generates unique package ID (`com.keyflow.matchgrade.<slug>`) to ensure installed plugins never overwrite each other in Keyflow.
- Displays effect name in Keyflow: `Match Grade (<Name>)`.
- Disabled export button until a reference image is loaded.
- 100% compliant with Keyflow Mobile DEX validator (`^[a-zA-Z][a-zA-Z0-9]{0,31}$`, Premultiplied Alpha GLSL).

### 6. ⚙️ Settings & ℹ️ About
- **Settings:** Configure default output directory and auto-open folder toggle.
- **About:** Displays full engine specifications and prominent credit: **Created & Developed by: TFBAGAS**.

---

## 🚀 How to Run

Double-click `run_gui.bat` or run in terminal:
```bash
python tools\app_qt.py
```
