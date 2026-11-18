export type NavTab = 'emulator' | 'nfc-fetch' | 'wifi-bridge' | 'firmware' | 'carrier-unlock';

export type FirmwareBootState = 'stock' | 'flashing' | 'bruce';

export type BruceAppId =
  | 'menu'
  | 'wifi'
  | 'ble'
  | 'subghz'
  | 'nfc'
  | 'ir'
  | 'files'
  | 'config';

export type NfcProtocol =
  | 'ISO14443-A'
  | 'MIFARE Classic 1K'
  | 'NTAG215'
  | 'DESFire EV2'
  | 'FeliCa';

export interface NfcTagRecord {
  id: string;
  label: string;
  uid: string;
  protocol: NfcProtocol;
  atqa: string;
  sak: string;
  ndefType: 'text' | 'uri' | 'mime' | 'raw';
  payload: string;
  rawHex: string;
  source: 'phone-webnfc' | 'preset' | 'file-import' | 'custom';
  fetchedAt: string;
  rssiDbm: number;
  imageDataUrl?: string;
  imageName?: string;
}

export type WifiBridgeTransport = 'onboard-tunnel' | 'websocket-lan';

export interface WifiTxRxConfig {
  transport: WifiBridgeTransport;
  wifiMode: 'AP (192.168.4.1)' | 'STA (LAN Bridge)';
  ssid: string;
  wsUrl: string;
  wsConnected: boolean;
  baudRate: 115200 | 460800 | 921600;
  txPin: string;
  rxPin: string;
  txEnabled: boolean;
  rxEnabled: boolean;
  autoForwardNfc: boolean;
  txBytes: number;
  rxBytes: number;
  txFrames: number;
  rxFrames: number;
}

export interface TxRxFrame {
  id: string;
  timestamp: string;
  direction: 'TX' | 'RX';
  line: 'WIFI_TX_GPIO43' | 'WIFI_RX_GPIO44' | 'PHONE_NFC' | 'BRUCE_CORE';
  summary: string;
  hex: string;
  bytes: number;
}

export interface FirmwareBinaryInfo {
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

export interface FlashLogEntry {
  step: string;
  progress: number;
  detail: string;
}

export interface WebNdefRecord {
  recordType: string;
  mediaType?: string;
  encoding?: string;
  lang?: string;
  data?: DataView;
}

export interface WebNdefReadingEvent {
  serialNumber: string;
  message: {
    records: WebNdefRecord[];
  };
}

export interface WebNdefReader {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (
    message: string | { records: Array<{ recordType: string; data: string }> },
    options?: { overwrite?: boolean; signal?: AbortSignal }
  ) => Promise<void>;
  onreading: ((event: WebNdefReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}
