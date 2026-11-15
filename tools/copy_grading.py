#!/usr/bin/env python3
"""
Keyflow Copy Grading Engine & Plugin Generator
----------------------------------------------
Menganalisis gambar referensi (foto, film still, moodboard) dan mengekstrak parameter
color grading (Exposure, Contrast, White Balance, 3-Way Lift/Gamma/Gain, Saturation, Vibrance).
Menghasilkan paket plugin Keyflow (.kfplug) unik yang siap diimpor ke Keyflow Mobile tanpa menimpa plugin lain.
"""

import os
import re
import sys
import json
import zipfile
import argparse
import numpy as np
from PIL import Image

def analyze_reference_pil(img, stage_callback=None):
    """
    Analyzes an in-memory PIL image and returns Keyflow grading parameters.
    stage_callback(stage_str) can be passed to report non-blocking progress stages.
    """
    if stage_callback:
        stage_callback("Optimizing analysis cache...")

    # Resize thumbnail for fast statistical analysis if resolution is high
    max_dim = 1200
    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
        img = img.resize(new_size, Image.Resampling.BILINEAR)

    rgb = np.array(img.convert('RGB'), dtype=np.float32) / 255.0
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    if stage_callback:
        stage_callback("Analyzing colors & luminance...")

    # 1. Luminansi Perceptual (Rec. 709)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    if stage_callback:
        stage_callback("Extracting grading characteristics...")

    # 2. Analisis Exposure & Contrast
    p5, p50, p95 = np.percentile(lum, [5, 50, 95])
    exposure = float(np.clip(np.log2(max(p50, 0.02) / 0.435), -1.5, 1.5))
    
    dyn_range = p95 - p5
    contrast = float(np.clip(dyn_range / 0.65, 0.5, 1.8))
    pivot = float(np.clip((p5 + p95) / 2.0, 0.2, 0.8))

    shadows = float(np.clip((p5 - 0.04) * 2.5, -0.5, 0.5))
    highlights = float(np.clip((0.96 - p95) * -2.5, -0.5, 0.5))

    # 3. Analisis White Balance (Temperature & Tint)
    chroma_diff = np.abs(r - g) + np.abs(g - b)
    neutral_mask = (chroma_diff < 0.18) & (lum > 0.2) & (lum < 0.8)

    if np.sum(neutral_mask) > 100:
        neut_r = float(np.mean(r[neutral_mask]))
        neut_g = float(np.mean(g[neutral_mask]))
        neut_b = float(np.mean(b[neutral_mask]))
    else:
        neut_r = float(np.mean(r))
        neut_g = float(np.mean(g))
        neut_b = float(np.mean(b))

    temp = float(np.clip((neut_r - neut_b) * 2.2, -1.0, 1.0))
    tint = float(np.clip(((neut_r + neut_b) * 0.5 - neut_g) * 2.5, -1.0, 1.0))

    if stage_callback:
        stage_callback("Calculating grading parameters...")

    # 4. Analisis 3-Way Split Toning (Lift, Gamma, Gain)
    shadow_mask = lum < 0.33
    mid_mask = (lum >= 0.33) & (lum <= 0.66)
    high_mask = lum > 0.66

    def get_swatch_tint(mask):
        if np.sum(mask) > 64:
            mr = float(np.mean(r[mask]))
            mg = float(np.mean(g[mask]))
            mb = float(np.mean(b[mask]))
            ml = float(np.mean(lum[mask]))
            tr = float(np.clip(0.5 + (mr - ml) * 1.6, 0.05, 0.95))
            tg = float(np.clip(0.5 + (mg - ml) * 1.6, 0.05, 0.95))
            tb = float(np.clip(0.5 + (mb - ml) * 1.6, 0.05, 0.95))
            return tr, tg, tb
        return 0.5, 0.5, 0.5

    lift_r, lift_g, lift_b = get_swatch_tint(shadow_mask)
    gamma_r, gamma_g, gamma_b = get_swatch_tint(mid_mask)
    gain_r, gain_g, gain_b = get_swatch_tint(high_mask)

    # 5. Analisis Saturation & Vibrance
    max_c = np.maximum(r, np.maximum(g, b))
    min_c = np.minimum(r, np.minimum(g, b))
    sat_map = (max_c - min_c) / np.maximum(max_c, 1e-4)
    mean_sat = float(np.mean(sat_map))
    sat = float(np.clip(mean_sat / 0.32, 0.1, 2.0))
    vib = float(np.clip((float(np.std(sat_map)) - 0.15) * 2.0, -0.8, 0.8))

    params = {
        "gradeMix": 1.0,
        "exposure": round(exposure, 2),
        "contrast": round(contrast, 2),
        "pivot": round(pivot, 2),
        "shadows": round(shadows, 2),
        "highlights": round(highlights, 2),
        "temp": round(temp, 2),
        "tint": round(tint, 2),
        "sat": round(sat, 2),
        "vib": round(vib, 2),
        "liftR": round(lift_r, 2),
        "liftG": round(lift_g, 2),
        "liftB": round(lift_b, 2),
        "gammaR": round(gamma_r, 2),
        "gammaG": round(gamma_g, 2),
        "gammaB": round(gamma_b, 2),
        "gainR": round(gain_r, 2),
        "gainG": round(gain_g, 2),
        "gainB": round(gain_b, 2)
    }

    return params

def analyze_reference(image_path, stage_callback=None):
    """
    Menganalisis gambar referensi dan mengembalikan dictionary parameter grading Keyflow.
    Parameter ID wajib alphanumeric (tanpa underscore) sesuai aturan engine Keyflow DEX:
    'parameter id must be a letter followed by letters or digits (max 32)'
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"File gambar referensi tidak ditemukan: {image_path}")

    if stage_callback:
        stage_callback("Reading image...")

    img = Image.open(image_path).convert('RGB')
    return analyze_reference_pil(img, stage_callback=stage_callback)

def simulate_grade(img_pil, params):
    """
    Mensimulasikan shader Keyflow pass0.frag secara presisi dalam CPU NumPy.
    """
    rgb = np.array(img_pil.convert('RGB'), dtype=np.float32) / 255.0
    orig_rgb = rgb.copy()

    # 1. Exposure
    rgb *= np.power(2.0, params.get("exposure", 0.0))

    # 2. White Balance
    temp = params.get("temp", 0.0)
    tint = params.get("tint", 0.0)
    rgb[:, :, 0] += temp * 0.12 + tint * 0.06
    rgb[:, :, 1] -= tint * 0.12
    rgb[:, :, 2] -= temp * 0.12 - tint * 0.06
    rgb = np.maximum(rgb, 0.0)

    # 3. 3-Way Lift/Gamma/Gain
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    
    lift_delta = np.array([params.get("liftR", 0.5) - 0.5,
                           params.get("liftG", 0.5) - 0.5,
                           params.get("liftB", 0.5) - 0.5]) * 2.0

    gamma_delta = np.array([params.get("gammaR", 0.5) - 0.5,
                            params.get("gammaG", 0.5) - 0.5,
                            params.get("gammaB", 0.5) - 0.5]) * 2.0

    gain_delta = np.array([params.get("gainR", 0.5) - 0.5,
                           params.get("gainG", 0.5) - 0.5,
                           params.get("gainB", 0.5) - 0.5]) * 2.0

    w_shadow = np.clip(1.0 - lum * 2.5, 0.0, 1.0)[:, :, np.newaxis]
    w_high   = np.clip((lum - 0.5) * 2.0, 0.0, 1.0)[:, :, np.newaxis]
    w_mid    = np.clip(1.0 - np.abs(lum - 0.45) * 2.5, 0.0, 1.0)[:, :, np.newaxis]

    rgb += lift_delta * w_shadow * 0.35
    rgb += gamma_delta * w_mid * 0.35
    rgb += gain_delta * w_high * 0.35

    # Shadows & Highlights level adjustment
    rgb += params.get("shadows", 0.0) * w_shadow * 0.25
    rgb += params.get("highlights", 0.0) * w_high * 0.25

    # 4. Contrast with Pivot
    pivot = params.get("pivot", 0.435)
    contrast = params.get("contrast", 1.0)
    rgb = (rgb - pivot) * contrast + pivot

    # 5. Saturation & Vibrance
    lum_post = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    max_c = np.maximum(rgb[:, :, 0], np.maximum(rgb[:, :, 1], rgb[:, :, 2]))
    min_c = np.minimum(rgb[:, :, 0], np.minimum(rgb[:, :, 1], rgb[:, :, 2]))
    current_sat = (max_c - min_c) / np.maximum(max_c, 1e-4)

    vib_bonus = params.get("vib", 0.0) * (1.0 - current_sat)
    total_sat = np.clip(params.get("sat", 1.0) + vib_bonus, 0.0, 3.0)[:, :, np.newaxis]
    lum_3d = lum_post[:, :, np.newaxis]
    rgb = lum_3d + total_sat * (rgb - lum_3d)

    # 6. Mix Blend
    rgb = np.clip(rgb, 0.0, 1.0)
    mix = np.clip(params.get("gradeMix", 1.0), 0.0, 1.0)
    final_rgb = orig_rgb * (1.0 - mix) + rgb * mix

    out_arr = (np.clip(final_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    return Image.fromarray(out_arr)

def validate_plugin_schema(manifest_data, effect_data, frag_code):
    """
    Validasi ketat meniru validator DEX Keyflow Engine untuk memastikan 0% error saat instalasi.
    """
    param_id_pattern = re.compile(r'^[a-zA-Z][a-zA-Z0-9]{0,31}$')
    
    # 1. Validasi parameter IDs
    param_ids = set()
    for p in effect_data.get("params", []):
        pid = p.get("id", "")
        if not param_id_pattern.match(pid):
            raise ValueError(f"Validasi Gagal: Parameter id '{pid}' tidak valid! Harus diawali huruf diikuti huruf/angka tanpa simbol/underscore (maks 32 karakter).")
        param_ids.add(pid)

    # 2. Validasi colors
    for c in effect_data.get("colors", []):
        for ch in ["r", "g", "b"]:
            ref = c.get(ch)
            if ref and ref not in param_ids:
                raise ValueError(f"Validasi Gagal: color '{c.get('label')}' merujuk '{ref}' yang bukan parameter valid.")

    # 3. Validasi presets
    for pr in effect_data.get("presets", []):
        pr_id = pr.get("id", "")
        if not param_id_pattern.match(pr_id):
            raise ValueError(f"Validasi Gagal: preset id '{pr_id}' harus alphanumeric (tanpa spasi/simbol).")
        for k in pr.get("values", {}):
            if k not in param_ids:
                raise ValueError(f"Validasi Gagal: preset '{pr_id}' merujuk parameter tidak dikenal: '{k}'")

    # 4. Validasi newInstanceValues & thumbnailValues
    for k in effect_data.get("newInstanceValues", {}):
        if k not in param_ids:
            raise ValueError(f"Validasi Gagal: newInstanceValues merujuk parameter tidak dikenal: '{k}'")

    for k in effect_data.get("thumbnailValues", {}):
        if k not in param_ids:
            raise ValueError(f"Validasi Gagal: thumbnailValues merujuk parameter tidak dikenal: '{k}'")

    # 5. Validasi shader tokens terlarang
    for forbidden in ["#version", "#extension", "while"]:
        if forbidden in frag_code:
            raise ValueError(f"Validasi Gagal: Fragment shader mengandung token terlarang '{forbidden}'.")

    # 6. Validasi manifest effects
    if manifest_data.get("effects") != [effect_data.get("id")]:
        raise ValueError("Validasi Gagal: Daftar effects di manifest.json tidak cocok dengan ID effect.json!")

    return True

def package_kfplug(params, output_path, preset_name="Matched Grade", author=None, description=None):
    """
    Mengemas file manifest.json, effect.json, dan pass0.frag ke dalam format .kfplug (ZIP).
    Menghasilkan ID unik untuk paket plugin dan ID efek agar TIDAK saling menimpa di Keyflow.
    Nama yang tampil di aplikasi adalah: Match Grade (<preset_name>)
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(os.path.dirname(script_dir), "plugin_template")

    manifest_path = os.path.join(template_dir, "manifest.json")
    effect_json_path = os.path.join(template_dir, "effects", "copy_grading", "effect.json")
    pass0_path = os.path.join(template_dir, "effects", "copy_grading", "pass0.frag")

    clean_name = preset_name.strip() or "Custom Grade"

    # Buat slug alfanumerik unik untuk ID paket dan efek (maks 16 karakter, huruf kecil & angka)
    clean_slug = re.sub(r'[^a-zA-Z0-9]', '', clean_name).lower()[:16] or "grade"
    pkg_id = f"com.keyflow.matchgrade.{clean_slug}"
    effect_id = f"matchgrade_{clean_slug}"
    display_name = f"Match Grade ({clean_name})"

    # Baca template effect.json
    with open(effect_json_path, 'r', encoding='utf-8') as f:
        effect_data = json.load(f)

    # Tetapkan ID dan nama efek yang unik
    effect_data["id"] = effect_id
    effect_data["name"] = display_name
    effect_data["newInstanceValues"] = params.copy()
    effect_data["thumbnailValues"] = params.copy()

    # Buat preset khusus di urutan pertama
    words = re.findall(r'[a-zA-Z0-9]+', clean_name)
    clean_preset_id = "preset" + ("".join(w.capitalize() for w in words)[:24] if words else "Match")

    new_preset = {
        "id": clean_preset_id,
        "label": clean_name[:32],
        "values": params.copy()
    }
    
    # Masukkan preset hasil ekstraksi di awal daftar
    effect_data["presets"].insert(0, new_preset)

    # Baca manifest.json
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest_data = json.load(f)

    # Tetapkan metadata paket yang unik agar tidak menimpa plugin lain
    manifest_data["id"] = pkg_id
    manifest_data["name"] = display_name
    manifest_data["author"] = (author.strip() if author and author.strip() else "TFBAGAS")
    
    if description and description.strip():
        manifest_data["description"] = description.strip()
    else:
        manifest_data["description"] = f"Grading preset dicocokkan otomatis dari referensi '{clean_name}'."

    manifest_data["effects"] = [effect_id]

    with open(pass0_path, 'r', encoding='utf-8') as f:
        frag_code = f.read()

    # Lakukan validasi ketat sebelum kompresi
    validate_plugin_schema(manifest_data, effect_data, frag_code)

    # Pastikan direktori output ada
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    if not output_path.endswith(".kfplug"):
        output_path += ".kfplug"

    # Tulis zip archive dengan nama berkas normal (forward slashes)
    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
        # 1. manifest.json di akar arsip
        zipf.writestr("manifest.json", json.dumps(manifest_data, indent=2))
        
        # 2. effects/<effect_id>/effect.json (menggunakan folder ID efek unik)
        zipf.writestr(f"effects/{effect_id}/effect.json", json.dumps(effect_data, indent=2))
        
        # 3. effects/<effect_id>/pass0.frag
        zipf.writestr(f"effects/{effect_id}/pass0.frag", frag_code)

    file_size_kb = os.path.getsize(output_path) / 1024.0
    return output_path, file_size_kb, display_name

def main():
    parser = argparse.ArgumentParser(description="Keyflow Copy Grading Generator")
    parser.add_argument("--ref", required=True, help="Path ke gambar referensi")
    parser.add_argument("--target", help="Path ke gambar target untuk di-grading (opsional)")
    parser.add_argument("--preview", help="Path untuk menyimpan hasil preview side-by-side (opsional)")
    parser.add_argument("--out", help="Path output file .kfplug")
    parser.add_argument("--name", default="Matched Grade", help="Nama preset / look (misal: Barbie, Breaking Bad)")
    parser.add_argument("--json", action="store_true", help="Cetak parameter dalam format JSON")

    args = parser.parse_args()

    print(f"[*] Menganalisis gambar referensi: {args.ref}")
    params = analyze_reference(args.ref)

    if args.json:
        print(json.dumps(params, indent=2))
    else:
        print("\n=== HASIL EKSTRAKSI COLOR GRADING KEYFLOW ===")
        print(f" * Exposure       : {params['exposure']} EV")
        print(f" * Contrast       : {params['contrast']} (Pivot: {params['pivot']})")
        print(f" * Shadows/Highs  : {params['shadows']} / {params['highlights']}")
        print(f" * White Balance  : Temp={params['temp']}, Tint={params['tint']}")
        print(f" * Sat / Vibrance : {params['sat']} / {params['vib']}")
        print(f" * Shadows (Lift) : R={params['liftR']}, G={params['liftG']}, B={params['liftB']}")
        print(f" * Midtones(Gamma): R={params['gammaR']}, G={params['gammaG']}, B={params['gammaB']}")
        print(f" * Highs (Gain)   : R={params['gainR']}, G={params['gainG']}, B={params['gainB']}")

    # Buat preview jika ada target
    if args.target:
        print(f"\n[*] Menerapkan grading ke gambar target: {args.target}")
        tgt_img = Image.open(args.target).convert('RGB')
        graded_img = simulate_grade(tgt_img, params)

        if args.preview:
            w, h = tgt_img.size
            comparison = Image.new('RGB', (w * 2, h))
            comparison.paste(tgt_img, (0, 0))
            comparison.paste(graded_img, (w, 0))
            comparison.save(args.preview)
            print(f"[+] Preview side-by-side berhasil disimpan ke: {args.preview}")
        else:
            out_preview = "preview_graded.jpg"
            graded_img.save(out_preview)
            print(f"[+] Gambar hasil grading berhasil disimpan ke: {out_preview}")

    # Kemas plugin .kfplug
    if args.out:
        out_file, size_kb, disp_name = package_kfplug(params, args.out, preset_name=args.name)
        print(f"\n[+] PAKET PLUGIN KEYFLOW BERHASIL DIBUAT (0 ERROR VALIDASI)!")
        print(f"    Nama Efek: {disp_name}")
        print(f"    Lokasi   : {out_file}")
        print(f"    Ukuran   : {size_kb:.2f} KB (Batas engine: 2048 KB)")
        print(f"    Status   : Siap diimpor berdampingan dengan plugin lain tanpa menimpa!")

if __name__ == "__main__":
    main()
