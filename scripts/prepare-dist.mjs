import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const VERSION = process.env.LIGHTCRAFT_VERSION || '0.14.0';
const RELEASE_URL = `https://github.com/storytold/lightcraft/releases/download/v${VERSION}/lightcraft-web-${VERSION}.zip`;

function hasWasm(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((f) => f.endsWith('.wasm'));
}

// 1. Download & extract official LightCraft WebAssembly bundle if not present
if (!hasWasm(DIST)) {
  console.log(`⬇️ Downloading LightCraft Web v${VERSION} from ${RELEASE_URL}...`);
  const zipPath = path.join(ROOT, 'lightcraft-web.zip');
  execSync(`curl -fSL -o "${zipPath}" "${RELEASE_URL}"`, { stdio: 'inherit' });
  const tmpExtract = path.join(ROOT, '.tmp_extract');
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  fs.mkdirSync(tmpExtract, { recursive: true });
  execSync(`unzip -q "${zipPath}" -d "${tmpExtract}"`, { stdio: 'inherit' });
  fs.rmSync(zipPath, { force: true });

  const entries = fs.readdirSync(tmpExtract);
  const innerDir = entries.length === 1 && fs.statSync(path.join(tmpExtract, entries[0])).isDirectory()
    ? path.join(tmpExtract, entries[0])
    : tmpExtract;

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.renameSync(innerDir, DIST);
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  console.log('✅ Extracted LightCraft Web bundle to dist/');
} else {
  console.log('✅ LightCraft Web WASM bundle already exists in dist/');
}

// 2. Remove redundant pre-compressed static server files (*.br, *.gz) to save ~45 MB in APK size
for (const file of fs.readdirSync(DIST)) {
  if (file.endsWith('.br') || file.endsWith('.gz')) {
    fs.rmSync(path.join(DIST, file), { force: true });
  }
}
console.log('🧹 Cleaned redundant .br and .gz precompressed archives from dist/');

// 3. Write LightCraft Android Mobile Bridge
const mobileBridgeCode = `/**
 * LightCraft Android Mobile Bridge
 * Connects LightCraft WebAssembly (egui + WebGL2 + Web Workers) to Native Android (window.LightCraftAndroid):
 * 1. Export Photo / Print to PDF / Back Up Library (.zip) -> Native MediaStore Downloads/LightCraft + Save As + Share
 * 2. Import Photos / RAW (.dng, .cr2, .nef, .arw, etc.) & Restore Library (.zip) -> Fixes Android WebView file picker
 * 3. Live DPI / UI Scaling override via window.devicePixelRatio so panels fit comfortably on mobile screens
 * 4. Top Safe Bar offset so top menu (File, Edit, Photo, View, Help) is never blocked by camera cutouts
 * 5. Quick Import button + Keyboard trigger + Native Android Clipboard integration
 */
(function () {
  if (window.__lightcraftMobileBridgeLoaded) return;
  window.__lightcraftMobileBridgeLoaded = true;

  const TOP_OFFSET_KEY = 'lightcraft.android.topOffset';
  const REL_SCALE_KEY = 'lightcraft.android.relScale';
  const nativeDpr = Math.max(1, window.devicePixelRatio || 1);

  function getSavedRelScale() {
    const v = parseInt(localStorage.getItem(REL_SCALE_KEY) || '75', 10);
    return [60, 75, 85, 100].includes(v) ? v : 75;
  }

  // Override window.devicePixelRatio so eframe/egui scales panels comfortably on high-DPI phones
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: function () {
        const pct = getSavedRelScale();
        return Math.max(1, +(nativeDpr * (pct / 100)).toFixed(2));
      }
    });
  } catch (_) {}

  // Convert Uint8Array to Base64 string safely in chunks
  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }

  function guessMime(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      dng: 'image/x-adobe-dng',
      pdf: 'application/pdf',
      zip: 'application/zip',
      json: 'application/json',
      xmp: 'application/rdf+xml',
      cube: 'text/plain'
    };
    return map[ext] || 'application/octet-stream';
  }

  // Central handler for exported photos, contact sheet PDFs, and library backup ZIPs
  function handleNativeFileSave(filename, bytes, mime) {
    const safeName = filename || 'LightCraft-Export.jpg';
    const safeMime = mime || guessMime(safeName);
    const b64 = uint8ToBase64(bytes);

    // 1. Immediately save to /sdcard/Download/LightCraft/<safeName> via Native Java Bridge
    if (window.LightCraftAndroid && typeof window.LightCraftAndroid.saveToDownloads === 'function') {
      try {
        window.LightCraftAndroid.saveToDownloads(b64, safeName, safeMime);
      } catch (e) {
        console.error('Native saveToDownloads error:', e);
      }
    }

    // 2. Show floating action toast for "Save As (Pilih Folder)" and "Bagikan / Buka"
    showSaveActionToast(safeName, b64, bytes, safeMime);
  }

  function showSaveActionToast(filename, b64, bytes, mime) {
    let old = document.getElementById('lc-mobile-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'lc-mobile-toast';
    toast.style.cssText = [
      'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:99999;',
      'background:#0f172a;color:#f8fafc;padding:12px 14px;border-radius:14px;',
      'box-shadow:0 12px 28px rgba(0,0,0,0.5);font:13px/1.4 system-ui,sans-serif;',
      'display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:94vw;',
      'border:1px solid rgba(255,255,255,0.18);'
    ].join('');

    const sizeKb = Math.max(1, Math.round(bytes.byteLength / 1024));
    const sizeText = sizeKb >= 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB';

    const label = document.createElement('div');
    label.textContent = '✅ Tersimpan: Download/LightCraft/' + filename + ' (' + sizeText + ')';
    label.style.cssText = 'width:100%;font-weight:600;color:#4ade80;margin-bottom:2px;word-break:break-all;';
    toast.appendChild(label);

    const pickerBtn = document.createElement('button');
    pickerBtn.textContent = '📁 Pilih Folder (Save As)';
    pickerBtn.style.cssText = [
      'background:#2563eb;color:#fff;border:none;border-radius:8px;padding:7px 12px;',
      'font:600 12px system-ui,sans-serif;cursor:pointer;'
    ].join('');
    pickerBtn.onclick = () => {
      if (window.LightCraftAndroid && typeof window.LightCraftAndroid.saveWithSystemPicker === 'function') {
        window.LightCraftAndroid.saveWithSystemPicker(b64, filename, mime);
      }
    };
    toast.appendChild(pickerBtn);

    const shareBtn = document.createElement('button');
    shareBtn.textContent = '📤 Bagikan / Buka';
    shareBtn.style.cssText = [
      'background:#059669;color:#fff;border:none;border-radius:8px;padding:7px 12px;',
      'font:600 12px system-ui,sans-serif;cursor:pointer;'
    ].join('');
    shareBtn.onclick = () => {
      if (window.LightCraftAndroid && typeof window.LightCraftAndroid.shareFile === 'function') {
        window.LightCraftAndroid.shareFile(b64, filename, mime);
      }
    };
    toast.appendChild(shareBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Tutup';
    closeBtn.style.cssText = [
      'background:rgba(255,255,255,0.1);color:#cbd5e1;border:none;border-radius:8px;',
      'padding:7px 10px;font:600 12px system-ui,sans-serif;cursor:pointer;margin-left:auto;'
    ].join('');
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 20000);
  }

  // A. Override window.showSaveFilePicker if invoked
  window.showSaveFilePicker = async function (opts) {
    const suggested = (opts && opts.suggestedName) ? opts.suggestedName : 'LightCraft-Export.jpg';
    const chunks = [];
    return {
      name: suggested,
      async createWritable() {
        return {
          async write(data) {
            if (data instanceof Uint8Array) {
              chunks.push(new Uint8Array(data));
            } else if (ArrayBuffer.isView(data)) {
              chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            } else if (data instanceof ArrayBuffer) {
              chunks.push(new Uint8Array(data));
            } else if (data instanceof Blob) {
              const ab = await data.arrayBuffer();
              chunks.push(new Uint8Array(ab));
            }
          },
          async close() {
            const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.byteLength;
            }
            handleNativeFileSave(suggested, merged, guessMime(suggested));
          }
        };
      }
    };
  };

  // B. Intercept <input type="file"> and <a download="..."> clicks
  const origElementClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    // 1. Fix Android WebView <input type="file" accept="..."> greying out RAW files (.dng, .cr2, .nef, .arw) or .zip backups
    if (this.tagName === 'INPUT' && this.type === 'file') {
      const accept = (this.getAttribute('accept') || '').toLowerCase();
      if (accept.includes('.')) {
        // Removing restrictive dot-extension filters allows picking both standard images and RAW camera files / ZIP backups on Android
        this.removeAttribute('accept');
      }
    }

    // 2. Intercept <a href="blob:..." download="filename"> exports (Photos, PDFs, Library Backups)
    if (this.tagName === 'A' && this.hasAttribute('download') && this.href && this.href.startsWith('blob:')) {
      const dlName = this.getAttribute('download') || 'LightCraft-Export.jpg';
      const blobUrl = this.href;
      fetch(blobUrl)
        .then((r) => r.arrayBuffer())
        .then((ab) => {
          handleNativeFileSave(dlName, new Uint8Array(ab), guessMime(dlName));
        })
        .catch((err) => console.error('Blob download intercept failed:', err));
      return;
    }

    return origElementClick.apply(this, arguments);
  };

  // C. Bridge navigator.clipboard to Native Android ClipboardManager
  try {
    if (navigator.clipboard) {
      const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async function (text) {
        if (window.LightCraftAndroid && typeof window.LightCraftAndroid.copyText === 'function') {
          window.LightCraftAndroid.copyText(String(text || ''));
        }
        return origWriteText(text).catch(() => {});
      };
      const origReadText = navigator.clipboard.readText.bind(navigator.clipboard);
      navigator.clipboard.readText = async function () {
        if (window.LightCraftAndroid && typeof window.LightCraftAndroid.pasteText === 'function') {
          const nativeText = window.LightCraftAndroid.pasteText();
          if (nativeText) return nativeText;
        }
        return origReadText().catch(() => '');
      };
    }
  } catch (_) {}

  function getTopOffset() {
    const val = localStorage.getItem(TOP_OFFSET_KEY);
    return val === null ? 28 : (parseInt(val, 10) || 0);
  }

  function applyTopOffset(px) {
    const canvas = document.getElementById('lightcraft_canvas');
    if (!canvas) return;
    let banner = document.getElementById('lc-top-safe-bar');
    if (px > 0) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'lc-top-safe-bar';
        banner.style.cssText = [
          'position:fixed;top:0;left:0;right:0;z-index:99990;',
          'background:#141414;border-bottom:1px solid #262626;',
          'display:flex;align-items:center;justify-content:center;',
          'color:#737373;font:600 10px system-ui,sans-serif;user-select:none;'
        ].join('');
        document.body.appendChild(banner);
      }
      banner.style.height = px + 'px';
      banner.style.display = 'flex';
      canvas.style.top = px + 'px';
      canvas.style.height = 'calc(100% - ' + px + 'px)';
    } else {
      if (banner) banner.style.display = 'none';
      canvas.style.top = '0px';
      canvas.style.height = '100%';
    }
    window.dispatchEvent(new Event('resize'));
  }

  window.addEventListener('DOMContentLoaded', () => {
    applyTopOffset(getTopOffset());

    const bar = document.createElement('div');
    bar.id = 'lc-mobile-pill';
    bar.style.cssText = [
      'position:fixed;right:10px;bottom:34px;z-index:99998;',
      'display:flex;align-items:center;gap:5px;background:rgba(15,23,42,0.88);',
      'backdrop-filter:blur(8px);padding:5px 8px;border-radius:999px;',
      'border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 14px rgba(0,0,0,0.4);',
      'font:600 11px system-ui,sans-serif;color:#f8fafc;user-select:none;'
    ].join('');

    const btnStyle = [
      'background:rgba(255,255,255,0.13);color:#f8fafc;border:none;border-radius:999px;',
      'padding:5px 9px;font:600 11px system-ui,sans-serif;cursor:pointer;'
    ].join('');

    // Quick keyboard trigger button
    const kbBtn = document.createElement('button');
    kbBtn.textContent = '⌨️ Ketik';
    kbBtn.style.cssText = btnStyle;
    kbBtn.onclick = (e) => {
      e.stopPropagation();
      const input = document.getElementById('egui_text_agent') || document.querySelector('input:not([type=file]), textarea');
      if (input) {
        input.focus();
        input.click();
      } else {
        const canvas = document.getElementById('lightcraft_canvas');
        if (canvas) canvas.focus();
      }
    };

    // Live UI Scale button (60%, 75%, 85%, 100%)
    const scaleBtn = document.createElement('button');
    const scales = [60, 75, 85, 100];
    scaleBtn.textContent = '🔍 ' + getSavedRelScale() + '%';
    scaleBtn.style.cssText = btnStyle;
    scaleBtn.onclick = (e) => {
      e.stopPropagation();
      const cur = getSavedRelScale();
      const next = scales[(scales.indexOf(cur) + 1) % scales.length] || 75;
      localStorage.setItem(REL_SCALE_KEY, String(next));
      scaleBtn.textContent = '🔍 ' + next + '%';
      window.dispatchEvent(new Event('resize'));
    };

    // Top Safe Bar offset button (0px, 28px, 42px)
    const topBtn = document.createElement('button');
    const offsets = [0, 28, 42];
    function updateTopBtnLabel() {
      const cur = getTopOffset();
      topBtn.textContent = cur === 0 ? '⬆️ Penuh' : ('⬇️ Atas ' + cur + 'px');
    }
    updateTopBtnLabel();
    topBtn.style.cssText = btnStyle;
    topBtn.onclick = (e) => {
      e.stopPropagation();
      const cur = getTopOffset();
      const next = offsets[(offsets.indexOf(cur) + 1) % offsets.length];
      localStorage.setItem(TOP_OFFSET_KEY, String(next));
      applyTopOffset(next);
      updateTopBtnLabel();
    };

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '‹';
    toggleBtn.style.cssText = 'background:transparent;color:#94a3b8;border:none;padding:2px 5px;font-size:13px;cursor:pointer;';
    let collapsed = false;
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      kbBtn.style.display = collapsed ? 'none' : '';
      scaleBtn.style.display = collapsed ? 'none' : '';
      topBtn.style.display = collapsed ? 'none' : '';
      toggleBtn.textContent = collapsed ? '⚙️' : '‹';
    };

    bar.appendChild(kbBtn);
    bar.appendChild(scaleBtn);
    bar.appendChild(topBtn);
    bar.appendChild(toggleBtn);
    document.body.appendChild(bar);
  });
})();
`;

fs.writeFileSync(path.join(DIST, 'mobile-bridge.js'), mobileBridgeCode, 'utf8');

// 4. Inject mobile-bridge.js into dist/index.html
const indexHtmlPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexHtmlPath, 'utf8');
if (!html.includes('mobile-bridge.js')) {
  html = html.replace('<head>', '<head>\n  <script src="./mobile-bridge.js"></script>');
}
fs.writeFileSync(indexHtmlPath, html, 'utf8');
console.log('✅ Updated dist/index.html with LightCraft Native Android Bridge');
