# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_data_files
import os

# Proje dizini
project_dir = os.path.abspath('.')

# Backend modüllerini otomatik bul
hiddenimports = collect_submodules('backend')
hiddenimports += ['flask', 'werkzeug', 'jinja2', 'PIL', 'google.generativeai', 'requests', 'lxml', 'lxml.etree']

a = Analysis(
    ['app.py'],
    pathex=[project_dir],
    binaries=[],
    datas=[
        ('templates', 'templates'),
        ('static', 'static'),
        ('.env', '.'),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Red Pather',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['RedPather.icns'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Red Pather',
)
app = BUNDLE(
    coll,
    name='Red Pather.app',
    icon='RedPather.icns',
    bundle_identifier='com.redpather.app',
)
