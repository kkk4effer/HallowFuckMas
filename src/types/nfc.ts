export type PageId = 'bridge' | 'bruce' | 'ndef' | 'download' | 'apk';

export type NdefRecordType = 'URI' | 'Text' | 'Wi-Fi' | 'vCard';

export interface NdefTagFile {
  id: string;
  fileName: string;
  title: string;
  recordType: NdefRecordType;
  payload: string;
  rawNdefBytes: number[];
  rawNdefHex: string;
  createdAt: string;
}

export type NfcProtocol =
  | 'ISO14443-A'
  | 'MIFARE Classic 1K'
  | 'NTAG215'
  | 'EMV Contactless'
  | 'FeliCa';

export interface NfcCardPass {
  id: string;
  label: string;
  issuer: string;
  protocol: NfcProtocol;
  uid: string;
  atqa: string;
  sak: string;
  ndefRecord: string;
  sectorHex: string[];
  accentColor: string;
  lastTapped?: string;
}

export type SerialDirection = 'TX' | 'RX';

export type SerialChannel =
  | 'NFC->USB'
  | 'USB->NFC'
  | 'BRUCE_CMD'
  | 'KEEPALIVE'
  | 'SYSTEM';

export interface SerialPacket {
  id: string;
  timestamp: string;
  direction: SerialDirection;
  channel: SerialChannel;
  hexPayload: string;
  asciiSummary: string;
  bytes: number;
}

export type UsbConnectionMode =
  | 'disconnected'
  | 'webserial'
  | 'webusb'
  | 'virtual';

export interface UsbBridgeState {
  mode: UsbConnectionMode;
  portName: string;
  baudRate: number;
  dataBits: 8;
  stopBits: 1;
  parity: 'none';
  dtr: boolean;
  rts: boolean;
  txPin: string;
  rxPin: string;
  keepAliveEnabled: boolean;
  wakeLockActive: boolean;
  webNfcScanning: boolean;
  txBytesTotal: number;
  rxBytesTotal: number;
  txPacketsTotal: number;
  rxPacketsTotal: number;
  lastHeartbeatAt: string | null;
}

export type BruceModuleMode =
  | 'relay'
  | 'reader'
  | 'mifare_dump'
  | 'emulate';

export interface BruceRelayedReading {
  id: string;
  timestamp: string;
  source: 'Phone WebNFC -> USB TX' | 'ESP32-C6 Bruce RX -> Chrome';
  uid: string;
  protocol: NfcProtocol;
  atqa: string;
  sak: string;
  ndefPayload: string;
  rawFrameHex: string;
  rssiDbm: number;
}

export interface ExtensionFileEntry {
  path: string;
  language: 'json' | 'javascript' | 'html' | 'css' | 'markdown';
  description: string;
  content: string;
}

export interface ApkBuildConfig {
  appName: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  cashTag: string;
  unlockPriceUsd: number;
  requirePaywallOnLaunch: boolean;
  autoStartUsbTxRx: boolean;
  enableHceWallet: boolean;
  baudRate: number;
}

export interface ApkBuildStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
  detail: string;
}

// Safe minimal Web API declarations for Web Serial, WebUSB, Web NFC, and WakeLock
export interface WebSerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    flowControl?: string;
  }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}

export interface WebNdefRecord {
  recordType: string;
  mediaType?: string;
  data?: DataView;
}

export interface WebNdefReadingEvent {
  serialNumber: string;
  message: {
    records: WebNdefRecord[];
  };
}

export interface WebNdefReader {
  scan(): Promise<void>;
  write?(message: string | { records: Array<{ recordType: string; data: string }> }): Promise<void>;
  onreading: ((event: WebNdefReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}
