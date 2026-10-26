# 🎞️ LightCraft for Android

[![Build LightCraft Android APK](https://github.com/MasAim24/lightcraft-android/actions/workflows/build-apk.yml/badge.svg)](https://github.com/MasAim24/lightcraft-android/actions/workflows/build-apk.yml)
[![Latest Release](https://img.shields.io/github/v/release/MasAim24/lightcraft-android?label=Release&color=blue)](https://github.com/MasAim24/lightcraft-android/releases/latest)
[![LightCraft Version](https://img.shields.io/badge/LightCraft-v0.14.0-amber)](https://github.com/storytold/lightcraft)
[![Platform](https://img.shields.io/badge/Platform-Android%20(Capacitor%207)-3DDC84?logo=android&logoColor=white)](https://capacitorjs.com/)

**LightCraft for Android** packages [**LightCraft**](https://github.com/storytold/lightcraft) — a fast, offline-first, non-destructive RAW & photo editor (Adobe Lightroom-style) written from scratch in pure **Rust (`egui` + WebGL2 + WebAssembly)** — into a native Android APK powered by **Capacitor 7** and a custom **Native Android Java Bridge**.

---

## 📥 Download APK

| Release | Version | Direct Download |
| :--- | :--- | :--- |
| **LightCraft Android APK** | `v0.14.0-android` | [**⬇️ Download LightCraft-v0.14.0.apk**](https://github.com/MasAim24/lightcraft-android/releases/download/v0.14.0-android/LightCraft-v0.14.0.apk) |

> **Installation Note:** Download the `.apk` file on your Android phone or tablet and allow installation from your browser or file manager when prompted. Works 100% offline once installed.

---

## ✨ Key Android Features & Enhancements

### 1. 💾 Native Photo Export, Library Backup, "Save As", & Share (`LightCraftNativeBridge`)
- **Auto-Save to Downloads:** Exporting edited photos (`.jpg`, `.png`, `.webp`, `.avif`, `.tiff`, `.dng`), printing contact sheets to `.pdf`, or running **File ▸ Back Up Library…** (`.zip`) automatically saves the file directly to `/sdcard/Download/LightCraft/` via Android's `MediaStore` API.
- **Interactive Floating Action Bar:** Every exported photo or backup triggers an on-screen action toast with:
  - **📁 Pilih Folder (Save As):** Opens the native Android system folder/file picker (`Intent.ACTION_CREATE_DOCUMENT`) to save anywhere on internal storage, SD card, or cloud storage.
  - **📤 Bagikan / Buka:** Opens the native Android Share sheet (`FileProvider` + `Intent.ACTION_SEND`) to share directly to Instagram, WhatsApp, Telegram, Google Photos, or another image viewer.

### 2. 📸 Unrestricted RAW & Photo Import on Android WebView
- Android's `ACTION_GET_CONTENT` file picker normally grays out camera RAW files (`.dng`, `.cr2`, `.nef`, `.arw`, `.raf`, `.orf`, `.rw2`) and `.zip` backups when an HTML `<input type="file" accept=".jpg,.dng,...">` uses dot-extensions.
- The injected mobile bridge automatically normalizes file input attributes so **Import Photos** and **File ▸ Restore Library from Backup…** work across all Android gallery and file manager apps.

### 3. 🔍 Live High-DPI UI Scaling & Top Safe Margin
- **Live DPI Calibration (`60%` / `75%` / `85%` / `100%`):** Dynamically overrides `window.devicePixelRatio` so LightCraft's Catalog, Histogram, Tone Curve, Color Grading panels, and Filmstrip fit comfortably on high-DPI phone and tablet screens without requiring a page reload.
- **Top Safe Bar (`0px` / `28px` / `42px`):** Adjustable top safe margin so top menu items (**File**, **Edit**, **Photo**, **View**, **Help**) are never blocked by camera cutouts or Android system swipe bars.
- **Immersive Fullscreen Mode:** Automatically hides Android status and navigation bars (`WindowInsetsController` / `SYSTEM_UI_FLAG_IMMERSIVE_STICKY`).

### 4. 📋 Native Android Clipboard Bridge
- Bridges `navigator.clipboard.writeText` and `navigator.clipboard.readText` directly to Android's native `ClipboardManager`.

---

## 🏗️ Architecture & Project Structure

```text
lightcraft-android/
├── .github/workflows/
│   └── build-apk.yml          # GitHub Actions CI/CD (Node 22 + Java 21 + Android SDK)
├── scripts/
│   ├── prepare-dist.mjs       # Downloads LightCraft WASM release, strips redundant .br/.gz, injects Mobile Bridge
│   └── setup-android.mjs      # Patches AndroidManifest.xml & generates MainActivity.java with @JavascriptInterface
├── capacitor.config.json      # Capacitor 7 Android configuration (com.storytold.lightcraft)
└── package.json               # Build scripts and Capacitor dependencies
```

---

## 🛠️ Building Locally or via GitHub Actions

### Option A: GitHub Actions (Recommended)
1. Go to the [**Actions**](https://github.com/MasAim24/lightcraft-android/actions/workflows/build-apk.yml) tab.
2. Select **Build LightCraft Android APK** and click **Run workflow**.
3. Download the compiled `LightCraft-Android-APK` artifact once the workflow completes.

### Option B: Local Build
**Prerequisites:** Node.js 22+, `pnpm`, Java 21 JDK, and Android SDK (`ANDROID_HOME`).

```bash
pnpm install
pnpm build
npx @capacitor/cli add android
npx @capacitor/cli sync android
pnpm run setup:android
cd android && ./gradlew assembleDebug
```

---

## 🙏 Credits & Upstream

- **LightCraft Core Engine:** Created by [**Storytold (`storytold/lightcraft`)**](https://github.com/storytold/lightcraft) — built in Rust with `egui` and compiled to WebAssembly.
- **Android Packaging & Native Bridge:** Maintained by [@MasAim24](https://github.com/MasAim24).
