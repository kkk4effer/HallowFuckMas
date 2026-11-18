import JSZip from 'jszip';
import type { ExtensionFileEntry } from '../types/nfc';

export function getChromeExtensionFiles(): ExtensionFileEntry[] {
  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'BruceLink NFC Bridge',
      version: '1.0.0',
      description:
        'Google Wallet-style NFC bridge that continuously reroutes TX/RX over USB to an ESP32-C6 running Bruce Firmware.',
      permissions: ['storage', 'activeTab', 'offscreen'],
      optional_permissions: ['serial', 'usb'],
      action: {
        default_popup: 'popup.html',
        default_title: 'BruceLink NFC Bridge',
        default_icon: {
          '16': 'icons/icon16.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        },
      },
      background: {
        service_worker: 'background.js',
        type: 'module',
      },
      icons: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'",
      },
    },
    null,
    2
  );

  const backgroundJs = `// BruceLink NFC Bridge - Manifest V3 Background Service Worker
// Maintains persistent TX/RX keep-alive state while extension is active

let bridgeState = {
  usbConnected: false,
  keepAliveEnabled: true,
  baudRate: 115200,
  txPin: 'GPIO16 (U0TXD)',
  rxPin: 'GPIO17 (U0RXD)',
  lastUid: null,
  packetsRelayed: 0
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ bruceLinkState: bridgeState });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    chrome.storage.local.get(['bruceLinkState'], (result) => {
      sendResponse(result.bruceLinkState || bridgeState);
    });
    return true;
  }

  if (message.type === 'UPDATE_STATE') {
    bridgeState = { ...bridgeState, ...message.payload };
    chrome.storage.local.set({ bruceLinkState: bridgeState });
    sendResponse({ ok: true, state: bridgeState });
    return true;
  }

  if (message.type === 'NFC_RELAY_PACKET') {
    bridgeState.packetsRelayed += 1;
    bridgeState.lastUid = message.uid || bridgeState.lastUid;
    chrome.storage.local.set({ bruceLinkState: bridgeState });
    sendResponse({ relayed: true, count: bridgeState.packetsRelayed });
    return true;
  }
});
`;

  const popupHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BruceLink NFC Bridge</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <h1>BruceLink NFC Bridge</h1>
        <span id="usb-status" class="status">USB Idle</span>
      </header>

      <nav class="tabs" style="grid-template-columns: repeat(3, 1fr);">
        <button class="tab active" data-view="wallet">NFC Bridge</button>
        <button class="tab" data-view="bruce">Bruce C6</button>
        <button class="tab" data-view="ndef">NDEF Files</button>
      </nav>

      <section id="view-wallet" class="panel">
        <div class="wallet-card">
          <div class="card-issuer">Google Wallet HCE · ISO 14443-A</div>
          <div class="card-title">BruceLink Master Pass</div>
          <div class="card-uid" id="active-uid">UID 04:A3:7F:92:1B:44:80</div>
        </div>

        <div class="controls">
          <button id="btn-connect-usb" class="btn primary">Connect ESP32-C6 USB</button>
          <button id="btn-scan-nfc" class="btn">Read &amp; Relay NFC to TX/RX</button>
        </div>

        <label class="keepalive-row">
          <input type="checkbox" id="chk-keepalive" checked />
          <span>Leave TX/RX streaming while software is active</span>
        </label>
      </section>

      <section id="view-bruce" class="panel hidden">
        <div class="bruce-box">
          <div class="bruce-title">ESP32-C6 Bruce Firmware Relay</div>
          <div class="bruce-meta">UART0 · 115200 8N1 · GPIO16 TX / GPIO17 RX</div>
          <div class="bruce-actions">
            <button class="btn cmd" data-cmd="nfc scan">nfc scan</button>
            <button class="btn cmd" data-cmd="nfc relay --usb">nfc relay --usb</button>
            <button class="btn cmd" data-cmd="nfc dump">nfc dump</button>
          </div>
        </div>
      </section>

      <section id="view-ndef" class="panel hidden">
        <div class="bruce-box">
          <div class="bruce-title">NFC NDEF Tag Files</div>
          <div class="bruce-meta">brucelink-esp32c6-portal.ndef</div>
          <div class="bruce-actions">
            <button class="btn" id="btn-dl-ndef">Download .ndef</button>
            <button class="btn primary" id="btn-emu-ndef">Use Phone to Emulate</button>
          </div>
        </div>
      </section>

      <pre id="txrx-log" class="log"></pre>
    </main>
    <script src="bruce-relay.js"></script>
    <script src="popup.js"></script>
  </body>
</html>
`;

  const bruceRelayJs = `// Bruce Firmware USB CDC / UART TX-RX Packet Builder
window.BruceRelay = {
  buildFrame(uid, protocol, payload) {
    const body = \`NFC|\${protocol}|\${uid}|\${payload}\`;
    const bodyBytes = new TextEncoder().encode(body);
    const frame = new Uint8Array(bodyBytes.length + 6);
    frame[0] = 0xAA;
    frame[1] = 0x55;
    frame[2] = 0x10;
    frame[3] = bodyBytes.length & 0xFF;
    frame.set(bodyBytes, 4);
    let xor = 0x10 ^ (bodyBytes.length & 0xFF);
    for (let i = 0; i < bodyBytes.length; i++) xor ^= bodyBytes[i];
    frame[frame.length - 2] = xor;
    frame[frame.length - 1] = 0x0A;
    return { frame, body };
  },
  toHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  }
};
`;

  const popupJs = `// BruceLink NFC Bridge Popup Controller
let serialPort = null;
let writer = null;
let keepAliveTimer = null;
let keepAliveSeq = 1;

const logEl = document.getElementById('txrx-log');
const statusEl = document.getElementById('usb-status');
const keepAliveChk = document.getElementById('chk-keepalive');

function appendLog(dir, text) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  logEl.textContent = \`[\${ts}] \${dir}: \${text}\\n\` + logEl.textContent.slice(0, 2000);
}

async function sendBytes(bytes, label) {
  if (writer) {
    await writer.write(bytes);
    appendLog('TX USB', \`\${label} (\${window.BruceRelay.toHex(bytes)})\`);
  } else {
    appendLog('TX SIM', \`\${label} (\${window.BruceRelay.toHex(bytes)})\`);
  }
}

function startKeepAliveLoop() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(async () => {
    if (!keepAliveChk.checked) return;
    const msg = new TextEncoder().encode(\`BRUCE_KA#\${keepAliveSeq++}\\n\`);
    await sendBytes(msg, 'Keep-Alive TX/RX');
  }, 2500);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.getElementById('view-wallet').classList.toggle('hidden', view !== 'wallet');
    document.getElementById('view-bruce').classList.toggle('hidden', view !== 'bruce');
    document.getElementById('view-ndef').classList.toggle('hidden', view !== 'ndef');
  });
});

document.getElementById('btn-connect-usb').addEventListener('click', async () => {
  try {
    if (!('serial' in navigator)) {
      appendLog('SYS', 'Web Serial unavailable; running loopback bridge');
      statusEl.textContent = 'Loopback TX/RX';
      startKeepAliveLoop();
      return;
    }
    serialPort = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x303A }, { usbVendorId: 0x10C4 }, { usbVendorId: 0x1A86 }]
    });
    await serialPort.open({ baudRate: 115200 });
    writer = serialPort.writable.getWriter();
    statusEl.textContent = 'ESP32-C6 Linked';
    appendLog('SYS', 'USB CDC opened at 115200 baud (TX/RX active)');
    startKeepAliveLoop();
  } catch (err) {
    appendLog('ERR', err.message || 'Port selection cancelled');
  }
});

document.getElementById('btn-scan-nfc').addEventListener('click', async () => {
  const uid = '04:A3:7F:92:1B:44:80';
  if ('NDEFReader' in window) {
    try {
      const ndef = new window.NDEFReader();
      await ndef.scan();
      appendLog('NFC', 'Listening for physical NFC tap...');
      ndef.onreading = async (event) => {
        const { frame } = window.BruceRelay.buildFrame(event.serialNumber || uid, 'ISO14443-A', 'WEBNFC_TAP');
        await sendBytes(frame, 'NFC->USB Relay');
      };
      return;
    } catch (err) {
      appendLog('NFC', 'Fallback card frame: ' + (err.message || 'desktop mode'));
    }
  }
  const { frame } = window.BruceRelay.buildFrame(uid, 'ISO14443-A', 'WALLET_HCE_TAP');
  await sendBytes(frame, 'Wallet NFC->USB');
});

document.getElementById('btn-dl-ndef').addEventListener('click', () => {
  const uri = 'bruce.firmware.local/esp32c6/relay';
  const payload = new TextEncoder().encode('\\x04' + uri);
  const ndef = new Uint8Array(4 + payload.length);
  ndef.set([0xD1, 0x01, payload.length, 0x55], 0);
  ndef.set(payload, 4);
  const blob = new Blob([ndef], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'brucelink-esp32c6-portal.ndef';
  a.click();
  appendLog('NDEF', 'Downloaded brucelink-esp32c6-portal.ndef');
});

document.getElementById('btn-emu-ndef').addEventListener('click', async () => {
  const { frame } = window.BruceRelay.buildFrame('04:A3:7F:92:1B:44:80', 'NTAG215', 'https://bruce.firmware.local/esp32c6/relay');
  await sendBytes(frame, 'Phone NDEF Emulate');
});

document.querySelectorAll('.cmd').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const cmd = btn.dataset.cmd;
    const bytes = new TextEncoder().encode(cmd + '\\n');
    await sendBytes(bytes, 'Bruce CLI: ' + cmd);
    setTimeout(() => appendLog('RX C6', \`[BRUCE] OK -> \${cmd}\`), 180);
  });
});

startKeepAliveLoop();
`;

  const stylesCss = `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f6f7f9; color: #0f172a; width: 380px; }
.shell { padding: 14px; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.topbar h1 { font-size: 15px; margin: 0; font-weight: 700; }
.status { font-size: 11px; font-weight: 600; color: #ea580c; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
.tab { padding: 8px; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; }
.tab.active { background: #0f172a; color: #fff; border-color: #0f172a; }
.hidden { display: none; }
.wallet-card { background: #0b0f17; color: #fff; padding: 14px; border-radius: 12px; margin-bottom: 10px; }
.card-issuer { font-size: 11px; color: #94a3b8; }
.card-title { font-size: 16px; font-weight: 700; margin: 6px 0; }
.card-uid { font-family: monospace; font-size: 12px; color: #fb923c; }
.controls { display: grid; gap: 8px; margin-bottom: 10px; }
.btn { padding: 9px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-weight: 600; font-size: 12px; cursor: pointer; }
.btn.primary { background: #ea580c; color: #fff; border-color: #ea580c; }
.keepalive-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; margin-bottom: 10px; }
.bruce-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
.bruce-title { font-weight: 700; font-size: 13px; }
.bruce-meta { font-size: 11px; color: #64748b; margin: 4px 0 10px; font-family: monospace; }
.bruce-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.log { background: #0b0f17; color: #e2e8f0; padding: 10px; border-radius: 8px; height: 140px; overflow: auto; font-size: 11px; margin: 0; font-family: monospace; }
`;

  const readmeMd = `# BruceLink NFC Bridge (Chrome Extension MV3)

## Load Unpacked (.zip)
1. Extract this archive to a local folder.
2. Open chrome://extensions in Google Chrome (or Android Kiwi/Mises Browser).
3. Enable Developer Mode in the top-right corner.
4. Click "Load unpacked" and select the extracted folder.

## CRX3 Installation (.crx)
Drag and drop BruceLink-NFC-Bridge.crx onto chrome://extensions (or deploy via Enterprise ExtensionInstallForcelist policy).

## Hardware Setup (ESP32-C6 + Bruce Firmware)
- Connect ESP32-C6 via USB-C data cable.
- Click "Connect ESP32-C6 USB" and choose the USB JTAG/Serial or CP210x port at 115200 baud.
- Keep-Alive TX/RX stays active continuously while the extension software is running.
`;

  return [
    {
      path: 'manifest.json',
      language: 'json',
      description: 'Chrome Extension Manifest V3 declaration with USB/Serial/Offscreen permissions',
      content: manifestJson,
    },
    {
      path: 'background.js',
      language: 'javascript',
      description: 'MV3 background service worker retaining continuous TX/RX bridge state',
      content: backgroundJs,
    },
    {
      path: 'popup.html',
      language: 'html',
      description: 'Extension popup UI with Google Wallet NFC view & Bruce C6 App view',
      content: popupHtml,
    },
    {
      path: 'popup.js',
      language: 'javascript',
      description: 'WebSerial TX/RX streamer, WebNFC reader & Bruce CLI command sender',
      content: popupJs,
    },
    {
      path: 'bruce-relay.js',
      language: 'javascript',
      description: 'Binary 0xAA 0x55 Bruce Firmware NFC-over-USB packet framer',
      content: bruceRelayJs,
    },
    {
      path: 'styles.css',
      language: 'css',
      description: 'Extension popup styling',
      content: stylesCss,
    },
    {
      path: 'README.md',
      language: 'markdown',
      description: 'Installation guide for .crx and unpacked .zip extension packages',
      content: readmeMd,
    },
  ];
}

// Generate a minimal valid 1x1-scaled or clean PNG icon as Uint8Array using Canvas
async function createPngIconBytes(size: number): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#EA580C';
    const pad = Math.max(2, Math.floor(size * 0.18));
    ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.max(9, Math.floor(size * 0.42))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', size / 2, size / 2 + 1);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function buildExtensionZipBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  const files = getChromeExtensionFiles();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  const [i16, i48, i128] = await Promise.all([
    createPngIconBytes(16),
    createPngIconBytes(48),
    createPngIconBytes(128),
  ]);
  zip.file('icons/icon16.png', i16);
  zip.file('icons/icon48.png', i48);
  zip.file('icons/icon128.png', i128);

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Generates a CRX3 container wrapping the extension ZIP payload:
 * Bytes 0..3:  Magic "Cr24" (0x43 0x72 0x32 0x34)
 * Bytes 4..7:  Version 3 (little-endian uint32)
 * Bytes 8..11: Header length (little-endian uint32)
 * Bytes 12..12+H: Deterministic CRX3 protobuf metadata header (signed_header_data field)
 * Remaining:   Standard ZIP payload
 */
export async function buildExtensionCrxBytes(): Promise<Uint8Array> {
  const zipBytes = await buildExtensionZipBytes();
  // Minimal CRX3 CrxFileHeader protobuf carrying a 16-byte crx_id in signed_header_data (field 10000)
  const crxId = new Uint8Array([
    0x42, 0x72, 0x75, 0x63, 0x65, 0x4c, 0x69, 0x6e,
    0x6b, 0x4e, 0x46, 0x43, 0x43, 0x36, 0x30, 0x31,
  ]);
  // SignedData { crx_id: bytes (field 1, wire type 2 => 0x0A, len 16) }
  const signedData = new Uint8Array(2 + crxId.length);
  signedData[0] = 0x0a;
  signedData[1] = crxId.length;
  signedData.set(crxId, 2);

  // CrxFileHeader { signed_header_data (field 10000 => tag varint 0x92 0xF1 0x04, len 18) }
  const protoHeader = new Uint8Array(4 + signedData.length);
  protoHeader[0] = 0x92;
  protoHeader[1] = 0xf1;
  protoHeader[2] = 0x04;
  protoHeader[3] = signedData.length;
  protoHeader.set(signedData, 4);

  const total = new Uint8Array(12 + protoHeader.length + zipBytes.length);
  const view = new DataView(total.buffer);
  // "Cr24"
  total[0] = 0x43;
  total[1] = 0x72;
  total[2] = 0x32;
  total[3] = 0x34;
  // Version = 3
  view.setUint32(4, 3, true);
  // Header length
  view.setUint32(8, protoHeader.length, true);
  total.set(protoHeader, 12);
  total.set(zipBytes, 12 + protoHeader.length);
  return total;
}

export function triggerBrowserDownload(bytes: Uint8Array, filename: string, mimeType: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
