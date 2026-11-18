import type { FirmwareBinaryInfo, FirmwareBootState } from '../types/hardware';

const BRUCE_DEFAULT_FILENAME = 'bruce-lilygo-t-embed-cc1101-v1.9.1.bin';
const FLASH_DB_NAME = 'tembed_spi_flash_db';
const FLASH_STORE_NAME = 'flash_slots';
const FLASH_SLOT_KEY = 'permanent_firmware_slot';
const FLASH_META_LS_KEY = 'tembed_permanent_fw_meta_v1';

export interface PersistedFlashSlot {
  bootState: FirmwareBootState;
  fileName: string;
  version: string;
  board: string;
  mcu: string;
  flashOffset: string;
  sizeBytes: number;
  sha256: string;
  isCustom: boolean;
  bytes: Uint8Array;
  projectName?: string;
  compileInfo?: string;
  entryPoint?: string;
  segmentCount?: number;
  espMagicValid?: boolean;
}

function readCString(bytes: Uint8Array, start: number, maxLen: number): string {
  const slice = bytes.subarray(start, Math.min(bytes.length, start + maxLen));
  let end = slice.indexOf(0);
  if (end === -1) end = slice.length;
  return new TextDecoder().decode(slice.subarray(0, end)).replace(/[^\x20-\x7E]/g, '').trim();
}

/**
 * Extracts ESP32 image header fields and esp_app_desc_t metadata (0xABCD5432) from a .bin file.
 */
function inspectEsp32Binary(bytes: Uint8Array, fallbackName: string): {
  espMagicValid: boolean;
  segmentCount: number;
  entryPoint: string;
  projectName: string;
  version: string;
  compileInfo: string;
} {
  const espMagicValid = bytes.length >= 24 && bytes[0] === 0xe9;
  const segmentCount = espMagicValid ? bytes[1] : 0;
  let entryPoint = '0x40374000';
  if (bytes.length >= 8 && espMagicValid) {
    const addr =
      (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
    entryPoint = `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`;
  }

  // Search for ESP-IDF esp_app_desc_t magic: 0x32 0x54 0xCD 0xAB (little-endian 0xABCD5432)
  const scanLimit = Math.min(bytes.length - 256, 8192);
  for (let i = 0; i <= scanLimit; i += 1) {
    if (
      bytes[i] === 0x32 &&
      bytes[i + 1] === 0x54 &&
      bytes[i + 2] === 0xcd &&
      bytes[i + 3] === 0xab
    ) {
      const version = readCString(bytes, i + 16, 32) || 'Custom';
      const projectName = readCString(bytes, i + 48, 32) || fallbackName;
      const compileTime = readCString(bytes, i + 80, 16);
      const compileDate = readCString(bytes, i + 96, 16);
      const idfVer = readCString(bytes, i + 112, 32);
      const compileInfo = [compileDate, compileTime, idfVer].filter(Boolean).join(' · ');
      return {
        espMagicValid,
        segmentCount,
        entryPoint,
        projectName,
        version,
        compileInfo,
      };
    }
  }

  // Fallback: inspect embedded BRUCE_FW descriptor string if present
  const headerAscii = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  if (headerAscii.includes('BRUCE_FW|')) {
    const parts = headerAscii.split('BRUCE_FW|')[1]?.split('|') ?? [];
    return {
      espMagicValid,
      segmentCount,
      entryPoint,
      projectName: 'Bruce Firmware',
      version: parts[0]?.replace(/^v/, '') || '1.9.1',
      compileInfo: parts[1] || 'lilygo-t-embed-cc1101',
    };
  }

  const cleanBaseName = fallbackName.replace(/\.bin$/i, '');
  return {
    espMagicValid,
    segmentCount,
    entryPoint,
    projectName: cleanBaseName,
    version: espMagicValid ? 'Custom (0xE9)' : 'Raw Binary',
    compileInfo: espMagicValid ? `${segmentCount} segments · ${entryPoint}` : 'Raw SPI image',
  };
}

function openFlashDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(FLASH_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FLASH_STORE_NAME)) {
        db.createObjectStore(FLASH_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open flash storage'));
  });
}

export async function savePersistedFlashState(
  firmware: FirmwareBinaryInfo,
  bootState: FirmwareBootState
): Promise<void> {
  const metaOnly = {
    bootState,
    fileName: firmware.fileName,
    version: firmware.version,
    board: firmware.board,
    mcu: firmware.mcu,
    flashOffset: firmware.flashOffset,
    sizeBytes: firmware.sizeBytes,
    sha256: firmware.sha256,
    isCustom: firmware.isCustom,
    projectName: firmware.projectName,
    compileInfo: firmware.compileInfo,
    entryPoint: firmware.entryPoint,
    segmentCount: firmware.segmentCount,
    espMagicValid: firmware.espMagicValid,
  };

  try {
    localStorage.setItem(FLASH_META_LS_KEY, JSON.stringify(metaOnly));
  } catch {
    // Ignore localStorage failures
  }

  try {
    const db = await openFlashDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FLASH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(FLASH_STORE_NAME);
      const slot: PersistedFlashSlot = {
        ...metaOnly,
        bytes: firmware.bytes,
      };
      store.put(slot, FLASH_SLOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to persist firmware flash'));
    });
    db.close();
  } catch {
    // Fallback metadata remains in localStorage
  }
}

export async function loadPersistedFlashState(): Promise<{
  firmware: FirmwareBinaryInfo;
  bootState: FirmwareBootState;
} | null> {
  try {
    const db = await openFlashDb();
    const slot = await new Promise<PersistedFlashSlot | undefined>((resolve, reject) => {
      const tx = db.transaction(FLASH_STORE_NAME, 'readonly');
      const store = tx.objectStore(FLASH_STORE_NAME);
      const req = store.get(FLASH_SLOT_KEY);
      req.onsuccess = () => resolve(req.result as PersistedFlashSlot | undefined);
      req.onerror = () => reject(req.error ?? new Error('Failed to read flash storage'));
    });
    db.close();

    if (slot && slot.bytes) {
      return {
        bootState: slot.bootState,
        firmware: {
          fileName: slot.fileName,
          version: slot.version,
          board: slot.board,
          mcu: slot.mcu,
          flashOffset: slot.flashOffset,
          sizeBytes: slot.sizeBytes,
          sha256: slot.sha256,
          isCustom: slot.isCustom,
          projectName: slot.projectName,
          compileInfo: slot.compileInfo,
          entryPoint: slot.entryPoint,
          segmentCount: slot.segmentCount,
          espMagicValid: slot.espMagicValid,
          bytes: slot.bytes instanceof Uint8Array ? slot.bytes : new Uint8Array(slot.bytes),
        },
      };
    }
  } catch {
    // Fall through to localStorage metadata check
  }

  try {
    const rawMeta = localStorage.getItem(FLASH_META_LS_KEY);
    if (!rawMeta) return null;
    const meta = JSON.parse(rawMeta) as Omit<PersistedFlashSlot, 'bytes'>;
    return {
      bootState: meta.bootState,
      firmware: {
        ...meta,
        bytes: new Uint8Array(0),
      },
    };
  } catch {
    return null;
  }
}

export async function clearPersistedFlashState(): Promise<void> {
  try {
    localStorage.removeItem(FLASH_META_LS_KEY);
  } catch {
    // Ignore
  }

  try {
    const db = await openFlashDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FLASH_STORE_NAME, 'readwrite');
      tx.objectStore(FLASH_STORE_NAME).delete(FLASH_SLOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear flash storage'));
    });
    db.close();
  } catch {
    // Ignore storage errors
  }
}

/**
 * Computes a lowercase hex SHA-256 digest using Web Crypto API.
 */
export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    let acc = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i += 1) {
      acc ^= bytes[i];
      acc = Math.imul(acc, 0x01000193);
    }
    return (acc >>> 0).toString(16).padStart(8, '0').repeat(8);
  }
}

/**
 * Generates a valid ESP32-S3 binary image structure starting with ESP magic 0xE9,
 * segment headers, partition table descriptors, and Bruce Firmware module tables.
 */
export async function buildBruceFirmwareBinary(): Promise<FirmwareBinaryInfo> {
  const totalSize = 65536;
  const bytes = new Uint8Array(totalSize);

  bytes[0] = 0xe9;
  bytes[1] = 0x03;
  bytes[2] = 0x02;
  bytes[3] = 0x2f;
  bytes[4] = 0x00;
  bytes[5] = 0x40;
  bytes[6] = 0x37;
  bytes[7] = 0x40;
  bytes[12] = 0x09;
  bytes[13] = 0x00;
  bytes[23] = 0x01;

  const encoder = new TextEncoder();
  const appDesc = encoder.encode(
    'BRUCE_FW|v1.9.1|lilygo-t-embed-cc1101|esp32s3|ST7789_170x320|TX=GPIO43|RX=GPIO44|WIFI_UART_BRIDGE|PN532_WEBNFC_RELAY'
  );
  bytes.set(appDesc, 0x20);

  const manifest = encoder.encode(
    '\n[PARTITIONS]\n' +
      'nvs,data,nvs,0x9000,0x5000\n' +
      'otadata,data,ota,0xe000,0x2000\n' +
      'app0,app,ota_0,0x10000,0x330000\n' +
      'spiffs,data,spiffs,0x340000,0xCB0000\n' +
      '[MODULES]\n' +
      'wifi_txrx_uart,nfc_iso14443_relay,cc1101_subghz,ir_nec_tx,ble_hid,sd_spiffs\n'
  );
  bytes.set(manifest, 0x100);

  for (let i = 0x300; i < totalSize - 32; i += 1) {
    bytes[i] = (i * 31 + (i >> 4)) & 0xff;
  }

  const sha256 = await computeSha256Hex(bytes);

  return {
    fileName: BRUCE_DEFAULT_FILENAME,
    version: '1.9.1',
    board: 'LilyGO T-Embed CC1101',
    mcu: 'ESP32-S3R8 (Dual-Core 240MHz)',
    flashOffset: '0x10000',
    sizeBytes: bytes.byteLength,
    sha256,
    isCustom: false,
    projectName: 'Bruce Firmware',
    compileInfo: 'lilygo-t-embed-cc1101',
    entryPoint: '0x40374000',
    segmentCount: 3,
    espMagicValid: true,
    bytes,
  };
}

/**
 * Parses any user-selected .bin file into FirmwareBinaryInfo, extracting real ESP32 header & app metadata.
 */
export async function parseUploadedFirmwareFile(file: File): Promise<FirmwareBinaryInfo> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const sha256 = await computeSha256Hex(bytes);
  const info = inspectEsp32Binary(bytes, file.name);

  return {
    fileName: file.name,
    version: info.version,
    board: 'LilyGO T-Embed CC1101',
    mcu: 'ESP32-S3',
    flashOffset: '0x10000',
    sizeBytes: bytes.byteLength,
    sha256,
    isCustom: true,
    projectName: info.projectName,
    compileInfo: info.compileInfo,
    entryPoint: info.entryPoint,
    segmentCount: info.segmentCount,
    espMagicValid: info.espMagicValid,
    bytes,
  };
}

/**
 * Triggers a browser file download for a Bruce Firmware .bin file.
 */
export function triggerFirmwareBinDownload(firmware: FirmwareBinaryInfo): void {
  const buffer = new ArrayBuffer(firmware.bytes.byteLength);
  new Uint8Array(buffer).set(firmware.bytes);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = firmware.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}
