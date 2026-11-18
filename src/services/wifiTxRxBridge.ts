import type { NfcTagRecord, TxRxFrame } from '../types/hardware';
import { formatClockTime, stringToHexPairs } from './nfcHardwareService';

export interface WireEncodedPacket {
  ascii: string;
  hex: string;
  bytes: number;
}

/**
 * Encodes an NFC tag record into a Bruce UART-over-Wi-Fi RX frame
 * delivered from Phone NFC -> Onboard Wi-Fi -> ESP32-S3 RX (GPIO44).
 */
export function encodeNfcTagForWifiRx(tag: NfcTagRecord): WireEncodedPacket {
  const frameText = `BRUCE_NFC_RX|UID=${tag.uid}|PROTO=${tag.protocol}|ATQA=${tag.atqa}|SAK=${tag.sak}|DATA=${tag.payload}`;
  const hex = stringToHexPairs(`${frameText}\n`);
  return {
    ascii: frameText,
    hex,
    bytes: new TextEncoder().encode(`${frameText}\n`).byteLength,
  };
}

export function buildTxRxFrame(
  direction: 'TX' | 'RX',
  line: TxRxFrame['line'],
  summary: string,
  asciiOrHexPayload: string,
  isAlreadyHex = false
): TxRxFrame {
  const hex = isAlreadyHex ? asciiOrHexPayload : stringToHexPairs(asciiOrHexPayload);
  const bytes = isAlreadyHex
    ? asciiOrHexPayload.trim().split(/\s+/).filter(Boolean).length
    : new TextEncoder().encode(asciiOrHexPayload).byteLength;

  return {
    id: `frm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: formatClockTime(),
    direction,
    line,
    summary,
    hex,
    bytes,
  };
}

/**
 * Generates an ESP32-S3 Bruce Firmware TX acknowledgement sent back from GPIO43
 * after receiving an NFC frame or command on Wi-Fi RX (GPIO44).
 */
export function createEsp32BruceTxAck(command: string, latestTag?: NfcTagRecord | null): string {
  const cmd = command.trim().toLowerCase();
  if (cmd.startsWith('bruce_nfc_rx') || cmd.includes('nfc')) {
    const uid = latestTag?.uid ?? '04:A3:7F:92:1B:44:80';
    return `[GPIO43_TX] BRUCE_NFC_RECEIVED UID=${uid} EMULATE_READY`;
  }
  if (cmd.includes('wifi')) {
    return '[GPIO43_TX] WIFI_BRIDGE AP=192.168.4.1 RX=GPIO44 TX=GPIO43 LINK_UP';
  }
  if (cmd.includes('subghz') || cmd.includes('433')) {
    return '[GPIO43_TX] CC1101_OK FREQ=433.92MHz MOD=ASK/OOK RSSI=-61dBm';
  }
  if (cmd.includes('help') || cmd === '?') {
    return '[GPIO43_TX] CMDS: nfc_scan, nfc_emulate, wifi_status, subghz_rx, info';
  }
  return `[GPIO43_TX] ACK "${command.trim()}" OK`;
}
