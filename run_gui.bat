@echo off
title Color Match Tool for Keyflow
cd /d "%~dp0"

:: Check PySide6 dependency
python -c "import PySide6" 2>nul
if errorlevel 1 (
    echo [INFO] Installing PySide6 dependency for modern Liquid Glass interface...
    pip install PySide6
)

python tools\app_qt.py
if errorlevel 1 (
    echo.
    echo An error occurred while running Color Match Tool for Keyflow.
    pause
)
