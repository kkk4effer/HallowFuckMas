import JSZip from 'jszip';
import type {
  NdefRecordType,
  NdefTagFile,
  NfcCardPass,
  NfcProtocol,
  SerialPacket,
} from '../types/nfc';

/**
 * Encodes an NFC Forum Well-Known or Media Type NDEF message into binary bytes.
 * Header byte: MB=1, ME=1, CF=0, SR=1 (for payloads < 256), IL=0, TNF=0x01 (Well-Known) or 0x02 (Media).
 */
export function encodeNdefBinary(recordType: NdefRecordType, payload: string): Uint8Array {
  const encoder = new TextEncoder();

  if (recordType === 'URI') {
    let prefixCode = 0x00;
    let stripped = payload;
    if (payload.startsWith('https://www.')) {
      prefixCode = 0x02;
      stripped = payload.slice('https://www.'.length);
    } else if (payload.startsWith('http://www.')) {
      prefixCode = 0x01;
      stripped = payload.slice('http://www.'.length);
    } else if (payload.startsWith('https://')) {
      prefixCode = 0x04;
      stripped = payload.slice('https://'.length);
    } else if (payload.startsWith('http://')) {
      prefixCode = 0x03;
      stripped = payload.slice('http://'.length);
    }
    const uriBytes = encoder.encode(stripped);
    const fullPayload = new Uint8Array(1 + uriBytes.length);
    fullPayload[0] = prefixCode;
    fullPayload.set(uriBytes, 1);
    return wrapNdefRecord(0x01, new Uint8Array([0x55]), fullPayload); // 'U'
  }

  if (recordType === 'Text') {
    const langBytes = encoder.encode('en');
    const textBytes = encoder.encode(payload);
    const fullPayload = new Uint8Array(1 + langBytes.length + textBytes.length);
    fullPayload[0] = langBytes.length & 0x3f; // UTF-8, lang length
    fullPayload.set(langBytes, 1);
    fullPayload.set(textBytes, 1 + langBytes.length);
    return wrapNdefRecord(0x01, new Uint8Array([0x54]), fullPayload); // 'T'
  }

  const mime =
    recordType === 'Wi-Fi' ? 'application/vnd.wfa.wsc' : 'text/vcard';
  const typeBytes = encoder.encode(mime);
  const bodyBytes = encoder.encode(payload);
  return wrapNdefRecord(0x02, typeBytes, bodyBytes);
}

function wrapNdefRecord(
  tnf: number,
  typeBytes: Uint8Array,
  payloadBytes: Uint8Array
): Uint8Array {
  const shortRecord = payloadBytes.length < 256;
  const header = 0x80 | 0x40 | (shortRecord ? 0x10 : 0x00) | (tnf & 0x07);
  const lenFieldSize = shortRecord ? 1 : 4;
  const total = new Uint8Array(2 + lenFieldSize + typeBytes.length + payloadBytes.length);
  total[0] = header;
  total[1] = typeBytes.length & 0xff;

  let offset = 2;
  if (shortRecord) {
    total[offset++] = payloadBytes.length & 0xff;
  } else {
    const view = new DataView(total.buffer);
    view.setUint32(offset, payloadBytes.length, false);
    offset += 4;
  }

  total.set(typeBytes, offset);
  offset += typeBytes.length;
  total.set(payloadBytes, offset);
  return total;
}

export function bytesToHexString(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function buildNdefTagFile(
  title: string,
  recordType: NdefRecordType,
  payload: string,
  customFileName?: string
): NdefTagFile {
  const binary = encodeNdefBinary(recordType, payload);
  const slug =
    customFileName?.trim() ||
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.ndef`;
  const fileName = slug.endsWith('.ndef') ? slug : `${slug}.ndef`;

  return {
    id: `ndef-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    title,
    recordType,
    payload,
    rawNdefBytes: Array.from(binary),
    rawNdefHex: bytesToHexString(binary),
    createdAt: new Date().toLocaleTimeString('en-US', { hour12: false }),
  };
}

export function getDefaultNdefTagFiles(): NdefTagFile[] {
  return [
    buildNdefTagFile(
      'BruceLink ESP32-C6 Portal URI',
      'URI',
      'https://bruce.firmware.local/esp32c6/relay',
      'brucelink-esp32c6-portal.ndef'
    ),
    buildNdefTagFile(
      'Lab Access Desk Note',
      'Text',
      'BruceLink NFC Bridge · UART0 115200 8N1 GPIO16/17',
      'lab-access-note.ndef'
    ),
    buildNdefTagFile(
      'Bench Wi-Fi Provisioning',
      'Wi-Fi',
      'WIFI:T:WPA;S:BruceBench-5G;P:esp32c6-bridge;;',
      'bench-wifi-connect.ndef'
    ),
    buildNdefTagFile(
      'Hardware Engineer vCard',
      'vCard',
      'BEGIN:VCARD\nVERSION:3.0\nFN:BruceLink Operator\nORG:Hardware Lab\nEND:VCARD',
      'operator-badge.ndef'
    ),
  ];
}

export async function buildAllTagsArchiveBytes(
  tagFiles: NdefTagFile[],
  passes: NfcCardPass[],
  packets: SerialPacket[] = []
): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const tag of tagFiles) {
    zip.file(`ndef/${tag.fileName}`, new Uint8Array(tag.rawNdefBytes));
  }

  for (const pass of passes) {
    const slug = pass.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const nfcContent = [
      'Filetype: Flipper NFC device',
      'Version: 4',
      `# BruceLink Tag Backup: ${pass.label}`,
      `Device type: ${pass.protocol}`,
      `UID: ${pass.uid.replace(/:/g, ' ')}`,
      `ATQA: ${pass.atqa.replace(/^0x/i, '')}`,
      `SAK: ${pass.sak.replace(/^0x/i, '')}`,
      `NDEF Payload: ${pass.ndefRecord}`,
      ...pass.sectorHex.map((hex, i) => `Block ${i}: ${hex}`),
      '',
    ].join('\n');
    zip.file(`nfc/${slug}.nfc`, nfcContent);
  }

  if (packets.length > 0) {
    const serialLogLines = [
      '# BruceLink Live USB TX/RX Serial Stream Capture',
      `# Exported: ${new Date().toISOString()}`,
      `# Frames: ${packets.length}`,
      '',
      ...packets.map(
        (pkt) =>
          `[${pkt.timestamp}] ${pkt.direction} | ${pkt.channel} | ${pkt.bytes}B | ${pkt.asciiSummary} | HEX: ${pkt.hexPayload}`
      ),
      '',
    ].join('\n');
    zip.file('txrx-serial-stream.log', serialLogLines);
  }

  zip.file(
    'tags-manifest.json',
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        ndefTagsCount: tagFiles.length,
        nfcPassBackupsCount: passes.length,
        serialPacketsExported: packets.length,
        ndefTags: tagFiles.map((t) => ({
          fileName: t.fileName,
          title: t.title,
          recordType: t.recordType,
          payload: t.payload,
          bytes: t.rawNdefBytes.length,
        })),
        nfcPasses: passes.map((p) => ({
          id: p.id,
          label: p.label,
          protocol: p.protocol,
          uid: p.uid,
          atqa: p.atqa,
          sak: p.sak,
        })),
      },
      null,
      2
    )
  );

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

const KNOWN_PROTOCOLS: NfcProtocol[] = [
  'ISO14443-A',
  'MIFARE Classic 1K',
  'NTAG215',
  'EMV Contactless',
  'FeliCa',
];

function extractUidFromPacket(pkt: SerialPacket): string | null {
  const colonUid = pkt.asciiSummary.match(/\b([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){3,6})\b/);
  if (colonUid) {
    return colonUid[1].toUpperCase();
  }
  const spaceUid = pkt.asciiSummary.match(/UID[:=\s]+([0-9A-Fa-f]{2}(?:\s+[0-9A-Fa-f]{2}){3,6})/i);
  if (spaceUid) {
    return spaceUid[1].trim().replace(/\s+/g, ':').toUpperCase();
  }
  return null;
}

function extractProtocolFromPacket(pkt: SerialPacket): NfcProtocol {
  const upper = pkt.asciiSummary.toUpperCase();
  for (const proto of KNOWN_PROTOCOLS) {
    if (upper.includes(proto.toUpperCase())) {
      return proto;
    }
  }
  if (upper.includes('MIFARE')) return 'MIFARE Classic 1K';
  if (upper.includes('NTAG')) return 'NTAG215';
  if (upper.includes('FELICA')) return 'FeliCa';
  return 'ISO14443-A';
}

function extractPayloadFromPacket(pkt: SerialPacket): {
  recordType: NdefRecordType;
  payload: string;
} {
  const summary = pkt.asciiSummary.trim();

  // Check if formatted as NFC|<PROTOCOL>|<UID>|<PAYLOAD>
  if (summary.includes('NFC|')) {
    const idx = summary.indexOf('NFC|');
    const parts = summary.slice(idx).split('|');
    if (parts.length >= 4) {
      const innerPayload = parts.slice(3).join('|').trim();
      if (innerPayload) {
        return classifyPayload(innerPayload);
      }
    }
  }

  return classifyPayload(summary || pkt.hexPayload);
}

function classifyPayload(text: string): {
  recordType: NdefRecordType;
  payload: string;
} {
  const trimmed = text.trim();
  if (/WIFI:/i.test(trimmed)) {
    const wifiMatch = trimmed.match(/WIFI:[^\n]+/i);
    return { recordType: 'Wi-Fi', payload: wifiMatch ? wifiMatch[0] : trimmed };
  }
  if (/BEGIN:VCARD/i.test(trimmed)) {
    return { recordType: 'vCard', payload: trimmed };
  }
  const urlMatch = trimmed.match(/(https?:\/\/[^\s|]+|bruce:\/\/[^\s|]+)/i);
  if (urlMatch) {
    return { recordType: 'URI', payload: urlMatch[1] };
  }
  return { recordType: 'Text', payload: trimmed };
}

export function isRawPacketConvertible(pkt: SerialPacket): boolean {
  if (pkt.channel === 'KEEPALIVE' || pkt.channel === 'SYSTEM') {
    return false;
  }
  if (pkt.asciiSummary.includes('KA_ACK') || pkt.asciiSummary.includes('BRUCE_KA_TXRX')) {
    return false;
  }
  return pkt.bytes > 0;
}

export function convertSerialPacketToNdefTag(pkt: SerialPacket): NdefTagFile {
  const uid = extractUidFromPacket(pkt);
  const protocol = extractProtocolFromPacket(pkt);
  const { recordType, payload } = extractPayloadFromPacket(pkt);

  const uidSlug = uid ? uid.replace(/:/g, '').toLowerCase() : pkt.id.slice(-6);
  const shortTime = pkt.timestamp.replace(/[:.]/g, '').slice(0, 6);
  const title = uid
    ? `Raw ${pkt.direction} Tag (${uid})`
    : `Stream ${pkt.direction} ${pkt.channel} (${pkt.timestamp})`;
  const fileName = `raw-${pkt.direction.toLowerCase()}-${uidSlug}-${shortTime}.ndef`;

  const finalPayload =
    recordType === 'Text' && uid && !payload.includes(uid)
      ? `UID=${uid} | ${protocol} | ${payload}`
      : payload;

  return buildNdefTagFile(title, recordType, finalPayload, fileName);
}

export function convertSerialPacketToCardPass(pkt: SerialPacket): NfcCardPass | null {
  const uid = extractUidFromPacket(pkt);
  if (!uid) return null;

  const protocol = extractProtocolFromPacket(pkt);
  const { payload } = extractPayloadFromPacket(pkt);
  const cleanHexBytes = pkt.hexPayload.trim().split(/\s+/).filter(Boolean);
  const sectorRows: string[] = [];
  for (let i = 0; i < cleanHexBytes.length && sectorRows.length < 4; i += 16) {
    sectorRows.push(cleanHexBytes.slice(i, i + 16).join(' '));
  }
  if (sectorRows.length === 0 && pkt.hexPayload.trim()) {
    sectorRows.push(pkt.hexPayload.trim());
  }

  return {
    id: `pass-raw-${uid.replace(/:/g, '').toLowerCase()}-${Date.now()}`,
    label: `Captured ${protocol} (${uid.slice(0, 11)})`,
    issuer: `Live ${pkt.direction} Stream · ${pkt.channel}`,
    protocol,
    uid,
    atqa: protocol === 'MIFARE Classic 1K' ? '0x0004' : '0x0044',
    sak: protocol === 'MIFARE Classic 1K' ? '0x08' : '0x20',
    ndefRecord: payload,
    sectorHex: sectorRows,
    accentColor: pkt.direction === 'RX' ? '#059669' : '#EA580C',
    lastTapped: pkt.timestamp,
  };
}

