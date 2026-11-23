# -*- coding: utf-8 -*-
"""
Internationalization (i18n) module for Match Grading Tool for Keyflow.
Supports: Indonesian ('id') and English ('en').
"""

TRANSLATIONS = {
    "id": {
        "app_title": "Match Grading Tool for Keyflow",
        "app_subtitle": "Ekstrak Look & Grading dari Gambar Referensi lalu Ekspor ke Plugin Keyflow (.kfplug)",
        "nav_home": "Home",
        "nav_settings": "Pengaturan",
        "nav_about": "Tentang",
        "badge_ref": "1",
        "title_ref": "Gambar Referensi (Wajib)",
        "badge_target": "2",
        "title_target": "Gambar Target / Preview (Opsional)",
        "badge_params": "3",
        "title_params": "Parameter Grading Terdeteksi",
        "badge_export": "4",
        "title_export": "Ekspor Plugin (.kfplug)",
        
        # Image area
        "drop_text": "Tarik & Lepas Gambar ke Sini atau",
        "btn_browse": "📁  Pilih Gambar...",
        "btn_replace": "Ganti",
        "btn_remove": "Hapus",
        "no_image_ref": "Belum ada gambar referensi yang dipilih",
        "no_image_target": "Pilih gambar untuk simulasi sebelum ekspor",
        "info_dim": "Resolusi",
        "info_fmt": "Format",
        "info_size": "Ukuran",
        
        # Parameters
        "param_exposure": "Exposure (EV)",
        "param_contrast": "Kontras",
        "param_pivot": "Titik Tumpu Kontras (Pivot)",
        "param_shadows": "Level Shadows Lift/Crush",
        "param_highlights": "Level Highlights Boost/Roll",
        "param_temp": "Temperatur Warna (Kelvin)",
        "param_tint": "Tint Warna (Magenta/Green)",
        "param_sat": "Saturasi",
        "param_vib": "Vibrance",
        "btn_reset_params": "↺  Reset ke Hasil Deteksi Otomatis",
        "btn_reset_neutral": "Reset ke Netral (Default)",
        
        # Swatches
        "swatches_title": "Swatch Roda Warna 3-Way (Klik untuk Ubah):",
        "swatch_shadows": "Shadows (Lift)",
        "swatch_midtones": "Midtones (Gamma)",
        "swatch_highs": "Highs (Gain)",
        "btn_copy_hex": "Salin HEX",
        "btn_copy_rgb": "Salin RGB",
        "copied": "Tersalin!",
        
        # Comparison & Preview
        "preview_title": "Pratinjau Visual (Before / After Comparison)",
        "btn_split_mode": "Split Slider",
        "btn_side_mode": "Berdampingan",
        "btn_toggle_mode": "Toggle View",
        "label_original": "ASLI (BEFORE)",
        "label_graded": "GRADED (AFTER)",
        "drag_slider_hint": "Geser garis pembatas untuk membandingkan sebelum dan sesudah",
        
        # Export
        "export_name_label": "Nama Grading / Look (misal: Barbie, Breaking Bad):",
        "export_name_placeholder": "Masukkan nama look...",
        "effect_preview_label": "Nama Efek di Keyflow: Match Grade ({})",
        "file_preview_label": "Nama File: {}.kfplug",
        "btn_export": "⬆️   Ekspor ke .kfplug (Keyflow Plugin)",
        "export_req_ref": "Silakan pilih gambar referensi terlebih dahulu!",
        "export_success_title": "Ekspor Berhasil! ⚡",
        "export_success_msg": "Plugin Keyflow berhasil dibuat:\n\n• Nama Efek: {}\n• File: {}\n• Ukuran: {:.2f} KB\n• Status: Siap pasang ke Keyflow tanpa menimpa plugin lain!",
        "export_error_title": "Gagal Mengekspor",
        
        # Settings
        "settings_title": "Pengaturan Direktori & Preferensi",
        "settings_subtitle": "Atur lokasi penyimpanan default plugin dan preferensi kerja",
        "settings_dir_title": "📁 Direktori Output Default (.kfplug)",
        "settings_dir_desc": "File .kfplug hasil generate akan otomatis disimpan ke folder ini.",
        "btn_browse_dir": "Pilih Folder...",
        "btn_open_folder": "📂 Buka Folder Output di Windows Explorer",
        "settings_options_title": "⚙️ Preferensi Ekspor",
        "chk_auto_open": "Otomatis buka folder output setelah ekspor selesai",
        "chk_unique_id": "Multi-Plugin Co-existence (ID paket unik otomatis agar tidak saling menimpa)",
        "settings_lang_title": "🌐 Pilihan Bahasa (Language)",
        "btn_save_settings": "💾  Simpan Pengaturan",
        "settings_saved_msg": "Pengaturan berhasil disimpan!",
        
        # About
        "about_hero_title": "Match Grading Tool for Keyflow",
        "about_hero_sub": "Color Matching & Look Extraction Engine for Keyflow Mobile",
        "about_target_engine": "Target Engine: Keyflow Mobile 1.5.x+ (OpenGL ES Pipeline)",
        "about_credit_title": "⭐  CREDIT & DEVELOPMENT",
        "about_credit_author": "Created & Developed by: TFBAGAS",
        "about_credit_desc": "Reverse-engineered from Keyflow DEX runtime bytecode & mobile GLSL engine.",
        "about_features_title": "🚀 Kemampuan & Fitur Engine:",
        "about_spec_1": "• Ekstraksi Tonal Rec. 709: Exposure EV, Contrast S-Curve dengan kontrol Pivot dinamis.",
        "about_spec_2": "• 3-Way Color Wheels: Lift (Shadows), Gamma (Midtones), Gain (Highlights) split-toning.",
        "about_spec_3": "• Planckian White Balance: Koreksi Color Temperature Kelvin & Green/Magenta Tint.",
        "about_spec_4": "• 100% Mobile Safe: Premultiplied Alpha compliant, zero dynamic loop, Mali/Adreno safe.",
        "about_spec_5": "• Multi-Plugin Co-existence: Menghasilkan ID unik sehingga preset tidak saling menimpa.",
        "about_spec_6": "• Target App: Keyflow Mobile (Package: com.angkin.keyflow, Format: .kfplug v1).",
        
        # Status Bar
        "status_ready": "Siap",
        "status_ref_loaded": "Gambar referensi berhasil dimuat: {}",
        "status_target_loaded": "Gambar target berhasil dimuat: {}",
        "status_analyzing": "Menganalisis profil warna gambar...",
        "status_simulating": "Memperbarui pratinjau grading...",
        "status_exported": "Plugin berhasil diekspor: {}",
        "status_error": "Terjadi kesalahan: {}"
    },
    
    "en": {
        "app_title": "Match Grading Tool for Keyflow",
        "app_subtitle": "Extract Look & Grading from Reference Image and Export as Keyflow Mobile Plugin (.kfplug)",
        "nav_home": "Home",
        "nav_settings": "Settings",
        "nav_about": "About",
        "badge_ref": "1",
        "title_ref": "Reference Image (Required)",
        "badge_target": "2",
        "title_target": "Target Image / Preview (Optional)",
        "badge_params": "3",
        "title_params": "Detected Grading Parameters",
        "badge_export": "4",
        "title_export": "Export Plugin (.kfplug)",
        
        # Image area
        "drop_text": "Drag & Drop Image Here or",
        "btn_browse": "📁  Browse Image...",
        "btn_replace": "Replace",
        "btn_remove": "Remove",
        "no_image_ref": "No reference image selected yet",
        "no_image_target": "Select an image to preview grading before export",
        "info_dim": "Dimensions",
        "info_fmt": "Format",
        "info_size": "Size",
        
        # Parameters
        "param_exposure": "Exposure (EV)",
        "param_contrast": "Contrast",
        "param_pivot": "Contrast Pivot",
        "param_shadows": "Shadows Lift/Crush Level",
        "param_highlights": "Highlights Boost/Roll Level",
        "param_temp": "Color Temperature (Kelvin)",
        "param_tint": "Color Tint (Magenta/Green)",
        "param_sat": "Saturation",
        "param_vib": "Vibrance",
        "btn_reset_params": "↺  Reset to Auto-Detected Values",
        "btn_reset_neutral": "Reset to Neutral (Default)",
        
        # Swatches
        "swatches_title": "3-Way Color Wheels Swatches (Click to Pick):",
        "swatch_shadows": "Shadows (Lift)",
        "swatch_midtones": "Midtones (Gamma)",
        "swatch_highs": "Highs (Gain)",
        "btn_copy_hex": "Copy HEX",
        "btn_copy_rgb": "Copy RGB",
        "copied": "Copied!",
        
        # Comparison & Preview
        "preview_title": "Visual Preview (Before / After Comparison)",
        "btn_split_mode": "Split Slider",
        "btn_side_mode": "Side by Side",
        "btn_toggle_mode": "Toggle View",
        "label_original": "ORIGINAL (BEFORE)",
        "label_graded": "GRADED (AFTER)",
        "drag_slider_hint": "Drag the separator bar to compare before and after",
        
        # Export
        "export_name_label": "Grading / Look Name (e.g. Barbie, Breaking Bad):",
        "export_name_placeholder": "Enter look name...",
        "effect_preview_label": "Effect Name in Keyflow: Match Grade ({})",
        "file_preview_label": "Filename: {}.kfplug",
        "btn_export": "⬆️   Export to .kfplug (Keyflow Plugin)",
        "export_req_ref": "Please select a reference image first!",
        "export_success_title": "Export Successful! ⚡",
        "export_success_msg": "Keyflow plugin successfully created:\n\n• Effect Name: {}\n• File: {}\n• Size: {:.2f} KB\n• Status: Ready to install in Keyflow without overwriting other plugins!",
        "export_error_title": "Export Failed",
        
        # Settings
        "settings_title": "Directory & Preferences",
        "settings_subtitle": "Configure default plugin export location and workflow preferences",
        "settings_dir_title": "📁 Default Output Directory (.kfplug)",
        "settings_dir_desc": "Generated .kfplug files will automatically be saved to this folder.",
        "btn_browse_dir": "Browse Folder...",
        "btn_open_folder": "📂 Open Output Folder in Windows Explorer",
        "settings_options_title": "⚙️ Export Preferences",
        "chk_auto_open": "Automatically open output folder after export finishes",
        "chk_unique_id": "Multi-Plugin Co-existence (Automatic unique package ID to prevent overwriting)",
        "settings_lang_title": "🌐 Language Selection",
        "btn_save_settings": "💾  Save Settings",
        "settings_saved_msg": "Settings saved successfully!",
        
        # About
        "about_hero_title": "Match Grading Tool for Keyflow",
        "about_hero_sub": "Color Matching & Look Extraction Engine for Keyflow Mobile",
        "about_target_engine": "Target Engine: Keyflow Mobile 1.5.x+ (OpenGL ES Pipeline)",
        "about_credit_title": "⭐  CREDIT & DEVELOPMENT",
        "about_credit_author": "Created & Developed by: TFBAGAS",
        "about_credit_desc": "Reverse-engineered from Keyflow DEX runtime bytecode & mobile GLSL engine.",
        "about_features_title": "🚀 Engine Capabilities & Features:",
        "about_spec_1": "• Rec. 709 Tonal Extraction: Exposure EV, Contrast S-Curve with dynamic Pivot control.",
        "about_spec_2": "• 3-Way Color Wheels: Lift (Shadows), Gamma (Midtones), Gain (Highlights) split-toning.",
        "about_spec_3": "• Planckian White Balance: Color Temperature Kelvin & Green/Magenta Tint correction.",
        "about_spec_4": "• 100% Mobile Safe: Premultiplied Alpha compliant, zero dynamic loops, Mali/Adreno safe.",
        "about_spec_5": "• Multi-Plugin Co-existence: Generates unique package IDs so presets coexist side-by-side.",
        "about_spec_6": "• Target App: Keyflow Mobile (Package: com.angkin.keyflow, Format: .kfplug v1).",
        
        # Status Bar
        "status_ready": "Ready",
        "status_ref_loaded": "Reference image loaded successfully: {}",
        "status_target_loaded": "Target image loaded successfully: {}",
        "status_analyzing": "Analyzing color profile...",
        "status_simulating": "Updating grading preview...",
        "status_exported": "Plugin exported successfully: {}",
        "status_error": "An error occurred: {}"
    }
}

class I18n:
    def __init__(self, current_lang="id"):
        self.current_lang = current_lang if current_lang in TRANSLATIONS else "id"

    def set_language(self, lang):
        if lang in TRANSLATIONS:
            self.current_lang = lang

    def t(self, key, *args):
        lang_dict = TRANSLATIONS.get(self.current_lang, TRANSLATIONS["id"])
        text = lang_dict.get(key, key)
        if args:
            try:
                return text.format(*args)
            except Exception:
                return text
        return text

# Global instance
i18n = I18n("id")
