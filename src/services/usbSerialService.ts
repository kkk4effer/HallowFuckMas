import type {
  NfcCardPass,
  SerialChannel,
  SerialDirection,
  SerialPacket,
  WebNdefReader,
  WebSerialPort,
} from '../types/nfc';

export const DEFAULT_NFC_PASSES: NfcCardPass[] = [
  {
    id: 'pass-bruce-wallet',
    label: 'BruceLink Master Access',
    issuer: 'Google Wallet HCE · ISO 14443-A',
    protocol: 'ISO14443-A',
    uid: '04:A3:7F:92:1B:44:80',
    atqa: '0x0044',
    sak: '0x20',
    ndefRecord: 'bruce://nfc-relay?target=esp32c6&tx=GPIO16&rx=GPIO17',
    sectorHex: [
      '04 A3 7F 92 1B 44 80 08 04 00 62 63 64 65 66 67',
      '03 2B D1 01 27 55 04 62 72 75 63 65 2E 6C 69 6E',
      '6B 2F 6E 66 63 2D 72 65 6C 61 79 3F 63 36 3D 31',
      'FF FF FF FF FF FF 78 77 88 C1 FF FF FF FF FF FF',
    ],
    accentColor: '#EA580C',
  },
  {
    id: 'pass-transit-mifare',
    label: 'Metro Express Card',
    issuer: 'MIFARE Classic 1K · Transit Key',
    protocol: 'MIFARE Classic 1K',
    uid: '9A:41:C0:2E',
    atqa: '0x0004',
    sak: '0x08',
    ndefRecord: 'TRANSIT:ZONE-1|BAL:$24.50|SEQ:0891',
    sectorHex: [
      '9A 41 C0 2E 3B 88 04 00 C8 01 00 20 00 00 00 1A',
      '54 52 41 4E 53 49 54 3A 5A 4F 4E 45 2D 31 00 00',
      '00 00 09 92 00 00 00 00 00 00 00 00 00 00 00 00',
      'A0 A1 A2 A3 A4 A5 78 77 88 69 B0 B1 B2 B3 B4 B5',
    ],
    accentColor: '#059669',
  },
  {
    id: 'pass-ntag215-key',
    label: 'Lab Badge NTAG215',
    issuer: 'NTAG215 · 504 Bytes NDEF',
    protocol: 'NTAG215',
    uid: '04:5E:19:BA:02:6F:81',
    atqa: '0x0044',
    sak: '0x00',
    ndefRecord: 'https://bruce.firmware.local/esp32c6/bridge',
    sectorHex: [
      '04 5E 19 BA 02 6F 81 48 00 00 E1 10 3E 00 03 24',
      'D1 01 20 55 04 62 72 75 63 65 2E 66 69 72 6D 77',
      '61 72 65 2E 6C 6F 63 61 6C 2F 63 36 00 FE 00 00',
      '00 00 00 00 00 00 00 00 00 00 00 00 BD 04 00 00',
    ],
    accentColor: '#2563EB',
  },
  {
    id: 'pass-emv-token',
    label: 'Contactless EMV Token',
    issuer: 'EMV Visa AID A0000000031010',
    protocol: 'EMV Contactless',
    uid: '08:F2:11:7C',
    atqa: '0x0004',
    sak: '0x20',
    ndefRecord: 'AID:A0000000031010|ATC:014F|CVM:CDC',
    sectorHex: [
      '6F 23 84 07 A0 00 00 00 03 10 10 A5 18 50 0B 56',
      '49 53 41 20 44 45 42 49 54 9F 38 06 9F 66 04 9F',
      '02 06 9F 1A 02 5F 2A 02 9F 37 04 90 00 00 00 00',
      '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
    ],
    accentColor: '#1E293B',
  },
];

export function formatTimeStamp(date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

export function stringToHex(input: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function buildBruceNfcFrame(uid: string, protocol: string, payload: string): {
  bytes: Uint8Array;
  hex: string;
  ascii: string;
} {
  // Bruce Firmware USB Serial NFC Relay Frame:
  // [0xAA 0x55] [CMD: 0x10 NFC_RELAY] [LEN] [PAYLOAD...] [XOR_CRC] [0x0A]
  const bodyText = `NFC|${protocol}|${uid}|${payload}`;
  const bodyBytes = new TextEncoder().encode(bodyText);
  const frame = new Uint8Array(bodyBytes.length + 6);
  frame[0] = 0xaa;
  frame[1] = 0x55;
  frame[2] = 0x10;
  frame[3] = bodyBytes.length & 0xff;
  frame.set(bodyBytes, 4);
  let xor = 0x10 ^ (bodyBytes.length & 0xff);
  for (let i = 0; i < bodyBytes.length; i++) {
    xor ^= bodyBytes[i];
  }
  frame[frame.length - 2] = xor;
  frame[frame.length - 1] = 0x0a;

  const hex = Array.from(frame)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');

  return {
    bytes: frame,
    hex,
    ascii: bodyText,
  };
}

export function buildKeepAliveFrame(seq: number): {
  bytes: Uint8Array;
  hex: string;
  ascii: string;
} {
  const ascii = `BRUCE_KA_TXRX#${seq}`;
  const body = new TextEncoder().encode(ascii);
  const frame = new Uint8Array(body.length + 5);
  frame[0] = 0xaa;
  frame[1] = 0x55;
  frame[2] = 0x01; // KEEPALIVE_PING
  frame[3] = body.length;
  frame.set(body, 4);
  frame[frame.length - 1] = 0x0a;
  const hex = Array.from(frame)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  return { bytes: frame, hex, ascii };
}

export function createPacket(
  direction: SerialDirection,
  channel: SerialChannel,
  hexPayload: string,
  asciiSummary: string,
  bytesCount?: number
): SerialPacket {
  const computedBytes =
    bytesCount ?? (hexPayload.trim() ? hexPayload.trim().split(/\s+/).length : asciiSummary.length);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: formatTimeStamp(),
    direction,
    channel,
    hexPayload,
    asciiSummary,
    bytes: computedBytes,
  };
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export function isWebNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export async function requestEsp32SerialPort(baudRate: number): Promise<WebSerialPort> {
  const nav = navigator as Navigator & {
    serial?: {
      requestPort: (options?: {
        filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
      }) => Promise<WebSerialPort>;
    };
  };
  if (!nav.serial) {
    throw new Error('Web Serial API is not available in this browser context.');
  }
  // Espressif ESP32-C6 native USB JTAG/Serial (0x303A), CP210x (0x10C4), CH340 (0x1A86)
  const port = await nav.serial.requestPort({
    filters: [
      { usbVendorId: 0x303a },
      { usbVendorId: 0x10c4 },
      { usbVendorId: 0x1a86 },
      { usbVendorId: 0x0403 },
    ],
  });
  await port.open({
    baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  });
  if (port.setSignals) {
    await port.setSignals({ dataTerminalReady: true, requestToSend: false });
  }
  return port;
}

export async function writeBytesToSerialPort(
  port: WebSerialPort,
  data: Uint8Array
): Promise<void> {
  if (!port.writable) {
    throw new Error('Serial port is not writable.');
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

export function createNdefReader(): WebNdefReader | null {
  const win = window as Window & { NDEFReader?: new () => WebNdefReader };
  if (!win.NDEFReader) return null;
  return new win.NDEFReader();
}
