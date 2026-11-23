#!/usr/bin/env python3
"""
Keyflow Copy Grading Studio - Modern Edition
---------------------------------------------
UI Modern, Sleek & Minimalis bertema Dark Emerald
Dikembangkan oleh: TFBAGAS
"""

import os
import re
import sys
import json
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk, ImageDraw
import customtkinter as ctk

# Impor modul analisis warna & generator
from copy_grading import analyze_reference, simulate_grade, package_kfplug

# Konfigurasi Tema CustomTkinter
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("green")

# Konstanta Palet Warna (Dark Emerald Aesthetic)
BG_MAIN = "#080d0a"        # Latar belakang utama
BG_SIDEBAR = "#050806"     # Sidebar navigasi
CARD_BG = "#0f1612"        # Kartu / Surface
CARD_BORDER = "#18271e"    # Border kartu halus
ACCENT_GREEN = "#00e676"   # Hijau neon emerald menyala
ACCENT_BUTTON = "#00a854"  # Hijau tombol utama
ACCENT_HOVER = "#00c853"   # Hover tombol
TEXT_MUTED = "#86998e"     # Teks sekunder
TEXT_LIGHT = "#e8f5e9"     # Teks putih kehijauan

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CONFIG_FILE = os.path.join(PROJECT_DIR, "config.json")
LOGO_PATH = os.path.join(SCRIPT_DIR, "logo.png")

def load_config():
    default_config = {
        "output_dir": os.path.join(PROJECT_DIR, "output"),
        "auto_open_folder": True,
        "unique_package_id": True
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                default_config.update(saved)
        except Exception:
            pass
    return default_config

def save_config(cfg):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print("Gagal menyimpan config:", e)

class CopyGradingStudio(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Keyflow Copy Grading Studio")
        self.geometry("1120x800")
        self.minsize(1040, 740)
        self.configure(fg_color=BG_MAIN)

        self.config_data = load_config()
        self.ref_image_path = None
        self.target_image_path = None
        self.params = None
        self.current_tab = "home"

        # Load logo ikon
        self.logo_image = None
        if os.path.exists(LOGO_PATH):
            pil_logo = Image.open(LOGO_PATH)
            self.logo_image = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(42, 42))
            self.logo_image_small = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(28, 28))
            self.logo_image_large = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(72, 72))

        self._build_layout()
        self.show_tab("home")

    def _build_layout(self):
        # 1. Sidebar Navigasi Kiri
        self.sidebar = ctk.CTkFrame(self, width=150, corner_radius=0, fg_color=BG_SIDEBAR, border_width=1, border_color="#121e16")
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        # Logo di Sidebar atas
        logo_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        logo_frame.pack(pady=(24, 28))
        if self.logo_image:
            ctk.CTkLabel(logo_frame, image=self.logo_image, text="").pack()

        # Tombol Navigasi
        self.btn_nav_home = ctk.CTkButton(
            self.sidebar, text="🏠   Home", width=115, height=42, corner_radius=12,
            font=("Segoe UI", 12, "bold"), anchor="w",
            fg_color=ACCENT_BUTTON, hover_color=ACCENT_HOVER, text_color="#ffffff",
            command=lambda: self.show_tab("home")
        )
        self.btn_nav_home.pack(pady=8, padx=16)

        self.btn_nav_settings = ctk.CTkButton(
            self.sidebar, text="⚙️   Settings", width=115, height=42, corner_radius=12,
            font=("Segoe UI", 12, "bold"), anchor="w",
            fg_color="transparent", hover_color="#0e1b13", text_color=TEXT_MUTED,
            command=lambda: self.show_tab("settings")
        )
        self.btn_nav_settings.pack(pady=8, padx=16)

        self.btn_nav_about = ctk.CTkButton(
            self.sidebar, text="ℹ️   About", width=115, height=42, corner_radius=12,
            font=("Segoe UI", 12, "bold"), anchor="w",
            fg_color="transparent", hover_color="#0e1b13", text_color=TEXT_MUTED,
            command=lambda: self.show_tab("about")
        )
        self.btn_nav_about.pack(pady=8, padx=16)

        # Watermark bawah di sidebar
        watermark_lbl = ctk.CTkLabel(
            self.sidebar, text="KEYFLOW\nSTUDIO", font=("Segoe UI", 9, "bold"), text_color="#172b20"
        )
        watermark_lbl.pack(side="bottom", pady=20)

        # 2. Main Content Area Kanan
        self.content_container = ctk.CTkFrame(self, fg_color=BG_MAIN, corner_radius=0)
        self.content_container.pack(side="right", fill="both", expand=True, padx=24, pady=20)

        # Inisialisasi Tiga Tampilan Halaman
        self.frame_home = self._create_home_view()
        self.frame_settings = self._create_settings_view()
        self.frame_about = self._create_about_view()

    def show_tab(self, tab_name):
        self.current_tab = tab_name
        self.frame_home.pack_forget()
        self.frame_settings.pack_forget()
        self.frame_about.pack_forget()

        # Reset tombol navigasi
        self.btn_nav_home.configure(fg_color="transparent", text_color=TEXT_MUTED)
        self.btn_nav_settings.configure(fg_color="transparent", text_color=TEXT_MUTED)
        self.btn_nav_about.configure(fg_color="transparent", text_color=TEXT_MUTED)

        if tab_name == "home":
            self.btn_nav_home.configure(fg_color=ACCENT_BUTTON, text_color="#ffffff")
            self.frame_home.pack(fill="both", expand=True)
        elif tab_name == "settings":
            self.btn_nav_settings.configure(fg_color=ACCENT_BUTTON, text_color="#ffffff")
            self.frame_settings.pack(fill="both", expand=True)
        elif tab_name == "about":
            self.btn_nav_about.configure(fg_color=ACCENT_BUTTON, text_color="#ffffff")
            self.frame_about.pack(fill="both", expand=True)

    # ==========================================
    # VIEW 1: HOME (Look Matcher & Generator)
    # ==========================================
    def _create_home_view(self):
        view = ctk.CTkFrame(self.content_container, fg_color="transparent")

        # Top Header Bar
        header_bar = ctk.CTkFrame(view, fg_color="transparent")
        header_bar.pack(fill="x", pady=(0, 16))

        title_box = ctk.CTkFrame(header_bar, fg_color="transparent")
        title_box.pack(side="left")

        # Icon + Title
        title_row = ctk.CTkFrame(title_box, fg_color="transparent")
        title_row.pack(anchor="w")

        if self.logo_image_small:
            ctk.CTkLabel(title_row, image=self.logo_image_small, text="").pack(side="left", padx=(0, 10))

        ctk.CTkLabel(title_row, text="Keyflow", font=("Segoe UI", 22, "bold"), text_color=ACCENT_GREEN).pack(side="left")
        ctk.CTkLabel(title_row, text=" Copy Grading Studio", font=("Segoe UI", 22, "bold"), text_color="#ffffff").pack(side="left")

        subtitle = ctk.CTkLabel(
            title_box, text="Ekstrak Look & Grading dari Gambar Referensi lalu Ekspor ke Plugin Keyflow (.kfplug)",
            font=("Segoe UI", 11), text_color=TEXT_MUTED
        )
        subtitle.pack(anchor="w", pady=(2, 0))

        # Badge Versi di kanan atas
        version_pill = ctk.CTkFrame(header_bar, fg_color="#101c15", border_width=1, border_color="#1d3826", corner_radius=16)
        version_pill.pack(side="right", padx=4)
        ctk.CTkLabel(version_pill, text="⚡ v1.0", font=("Segoe UI", 11, "bold"), text_color=ACCENT_GREEN).pack(padx=12, pady=4)

        # Grid 2 Kolom untuk Kartu
        grid_frame = ctk.CTkFrame(view, fg_color="transparent")
        grid_frame.pack(fill="both", expand=True)
        grid_frame.grid_columnconfigure(0, weight=1)
        grid_frame.grid_columnconfigure(1, weight=1)

        # ----------------------------------------------------
        # KOLOM KIRI: Card 1 (Referensi) & Card 2 (Target)
        # ----------------------------------------------------
        left_col = ctk.CTkFrame(grid_frame, fg_color="transparent")
        left_col.grid(row=0, column=0, sticky="nsew", padx=(0, 10))

        # CARD 1: Gambar Referensi (Wajib)
        self.card1 = self._create_card_container(left_col)
        self.card1.pack(fill="x", pady=(0, 12))

        # Header Badge Card 1
        c1_head = ctk.CTkFrame(self.card1, fg_color="transparent")
        c1_head.pack(fill="x", padx=16, pady=(14, 10))
        self._add_badge_header(c1_head, "1", "Gambar Referensi (Wajib)")

        # Tombol Pilih Referensi
        self.btn_select_ref = ctk.CTkButton(
            self.card1, text="📁  Pilih Gambar Referensi...", height=38, corner_radius=10,
            font=("Segoe UI", 12, "bold"), fg_color=ACCENT_BUTTON, hover_color=ACCENT_HOVER,
            command=self.load_reference
        )
        self.btn_select_ref.pack(fill="x", padx=16, pady=4)

        self.lbl_ref_filename = ctk.CTkLabel(
            self.card1, text="Belum ada gambar referensi yang dipilih",
            font=("Segoe UI", 10), text_color=TEXT_MUTED
        )
        self.lbl_ref_filename.pack(anchor="w", padx=18, pady=(2, 6))

        # Kotak Pratinjau Gambar Referensi
        self.box_ref_preview = ctk.CTkFrame(self.card1, height=160, fg_color="#0a100d", border_width=1, border_color="#16271c", corner_radius=10)
        self.box_ref_preview.pack(fill="x", padx=16, pady=(0, 14))
        self.lbl_ref_img = ctk.CTkLabel(self.box_ref_preview, text="🖼️ Tidak ada gambar", text_color="#2b4736", font=("Segoe UI", 11))
        self.lbl_ref_img.pack(expand=True)

        # CARD 2: Gambar Target (Opsional)
        self.card2 = self._create_card_container(left_col)
        self.card2.pack(fill="x", pady=0)

        c2_head = ctk.CTkFrame(self.card2, fg_color="transparent")
        c2_head.pack(fill="x", padx=16, pady=(14, 10))
        self._add_badge_header(c2_head, "2", "Gambar Target / Preview (Opsional)")

        self.btn_select_target = ctk.CTkButton(
            self.card2, text="🖼️  Pilih Gambar Target (Simulasi Preview)...", height=38, corner_radius=10,
            font=("Segoe UI", 12), fg_color="#13271c", hover_color="#193526", border_width=1, border_color="#214430",
            command=self.load_target
        )
        self.btn_select_target.pack(fill="x", padx=16, pady=4)

        self.lbl_target_filename = ctk.CTkLabel(
            self.card2, text="Pilih gambar untuk melihat hasil simulasi grading",
            font=("Segoe UI", 10), text_color=TEXT_MUTED
        )
        self.lbl_target_filename.pack(anchor="w", padx=18, pady=(2, 6))

        self.box_target_preview = ctk.CTkFrame(self.card2, height=160, fg_color="#0a100d", border_width=1, border_color="#16271c", corner_radius=10)
        self.box_target_preview.pack(fill="x", padx=16, pady=(0, 14))
        self.lbl_target_img = ctk.CTkLabel(self.box_target_preview, text="🖼️ Pratinjau simulasi", text_color="#2b4736", font=("Segoe UI", 11))
        self.lbl_target_img.pack(expand=True)

        # ----------------------------------------------------
        # KOLOM KANAN: Card 3 (Parameter) & Card 4 (Ekspor)
        # ----------------------------------------------------
        right_col = ctk.CTkFrame(grid_frame, fg_color="transparent")
        right_col.grid(row=0, column=1, sticky="nsew", padx=(10, 0))

        # CARD 3: Parameter Terdeteksi
        self.card3 = self._create_card_container(right_col)
        self.card3.pack(fill="x", pady=(0, 12))

        c3_head = ctk.CTkFrame(self.card3, fg_color="transparent")
        c3_head.pack(fill="x", padx=16, pady=(14, 8))
        self._add_badge_header(c3_head, "3", "Parameter Grading Terdeteksi")

        # Glowing green status dot di kanan atas
        dot = ctk.CTkLabel(c3_head, text="●", text_color=ACCENT_GREEN, font=("Segoe UI", 14))
        dot.pack(side="right")

        # Baris Metrik Parameter
        self.param_labels = {}
        metrics = [
            ("☀️", "Exposure (EV)", "exposure", "0.00 EV"),
            ("🌗", "Contrast", "contrast", "1.00"),
            ("🌓", "Contrast Pivot", "pivot", "0.43"),
            ("💧", "Shadows Tint/Level", "shadows", "+0.00"),
            ("💧", "Highlights Tint/Level", "highlights", "-0.00"),
            ("🌡️", "Color Temperature", "temp", "+0.00"),
            ("🎨", "Color Tint", "tint", "-0.00"),
            ("💧", "Saturation", "sat", "1.00"),
            ("〰️", "Vibrance", "vib", "+0.00")
        ]

        table_frame = ctk.CTkFrame(self.card3, fg_color="transparent")
        table_frame.pack(fill="x", padx=16, pady=2)

        for icon, title_text, key, def_val in metrics:
            row_f = ctk.CTkFrame(table_frame, fg_color="transparent", height=23)
            row_f.pack(fill="x", pady=1)

            # Icon + Name
            ctk.CTkLabel(row_f, text=icon, font=("Segoe UI", 11), width=20, anchor="w").pack(side="left")
            ctk.CTkLabel(row_f, text=title_text, font=("Segoe UI", 11), text_color="#cbd5e1", anchor="w").pack(side="left", padx=4)

            # Value (Neon Emerald)
            val_lbl = ctk.CTkLabel(row_f, text=def_val, font=("Segoe UI", 11, "bold"), text_color=ACCENT_GREEN, anchor="e")
            val_lbl.pack(side="right")
            self.param_labels[key] = val_lbl

        # 3-Way Swatches
        swatch_title_box = ctk.CTkFrame(self.card3, fg_color="transparent")
        swatch_title_box.pack(fill="x", padx=16, pady=(10, 4))
        ctk.CTkLabel(swatch_title_box, text="3-Way Color Wheels Swatches:", font=("Segoe UI", 11, "bold"), text_color="#94a3b8").pack(anchor="w")

        swatches_row = ctk.CTkFrame(self.card3, fg_color="transparent")
        swatches_row.pack(fill="x", padx=16, pady=(0, 14))

        self.swatch_shadow = self._create_swatch_card(swatches_row, "Shadows (Lift)")
        self.swatch_shadow.pack(side="left", expand=True, fill="x", padx=(0, 4))

        self.swatch_mid = self._create_swatch_card(swatches_row, "Midtones (Gamma)")
        self.swatch_mid.pack(side="left", expand=True, fill="x", padx=2)

        self.swatch_high = self._create_swatch_card(swatches_row, "Highs (Gain)")
        self.swatch_high.pack(side="left", expand=True, fill="x", padx=(4, 0))

        # CARD 4: Ekspor Plugin
        self.card4 = self._create_card_container(right_col)
        self.card4.pack(fill="x", pady=0)

        c4_head = ctk.CTkFrame(self.card4, fg_color="transparent")
        c4_head.pack(fill="x", padx=16, pady=(14, 8))
        self._add_badge_header(c4_head, "4", "Ekspor Plugin (.kfplug)")

        c4_body = ctk.CTkFrame(self.card4, fg_color="transparent")
        c4_body.pack(fill="x", padx=16, pady=(0, 14))

        ctk.CTkLabel(c4_body, text="Nama Grading / Look (misal: Barbie, Breaking Bad):", font=("Segoe UI", 11), text_color="#94a3b8").pack(anchor="w", pady=(0, 2))

        # Input Box Preset
        self.txt_preset_name = ctk.CTkEntry(
            c4_body, height=36, corner_radius=8,
            fg_color="#0a100d", border_color="#18271e", text_color="#ffffff",
            font=("Segoe UI", 12)
        )
        self.txt_preset_name.insert(0, "Breaking Bad 2")
        self.txt_preset_name.pack(fill="x", pady=2)
        self.txt_preset_name.bind("<KeyRelease>", self._on_name_change)

        self.lbl_effect_preview = ctk.CTkLabel(
            c4_body, text="Nama Efek di Keyflow: Match Grade (Breaking Bad 2)",
            font=("Segoe UI", 10, "italic"), text_color=ACCENT_GREEN
        )
        self.lbl_effect_preview.pack(anchor="w", pady=(2, 10))

        # Tombol Ekspor Utama (Besar, Glowing Emerald)
        self.btn_export = ctk.CTkButton(
            c4_body, text="⬆️   Ekspor ke .kfplug (Keyflow Plugin)", height=44, corner_radius=12,
            font=("Segoe UI", 13, "bold"), fg_color=ACCENT_BUTTON, hover_color=ACCENT_HOVER,
            command=self.export_kfplug
        )
        self.btn_export.pack(fill="x")

        return view

    # ==========================================
    # VIEW 2: SETTINGS (Pengaturan Output)
    # ==========================================
    def _create_settings_view(self):
        view = ctk.CTkFrame(self.content_container, fg_color="transparent")

        # Header Settings
        head = ctk.CTkFrame(view, fg_color="transparent")
        head.pack(fill="x", pady=(0, 20))
        ctk.CTkLabel(head, text="Pengaturan & Preferensi", font=("Segoe UI", 22, "bold"), text_color="#ffffff").pack(anchor="w")
        ctk.CTkLabel(head, text="Konfigurasi folder output ekspor dan perilaku aplikasi", font=("Segoe UI", 11), text_color=TEXT_MUTED).pack(anchor="w")

        # Card 1: Direktori Output
        dir_card = self._create_card_container(view)
        dir_card.pack(fill="x", pady=(0, 14))

        d_body = ctk.CTkFrame(dir_card, fg_color="transparent")
        d_body.pack(fill="x", padx=20, pady=20)

        ctk.CTkLabel(d_body, text="📁 Direktori Output Default (.kfplug)", font=("Segoe UI", 14, "bold"), text_color=ACCENT_GREEN).pack(anchor="w", pady=(0, 4))
        ctk.CTkLabel(d_body, text="File .kfplug hasil generate akan otomatis disimpan ke folder ini.", font=("Segoe UI", 11), text_color=TEXT_MUTED).pack(anchor="w", pady=(0, 10))

        row_picker = ctk.CTkFrame(d_body, fg_color="transparent")
        row_picker.pack(fill="x", pady=6)

        self.txt_output_dir = ctk.CTkEntry(
            row_picker, height=40, corner_radius=8,
            fg_color="#0a100d", border_color="#18271e", text_color="#ffffff",
            font=("Segoe UI", 11)
        )
        self.txt_output_dir.insert(0, self.config_data.get("output_dir", ""))
        self.txt_output_dir.pack(side="left", fill="x", expand=True, padx=(0, 10))

        btn_browse_dir = ctk.CTkButton(
            row_picker, text="Pilih Folder...", height=40, width=120, corner_radius=8,
            font=("Segoe UI", 11, "bold"), fg_color="#18271e", hover_color="#22392b",
            command=self._browse_output_dir
        )
        btn_browse_dir.pack(side="right")

        btn_open_folder = ctk.CTkButton(
            d_body, text="📂 Buka Folder Output di Windows Explorer", height=36, corner_radius=8,
            font=("Segoe UI", 11), fg_color="#102017", hover_color="#173123", border_width=1, border_color="#1d3826",
            command=self._open_output_folder
        )
        btn_open_folder.pack(anchor="w", pady=(10, 0))

        # Card 2: Perilaku Ekspor
        pref_card = self._create_card_container(view)
        pref_card.pack(fill="x", pady=(0, 14))

        p_body = ctk.CTkFrame(pref_card, fg_color="transparent")
        p_body.pack(fill="x", padx=20, pady=20)

        ctk.CTkLabel(p_body, text="⚙️ Opsi Ekspor", font=("Segoe UI", 14, "bold"), text_color=ACCENT_GREEN).pack(anchor="w", pady=(0, 10))

        self.chk_auto_open = ctk.CTkCheckBox(
            p_body, text="Otomatis buka folder output setelah ekspor selesai",
            font=("Segoe UI", 12), text_color="#e2e8f0", fg_color=ACCENT_BUTTON, hover_color=ACCENT_HOVER
        )
        if self.config_data.get("auto_open_folder", True):
            self.chk_auto_open.select()
        self.chk_auto_open.pack(anchor="w", pady=6)

        self.chk_multi_plug = ctk.CTkCheckBox(
            p_body, text="Multi-Plugin Co-existence (ID paket unik otomatis agar tidak menimpa plugin lain)",
            font=("Segoe UI", 12), text_color="#e2e8f0", fg_color=ACCENT_BUTTON, hover_color=ACCENT_HOVER
        )
        if self.config_data.get("unique_package_id", True):
            self.chk_multi_plug.select()
        self.chk_multi_plug.pack(anchor="w", pady=6)

        # Tombol Simpan Pengaturan
        btn_save_settings = ctk.CTkButton(
            view, text="💾  Simpan Pengaturan", height=42, corner_radius=10,
            font=("Segoe UI", 12, "bold"), fg_color=ACCENT_BUTTON, hover_color=ACCENT_HOVER,
            command=self._save_settings_action
        )
        btn_save_settings.pack(anchor="w", pady=10)

        return view

    # ==========================================
    # VIEW 3: ABOUT (Credit TFBAGAS & Info)
    # ==========================================
    def _create_about_view(self):
        view = ctk.CTkFrame(self.content_container, fg_color="transparent")

        # Header About
        head = ctk.CTkFrame(view, fg_color="transparent")
        head.pack(fill="x", pady=(0, 16))

        # Hero Banner Card
        hero_card = self._create_card_container(view)
        hero_card.pack(fill="x", pady=(0, 14))

        h_body = ctk.CTkFrame(hero_card, fg_color="transparent")
        h_body.pack(fill="x", padx=24, pady=24)

        top_row = ctk.CTkFrame(h_body, fg_color="transparent")
        top_row.pack(fill="x", pady=(0, 12))

        if self.logo_image_large:
            ctk.CTkLabel(top_row, image=self.logo_image_large, text="").pack(side="left", padx=(0, 20))

        title_sub = ctk.CTkFrame(top_row, fg_color="transparent")
        title_sub.pack(side="left", fill="both", expand=True)

        ctk.CTkLabel(title_sub, text="Keyflow Copy Grading Studio", font=("Segoe UI", 24, "bold"), text_color="#ffffff").pack(anchor="w")
        ctk.CTkLabel(title_sub, text="Color Matching & Look Extraction Engine for Keyflow Mobile", font=("Segoe UI", 12), text_color=TEXT_MUTED).pack(anchor="w")
        ctk.CTkLabel(title_sub, text="Target Engine: Keyflow Mobile 1.5.x+ (OpenGL ES Shading Pipeline)", font=("Segoe UI", 11, "italic"), text_color=ACCENT_GREEN).pack(anchor="w", pady=(4, 0))

        # PROMINENT CREDIT CARD
        credit_box = ctk.CTkFrame(h_body, fg_color="#0a120e", border_width=1, border_color="#183623", corner_radius=10)
        credit_box.pack(fill="x", pady=(12, 0))

        cb_pad = ctk.CTkFrame(credit_box, fg_color="transparent")
        cb_pad.pack(fill="x", padx=18, pady=14)

        ctk.CTkLabel(cb_pad, text="⭐  CREDIT & DEVELOPMENT", font=("Segoe UI", 11, "bold"), text_color=ACCENT_GREEN).pack(anchor="w")
        ctk.CTkLabel(cb_pad, text="Created & Developed by: TFBAGAS", font=("Segoe UI", 16, "bold"), text_color="#ffffff").pack(anchor="w", pady=(2, 0))
        ctk.CTkLabel(cb_pad, text="Reverse-engineered from Keyflow DEX runtime bytecode & mobile GLSL engine.", font=("Segoe UI", 11), text_color=TEXT_MUTED).pack(anchor="w")

        # Card 2: Feature Specifications
        feat_card = self._create_card_container(view)
        feat_card.pack(fill="x", pady=0)

        f_body = ctk.CTkFrame(feat_card, fg_color="transparent")
        f_body.pack(fill="x", padx=24, pady=20)

        ctk.CTkLabel(f_body, text="🚀 Kemampuan & Fitur Engine:", font=("Segoe UI", 13, "bold"), text_color="#ffffff").pack(anchor="w", pady=(0, 8))

        specs = [
            "✨ Ekstraksi Tonal Rec. 709: Exposure EV, Contrast S-Curve dengan kontrol Pivot dinamis.",
            "🎨 3-Way Color Wheels: Lift (Shadows), Gamma (Midtones), Gain (Highlights) split-toning.",
            "🌡️ Planckian White Balance: Koreksi Color Temperature Kelvin & Green/Magenta Tint.",
            "🔒 100% Mobile Safe: Premultiplied Alpha compliant, zero loop penalty, Adreno/Mali safe.",
            "📦 Multi-Plugin Co-existence: Menghasilkan ID unik sehingga preset tidak saling menimpa.",
            "📱 Target App: Keyflow Mobile (Package: com.angkin.keyflow, Format: .kfplug v1)."
        ]

        for sp in specs:
            ctk.CTkLabel(f_body, text=sp, font=("Segoe UI", 11), text_color="#cbd5e1").pack(anchor="w", pady=2)

        return view

    # ==========================================
    # HELPER WIDGETS & UI COMPONENTS
    # ==========================================
    def _create_card_container(self, parent):
        return ctk.CTkFrame(
            parent, fg_color=CARD_BG, corner_radius=14,
            border_width=1, border_color=CARD_BORDER
        )

    def _add_badge_header(self, parent, badge_num, title_text):
        # Green Circular Badge
        badge = ctk.CTkLabel(
            parent, text=badge_num, width=22, height=22, corner_radius=11,
            fg_color=ACCENT_GREEN, text_color="#000000", font=("Segoe UI", 11, "bold")
        )
        badge.pack(side="left", padx=(0, 10))

        # Title Text
        lbl = ctk.CTkLabel(parent, text=title_text, font=("Segoe UI", 12, "bold"), text_color="#ffffff")
        lbl.pack(side="left")

    def _create_swatch_card(self, parent, title):
        card = ctk.CTkFrame(parent, fg_color="#0a100d", border_width=1, border_color="#18271e", corner_radius=8)
        
        ctk.CTkLabel(card, text=title, font=("Segoe UI", 9), text_color=TEXT_MUTED).pack(pady=(6, 2))

        # Color Block Box
        color_box = ctk.CTkLabel(card, text="", height=36, corner_radius=6, fg_color="#808080")
        color_box.pack(fill="x", padx=8, pady=2)

        rgb_val = ctk.CTkLabel(card, text="128, 128, 128", font=("Segoe UI", 9, "bold"), text_color="#cbd5e1")
        rgb_val.pack(pady=(2, 6))

        card.color_box = color_box
        card.rgb_val = rgb_val
        return card

    def _update_swatch_color(self, swatch_widget, r_norm, g_norm, b_norm):
        r_int = int(r_norm * 255.0)
        g_int = int(g_norm * 255.0)
        b_int = int(b_norm * 255.0)
        hex_col = f"#{r_int:02x}{g_int:02x}{b_int:02x}"
        swatch_widget.color_box.configure(fg_color=hex_col)
        swatch_widget.rgb_val.configure(text=f"{r_int}, {g_int}, {b_int}")

    def _on_name_change(self, event=None):
        raw_name = self.txt_preset_name.get().strip() or "Custom Grade"
        self.lbl_effect_preview.configure(text=f"Nama Efek di Keyflow: Match Grade ({raw_name})")

    # ==========================================
    # LOGIKA & ACTIONS
    # ==========================================
    def load_reference(self):
        file_path = filedialog.askopenfilename(
            title="Pilih Gambar Referensi",
            filetypes=[("Image Files", "*.jpg;*.jpeg;*.png;*.webp;*.bmp")]
        )
        if not file_path:
            return

        self.ref_image_path = file_path
        filename = os.path.basename(file_path)
        
        # Potong teks nama jika terlalu panjang
        disp_filename = filename if len(filename) <= 45 else filename[:42] + "..."
        self.lbl_ref_filename.configure(text=disp_filename, text_color=ACCENT_GREEN)

        base_name = os.path.splitext(filename)[0]
        clean_name = base_name.replace("_", " ").replace("-", " ").title()[:24]
        self.txt_preset_name.delete(0, tk.END)
        self.txt_preset_name.insert(0, clean_name)
        self._on_name_change()

        # Render Image Thumbnail
        self._display_image_in_box(file_path, self.lbl_ref_img, (390, 150))

        # Analisis grading
        try:
            self.params = analyze_reference(file_path)
            self._update_ui_with_params(self.params)
            if self.target_image_path:
                self.update_preview()
        except Exception as e:
            messagebox.showerror("Gagal Menganalisis", f"Terjadi kesalahan saat memproses gambar:\n{e}")

    def load_target(self):
        file_path = filedialog.askopenfilename(
            title="Pilih Gambar Target (Simulasi)",
            filetypes=[("Image Files", "*.jpg;*.jpeg;*.png;*.webp;*.bmp")]
        )
        if not file_path:
            return

        self.target_image_path = file_path
        filename = os.path.basename(file_path)
        disp_filename = filename if len(filename) <= 45 else filename[:42] + "..."
        self.lbl_target_filename.configure(text=disp_filename, text_color="#a7f3d0")

        if self.params:
            self.update_preview()

    def update_preview(self):
        if not self.target_image_path or not self.params:
            return
        try:
            target_img = Image.open(self.target_image_path).convert('RGB')
            graded_img = simulate_grade(target_img, self.params)
            self._display_pil_in_box(graded_img, self.lbl_target_img, (390, 150))
        except Exception as e:
            messagebox.showerror("Gagal Preview", f"Kesalahan simulasi shader:\n{e}")

    def _display_image_in_box(self, path, ctk_label, max_size):
        try:
            img = Image.open(path).convert('RGB')
            self._display_pil_in_box(img, ctk_label, max_size)
        except Exception as e:
            print("Display error:", e)

    def _display_pil_in_box(self, pil_img, ctk_label, max_size):
        img_copy = pil_img.copy()
        img_copy.thumbnail(max_size, Image.Resampling.BILINEAR)
        ctk_img = ctk.CTkImage(light_image=img_copy, dark_image=img_copy, size=img_copy.size)
        ctk_label.configure(image=ctk_img, text="")
        ctk_label.image = ctk_img

    def _update_ui_with_params(self, params):
        for key, lbl in self.param_labels.items():
            if key in params:
                val = params[key]
                if key == "exposure":
                    lbl.configure(text=f"{val:+.2f} EV")
                elif key in ["contrast", "pivot"]:
                    lbl.configure(text=f"{val:.2f}")
                elif key in ["temp", "tint", "shadows", "highlights"]:
                    lbl.configure(text=f"{val:+.2f}")
                elif key in ["sat", "vib"]:
                    lbl.configure(text=f"{val:.2f}")

        self._update_swatch_color(self.swatch_shadow, params['liftR'], params['liftG'], params['liftB'])
        self._update_swatch_color(self.swatch_mid, params['gammaR'], params['gammaG'], params['gammaB'])
        self._update_swatch_color(self.swatch_high, params['gainR'], params['gainG'], params['gainB'])

    def export_kfplug(self):
        if not self.params:
            messagebox.showwarning("Perhatian", "Pilih gambar referensi terlebih dahulu!")
            return

        preset_name = self.txt_preset_name.get().strip() or "Custom Grade"
        safe_name = "".join(c for c in preset_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(" ", "_")
        clean_file_name = f"Match_Grade_{safe_name}.kfplug"

        out_dir = self.config_data.get("output_dir", os.path.join(PROJECT_DIR, "output"))
        os.makedirs(out_dir, exist_ok=True)
        default_save_path = os.path.join(out_dir, clean_file_name)

        out_path = filedialog.asksaveasfilename(
            title="Simpan Paket Plugin Keyflow (.kfplug)",
            initialdir=out_dir,
            initialfile=clean_file_name,
            defaultextension=".kfplug",
            filetypes=[("Keyflow Plugin", "*.kfplug")]
        )

        if not out_path:
            return

        try:
            saved_file, size_kb, disp_name = package_kfplug(self.params, out_path, preset_name=preset_name)
            
            # Otomatis buka folder jika diaktifkan
            if self.config_data.get("auto_open_folder", True):
                folder = os.path.dirname(os.path.abspath(saved_file))
                try:
                    os.startfile(folder)
                except Exception:
                    pass

            messagebox.showinfo(
                "Berhasil Diekspor! ⚡",
                f"Plugin Keyflow berhasil dibuat:\n\n"
                f"🎨 Nama Efek: {disp_name}\n"
                f"📁 File: {os.path.basename(saved_file)}\n"
                f"📊 Ukuran: {size_kb:.2f} KB\n"
                f"🔒 Status: Siap pasang ke Keyflow Mobile tanpa menimpa plugin lain!"
            )
        except Exception as e:
            messagebox.showerror("Gagal Mengekspor", f"Terjadi kesalahan saat membuat paket .kfplug:\n{e}")

    # ==========================================
    # SETTINGS ACTIONS
    # ==========================================
    def _browse_output_dir(self):
        cur = self.txt_output_dir.get().strip()
        folder = filedialog.askdirectory(title="Pilih Folder Output .kfplug", initialdir=cur or PROJECT_DIR)
        if folder:
            self.txt_output_dir.delete(0, tk.END)
            self.txt_output_dir.insert(0, folder)

    def _open_output_folder(self):
        cur = self.txt_output_dir.get().strip() or os.path.join(PROJECT_DIR, "output")
        os.makedirs(cur, exist_ok=True)
        try:
            os.startfile(cur)
        except Exception as e:
            messagebox.showerror("Error", f"Tidak dapat membuka folder:\n{e}")

    def _save_settings_action(self):
        new_dir = self.txt_output_dir.get().strip() or os.path.join(PROJECT_DIR, "output")
        os.makedirs(new_dir, exist_ok=True)
        self.config_data["output_dir"] = new_dir
        self.config_data["auto_open_folder"] = bool(self.chk_auto_open.get())
        self.config_data["unique_package_id"] = bool(self.chk_multi_plug.get())
        save_config(self.config_data)
        messagebox.showinfo("Tersimpan", "Pengaturan berhasil disimpan!")

def main():
    app = CopyGradingStudio()
    app.mainloop()

if __name__ == "__main__":
    main()
