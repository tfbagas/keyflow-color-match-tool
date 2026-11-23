# -*- coding: utf-8 -*-
"""
Color Match Tool for Keyflow
----------------------------
Liquid Glass & Monochrome Icons Edition
Credit by TFBAGAS

Multithreaded Background Image Processing & Real-time Keyflow Plugin (.kfplug) Generator
"""

import os
import re
import sys
import json
import numpy as np
from PIL import Image

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QLineEdit, QSlider, QDoubleSpinBox,
    QFrame, QFileDialog, QMessageBox, QColorDialog, QScrollArea,
    QStackedWidget, QCheckBox, QSizePolicy, QToolTip, QComboBox
)
from PySide6.QtGui import (
    QPixmap, QImage, QColor, QFont, QIcon, QPainter, QPen,
    QBrush, QDragEnterEvent, QDropEvent, QCursor, QPainterPath,
    QLinearGradient
)
from PySide6.QtCore import Qt, QSize, QPoint, QRect, QRectF, Signal, Slot, QThread, QTimer

# Import core grading engine & icon system
from copy_grading import analyze_reference, analyze_reference_pil, simulate_grade, package_kfplug
from icons import get_pixmap, get_icon

# Official Liquid Glass Dark Emerald Color Palette
C_BG = "#080D0B"
C_PANEL = "#111A17"
C_SURFACE = "#16231D"
C_ACCENT = "#00E987"
C_HOVER = "#16FFA0"
C_BORDER = "#20352B"
C_TEXT = "#E8F2ED"
C_MUTED = "#91A69A"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CONFIG_FILE = os.path.join(PROJECT_DIR, "config.json")
LOGO_PATH = os.path.join(SCRIPT_DIR, "keyflow_logo.png")
BG_PATH = os.path.join(SCRIPT_DIR, "liquid_glass_bg.png")

def load_config():
    default_config = {
        "output_dir": os.path.join(PROJECT_DIR, "output"),
        "auto_open_folder": True,
        "unique_package_id": True,
        "default_author": "TFBAGAS"
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
        print("Failed to save config:", e)

# -------------------------------------------------------------
# BACKGROUND WORKER THREAD: Non-blocking Color Matching
# -------------------------------------------------------------
class ColorMatchWorker(QThread):
    """
    Dedicated background worker that offloads heavy image decoding,
    caching, statistical color analysis, and preview generation
    from the main GUI thread to prevent freezing.
    """
    stage_changed = Signal(str)
    match_finished = Signal(dict)
    match_error = Signal(str)

    def __init__(self, mode, file_path, current_params=None, parent=None):
        super().__init__(parent)
        self.mode = mode                     # "reference" or "target"
        self.file_path = file_path
        self.current_params = current_params or {}

    def run(self):
        try:
            # Stage 1: Read & decode image
            self.stage_changed.emit("Reading image...")
            if not os.path.exists(self.file_path):
                raise FileNotFoundError(f"Image file not found: {self.file_path}")

            img = Image.open(self.file_path).convert('RGB')
            orig_w, orig_h = img.size
            size_mb = os.path.getsize(self.file_path) / (1024.0 * 1024.0)
            fmt = os.path.splitext(self.file_path)[1][1:].upper()
            base_name = os.path.basename(self.file_path)

            # Stage 2: Create optimized preview cache (max dimension 1280px)
            self.stage_changed.emit("Optimizing preview cache...")
            max_preview_dim = 1280
            if max(orig_w, orig_h) > max_preview_dim:
                scale = max_preview_dim / max(orig_w, orig_h)
                preview_size = (int(orig_w * scale), int(orig_h * scale))
                preview_pil = img.resize(preview_size, Image.Resampling.BILINEAR)
            else:
                preview_pil = img.copy()

            # Thumbnail for card drop widget (max 380x160)
            thumb_pil = img.copy()
            thumb_pil.thumbnail((380, 160), Image.Resampling.BILINEAR)

            # Stage 3: Mode-specific analysis / simulation
            detected_params = None
            if self.mode == "reference":
                # Analyze color characteristics using background thread
                detected_params = analyze_reference_pil(
                    preview_pil,
                    stage_callback=self.stage_changed.emit
                )
                self.stage_changed.emit("Finalizing preview...")
                graded_preview_pil = simulate_grade(preview_pil, detected_params)
            else:
                # Target mode: use active current params to simulate
                self.stage_changed.emit("Finalizing preview...")
                graded_preview_pil = simulate_grade(preview_pil, self.current_params)

            # Finish: transmit result back to GUI thread via Qt Signal
            result = {
                "mode": self.mode,
                "file_path": self.file_path,
                "meta": {
                    "w": orig_w,
                    "h": orig_h,
                    "size_mb": size_mb,
                    "fmt": fmt,
                    "base_name": base_name
                },
                "preview_pil": preview_pil,
                "thumb_pil": thumb_pil,
                "detected_params": detected_params,
                "graded_preview_pil": graded_preview_pil
            }
            self.match_finished.emit(result)

        except Exception as e:
            self.match_error.emit(str(e))

# -------------------------------------------------------------
# Liquid Glass Custom Frame (Translucent + Specular Highlights)
# -------------------------------------------------------------
class GlassCard(QFrame):
    def __init__(self, parent=None, corner_radius=16):
        super().__init__(parent)
        self.corner_radius = corner_radius
        self.is_hovered = False
        self.setAttribute(Qt.WA_Hover, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

    def enterEvent(self, event):
        self.is_hovered = True
        self.update()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.is_hovered = False
        self.update()
        super().leaveEvent(event)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        rect = QRectF(0, 0, self.width(), self.height())
        radius = self.corner_radius

        path = QPainterPath()
        path.addRoundedRect(rect.adjusted(0.5, 0.5, -0.5, -0.5), radius, radius)

        # 1. Glass Surface Fill (Translucent Dark Emerald)
        bg_color = QColor(17, 26, 23, 200) if not self.is_hovered else QColor(20, 31, 27, 215)
        painter.fillPath(path, bg_color)

        # 2. Specular Top-Edge Reflection Gradient
        specular = QLinearGradient(0, 0, 0, rect.height())
        specular.setColorAt(0.0, QColor(255, 255, 255, 45 if not self.is_hovered else 80))
        specular.setColorAt(0.15, QColor(0, 233, 135, 30))
        specular.setColorAt(1.0, QColor(0, 233, 135, 15))

        pen = QPen(QBrush(specular), 1.2)
        painter.strokePath(path, pen)

# -------------------------------------------------------------
# WIDGET 1: Image Drop Area with Side-Stack Action Buttons
# -------------------------------------------------------------
class ImageDropWidget(GlassCard):
    imageSelected = Signal(str)   # Emits image path when dropped/selected
    imageRemoved = Signal()

    def __init__(self, step_num, title_text, is_required=True, parent=None):
        super().__init__(parent, corner_radius=16)
        self.step_num = step_num
        self.title_text = title_text
        self.is_required = is_required
        self.image_path = None
        self.setAcceptDrops(True)

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 14, 18, 14)
        layout.setSpacing(8)

        # Header Bar: [1] Title                      ✓ Loaded
        head_row = QHBoxLayout()
        
        badge = QLabel(str(self.step_num))
        badge.setFixedSize(22, 22)
        badge.setAlignment(Qt.AlignCenter)
        badge.setStyleSheet(f"background-color: {C_ACCENT}; color: #080D0B; border-radius: 11px; font-weight: bold; font-size: 11px;")
        head_row.addWidget(badge)

        self.lbl_title = QLabel(self.title_text)
        self.lbl_title.setStyleSheet("font-weight: bold; font-size: 12px; color: #ffffff;")
        head_row.addWidget(self.lbl_title)
        head_row.addStretch()

        self.lbl_status = QLabel("")
        self.lbl_status.setStyleSheet(f"color: {C_ACCENT}; font-size: 11px; font-weight: bold;")
        head_row.addWidget(self.lbl_status)

        layout.addLayout(head_row)

        # Main Body Row: [ Image Preview Box (Left) ]  [ Replace / Remove (Right) ]
        body_row = QHBoxLayout()
        body_row.setSpacing(12)

        # Image Container
        self.img_box = QFrame()
        self.img_box.setStyleSheet(f"background-color: rgba(9, 15, 12, 0.85); border: 1px solid {C_BORDER}; border-radius: 10px;")
        self.img_box.setFixedHeight(165)
        
        box_layout = QVBoxLayout(self.img_box)
        box_layout.setContentsMargins(4, 4, 4, 4)
        box_layout.setAlignment(Qt.AlignCenter)

        # State 1: Placeholder
        self.placeholder = QWidget()
        ph_layout = QVBoxLayout(self.placeholder)
        ph_layout.setAlignment(Qt.AlignCenter)
        ph_layout.setSpacing(6)

        lbl_icon = QLabel()
        lbl_icon.setPixmap(get_pixmap("image", C_MUTED, 28))
        lbl_icon.setAlignment(Qt.AlignCenter)
        ph_layout.addWidget(lbl_icon)

        lbl_hint = QLabel("Drag & Drop Image Here")
        lbl_hint.setStyleSheet(f"color: {C_MUTED}; font-size: 11px;")
        lbl_hint.setAlignment(Qt.AlignCenter)
        ph_layout.addWidget(lbl_hint)

        self.btn_browse = QPushButton("  Browse Image...")
        self.btn_browse.setIcon(get_icon("upload", C_TEXT, C_ACCENT, 16))
        self.btn_browse.setCursor(Qt.PointingHandCursor)
        self.btn_browse.setStyleSheet(f"background-color: {C_SURFACE}; color: {C_TEXT}; border: 1px solid {C_BORDER}; border-radius: 8px; font-size: 11px; font-weight: bold; padding: 6px 14px;")
        self.btn_browse.clicked.connect(self.browse_file)
        ph_layout.addWidget(self.btn_browse)

        box_layout.addWidget(self.placeholder)

        # State 2: Preview Pixmap
        self.lbl_preview = QLabel()
        self.lbl_preview.setAlignment(Qt.AlignCenter)
        box_layout.addWidget(self.lbl_preview)
        self.lbl_preview.hide()

        body_row.addWidget(self.img_box, 1)

        # Right Vertical Button Stack: [ Replace ] / [ Remove ]
        self.btn_stack = QFrame()
        self.btn_stack.setFixedWidth(80)
        self.btn_stack.setStyleSheet("background: transparent; border: none;")
        stack_layout = QVBoxLayout(self.btn_stack)
        stack_layout.setContentsMargins(0, 0, 0, 0)
        stack_layout.setSpacing(8)
        stack_layout.setAlignment(Qt.AlignCenter)

        # Replace Button
        self.btn_replace = QPushButton("Replace")
        self.btn_replace.setIcon(get_icon("refresh", C_TEXT, C_ACCENT, 16))
        self.btn_replace.setCursor(Qt.PointingHandCursor)
        self.btn_replace.setFixedHeight(75)
        self.btn_replace.setStyleSheet(f"""
            QPushButton {{
                background-color: rgba(22, 35, 29, 0.7);
                color: {C_TEXT};
                border: 1px solid {C_BORDER};
                border-radius: 8px;
                font-size: 10px;
                font-weight: bold;
                padding: 6px;
            }}
            QPushButton:hover {{
                background-color: rgba(30, 48, 40, 0.9);
                border-color: {C_ACCENT};
                color: {C_ACCENT};
            }}
        """)
        self.btn_replace.clicked.connect(self.browse_file)
        stack_layout.addWidget(self.btn_replace)

        # Remove Button
        self.btn_remove = QPushButton("Remove")
        self.btn_remove.setIcon(get_icon("trash", C_TEXT, "#FF5252", 16))
        self.btn_remove.setCursor(Qt.PointingHandCursor)
        self.btn_remove.setFixedHeight(75)
        self.btn_remove.setStyleSheet(f"""
            QPushButton {{
                background-color: rgba(22, 35, 29, 0.7);
                color: {C_TEXT};
                border: 1px solid {C_BORDER};
                border-radius: 8px;
                font-size: 10px;
                font-weight: bold;
                padding: 6px;
            }}
            QPushButton:hover {{
                background-color: rgba(45, 25, 25, 0.9);
                border-color: #FF5252;
                color: #FF5252;
            }}
        """)
        self.btn_remove.clicked.connect(self.remove_image)
        stack_layout.addWidget(self.btn_remove)

        body_row.addWidget(self.btn_stack)
        self.btn_stack.hide()

        layout.addLayout(body_row)

        # Metadata Footer
        self.lbl_meta = QLabel("")
        self.lbl_meta.setStyleSheet(f"color: {C_MUTED}; font-size: 10px;")
        layout.addWidget(self.lbl_meta)
        self.lbl_meta.hide()

    def set_controls_enabled(self, enabled):
        self.btn_browse.setEnabled(enabled)
        self.btn_replace.setEnabled(enabled)
        self.btn_remove.setEnabled(enabled)

    def set_status_text(self, text, is_accent=True):
        color = C_ACCENT if is_accent else C_MUTED
        self.lbl_status.setStyleSheet(f"color: {color}; font-size: 11px; font-weight: bold;")
        self.lbl_status.setText(text)

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if urls:
                path = urls[0].toLocalFile()
                ext = os.path.splitext(path)[1].lower()
                if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']:
                    event.acceptProposedAction()
                    self.img_box.setStyleSheet(f"background-color: rgba(14, 28, 22, 0.95); border: 2px solid {C_ACCENT}; border-radius: 10px;")
                    return
        event.ignore()

    def dragLeaveEvent(self, event):
        self.img_box.setStyleSheet(f"background-color: rgba(9, 15, 12, 0.85); border: 1px solid {C_BORDER}; border-radius: 10px;")

    def dropEvent(self, event: QDropEvent):
        self.img_box.setStyleSheet(f"background-color: rgba(9, 15, 12, 0.85); border: 1px solid {C_BORDER}; border-radius: 10px;")
        urls = event.mimeData().urls()
        if urls:
            path = urls[0].toLocalFile()
            self.select_file_path(path)

    def browse_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Select Image", "",
            "Image Files (*.jpg *.jpeg *.png *.webp *.bmp)"
        )
        if file_path:
            self.select_file_path(file_path)

    def select_file_path(self, path):
        if not os.path.exists(path):
            return
        self.image_path = path
        self.imageSelected.emit(path)

    def display_loaded_image(self, meta, thumb_pil):
        """Called by main GUI thread when background worker finishes loading."""
        w = meta.get("w", 0)
        h = meta.get("h", 0)
        fmt = meta.get("fmt", "")
        size_mb = meta.get("size_mb", 0.0)
        base_name = meta.get("base_name", "")
        disp_name = base_name if len(base_name) <= 26 else base_name[:23] + "..."

        self.lbl_meta.setText(f"{disp_name}  •  {w}×{h} px  •  {fmt}  •  {size_mb:.1f} MB")
        self.set_status_text("✓ Loaded", is_accent=True)

        # Convert PIL thumbnail to QPixmap on main GUI thread
        raw_bytes = thumb_pil.tobytes()
        qimg = QImage(raw_bytes, thumb_pil.width, thumb_pil.height, thumb_pil.width * 3, QImage.Format_RGB888)
        pix = QPixmap.fromImage(qimg)
        scaled = pix.scaled(380, 155, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.lbl_preview.setPixmap(scaled)

        self.placeholder.hide()
        self.lbl_preview.show()
        self.btn_stack.show()
        self.lbl_meta.show()

    def remove_image(self):
        self.image_path = None
        self.lbl_preview.clear()
        self.lbl_meta.setText("")
        self.lbl_status.setText("")
        self.lbl_preview.hide()
        self.btn_stack.hide()
        self.lbl_meta.hide()
        self.placeholder.show()
        self.imageRemoved.emit()

# -------------------------------------------------------------
# WIDGET 2: Monochrome Parameter Row (Slider + Spinbox)
# -------------------------------------------------------------
class ParameterControl(QWidget):
    valueChanged = Signal(str, float)

    def __init__(self, key, label_text, icon_name, min_val, max_val, default_val, decimals=2, parent=None):
        super().__init__(parent)
        self.key = key
        self.label_text = label_text
        self.icon_name = icon_name
        self.min_val = min_val
        self.max_val = max_val
        self.default_val = default_val
        self.auto_val = default_val
        self.decimals = decimals
        self.scale_factor = 10 ** decimals

        self._build_ui()

    def _build_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 2, 0, 2)
        layout.setSpacing(10)

        # Monochrome Icon
        icon_lbl = QLabel()
        icon_lbl.setPixmap(get_pixmap(self.icon_name, C_TEXT, 16))
        icon_lbl.setFixedSize(18, 18)
        layout.addWidget(icon_lbl)

        # Label Text
        lbl_name = QLabel(self.label_text)
        lbl_name.setFixedWidth(145)
        lbl_name.setStyleSheet(f"font-size: 11px; color: {C_TEXT};")
        layout.addWidget(lbl_name)

        # Glowing Neon Emerald Slider
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(int(self.min_val * self.scale_factor), int(self.max_val * self.scale_factor))
        self.slider.setValue(int(self.default_val * self.scale_factor))
        self.slider.setCursor(Qt.PointingHandCursor)
        self.slider.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: 4px;
                background-color: #172A20;
                border-radius: 2px;
            }}
            QSlider::sub-page:horizontal {{
                background-color: {C_ACCENT};
                border-radius: 2px;
            }}
            QSlider::handle:horizontal {{
                background-color: #ffffff;
                border: 2px solid {C_ACCENT};
                width: 14px;
                margin-top: -5px;
                margin-bottom: -5px;
                border-radius: 7px;
            }}
            QSlider::handle:horizontal:hover {{
                background-color: {C_HOVER};
                border-color: #ffffff;
            }}
        """)
        self.slider.valueChanged.connect(self._on_slider_changed)
        layout.addWidget(self.slider, 1)

        # Numeric Spinbox with Green Active Value
        self.spin = QDoubleSpinBox()
        self.spin.setRange(self.min_val, self.max_val)
        self.spin.setSingleStep(1.0 / self.scale_factor)
        self.spin.setDecimals(self.decimals)
        self.spin.setValue(self.default_val)
        self.spin.setFixedWidth(64)
        self.spin.setAlignment(Qt.AlignRight)
        self.spin.setStyleSheet(f"""
            QDoubleSpinBox {{
                background-color: rgba(9, 16, 13, 0.9);
                border: 1px solid {C_BORDER};
                border-radius: 6px;
                color: {C_ACCENT};
                font-weight: bold;
                font-size: 11px;
                padding: 2px 4px;
            }}
            QDoubleSpinBox:hover, QDoubleSpinBox:focus {{
                border-color: {C_ACCENT};
            }}
        """)
        self.spin.valueChanged.connect(self._on_spin_changed)
        layout.addWidget(self.spin)

    def _on_slider_changed(self, val):
        flt = float(val) / self.scale_factor
        if abs(self.spin.value() - flt) > (0.5 / self.scale_factor):
            self.spin.blockSignals(True)
            self.spin.setValue(flt)
            self.spin.blockSignals(False)
        self.valueChanged.emit(self.key, flt)

    def _on_spin_changed(self, val):
        ival = int(val * self.scale_factor)
        if self.slider.value() != ival:
            self.slider.blockSignals(True)
            self.slider.setValue(ival)
            self.slider.blockSignals(False)
        self.valueChanged.emit(self.key, val)

    def set_auto_value(self, val):
        self.auto_val = val
        self.set_value(val)

    def set_value(self, val):
        self.spin.blockSignals(True)
        self.slider.blockSignals(True)
        self.spin.setValue(val)
        self.slider.setValue(int(val * self.scale_factor))
        self.spin.blockSignals(False)
        self.slider.blockSignals(False)

    def reset_to_auto(self):
        self.set_value(self.auto_val)

# -------------------------------------------------------------
# WIDGET 3: 3-Way Swatch Card (Color Block + HEX [Copy] + RGB)
# -------------------------------------------------------------
class ColorSwatchCard(QFrame):
    colorChanged = Signal(str, float, float, float)

    def __init__(self, key_prefix, title_text, def_r=0.5, def_g=0.5, def_b=0.5, parent=None):
        super().__init__(parent)
        self.key_prefix = key_prefix
        self.title_text = title_text
        self.r = def_r
        self.g = def_g
        self.b = def_b

        self.setStyleSheet(f"""
            QFrame {{
                background-color: rgba(14, 25, 20, 0.85);
                border: 1px solid {C_BORDER};
                border-radius: 10px;
            }}
        """)

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(5)

        lbl_title = QLabel(self.title_text)
        lbl_title.setStyleSheet(f"font-size: 10px; font-weight: bold; color: {C_MUTED}; border: none; background: transparent;")
        lbl_title.setAlignment(Qt.AlignCenter)
        layout.addWidget(lbl_title)

        # Clickable Color Block
        self.btn_color = QPushButton()
        self.btn_color.setFixedHeight(36)
        self.btn_color.setCursor(Qt.PointingHandCursor)
        self.btn_color.setToolTip("Click to adjust color via Color Picker")
        self.btn_color.clicked.connect(self.pick_color)
        layout.addWidget(self.btn_color)

        # HEX Row with Copy Icon Button:  #2F3A4A  [📋]
        hex_row = QHBoxLayout()
        hex_row.setContentsMargins(0, 0, 0, 0)
        hex_row.setSpacing(4)
        hex_row.setAlignment(Qt.AlignCenter)

        self.lbl_hex = QLabel("#808080")
        self.lbl_hex.setStyleSheet("font-size: 11px; font-weight: bold; color: #ffffff; border: none; background: transparent;")
        hex_row.addWidget(self.lbl_hex)

        self.btn_copy = QPushButton()
        self.btn_copy.setFixedSize(18, 18)
        self.btn_copy.setIcon(get_icon("copy", C_MUTED, C_ACCENT, 14))
        self.btn_copy.setCursor(Qt.PointingHandCursor)
        self.btn_copy.setToolTip("Copy HEX Code")
        self.btn_copy.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                border: none;
                border-radius: 3px;
            }}
            QPushButton:hover {{
                background-color: rgba(0, 233, 135, 0.15);
            }}
        """)
        self.btn_copy.clicked.connect(self.copy_hex)
        hex_row.addWidget(self.btn_copy)

        layout.addLayout(hex_row)

        # RGB Label
        self.lbl_rgb = QLabel("128, 128, 128")
        self.lbl_rgb.setStyleSheet(f"font-size: 9px; color: {C_MUTED}; border: none; background: transparent;")
        self.lbl_rgb.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.lbl_rgb)

        self.update_color_display(self.r, self.g, self.b)

    def update_color_display(self, r_norm, g_norm, b_norm):
        self.r = float(np.clip(r_norm, 0.0, 1.0))
        self.g = float(np.clip(g_norm, 0.0, 1.0))
        self.b = float(np.clip(b_norm, 0.0, 1.0))

        ri, gi, bi = int(self.r * 255.0), int(self.g * 255.0), int(self.b * 255.0)
        hex_code = f"#{ri:02X}{gi:02X}{bi:02X}"

        self.btn_color.setStyleSheet(f"background-color: {hex_code}; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;")
        self.lbl_hex.setText(hex_code)
        self.lbl_rgb.setText(f"{ri}, {gi}, {bi}")

    def pick_color(self):
        init_color = QColor(int(self.r * 255), int(self.g * 255), int(self.b * 255))
        picked = QColorDialog.getColor(init_color, self, f"Pick {self.title_text}")
        if picked.isValid():
            nr, ng, nb = picked.red() / 255.0, picked.green() / 255.0, picked.blue() / 255.0
            self.update_color_display(nr, ng, nb)
            self.colorChanged.emit(self.key_prefix, nr, ng, nb)

    def copy_hex(self):
        QApplication.clipboard().setText(self.lbl_hex.text())
        QToolTip.showText(QCursor.pos(), f"Copied: {self.lbl_hex.text()}")

# -------------------------------------------------------------
# WIDGET 4: Visual Comparison Split Slider (Before/After)
# -------------------------------------------------------------
class SplitCompareWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(180)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        self.orig_pil = None
        self.graded_pil = None
        self.original_pixmap = None
        self.graded_pixmap = None
        self.split_pos = 0.5
        self.is_dragging = False
        self.view_mode = "split" # "split" or "side"

    def set_images(self, orig_pil, graded_pil):
        self.orig_pil = orig_pil
        self.graded_pil = graded_pil
        self.update_scaled_pixmaps()
        self.update()

    def update_scaled_pixmaps(self):
        if self.orig_pil is None or self.graded_pil is None:
            self.original_pixmap = None
            self.graded_pixmap = None
            return

        w = max(self.width(), 80)
        h = max(self.height(), 80)

        # Scale down for fast rendering in paintEvent
        img_o = self.orig_pil.copy()
        img_o.thumbnail((w, h), Image.Resampling.BILINEAR)
        img_g = self.graded_pil.copy()
        img_g.thumbnail((w, h), Image.Resampling.BILINEAR)

        qo = QImage(img_o.tobytes(), img_o.width, img_o.height, img_o.width * 3, QImage.Format_RGB888)
        qg = QImage(img_g.tobytes(), img_g.width, img_g.height, img_g.width * 3, QImage.Format_RGB888)

        self.original_pixmap = QPixmap.fromImage(qo)
        self.graded_pixmap = QPixmap.fromImage(qg)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.update_scaled_pixmaps()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        w = self.width()
        h = self.height()

        # Rounded Glass Clipping
        path = QPainterPath()
        path.addRoundedRect(0, 0, w, h, 10, 10)
        painter.setClipPath(path)

        painter.fillRect(0, 0, w, h, QColor("#09100D"))

        if not self.original_pixmap or not self.graded_pixmap:
            painter.setPen(QColor(C_MUTED))
            painter.setFont(QFont("Segoe UI", 11))
            painter.drawText(QRect(0, 0, w, h), Qt.AlignCenter, "No image loaded for visual preview")
            return

        pw = self.original_pixmap.width()
        ph = self.original_pixmap.height()
        ox = (w - pw) // 2
        oy = (h - ph) // 2

        if self.view_mode == "split":
            split_x = int(ox + pw * self.split_pos)
            
            # Graded on Right
            painter.save()
            painter.setClipRect(split_x, oy, w - split_x, ph)
            painter.drawPixmap(ox, oy, self.graded_pixmap)
            painter.restore()

            # Original on Left
            painter.save()
            painter.setClipRect(ox, oy, split_x - ox, ph)
            painter.drawPixmap(ox, oy, self.original_pixmap)
            painter.restore()

            # Neon Emerald Divider Line
            pen = QPen(QColor(C_ACCENT), 2)
            painter.setPen(pen)
            painter.drawLine(split_x, oy, split_x, oy + ph)

            # Circular Handle with ◂▸
            painter.setBrush(QBrush(QColor(C_PANEL)))
            painter.setPen(QPen(QColor(C_ACCENT), 1.5))
            painter.drawEllipse(QPoint(split_x, oy + ph // 2), 12, 12)

            painter.setPen(QColor(C_ACCENT))
            painter.setFont(QFont("Segoe UI", 9, QFont.Bold))
            painter.drawText(QRect(split_x - 12, oy + ph // 2 - 12, 24, 24), Qt.AlignCenter, "◂▸")

            # Badges: BEFORE & AFTER
            painter.setPen(Qt.NoPen)
            painter.setBrush(QColor(0, 0, 0, 160))
            painter.drawRoundedRect(ox + 8, oy + 8, 70, 20, 4, 4)
            painter.drawRoundedRect(ox + pw - 78, oy + 8, 70, 20, 4, 4)

            painter.setPen(QColor(C_TEXT))
            painter.setFont(QFont("Segoe UI", 8, QFont.Bold))
            painter.drawText(QRect(ox + 8, oy + 8, 70, 20), Qt.AlignCenter, "BEFORE")
            painter.drawText(QRect(ox + pw - 78, oy + 8, 70, 20), Qt.AlignCenter, "AFTER")

        else: # Side-by-side
            half_w = pw // 2
            painter.drawPixmap(ox, oy, half_w, ph, self.original_pixmap, 0, 0, half_w, ph)
            painter.drawPixmap(ox + half_w + 2, oy, half_w, ph, self.graded_pixmap, half_w, 0, half_w, ph)

    def mousePressEvent(self, event):
        if self.original_pixmap and event.button() == Qt.LeftButton:
            self.is_dragging = True
            self._update_pos_from_mouse(event.pos().x())

    def mouseMoveEvent(self, event):
        if self.is_dragging:
            self._update_pos_from_mouse(event.pos().x())

    def mouseReleaseEvent(self, event):
        self.is_dragging = False

    def _update_pos_from_mouse(self, mx):
        if not self.original_pixmap:
            return
        w = self.width()
        pw = self.original_pixmap.width()
        ox = (w - pw) // 2
        rel_x = mx - ox
        self.split_pos = float(np.clip(rel_x / max(pw, 1), 0.05, 0.95))
        self.update()

# -------------------------------------------------------------
# MAIN WINDOW: Liquid Glass & Monochrome
# -------------------------------------------------------------
class MatchGradingApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.config_data = load_config()

        self.setWindowTitle("Color Match Tool for Keyflow")
        self.resize(1180, 840)
        self.setMinimumSize(1100, 760)

        # Background Pixmap Cache
        self.bg_pixmap = None
        if os.path.exists(BG_PATH):
            self.bg_pixmap = QPixmap(BG_PATH)

        # Worker thread handle for non-blocking operations
        self.active_worker = None

        # Debounce timer for smooth 60fps live slider updates
        self.preview_timer = QTimer(self)
        self.preview_timer.setSingleShot(True)
        self.preview_timer.timeout.connect(self._apply_debounced_preview)

        # Data Model
        self.current_params = {
            "gradeMix": 1.0, "exposure": 0.0, "contrast": 1.0, "pivot": 0.43,
            "shadows": 0.0, "highlights": 0.0, "temp": 0.0, "tint": 0.0,
            "sat": 1.0, "vib": 0.0,
            "liftR": 0.5, "liftG": 0.5, "liftB": 0.5,
            "gammaR": 0.5, "gammaG": 0.5, "gammaB": 0.5,
            "gainR": 0.5, "gainG": 0.5, "gainB": 0.5
        }
        self.auto_detected_params = self.current_params.copy()
        
        # Image Cache Model (Optimized PIL previews at max 1280px)
        self.ref_image_path = None
        self.ref_preview_pil = None
        self.target_image_path = None
        self.target_preview_pil = None

        self._build_ui()

    def closeEvent(self, event):
        """Safely clean up active background worker on exit."""
        if self.active_worker and self.active_worker.isRunning():
            try:
                self.active_worker.match_finished.disconnect()
                self.active_worker.match_error.disconnect()
                self.active_worker.stage_changed.disconnect()
            except Exception:
                pass
            self.active_worker.quit()
            self.active_worker.wait(1000)
        event.accept()

    def paintEvent(self, event):
        painter = QPainter(self)
        if self.bg_pixmap:
            painter.drawPixmap(0, 0, self.width(), self.height(), self.bg_pixmap)
        else:
            painter.fillRect(0, 0, self.width(), self.height(), QColor(C_BG))

    def _build_ui(self):
        central_widget = QWidget()
        central_widget.setStyleSheet("background: transparent;")
        self.setCentralWidget(central_widget)

        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # -----------------------------------------------------
        # 1. SIDEBAR (Translucent Liquid Glass)
        # -----------------------------------------------------
        self.sidebar = QFrame()
        self.sidebar.setFixedWidth(155)
        self.sidebar.setStyleSheet(f"""
            QFrame {{
                background-color: rgba(6, 11, 8, 0.75);
                border-right: 1px solid rgba(0, 233, 135, 0.2);
            }}
        """)
        side_layout = QVBoxLayout(self.sidebar)
        side_layout.setContentsMargins(14, 22, 14, 20)
        side_layout.setSpacing(8)

        # Top Logo (Official Keyflow Logo)
        logo_box = QLabel()
        logo_box.setAlignment(Qt.AlignCenter)
        if os.path.exists(LOGO_PATH):
            pix = QPixmap(LOGO_PATH).scaled(60, 60, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            logo_box.setPixmap(pix)
        side_layout.addWidget(logo_box)
        side_layout.addSpacing(18)

        # Navigation Buttons (Lucide Monochrome Icons)
        self.btn_nav_home = QPushButton("  Home")
        self.btn_nav_home.setIcon(get_icon("home", "#05120B", C_ACCENT, 18))
        self.btn_nav_home.setCursor(Qt.PointingHandCursor)
        self.btn_nav_home.setFixedHeight(40)
        self.btn_nav_home.setStyleSheet(f"""
            QPushButton {{
                background-color: {C_ACCENT};
                color: #05120B;
                font-weight: bold;
                font-size: 13px;
                border: none;
                border-radius: 10px;
                text-align: left;
                padding-left: 14px;
            }}
        """)
        self.btn_nav_home.clicked.connect(lambda: self.switch_tab(0))
        side_layout.addWidget(self.btn_nav_home)

        self.btn_nav_settings = QPushButton("  Settings")
        self.btn_nav_settings.setIcon(get_icon("settings", C_MUTED, C_ACCENT, 18))
        self.btn_nav_settings.setCursor(Qt.PointingHandCursor)
        self.btn_nav_settings.setFixedHeight(40)
        self.btn_nav_settings.setStyleSheet(self._get_nav_btn_style(False))
        self.btn_nav_settings.clicked.connect(lambda: self.switch_tab(1))
        side_layout.addWidget(self.btn_nav_settings)

        self.btn_nav_about = QPushButton("  About")
        self.btn_nav_about.setIcon(get_icon("info", C_MUTED, C_ACCENT, 18))
        self.btn_nav_about.setCursor(Qt.PointingHandCursor)
        self.btn_nav_about.setFixedHeight(40)
        self.btn_nav_about.setStyleSheet(self._get_nav_btn_style(False))
        self.btn_nav_about.clicked.connect(lambda: self.switch_tab(2))
        side_layout.addWidget(self.btn_nav_about)

        side_layout.addStretch()

        # Watermark
        lbl_watermark = QLabel("Color Match for Keyflow\nV.0.5 Beta")
        lbl_watermark.setStyleSheet("color: rgba(0, 233, 135, 0.45); font-size: 9px; font-weight: bold; background: transparent; border: none;")
        lbl_watermark.setAlignment(Qt.AlignCenter)
        lbl_watermark.setWordWrap(True)
        side_layout.addWidget(lbl_watermark)

        main_layout.addWidget(self.sidebar)

        # -----------------------------------------------------
        # 2. MAIN CONTENT (Liquid Glass Header + Stack)
        # -----------------------------------------------------
        right_container = QWidget()
        right_container.setStyleSheet("background: transparent;")
        right_layout = QVBoxLayout(right_container)
        right_layout.setContentsMargins(24, 18, 24, 14)
        right_layout.setSpacing(14)

        # Header Bar
        header_bar = QHBoxLayout()
        header_bar.setSpacing(12)

        title_col = QVBoxLayout()
        title_col.setSpacing(2)

        title_row = QHBoxLayout()
        lbl_app = QLabel("Color Match Tool")
        lbl_app.setStyleSheet("font-size: 20px; font-weight: bold; color: #ffffff; background: transparent;")
        title_row.addWidget(lbl_app)

        lbl_for = QLabel("for Keyflow")
        lbl_for.setStyleSheet(f"font-size: 20px; font-weight: bold; color: {C_ACCENT}; background: transparent;")
        title_row.addWidget(lbl_for)
        title_row.addStretch()
        title_col.addLayout(title_row)

        lbl_sub = QLabel("Extract Look & Grading from Reference Image and Export as Keyflow Mobile Plugin (.kfplug)")
        lbl_sub.setStyleSheet(f"font-size: 11px; color: {C_MUTED}; background: transparent;")
        title_col.addWidget(lbl_sub)

        header_bar.addLayout(title_col)
        header_bar.addStretch()

        # Non-blocking Status Pill
        self.status_pill = QLabel("Ready")
        self.status_pill.setStyleSheet(f"""
            QLabel {{
                background-color: rgba(14, 28, 22, 0.85);
                color: {C_ACCENT};
                border: 1px solid rgba(0, 233, 135, 0.35);
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
                padding: 4px 14px;
            }}
        """)
        header_bar.addWidget(self.status_pill)

        # Version Badge
        ver_pill = QLabel("v0.5 Beta")
        ver_pill.setStyleSheet(f"""
            QLabel {{
                background-color: rgba(14, 28, 22, 0.8);
                color: {C_MUTED};
                border: 1px solid rgba(0, 233, 135, 0.2);
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
                padding: 4px 10px;
            }}
        """)
        header_bar.addWidget(ver_pill)

        right_layout.addLayout(header_bar)

        # Pages Stack
        self.pages = QStackedWidget()
        self.pages.setStyleSheet("background: transparent;")
        self.page_home = self._create_home_page()
        self.page_settings = self._create_settings_page()
        self.page_about = self._create_about_page()

        self.pages.addWidget(self.page_home)
        self.pages.addWidget(self.page_settings)
        self.pages.addWidget(self.page_about)

        right_layout.addWidget(self.pages, 1)

        main_layout.addWidget(right_container, 1)

    def _get_nav_btn_style(self, is_active):
        if is_active:
            return f"""
                QPushButton {{
                    background-color: {C_ACCENT};
                    color: #05120B;
                    font-weight: bold;
                    font-size: 13px;
                    border: none;
                    border-radius: 10px;
                    text-align: left;
                    padding-left: 14px;
                }}
            """
        return f"""
            QPushButton {{
                background-color: transparent;
                color: {C_MUTED};
                font-size: 13px;
                font-weight: bold;
                border: none;
                border-radius: 10px;
                text-align: left;
                padding-left: 14px;
            }}
            QPushButton:hover {{
                background-color: rgba(22, 35, 29, 0.6);
                color: {C_TEXT};
            }}
        """

    # =========================================================
    # TAB 1: HOME PAGE
    # =========================================================
    def _create_home_page(self):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("background: transparent; border: none;")

        container = QWidget()
        container.setStyleSheet("background: transparent;")
        grid = QHBoxLayout(container)
        grid.setContentsMargins(0, 2, 4, 2)
        grid.setSpacing(14)

        # -----------------------------------------------------
        # LEFT COLUMN (Drop Cards & Split Comparison)
        # -----------------------------------------------------
        col_left = QVBoxLayout()
        col_left.setSpacing(12)

        # Card 1: Reference Image (Required)
        self.card_ref = ImageDropWidget(1, "Reference Image (Required)", is_required=True)
        self.card_ref.imageSelected.connect(self._on_ref_image_selected)
        self.card_ref.imageRemoved.connect(self._on_ref_image_removed)
        col_left.addWidget(self.card_ref)

        # Card 2: Target Image (Optional)
        self.card_target = ImageDropWidget(2, "Target Image / Preview (Optional)", is_required=False)
        self.card_target.imageSelected.connect(self._on_target_image_selected)
        self.card_target.imageRemoved.connect(self._on_target_image_removed)
        col_left.addWidget(self.card_target)

        # Card: Visual Preview (Before / After Comparison)
        card_preview = GlassCard(corner_radius=16)
        cp_layout = QVBoxLayout(card_preview)
        cp_layout.setContentsMargins(18, 12, 18, 12)
        cp_layout.setSpacing(8)

        pv_head = QHBoxLayout()
        lbl_pv_icon = QLabel()
        lbl_pv_icon.setPixmap(get_pixmap("columns", C_ACCENT, 16))
        pv_head.addWidget(lbl_pv_icon)

        lbl_pv_title = QLabel("Visual Preview (Before / After Comparison)")
        lbl_pv_title.setStyleSheet("font-weight: bold; font-size: 11px; color: #ffffff; background: transparent;")
        pv_head.addWidget(lbl_pv_title)
        pv_head.addStretch()

        self.btn_view_mode = QPushButton("Split Slider ▾")
        self.btn_view_mode.setCursor(Qt.PointingHandCursor)
        self.btn_view_mode.setStyleSheet(f"""
            QPushButton {{
                background-color: rgba(22, 35, 29, 0.7);
                color: {C_TEXT};
                border: 1px solid {C_BORDER};
                border-radius: 6px;
                font-size: 10px;
                padding: 4px 10px;
            }}
            QPushButton:hover {{
                border-color: {C_ACCENT};
                color: {C_ACCENT};
            }}
        """)
        self.btn_view_mode.clicked.connect(self._toggle_preview_mode)
        pv_head.addWidget(self.btn_view_mode)
        cp_layout.addLayout(pv_head)

        self.split_widget = SplitCompareWidget()
        cp_layout.addWidget(self.split_widget)

        col_left.addWidget(card_preview)
        grid.addLayout(col_left, 1)

        # -----------------------------------------------------
        # RIGHT COLUMN (Parameters, Swatches, Export)
        # -----------------------------------------------------
        col_right = QVBoxLayout()
        col_right.setSpacing(12)

        # Card 3: Detected Grading Parameters
        card_params = GlassCard(corner_radius=16)
        c3_layout = QVBoxLayout(card_params)
        c3_layout.setContentsMargins(18, 14, 18, 14)
        c3_layout.setSpacing(8)

        # Header
        c3_head = QHBoxLayout()
        badge3 = QLabel("3")
        badge3.setFixedSize(22, 22)
        badge3.setAlignment(Qt.AlignCenter)
        badge3.setStyleSheet(f"background-color: {C_ACCENT}; color: #080D0B; border-radius: 11px; font-weight: bold; font-size: 11px;")
        c3_head.addWidget(badge3)

        lbl_c3 = QLabel("Detected Grading Parameters")
        lbl_c3.setStyleSheet("font-weight: bold; font-size: 12px; color: #ffffff; background: transparent;")
        c3_head.addWidget(lbl_c3)
        c3_head.addStretch()

        # Reset All Button
        self.btn_reset_all = QPushButton("  Reset All")
        self.btn_reset_all.setIcon(get_icon("reset", C_MUTED, C_ACCENT, 14))
        self.btn_reset_all.setCursor(Qt.PointingHandCursor)
        self.btn_reset_all.setStyleSheet(f"""
            QPushButton {{
                background-color: transparent;
                color: {C_MUTED};
                border: 1px solid {C_BORDER};
                border-radius: 6px;
                font-size: 10px;
                font-weight: bold;
                padding: 4px 8px;
            }}
            QPushButton:hover {{
                border-color: {C_ACCENT};
                color: {C_ACCENT};
            }}
        """)
        self.btn_reset_all.clicked.connect(self.reset_all_parameters)
        c3_head.addWidget(self.btn_reset_all)
        c3_layout.addLayout(c3_head)

        # 9 Parameter Rows
        self.controls = {}
        param_defs = [
            ("exposure", "Exposure (EV)", "sun", -2.0, 2.0, 0.0, 2),
            ("contrast", "Contrast", "contrast", 0.2, 2.0, 1.0, 2),
            ("pivot", "Contrast Pivot", "pivot", 0.1, 0.9, 0.43, 2),
            ("shadows", "Shadows Tint/Level", "droplet", -0.5, 0.5, 0.0, 2),
            ("highlights", "Highlights Tint/Level", "highlights", -0.5, 0.5, 0.0, 2),
            ("temp", "Color Temperature", "thermometer", -1.0, 1.0, 0.0, 2),
            ("tint", "Color Tint", "palette", -1.0, 1.0, 0.0, 2),
            ("sat", "Saturation", "droplet", 0.0, 2.0, 1.0, 2),
            ("vib", "Vibrance", "activity", -0.8, 0.8, 0.0, 2)
        ]

        for key, title, icon, mn, mx, df, dec in param_defs:
            ctrl = ParameterControl(key, title, icon, mn, mx, df, dec)
            ctrl.valueChanged.connect(self._on_param_slider_changed)
            self.controls[key] = ctrl
            c3_layout.addWidget(ctrl)

        # 3-Way Swatches
        c3_layout.addSpacing(6)
        swatch_title_box = QHBoxLayout()
        sw_icon = QLabel()
        sw_icon.setPixmap(get_pixmap("layers", C_ACCENT, 16))
        swatch_title_box.addWidget(sw_icon)

        lbl_sw = QLabel("3-Way Color Wheels Swatches:")
        lbl_sw.setStyleSheet("font-weight: bold; font-size: 11px; color: #ffffff; background: transparent;")
        swatch_title_box.addWidget(lbl_sw)
        swatch_title_box.addStretch()
        c3_layout.addLayout(swatch_title_box)

        swatches_row = QHBoxLayout()
        swatches_row.setSpacing(8)

        self.swatch_shadow = ColorSwatchCard("lift", "Shadows (Lift)", 0.5, 0.5, 0.5)
        self.swatch_shadow.colorChanged.connect(self._on_swatch_color_picked)
        swatches_row.addWidget(self.swatch_shadow)

        self.swatch_mid = ColorSwatchCard("gamma", "Midtones (Gamma)", 0.5, 0.5, 0.5)
        self.swatch_mid.colorChanged.connect(self._on_swatch_color_picked)
        swatches_row.addWidget(self.swatch_mid)

        self.swatch_high = ColorSwatchCard("gain", "Highs (Gain)", 0.5, 0.5, 0.5)
        self.swatch_high.colorChanged.connect(self._on_swatch_color_picked)
        swatches_row.addWidget(self.swatch_high)

        c3_layout.addLayout(swatches_row)
        col_right.addWidget(card_params)

        # Card 4: Export Plugin (.kfplug)
        card_export = GlassCard(corner_radius=16)
        c4_layout = QVBoxLayout(card_export)
        c4_layout.setContentsMargins(18, 14, 18, 14)
        c4_layout.setSpacing(8)

        c4_head = QHBoxLayout()
        badge4 = QLabel("4")
        badge4.setFixedSize(22, 22)
        badge4.setAlignment(Qt.AlignCenter)
        badge4.setStyleSheet(f"background-color: {C_ACCENT}; color: #080D0B; border-radius: 11px; font-weight: bold; font-size: 11px;")
        c4_head.addWidget(badge4)

        lbl_c4 = QLabel("Export Plugin (.kfplug)")
        lbl_c4.setStyleSheet("font-weight: bold; font-size: 12px; color: #ffffff; background: transparent;")
        c4_head.addWidget(lbl_c4)
        c4_head.addStretch()
        c4_layout.addLayout(c4_head)

        # 1. Preset Name Field
        lbl_name_tag = QLabel("Look / Preset Name")
        lbl_name_tag.setStyleSheet(f"font-size: 10px; font-weight: bold; color: {C_MUTED}; background: transparent;")
        c4_layout.addWidget(lbl_name_tag)

        input_row = QFrame()
        input_row.setStyleSheet(f"background-color: rgba(9, 16, 13, 0.9); border: 1px solid {C_BORDER}; border-radius: 8px;")
        ir_layout = QHBoxLayout(input_row)
        ir_layout.setContentsMargins(10, 2, 8, 2)

        self.txt_export_name = QLineEdit()
        self.txt_export_name.setText("Custom Look")
        self.txt_export_name.setPlaceholderText("Enter preset name...")
        self.txt_export_name.setStyleSheet("background: transparent; border: none; color: #ffffff; font-size: 11px;")
        self.txt_export_name.textChanged.connect(self._on_preset_name_changed)
        ir_layout.addWidget(self.txt_export_name, 1)

        icon_pen = QLabel()
        icon_pen.setPixmap(get_pixmap("pencil", C_MUTED, 14))
        icon_pen.setStyleSheet("background: transparent; border: none;")
        ir_layout.addWidget(icon_pen)
        c4_layout.addWidget(input_row)

        # 2. Author / Made By Field
        lbl_author_tag = QLabel("Author / Made By")
        lbl_author_tag.setStyleSheet(f"font-size: 10px; font-weight: bold; color: {C_MUTED}; background: transparent;")
        c4_layout.addWidget(lbl_author_tag)

        author_row = QFrame()
        author_row.setStyleSheet(f"background-color: rgba(9, 16, 13, 0.9); border: 1px solid {C_BORDER}; border-radius: 8px;")
        ar_layout = QHBoxLayout(author_row)
        ar_layout.setContentsMargins(10, 2, 8, 2)

        self.txt_export_author = QLineEdit()
        default_author = self.config_data.get("default_author", "TFBAGAS")
        self.txt_export_author.setText(default_author)
        self.txt_export_author.setPlaceholderText("Enter creator name (e.g. TFBAGAS)...")
        self.txt_export_author.setStyleSheet("background: transparent; border: none; color: #ffffff; font-size: 11px;")
        ar_layout.addWidget(self.txt_export_author, 1)

        icon_user = QLabel()
        icon_user.setPixmap(get_pixmap("user", C_MUTED, 14))
        icon_user.setStyleSheet("background: transparent; border: none;")
        ar_layout.addWidget(icon_user)
        c4_layout.addWidget(author_row)

        # 3. Description Field
        lbl_desc_tag = QLabel("Plugin Description")
        lbl_desc_tag.setStyleSheet(f"font-size: 10px; font-weight: bold; color: {C_MUTED}; background: transparent;")
        c4_layout.addWidget(lbl_desc_tag)

        desc_row = QFrame()
        desc_row.setStyleSheet(f"background-color: rgba(9, 16, 13, 0.9); border: 1px solid {C_BORDER}; border-radius: 8px;")
        dr_layout = QHBoxLayout(desc_row)
        dr_layout.setContentsMargins(10, 2, 8, 2)

        self.txt_export_desc = QLineEdit()
        self.txt_export_desc.setText("Grading preset matched from reference 'Custom Look'.")
        self.txt_export_desc.setPlaceholderText("Enter plugin description for Keyflow...")
        self.txt_export_desc.setStyleSheet("background: transparent; border: none; color: #ffffff; font-size: 11px;")
        dr_layout.addWidget(self.txt_export_desc, 1)

        icon_desc = QLabel()
        icon_desc.setPixmap(get_pixmap("file_text", C_MUTED, 14))
        icon_desc.setStyleSheet("background: transparent; border: none;")
        dr_layout.addWidget(icon_desc)
        c4_layout.addWidget(desc_row)

        c4_layout.addSpacing(6)

        # Big Neon Green Export Pill Button
        self.btn_export = QPushButton("  Export to .kfplug")
        self.btn_export.setIcon(get_icon("download", "#080D0B", "#080D0B", 18))
        self.btn_export.setFixedHeight(44)
        self.btn_export.setCursor(Qt.PointingHandCursor)
        self.btn_export.setEnabled(False)
        self.btn_export.setStyleSheet(f"""
            QPushButton {{
                background-color: {C_ACCENT};
                color: #080D0B;
                font-weight: bold;
                font-size: 13px;
                border: none;
                border-radius: 12px;
            }}
            QPushButton:hover {{
                background-color: {C_HOVER};
            }}
            QPushButton:disabled {{
                background-color: #1A3026;
                color: #4A6356;
            }}
        """)
        self.btn_export.clicked.connect(self.export_kfplug_action)
        c4_layout.addWidget(self.btn_export)

        col_right.addWidget(card_export)
        grid.addLayout(col_right, 1)

        scroll.setWidget(container)
        return scroll

    # =========================================================
    # TAB 2: SETTINGS PAGE
    # =========================================================
    def _create_settings_page(self):
        container = QWidget()
        container.setStyleSheet("background: transparent;")
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 4, 0, 0)
        layout.setSpacing(16)

        lbl_s_title = QLabel("Settings & Preferences")
        lbl_s_title.setStyleSheet("font-size: 18px; font-weight: bold; color: #ffffff; background: transparent;")
        layout.addWidget(lbl_s_title)

        lbl_s_sub = QLabel("Configure default plugin output location and workflow preferences")
        lbl_s_sub.setStyleSheet(f"font-size: 11px; color: {C_MUTED}; background: transparent;")
        layout.addWidget(lbl_s_sub)

        # Output Directory Card
        card_dir = GlassCard(corner_radius=16)
        cd_layout = QVBoxLayout(card_dir)
        cd_layout.setContentsMargins(22, 18, 22, 18)
        cd_layout.setSpacing(10)

        lbl_d1 = QLabel("Default Output Directory (.kfplug)")
        lbl_d1.setStyleSheet(f"font-size: 13px; font-weight: bold; color: {C_ACCENT}; background: transparent;")
        cd_layout.addWidget(lbl_d1)

        lbl_d2 = QLabel("Generated .kfplug files will automatically be saved to this folder.")
        lbl_d2.setStyleSheet(f"font-size: 11px; color: {C_MUTED}; background: transparent;")
        cd_layout.addWidget(lbl_d2)

        row_dir = QHBoxLayout()
        self.txt_out_dir = QLineEdit()
        self.txt_out_dir.setText(self.config_data.get("output_dir", ""))
        self.txt_out_dir.setStyleSheet(f"background-color: rgba(9, 16, 13, 0.9); border: 1px solid {C_BORDER}; border-radius: 8px; color: #ffffff; padding: 6px;")
        row_dir.addWidget(self.txt_out_dir, 1)

        btn_browse_dir = QPushButton("Browse...")
        btn_browse_dir.setIcon(get_icon("folder", C_TEXT, C_ACCENT, 16))
        btn_browse_dir.setCursor(Qt.PointingHandCursor)
        btn_browse_dir.setStyleSheet(f"background-color: {C_SURFACE}; color: {C_TEXT}; border: 1px solid {C_BORDER}; border-radius: 8px; padding: 6px 14px; font-size: 11px; font-weight: bold;")
        btn_browse_dir.clicked.connect(self._browse_dir_action)
        row_dir.addWidget(btn_browse_dir)

        cd_layout.addLayout(row_dir)

        btn_open_folder = QPushButton("  Open Output Folder in Explorer")
        btn_open_folder.setIcon(get_icon("folder", C_TEXT, C_ACCENT, 16))
        btn_open_folder.setCursor(Qt.PointingHandCursor)
        btn_open_folder.setStyleSheet(f"background-color: rgba(16, 32, 23, 0.8); color: {C_TEXT}; border: 1px solid {C_BORDER}; border-radius: 8px; padding: 6px 14px; font-size: 11px;")
        btn_open_folder.clicked.connect(self._open_folder_action)
        cd_layout.addWidget(btn_open_folder, 0, Qt.AlignLeft)

        layout.addWidget(card_dir)

        # Preferences Card
        card_pref = GlassCard(corner_radius=16)
        cp_layout = QVBoxLayout(card_pref)
        cp_layout.setContentsMargins(22, 18, 22, 18)
        cp_layout.setSpacing(12)

        lbl_p_title = QLabel("Export Preferences")
        lbl_p_title.setStyleSheet(f"font-size: 13px; font-weight: bold; color: {C_ACCENT}; background: transparent;")
        cp_layout.addWidget(lbl_p_title)

        # Default Author (Made By)
        lbl_p_author = QLabel("Default Author Name (Made By):")
        lbl_p_author.setStyleSheet(f"font-size: 11px; font-weight: bold; color: {C_TEXT}; background: transparent;")
        cp_layout.addWidget(lbl_p_author)

        self.txt_settings_author = QLineEdit()
        self.txt_settings_author.setText(self.config_data.get("default_author", "TFBAGAS"))
        self.txt_settings_author.setPlaceholderText("Enter your creator name (e.g. TFBAGAS)...")
        self.txt_settings_author.setStyleSheet(f"background-color: rgba(9, 16, 13, 0.9); border: 1px solid {C_BORDER}; border-radius: 8px; color: #ffffff; padding: 6px; font-size: 11px;")
        cp_layout.addWidget(self.txt_settings_author)

        self.chk_auto_open = QCheckBox("Automatically open output folder after export finishes")
        self.chk_auto_open.setChecked(self.config_data.get("auto_open_folder", True))
        self.chk_auto_open.setStyleSheet(f"color: {C_TEXT}; font-size: 12px;")
        cp_layout.addWidget(self.chk_auto_open)

        self.chk_unique_id = QCheckBox("Multi-Plugin Co-existence (Automatic unique package ID to prevent overwriting)")
        self.chk_unique_id.setChecked(self.config_data.get("unique_package_id", True))
        self.chk_unique_id.setStyleSheet(f"color: {C_TEXT}; font-size: 12px;")
        cp_layout.addWidget(self.chk_unique_id)

        layout.addWidget(card_pref)

        btn_save = QPushButton("Save Settings")
        btn_save.setIcon(get_icon("check", "#080D0B", "#080D0B", 16))
        btn_save.setFixedSize(150, 38)
        btn_save.setCursor(Qt.PointingHandCursor)
        btn_save.setStyleSheet(f"""
            QPushButton {{
                background-color: {C_ACCENT};
                color: #080D0B;
                font-weight: bold;
                font-size: 12px;
                border: none;
                border-radius: 10px;
            }}
            QPushButton:hover {{
                background-color: {C_HOVER};
            }}
        """)
        btn_save.clicked.connect(self._save_settings_action)
        layout.addWidget(btn_save)

        layout.addStretch()
        return container

    # =========================================================
    # TAB 3: ABOUT PAGE (Credit by TFBAGAS)
    # =========================================================
    def _create_about_page(self):
        container = QWidget()
        container.setStyleSheet("background: transparent;")
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 4, 0, 0)
        layout.setSpacing(16)

        card_hero = GlassCard(corner_radius=16)
        ch_layout = QVBoxLayout(card_hero)
        ch_layout.setContentsMargins(24, 22, 24, 22)
        ch_layout.setSpacing(14)

        top_row = QHBoxLayout()
        if os.path.exists(LOGO_PATH):
            logo_hero = QLabel()
            logo_hero.setPixmap(QPixmap(LOGO_PATH).scaled(64, 64, Qt.KeepAspectRatio, Qt.SmoothTransformation))
            top_row.addWidget(logo_hero)
            top_row.addSpacing(16)

        title_info = QVBoxLayout()
        title_info.setSpacing(3)
        
        lbl_h_title = QLabel("Color Match Tool for Keyflow")
        lbl_h_title.setStyleSheet("font-size: 20px; font-weight: bold; color: #ffffff; background: transparent;")
        title_info.addWidget(lbl_h_title)

        lbl_h_sub = QLabel("Color Matching & Look Extraction Engine for Keyflow Mobile")
        lbl_h_sub.setStyleSheet(f"font-size: 11px; color: {C_MUTED}; background: transparent;")
        title_info.addWidget(lbl_h_sub)

        lbl_h_engine = QLabel("Target Engine: Keyflow Mobile 1.5.x+ (OpenGL ES Pipeline)")
        lbl_h_engine.setStyleSheet(f"font-size: 11px; font-style: italic; color: {C_ACCENT}; background: transparent;")
        title_info.addWidget(lbl_h_engine)

        top_row.addLayout(title_info)
        top_row.addStretch()
        ch_layout.addLayout(top_row)

        # PROMINENT CREDIT CARD
        credit_box = QFrame()
        credit_box.setStyleSheet(f"background-color: rgba(10, 20, 15, 0.85); border: 1px solid rgba(0, 233, 135, 0.3); border-radius: 10px;")
        cb_layout = QVBoxLayout(credit_box)
        cb_layout.setContentsMargins(18, 14, 18, 14)
        cb_layout.setSpacing(4)

        lbl_star = QLabel("CREDIT & DEVELOPMENT")
        lbl_star.setStyleSheet(f"font-size: 11px; font-weight: bold; color: {C_ACCENT}; background: transparent;")
        cb_layout.addWidget(lbl_star)

        lbl_author = QLabel("Created & Developed by: TFBAGAS")
        lbl_author.setStyleSheet("font-size: 15px; font-weight: bold; color: #ffffff; background: transparent;")
        cb_layout.addWidget(lbl_author)

        lbl_tech = QLabel("Reverse-engineered from Keyflow DEX runtime bytecode & mobile GLSL engine.")
        lbl_tech.setStyleSheet(f"font-size: 11px; color: {C_MUTED}; background: transparent;")
        cb_layout.addWidget(lbl_tech)

        ch_layout.addWidget(credit_box)
        layout.addWidget(card_hero)

        # Specifications Card
        card_specs = GlassCard(corner_radius=16)
        cs_layout = QVBoxLayout(card_specs)
        cs_layout.setContentsMargins(24, 20, 24, 20)
        cs_layout.setSpacing(8)

        lbl_f_title = QLabel("Engine Capabilities & Specifications:")
        lbl_f_title.setStyleSheet("font-size: 13px; font-weight: bold; color: #ffffff; background: transparent;")
        cs_layout.addWidget(lbl_f_title)

        specs = [
            "• Non-blocking Multithreading: Heavy image decoding, analysis, and simulation run on QThread workers.",
            "• Rec. 709 Tonal Extraction: Exposure EV, Contrast S-Curve with dynamic Pivot control.",
            "• 3-Way Color Wheels: Lift (Shadows), Gamma (Midtones), Gain (Highlights) split-toning.",
            "• Planckian White Balance: Color Temperature Kelvin & Green/Magenta Tint correction.",
            "• 100% Mobile Safe: Premultiplied Alpha compliant, zero dynamic loops, Mali/Adreno safe.",
            "• Multi-Plugin Co-existence: Generates unique package IDs so presets coexist side-by-side.",
            "• Target App: Keyflow Mobile (Package: com.angkin.keyflow, Format: .kfplug v1)."
        ]

        for sp in specs:
            lbl_sp = QLabel(sp)
            lbl_sp.setStyleSheet(f"font-size: 11px; color: {C_TEXT}; background: transparent;")
            cs_layout.addWidget(lbl_sp)

        layout.addWidget(card_specs)
        layout.addStretch()
        return container

    # =========================================================
    # LOGIC, SLOTS & EVENT HANDLERS
    # =========================================================
    def switch_tab(self, index):
        self.pages.setCurrentIndex(index)
        self.btn_nav_home.setStyleSheet(self._get_nav_btn_style(index == 0))
        self.btn_nav_settings.setStyleSheet(self._get_nav_btn_style(index == 1))
        self.btn_nav_about.setStyleSheet(self._get_nav_btn_style(index == 2))

    def _set_ui_busy(self, is_busy, status_message="Processing..."):
        """Manage UI responsiveness during background worker execution."""
        if is_busy:
            self.status_pill.setText(status_message)
            self.status_pill.setStyleSheet(f"""
                QLabel {{
                    background-color: rgba(22, 45, 34, 0.95);
                    color: {C_HOVER};
                    border: 1px solid {C_ACCENT};
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: bold;
                    padding: 4px 14px;
                }}
            """)
            self.card_ref.set_controls_enabled(False)
            self.card_target.set_controls_enabled(False)
            self.btn_export.setEnabled(False)
            self.btn_reset_all.setEnabled(False)
        else:
            self.status_pill.setText("Ready")
            self.status_pill.setStyleSheet(f"""
                QLabel {{
                    background-color: rgba(14, 28, 22, 0.85);
                    color: {C_ACCENT};
                    border: 1px solid rgba(0, 233, 135, 0.35);
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: bold;
                    padding: 4px 14px;
                }}
            """)
            self.card_ref.set_controls_enabled(True)
            self.card_target.set_controls_enabled(True)
            self.btn_reset_all.setEnabled(True)
            if self.ref_image_path:
                self.btn_export.setEnabled(True)

    def _on_ref_image_selected(self, path):
        """Trigger background worker for Reference Image."""
        if self.active_worker and self.active_worker.isRunning():
            return # Prevent concurrent duplicate tasks

        self.ref_image_path = path
        self.card_ref.set_status_text("Analyzing...", is_accent=True)
        self._set_ui_busy(True, "Reading image...")

        self.active_worker = ColorMatchWorker("reference", path, current_params=self.current_params)
        self.active_worker.stage_changed.connect(self._on_worker_stage)
        self.active_worker.match_finished.connect(self._on_worker_finished)
        self.active_worker.match_error.connect(self._on_worker_error)
        self.active_worker.start()

    def _on_target_image_selected(self, path):
        """Trigger background worker for Target Image."""
        if self.active_worker and self.active_worker.isRunning():
            return

        self.target_image_path = path
        self.card_target.set_status_text("Loading...", is_accent=True)
        self._set_ui_busy(True, "Reading image...")

        self.active_worker = ColorMatchWorker("target", path, current_params=self.current_params)
        self.active_worker.stage_changed.connect(self._on_worker_stage)
        self.active_worker.match_finished.connect(self._on_worker_finished)
        self.active_worker.match_error.connect(self._on_worker_error)
        self.active_worker.start()

    @Slot(str)
    def _on_worker_stage(self, stage_text):
        """Update live status message without blocking GUI."""
        self.status_pill.setText(stage_text)

    @Slot(dict)
    def _on_worker_finished(self, result):
        """Safely receive computed data from background thread."""
        mode = result.get("mode")
        file_path = result.get("file_path")
        meta = result.get("meta", {})
        preview_pil = result.get("preview_pil")
        thumb_pil = result.get("thumb_pil")
        detected_params = result.get("detected_params")
        graded_preview_pil = result.get("graded_preview_pil")

        if mode == "reference":
            self.ref_image_path = file_path
            self.ref_preview_pil = preview_pil
            self.card_ref.display_loaded_image(meta, thumb_pil)

            if detected_params:
                self.auto_detected_params = detected_params.copy()
                self.current_params = detected_params.copy()

                for k, val in detected_params.items():
                    if k in self.controls:
                        self.controls[k].set_auto_value(val)

                self.swatch_shadow.update_color_display(detected_params['liftR'], detected_params['liftG'], detected_params['liftB'])
                self.swatch_mid.update_color_display(detected_params['gammaR'], detected_params['gammaG'], detected_params['gammaB'])
                self.swatch_high.update_color_display(detected_params['gainR'], detected_params['gainG'], detected_params['gainB'])

                base_name = os.path.splitext(os.path.basename(file_path))[0]
                clean_name = base_name.replace("_", " ").replace("-", " ").title()[:24]
                self.txt_export_name.setText(clean_name)
                self.txt_export_desc.setText(f"Grading preset matched from reference '{clean_name}'.")

            # Update preview comparison
            active_src = self.target_preview_pil if self.target_preview_pil else preview_pil
            active_graded = simulate_grade(active_src, self.current_params)
            self.split_widget.set_images(active_src, active_graded)

        elif mode == "target":
            self.target_image_path = file_path
            self.target_preview_pil = preview_pil
            self.card_target.display_loaded_image(meta, thumb_pil)
            self.split_widget.set_images(preview_pil, graded_preview_pil)

        self._set_ui_busy(False)
        self.active_worker = None

    @Slot(str)
    def _on_worker_error(self, err_msg):
        """Handle worker failure safely without crashing or freezing."""
        self._set_ui_busy(False)
        self.active_worker = None
        QMessageBox.critical(self, "Processing Error", f"An error occurred while analyzing the image:\n{err_msg}")

    def _on_ref_image_removed(self):
        self.ref_image_path = None
        self.ref_preview_pil = None
        self.btn_export.setEnabled(False)
        self._refresh_active_preview()

    def _on_target_image_removed(self):
        self.target_image_path = None
        self.target_preview_pil = None
        self._refresh_active_preview()

    def _on_param_slider_changed(self, key, val):
        """Live parameter adjustment debounced to keep 60 FPS fluidity."""
        self.current_params[key] = val
        self.preview_timer.start(35) # 35 ms debounce

    def _on_swatch_color_picked(self, prefix, r, g, b):
        if prefix == "lift":
            self.current_params['liftR'] = r
            self.current_params['liftG'] = g
            self.current_params['liftB'] = b
        elif prefix == "gamma":
            self.current_params['gammaR'] = r
            self.current_params['gammaG'] = g
            self.current_params['gammaB'] = b
        elif prefix == "gain":
            self.current_params['gainR'] = r
            self.current_params['gainG'] = g
            self.current_params['gainB'] = b
        self.preview_timer.start(35)

    def reset_all_parameters(self):
        for k, v in self.auto_detected_params.items():
            if k in self.controls:
                self.controls[k].reset_to_auto()
        self.swatch_shadow.update_color_display(self.auto_detected_params['liftR'], self.auto_detected_params['liftG'], self.auto_detected_params['liftB'])
        self.swatch_mid.update_color_display(self.auto_detected_params['gammaR'], self.auto_detected_params['gammaG'], self.auto_detected_params['gammaB'])
        self.swatch_high.update_color_display(self.auto_detected_params['gainR'], self.auto_detected_params['gainG'], self.auto_detected_params['gainB'])
        self.current_params = self.auto_detected_params.copy()
        self._refresh_active_preview()

    def _refresh_active_preview(self):
        self.preview_timer.start(10)

    @Slot()
    def _apply_debounced_preview(self):
        """Compute visual simulation on cached preview image (~10ms CPU runtime)."""
        preview_src = self.target_preview_pil if self.target_preview_pil else self.ref_preview_pil
        if preview_src:
            try:
                graded_pil = simulate_grade(preview_src, self.current_params)
                self.split_widget.set_images(preview_src, graded_pil)
            except Exception as e:
                print("Preview simulation error:", e)
        else:
            self.split_widget.set_images(None, None)

    def _toggle_preview_mode(self):
        if self.split_widget.view_mode == "split":
            self.split_widget.view_mode = "side"
            self.btn_view_mode.setText("Side by Side ▾")
        else:
            self.split_widget.view_mode = "split"
            self.btn_view_mode.setText("Split Slider ▾")
        self.split_widget.update()

    def _on_preset_name_changed(self, text):
        clean_name = text.strip() or "Custom Look"
        cur_desc = self.txt_export_desc.text().strip()
        # Auto-update description if empty or following default pattern
        if not cur_desc or cur_desc.startswith("Grading preset matched from reference"):
            self.txt_export_desc.setText(f"Grading preset matched from reference '{clean_name}'.")

    def export_kfplug_action(self):
        if not self.ref_image_path:
            QMessageBox.warning(self, "Warning", "Please select a reference image first!")
            return

        preset_name = self.txt_export_name.text().strip() or "Custom Grade"
        preset_author = self.txt_export_author.text().strip() or self.config_data.get("default_author", "TFBAGAS")
        preset_desc = self.txt_export_desc.text().strip() or f"Grading preset matched from reference '{preset_name}'."

        safe_name = "".join(c for c in preset_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(" ", "_")
        clean_file_name = f"Match_Grade_{safe_name}.kfplug"

        out_dir = self.config_data.get("output_dir", os.path.join(PROJECT_DIR, "output"))
        os.makedirs(out_dir, exist_ok=True)

        save_path, _ = QFileDialog.getSaveFileName(
            self, "Export to .kfplug", os.path.join(out_dir, clean_file_name),
            "Keyflow Plugin (*.kfplug)"
        )
        if not save_path:
            return

        try:
            QApplication.processEvents()

            saved_file, size_kb, disp_name = package_kfplug(
                self.current_params,
                save_path,
                preset_name=preset_name,
                author=preset_author,
                description=preset_desc
            )

            if self.config_data.get("auto_open_folder", True):
                folder = os.path.dirname(os.path.abspath(saved_file))
                try:
                    os.startfile(folder)
                except Exception:
                    pass

            msg = QMessageBox(self)
            msg.setWindowTitle("Export Successful! ⚡")
            msg.setText(
                f"Keyflow plugin successfully created:\n\n"
                f"• Effect Name: {disp_name}\n"
                f"• Author / Made By: {preset_author}\n"
                f"• Description: {preset_desc}\n"
                f"• File: {os.path.basename(saved_file)}\n"
                f"• Size: {size_kb:.2f} KB\n"
                f"• Status: Ready to install in Keyflow without overwriting other plugins!"
            )
            msg.setIcon(QMessageBox.Information)
            msg.exec()
        except Exception as e:
            QMessageBox.critical(self, "Export Failed", f"Failed to export plugin:\n{e}")

    def _browse_dir_action(self):
        cur = self.txt_out_dir.text().strip()
        folder = QFileDialog.getExistingDirectory(self, "Select Output Folder", cur or PROJECT_DIR)
        if folder:
            self.txt_out_dir.setText(folder)

    def _open_folder_action(self):
        folder = self.txt_out_dir.text().strip() or os.path.join(PROJECT_DIR, "output")
        os.makedirs(folder, exist_ok=True)
        try:
            os.startfile(folder)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Cannot open folder:\n{e}")

    def _save_settings_action(self):
        new_dir = self.txt_out_dir.text().strip() or os.path.join(PROJECT_DIR, "output")
        os.makedirs(new_dir, exist_ok=True)
        self.config_data["output_dir"] = new_dir
        self.config_data["auto_open_folder"] = self.chk_auto_open.isChecked()
        self.config_data["unique_package_id"] = self.chk_unique_id.isChecked()
        
        # Save default author
        new_author = self.txt_settings_author.text().strip() or "TFBAGAS"
        self.config_data["default_author"] = new_author
        self.txt_export_author.setText(new_author)

        save_config(self.config_data)
        QMessageBox.information(self, "Success", "Settings saved successfully!")

def main():
    app = QApplication(sys.argv)
    window = MatchGradingApp()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
