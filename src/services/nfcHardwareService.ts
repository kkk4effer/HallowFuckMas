import type { NfcProtocol, NfcTagRecord, WebNdefReader } from '../types/hardware';

export function formatClockTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function stringToHexPairs(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function dataViewToHexPairs(view: DataView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function isPhoneWebNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export function createPhoneNdefReader(): WebNdefReader | null {
  if (!isPhoneWebNfcSupported()) return null;
  const win = window as unknown as { NDEFReader: new () => WebNdefReader };
  return new win.NDEFReader();
}

export const NFC_FETCH_PRESETS: NfcTagRecord[] = [
  {
    id: 'nfc-preset-1',
    label: 'Metro Transit Pass',
    uid: '04:A3:7F:92:1B:44:80',
    protocol: 'ISO14443-A',
    atqa: '0x0044',
    sak: '0x20',
    ndefType: 'uri',
    payload: 'https://transit.local/pass/zone-1?seq=0891',
    rawHex: '04 A3 7F 92 1B 44 80 D1 01 1A 55 04 74 72 61 6E 73 69 74',
    source: 'preset',
    fetchedAt: formatClockTime(),
    rssiDbm: -38,
  },
  {
    id: 'nfc-preset-2',
    label: 'Office HID Access Badge',
    uid: '9A:41:C0:2E',
    protocol: 'MIFARE Classic 1K',
    atqa: '0x0004',
    sak: '0x08',
    ndefType: 'text',
    payload: 'FACILITY:BLDG-B|DOOR:402|KEY:A0A1A2A3A4A5',
    rawHex: '9A 41 C0 2E 08 04 00 46 41 43 49 4C 49 54 59 3A 42 4C 44 47',
    source: 'preset',
    fetchedAt: formatClockTime(),
    rssiDbm: -42,
  },
  {
    id: 'nfc-preset-3',
    label: 'NTAG215 Smart Poster',
    uid: '04:E1:5C:2A:89:63:81',
    protocol: 'NTAG215',
    atqa: '0x0044',
    sak: '0x00',
    ndefType: 'uri',
    payload: 'bruce://nfc/emulate?uid=04E15C2A896381&mode=tag2',
    rawHex: '04 E1 5C 2A 89 63 81 03 24 D1 01 20 55 00 62 72 75 63 65',
    source: 'preset',
    fetchedAt: formatClockTime(),
    rssiDbm: -35,
  },
  {
    id: 'nfc-preset-4',
    label: 'DESFire EV2 Lab Key',
    uid: '04:77:19:FA:3C:11:80',
    protocol: 'DESFire EV2',
    atqa: '0x0344',
    sak: '0x20',
    ndefType: 'mime',
    payload: 'APP_ID:0xF41200|KEY_VER:02|AES128_AUTH',
    rawHex: '04 77 19 FA 3C 11 80 75 77 81 02 80 41 50 50 5F 49 44',
    source: 'preset',
    fetchedAt: formatClockTime(),
    rssiDbm: -45,
  },
];

/**
 * Parses Flipper Zero / Bruce Firmware .nfc dump text files into an NfcTagRecord.
 */
export function parseNfcDumpFileText(fileName: string, content: string): NfcTagRecord {
  const uidMatch = content.match(/UID:\s*([0-9A-Fa-f]{2}(?:[\s:][0-9A-Fa-f]{2})+)/i);
  const atqaMatch = content.match(/ATQA:\s*([0-9A-Fa-f\s]+)/i);
  const sakMatch = content.match(/SAK:\s*([0-9A-Fa-f]+)/i);
  const typeMatch = content.match(/Device type:\s*(.+)/i);

  const rawUid = uidMatch
    ? uidMatch[1].trim().replace(/\s+/g, ':').toUpperCase()
    : '04:B2:9C:11:4E:80:01';

  const atqa = atqaMatch
    ? `0x${atqaMatch[1].trim().replace(/\s+/g, '').toUpperCase()}`
    : '0x0044';

  const sak = sakMatch ? `0x${sakMatch[1].trim().toUpperCase()}` : '0x20';

  let protocol: NfcProtocol = 'ISO14443-A';
  const typeStr = typeMatch ? typeMatch[1].toLowerCase() : '';
  if (typeStr.includes('mifare classic')) protocol = 'MIFARE Classic 1K';
  else if (typeStr.includes('ntag')) protocol = 'NTAG215';
  else if (typeStr.includes('desfire')) protocol = 'DESFire EV2';
  else if (typeStr.includes('felica')) protocol = 'FeliCa';

  const payloadLines = content
    .split('\n')
    .filter((line) => line.startsWith('Page ') || line.startsWith('Block '))
    .slice(0, 4)
    .join(' | ');

  const payload = payloadLines || `Imported ${fileName} (${protocol})`;

  return {
    id: `nfc-file-${Date.now()}`,
    label: fileName.replace(/\.nfc$/i, ''),
    uid: rawUid,
    protocol,
    atqa,
    sak,
    ndefType: 'raw',
    payload,
    rawHex: stringToHexPairs(`${rawUid}|${payload}`).slice(0, 72),
    source: 'file-import',
    fetchedAt: formatClockTime(),
    rssiDbm: -40,
  };
}
