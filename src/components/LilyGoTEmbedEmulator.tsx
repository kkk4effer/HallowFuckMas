import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BatteryCharging,
  Bluetooth,
  Cpu,
  Download,
  FolderOpen,
  HardDriveUpload,
  ImagePlus,
  Nfc,
  Radio,
  RotateCcw,
  RotateCw,
  Settings,
  Sliders,
  Tv,
  Upload,
  Wifi,
} from 'lucide-react';
import type {
  BruceAppId,
  FirmwareBinaryInfo,
  FirmwareBootState,
  FlashLogEntry,
  NfcTagRecord,
  TxRxFrame,
  WifiTxRxConfig,
} from '../types/hardware';
import { formatBytes } from '../services/bruceFirmwareService';

interface LilyGoTEmbedEmulatorProps {
  bootState: FirmwareBootState;
  firmware: FirmwareBinaryInfo;
  flashLogs: FlashLogEntry[];
  flashProgress: number;
  activeApp: BruceAppId;
  onChangeApp: (app: BruceAppId) => void;
  activeNfcTag: NfcTagRecord | null;
  savedTags: NfcTagRecord[];
  wifiConfig: WifiTxRxConfig;
  recentFrames: TxRxFrame[];
  txPulseAt: number;
  rxPulseAt: number;
  onInstallFirmware: () => void;
  onDownloadFirmware: () => void;
  onUploadCustomBin: (file: File) => void;
  onUploadEmulatorFile: (file: File) => void;
  onRebootDevice: () => void;
  onResetToStock: () => void;
  onSendWireCommand: (command: string) => void;
  onRelayTagOverWifi: (tag: NfcTagRecord) => void;
  onAttachTagImage: (tagId: string, file: File) => void;
  onOpenNfcFetchTab: () => void;
  onToggleWifiAutoForward: () => void;
}

const BRUCE_MENU_ITEMS: Array<{
  id: Exclude<BruceAppId, 'menu'>;
  title: string;
  subtitle: string;
  accent: string;
  icon: typeof Wifi;
}> = [
  { id: 'nfc', title: 'NFC / RFID', subtitle: 'Phone Fetch & Emulate', accent: '#22D3EE', icon: Nfc },
  { id: 'wifi', title: 'Wi-Fi TX/RX', subtitle: 'UART Bridge Tunnel', accent: '#38BDF8', icon: Wifi },
  { id: 'subghz', title: 'Sub-GHz', subtitle: 'CC1101 433.92 MHz', accent: '#FB923C', icon: Radio },
  { id: 'ble', title: 'Bluetooth', subtitle: 'BLE Beacon & HID', accent: '#818CF8', icon: Bluetooth },
  { id: 'ir', title: 'Infrared', subtitle: 'NEC / Universal TX', accent: '#F472B6', icon: Tv },
  { id: 'files', title: 'Files / SD', subtitle: 'Saved .nfc & .bin', accent: '#34D399', icon: FolderOpen },
  { id: 'config', title: 'Config', subtitle: 'Pins & Display', accent: '#FBBF24', icon: Settings },
  { id: 'menu' as never, title: 'Bootloader', subtitle: 'Reset / Info', accent: '#94A3B8', icon: Cpu },
];

export function LilyGoTEmbedEmulator({
  bootState,
  firmware,
  flashLogs,
  flashProgress,
  activeApp,
  onChangeApp,
  activeNfcTag,
  savedTags,
  wifiConfig,
  recentFrames,
  txPulseAt,
  rxPulseAt,
  onInstallFirmware,
  onDownloadFirmware,
  onUploadCustomBin,
  onUploadEmulatorFile,
  onRebootDevice,
  onResetToStock,
  onSendWireCommand,
  onRelayTagOverWifi,
  onAttachTagImage,
  onOpenNfcFetchTab,
  onToggleWifiAutoForward,
}: LilyGoTEmbedEmulatorProps) {
  const [menuCursor, setMenuCursor] = useState(0);
  const [encoderAngle, setEncoderAngle] = useState(0);
  const [screenBrightness, setScreenBrightness] = useState(100);
  const [rgbRingEnabled, setRgbRingEnabled] = useState(true);
  const [subGhzFreq, setSubGhzFreq] = useState<'315.00' | '433.92' | '868.35'>('433.92');
  const [subGhzRecording, setSubGhzRecording] = useState(false);
  const [nfcEmulating, setNfcEmulating] = useState(false);
  const [bleAdvertising, setBleAdvertising] = useState(false);
  const [irLastBurst, setIrLastBurst] = useState<string | null>(null);
  const [nowClock, setNowClock] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  );
  const [txLedLit, setTxLedLit] = useState(false);
  const [rxLedLit, setRxLedLit] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowClock(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    }, 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (txPulseAt === 0) return;
    setTxLedLit(true);
    const t = window.setTimeout(() => setTxLedLit(false), 320);
    return () => window.clearTimeout(t);
  }, [txPulseAt]);

  useEffect(() => {
    if (rxPulseAt === 0) return;
    setRxLedLit(true);
    const t = window.setTimeout(() => setRxLedLit(false), 320);
    return () => window.clearTimeout(t);
  }, [rxPulseAt]);

  const menuList = BRUCE_MENU_ITEMS.slice(0, 7);

  const rotateEncoder = (delta: number) => {
    setEncoderAngle((prev) => prev + delta * 30);
    if (bootState !== 'bruce') return;

    if (activeApp === 'menu') {
      setMenuCursor((prev) => (prev + delta + menuList.length) % menuList.length);
    } else if (activeApp === 'subghz') {
      const freqs: Array<'315.00' | '433.92' | '868.35'> = ['315.00', '433.92', '868.35'];
      const idx = freqs.indexOf(subGhzFreq);
      setSubGhzFreq(freqs[(idx + delta + freqs.length) % freqs.length]);
    }
  };

  const pressEncoderCenter = () => {
    if (bootState === 'stock') {
      onInstallFirmware();
      return;
    }
    if (bootState !== 'bruce') return;

    if (activeApp === 'menu') {
      const chosen = menuList[menuCursor];
      if (chosen) onChangeApp(chosen.id);
    } else if (activeApp === 'nfc' && activeNfcTag) {
      setNfcEmulating((prev) => !prev);
      onSendWireCommand(`nfc_emulate ${activeNfcTag.uid}`);
    } else if (activeApp === 'subghz') {
      setSubGhzRecording((prev) => !prev);
      onSendWireCommand(`subghz_rx ${subGhzFreq}`);
    } else if (activeApp === 'ble') {
      setBleAdvertising((prev) => !prev);
      onSendWireCommand(bleAdvertising ? 'ble_stop' : 'ble_beacon_start');
    } else if (activeApp === 'ir') {
      setIrLastBurst(`NEC 0x20DF10EF (${new Date().toLocaleTimeString('en-US', { hour12: false })})`);
      onSendWireCommand('ir_tx NEC 0x20DF10EF');
    } else if (activeApp === 'wifi') {
      onSendWireCommand('wifi_ping');
    }
  };

  const pressBackButton = () => {
    if (bootState === 'bruce' && activeApp !== 'menu') {
      onChangeApp('menu');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      rotateEncoder(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      rotateEncoder(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pressEncoderCenter();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      pressBackButton();
    }
  };

  const ringColor =
    bootState === 'flashing'
      ? 'rgba(249, 115, 22, 0.85)'
      : txLedLit
        ? 'rgba(249, 115, 22, 0.9)'
        : rxLedLit
          ? 'rgba(34, 211, 238, 0.9)'
          : bootState === 'bruce'
            ? 'rgba(16, 185, 129, 0.45)'
            : 'rgba(100, 116, 139, 0.3)';

  return (
    <section className="space-y-5">
      {/* Top Action & Hardware Context Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            LilyGO T-Embed CC1101 Emulator
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
            <span>ESP32-S3R8</span>
            <span aria-hidden="true">·</span>
            <span>ST7789 Extra-Large IPS Display</span>
            <span aria-hidden="true">·</span>
            <span>
              Firmware:{' '}
              <strong className="font-medium text-slate-700">
                {bootState === 'bruce'
                  ? `${firmware.projectName || firmware.fileName} (${firmware.version}) · Permanent SPI Flash`
                  : bootState === 'flashing'
                    ? `Flashing ${firmware.fileName}...`
                    : 'Factory Bootloader'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {wifiConfig.txPin} / {wifiConfig.rxPin} over Wi-Fi
            </span>
          </div>
        </div>

        {/* Requested Primary Firmware Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={bootState === 'flashing'}
            onClick={onInstallFirmware}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            <HardDriveUpload className="w-4 h-4" />
            <span>
              {bootState === 'flashing'
                ? `Flashing ${flashProgress}%`
                : 'Install Bruce Firmware .bin'}
            </span>
          </button>

          <button
            type="button"
            onClick={onDownloadFirmware}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Download className="w-4 h-4 text-orange-600" />
            <span>Download Bruce Firmware .bin</span>
          </button>

          <label className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer">
            <span>Upload &amp; Flash .bin</span>
            <input
              type="file"
              accept=".bin,.uf2,.hex,.elf,.img,.raw,application/octet-stream"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadCustomBin(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Physical LilyGO T-Embed Hardware Enclosure (Extra-Big Display Focal Anchor) */}
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="LilyGO T-Embed hardware emulator. Use Left and Right arrow keys to turn the rotary encoder, Enter to select, Escape for back."
        className="relative bg-[#151921] text-slate-100 rounded-[28px] border border-slate-800 p-4 sm:p-6 lg:p-7 shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        {/* Top Hardware Edge: Antenna stub, USB-C, Onboard Wi-Fi TX/RX Pin Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800/90 text-xs font-mono text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-200 font-semibold tracking-wide">
              LILYGO T-EMBED
            </span>
            <span className="text-slate-500">|</span>
            <span>USB-C OTG</span>
            <span className="text-slate-500">|</span>
            <span>SD: MOUNTED</span>
          </div>

          {/* Wired TX / RX Lines Through Onboard Wi-Fi Indicator */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full transition-colors ${
                  txLedLit ? 'bg-orange-400 shadow-[0_0_8px_#fb923c]' : 'bg-orange-950 border border-orange-700/60'
                }`}
              />
              <span className={txLedLit ? 'text-orange-300' : 'text-slate-400'}>
                {wifiConfig.txPin}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full transition-colors ${
                  rxLedLit ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-cyan-950 border border-cyan-700/60'
                }`}
              />
              <span className={rxLedLit ? 'text-cyan-300' : 'text-slate-400'}>
                {wifiConfig.rxPin}
              </span>
            </div>
            <span className="text-emerald-400">
              Wi-Fi {wifiConfig.wifiMode}
            </span>
          </div>
        </div>

        {/* Main Chassis Layout: Extra-Big IPS Display (Left/Center) + Rotary Encoder Wheel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6 items-center">
          {/* EXTRA-BIG IPS DISPLAY BEZEL */}
          <div className="bg-[#080B10] rounded-2xl border-2 border-slate-800 p-3 sm:p-4 shadow-inner">
            <div
              style={{ opacity: screenBrightness / 100 }}
              className="relative w-full min-h-[390px] sm:min-h-[450px] lg:min-h-[490px] rounded-xl bg-[#0B0F17] border border-slate-800/80 overflow-hidden flex flex-col font-mono transition-opacity duration-150"
            >
              {/* TFT Top Status Strip */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#101622] border-b border-slate-800/90 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-orange-400 truncate max-w-[230px]">
                    {bootState === 'bruce'
                      ? firmware.isCustom
                        ? `${(firmware.projectName || firmware.fileName).toUpperCase()} · ${firmware.version}`
                        : `BRUCE v${firmware.version}`
                      : bootState === 'flashing'
                        ? 'ESPTOOL FLASH'
                        : 'T-EMBED BOOT'}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-cyan-300 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{wifiConfig.ssid}</span>
                  </span>
                </div>

                <div className="flex items-center gap-4 tabular-nums text-slate-300">
                  <span>
                    TX:{wifiConfig.txFrames} / RX:{wifiConfig.rxFrames}
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-emerald-400">
                    <BatteryCharging className="w-3.5 h-3.5" />
                    96%
                  </span>
                  <span>{nowClock}</span>
                </div>
              </div>

              {/* TFT Main Screen Viewport */}
              <div className="flex-1 p-4 sm:p-6 flex flex-col justify-between">
                {/* STATE 1: FACTORY STOCK BOOTLOADER */}
                {bootState === 'stock' && (
                  <div className="flex-1 flex flex-col justify-between gap-6">
                    <div className="space-y-3">
                      <div className="text-xs text-cyan-400">
                        LILYGO T-EMBED CC1101 · ESP32-S3R8 (REV 0.2)
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Hardware Ready — No Bruce OS Installed
                      </h2>
                      <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                        The onboard Wi-Fi UART bridge is wired to{' '}
                        <span className="text-orange-300">{wifiConfig.txPin}</span> and{' '}
                        <span className="text-cyan-300">{wifiConfig.rxPin}</span>. Flash{' '}
                        <span className="text-white font-semibold">{firmware.fileName}</span> to boot
                        the full Bruce Firmware OS inside this display.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="bg-[#121826] border border-slate-800 rounded-lg p-3.5">
                        <div className="text-slate-400">Target Binary</div>
                        <div className="text-slate-100 font-semibold mt-1 truncate">
                          {firmware.fileName}
                        </div>
                      </div>
                      <div className="bg-[#121826] border border-slate-800 rounded-lg p-3.5">
                        <div className="text-slate-400">Flash Offset / Size</div>
                        <div className="text-slate-100 font-semibold mt-1 tabular-nums">
                          {firmware.flashOffset} · {formatBytes(firmware.sizeBytes)}
                        </div>
                      </div>
                      <div className="bg-[#121826] border border-slate-800 rounded-lg p-3.5">
                        <div className="text-slate-400">Phone NFC Link</div>
                        <div className="text-cyan-300 font-semibold mt-1">
                          {activeNfcTag ? `Queued: ${activeNfcTag.uid}` : 'Waiting in NFC Fetch'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={onInstallFirmware}
                        className="px-4 py-2.5 text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors cursor-pointer"
                      >
                        Press OK or Click to Install Bruce Firmware .bin
                      </button>
                      <button
                        type="button"
                        onClick={onOpenNfcFetchTab}
                        className="px-4 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Open NFC Fetch
                      </button>
                    </div>
                  </div>
                )}

                {/* STATE 2: FLASHING .BIN TO SPI FLASH */}
                {bootState === 'flashing' && (
                  <div className="flex-1 flex flex-col justify-between gap-5">
                    <div>
                      <div className="text-xs text-orange-400">
                        esptool.py v4.7.0 — Writing {firmware.fileName}
                      </div>
                      <h2 className="text-2xl font-bold text-white mt-1">
                        Flashing ESP32-S3 SPI Flash ({flashProgress}%)
                      </h2>
                    </div>

                    <div className="w-full h-4 bg-slate-900 border border-slate-700 rounded overflow-hidden">
                      <div
                        style={{ width: `${flashProgress}%` }}
                        className="h-full bg-orange-500 transition-all duration-200"
                      />
                    </div>

                    <div className="flex-1 bg-[#070A0F] border border-slate-800 rounded-lg p-4 space-y-1.5 text-xs overflow-y-auto max-h-60">
                      {flashLogs.map((entry, idx) => (
                        <div key={`${entry.step}-${idx}`} className="flex items-start gap-3">
                          <span className="text-orange-400 tabular-nums shrink-0">
                            [{String(entry.progress).padStart(3, ' ')}%]
                          </span>
                          <span className="text-slate-200">{entry.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* STATE 3: FULL INTERACTIVE BRUCE FIRMWARE OS */}
                {bootState === 'bruce' && activeApp === 'menu' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-400">
                          Main Launcher · Rotate dial or click module
                        </div>
                        <div className="text-lg font-bold text-white mt-0.5">
                          {menuList[menuCursor]?.title}
                        </div>
                      </div>
                      {activeNfcTag && (
                        <button
                          type="button"
                          onClick={() => onChangeApp('nfc')}
                          className="text-xs bg-cyan-950/60 border border-cyan-800/80 text-cyan-200 px-3 py-1.5 rounded-md hover:bg-cyan-900/60 transition-colors cursor-pointer"
                        >
                          NFC Buffer: {activeNfcTag.uid}
                        </button>
                      )}
                    </div>

                    {/* Large Bruce Module Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-auto">
                      {menuList.map((item, idx) => {
                        const Icon = item.icon;
                        const selected = idx === menuCursor;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setMenuCursor(idx);
                              onChangeApp(item.id);
                            }}
                            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between min-h-[112px] ${
                              selected
                                ? 'bg-[#172033] border-orange-500 text-white'
                                : 'bg-[#101521] border-slate-800 text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <Icon
                              className="w-6 h-6"
                              style={{ color: item.accent }}
                            />
                            <div className="mt-3">
                              <div className="text-sm font-bold leading-tight">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {item.subtitle}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Bottom Hint Bar inside TFT */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                      <span>[Dial / Arrows] Move · [OK / Enter] Open · [Back] Home</span>
                      <span className="text-emerald-400">
                        SHA256: {firmware.sha256.slice(0, 12)}
                      </span>
                    </div>
                  </div>
                )}

                {/* BRUCE SUB-APP: NFC / RFID */}
                {bootState === 'bruce' && activeApp === 'nfc' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-cyan-400">BRUCE / NFC-RFID RELAY</div>
                        <h3 className="text-xl font-bold text-white">
                          {activeNfcTag ? activeNfcTag.label : 'No NFC Tag Loaded'}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeApp('menu')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>

                    {activeNfcTag ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-[#111726] border border-slate-800 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">UID</span>
                            <span className="text-cyan-300 font-bold tabular-nums">
                              {activeNfcTag.uid}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Protocol</span>
                            <span className="text-slate-100">{activeNfcTag.protocol}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">ATQA / SAK</span>
                            <span className="text-slate-100 tabular-nums">
                              {activeNfcTag.atqa} / {activeNfcTag.sak}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Source</span>
                            <span className="text-emerald-400">{activeNfcTag.source}</span>
                          </div>
                        </div>

                        <div className="bg-[#111726] border border-slate-800 rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Payload &amp; Tag Image</span>
                            {activeNfcTag.imageName && (
                              <span className="text-[11px] text-emerald-400 truncate max-w-[140px]">
                                {activeNfcTag.imageName}
                              </span>
                            )}
                          </div>
                          {activeNfcTag.imageDataUrl && (
                            <img
                              src={activeNfcTag.imageDataUrl}
                              alt={`${activeNfcTag.label} tag attachment`}
                              referrerPolicy="no-referrer"
                              className="w-full h-24 object-cover rounded-md border border-slate-700"
                            />
                          )}
                          <div className="text-slate-100 break-all">{activeNfcTag.payload}</div>
                          <div className="text-[11px] text-orange-300/90 break-all pt-1 border-t border-slate-800">
                            {activeNfcTag.rawHex}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#111726] border border-slate-800 rounded-lg p-6 text-center space-y-3">
                        <p className="text-sm text-slate-300">
                          Fetch a tag from your phone&apos;s NFC hardware or select a preset in NFC Fetch.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5">
                      {activeNfcTag && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setNfcEmulating((p) => !p);
                              onSendWireCommand(`nfc_emulate ${activeNfcTag.uid}`);
                            }}
                            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                              nfcEmulating
                                ? 'bg-emerald-600 text-white'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                            }`}
                          >
                            {nfcEmulating ? 'Emulating UID Active (Click to Stop)' : 'Emulate Loaded UID'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRelayTagOverWifi(activeNfcTag)}
                            className="px-3.5 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-md transition-colors cursor-pointer"
                          >
                            Stream to Wi-Fi RX ({wifiConfig.rxPin})
                          </button>
                          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer">
                            <ImagePlus className="w-3.5 h-3.5 text-orange-400" />
                            <span>{activeNfcTag.imageDataUrl ? 'Replace Tag Image' : 'Upload Image to Tag'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onAttachTagImage(activeNfcTag.id, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={onOpenNfcFetchTab}
                        className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        Go to NFC Fetch Tab
                      </button>
                    </div>
                  </div>
                )}

                {/* BRUCE SUB-APP: WI-FI TX/RX BRIDGE */}
                {bootState === 'bruce' && activeApp === 'wifi' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-sky-400">BRUCE / WI-FI UART TUNNEL</div>
                        <h3 className="text-xl font-bold text-white">
                          TX ({wifiConfig.txPin}) &amp; RX ({wifiConfig.rxPin}) over Wi-Fi
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeApp('menu')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>

                    <div className="bg-[#070A0F] border border-slate-800 rounded-lg p-3.5 flex-1 max-h-52 overflow-y-auto space-y-1.5 text-xs">
                      {recentFrames.slice(0, 7).map((frm) => (
                        <div key={frm.id} className="flex items-center gap-2.5">
                          <span className="text-slate-500 tabular-nums shrink-0">
                            {frm.timestamp}
                          </span>
                          <span
                            className={`font-bold shrink-0 ${
                              frm.direction === 'TX' ? 'text-orange-400' : 'text-cyan-400'
                            }`}
                          >
                            {frm.direction}
                          </span>
                          <span className="text-slate-200 truncate">{frm.summary}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onSendWireCommand('wifi_status')}
                        className="px-3.5 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-md cursor-pointer"
                      >
                        Ping Wi-Fi TX/RX
                      </button>
                      <button
                        type="button"
                        onClick={onToggleWifiAutoForward}
                        className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        Auto-Forward NFC: {wifiConfig.autoForwardNfc ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                )}

                {/* BRUCE SUB-APP: SUB-GHZ CC1101 */}
                {bootState === 'bruce' && activeApp === 'subghz' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-orange-400">BRUCE / CC1101 SUB-GHZ</div>
                        <h3 className="text-xl font-bold text-white">
                          Frequency Analyzer · {subGhzFreq} MHz
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeApp('menu')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>

                    {/* Simulated CC1101 Spectrum Bars */}
                    <div className="bg-[#070A0F] border border-slate-800 rounded-lg p-4 h-36 flex items-end gap-1.5">
                      {[28, 36, 22, 48, 72, 92, 65, 44, 31, 55, 81, 40, 29, 60, 42, 26].map(
                        (h, i) => (
                          <div
                            key={i}
                            style={{
                              height: `${subGhzRecording ? Math.min(100, h + ((i * 7) % 24)) : h}%`,
                            }}
                            className="flex-1 bg-orange-500/80 rounded-t transition-all duration-200"
                          />
                        )
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {(['315.00', '433.92', '868.35'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setSubGhzFreq(f)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                            subGhzFreq === f
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {f} MHz
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSubGhzRecording((p) => !p);
                          onSendWireCommand(`subghz_rx ${subGhzFreq}`);
                        }}
                        className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer ml-auto"
                      >
                        {subGhzRecording ? 'Stop Capture' : 'Capture RF Frame'}
                      </button>
                    </div>
                  </div>
                )}

                {/* BRUCE SUB-APP: BLE */}
                {bootState === 'bruce' && activeApp === 'ble' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-indigo-400">BRUCE / BLUETOOTH LE</div>
                        <h3 className="text-xl font-bold text-white">
                          BLE Advertiser &amp; HID Bridge
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeApp('menu')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>
                    <div className="bg-[#111726] border border-slate-800 rounded-lg p-5 space-y-2 text-xs">
                      <div className="text-slate-300">
                        Advertiser State:{' '}
                        <span className={bleAdvertising ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {bleAdvertising ? 'BROADCASTING (20ms interval)' : 'IDLE'}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        ESP32-S3 BLE 5.0 Radio · TX Power +9 dBm
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBleAdvertising((p) => !p);
                        onSendWireCommand(bleAdvertising ? 'ble_stop' : 'ble_beacon_start');
                      }}
                      className="self-start px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md cursor-pointer"
                    >
                      {bleAdvertising ? 'Stop BLE Beacon' : 'Start BLE Beacon'}
                    </button>
                  </div>
                )}

                {/* BRUCE SUB-APP: IR */}
                {bootState === 'bruce' && activeApp === 'ir' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-pink-400">BRUCE / INFRARED TX</div>
                        <h3 className="text-xl font-bold text-white">
                          Onboard IR Diode (GPIO2)
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeApp('menu')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>
                    <div className="bg-[#111726] border border-slate-800 rounded-lg p-5 text-xs space-y-2">
                      <div className="text-slate-300">
                        Carrier: 38 kHz · Protocol: NEC / Samsung / Sony
                      </div>
                      <div className="text-pink-300">
                        {irLastBurst ? `Last Burst: ${irLastBurst}` : 'Ready to transmit IR frame'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIrLastBurst(`NEC Power 0x20DF10EF`);
                          onSendWireCommand('ir_tx NEC 0x20DF10EF');
                        }}
                        className="px-4 py-2 text-xs font-semibold bg-pink-600 hover:bg-pink-500 text-white rounded-md cursor-pointer"
                      >
                        Send Power IR Burst
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIrLastBurst(`TV-B-Gone Sweep (14 codes)`);
                          onSendWireCommand('ir_tvbgone');
                        }}
                        className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        Run TV-B-Gone Sweep
                      </button>
                    </div>
                  </div>
                )}

                {/* BRUCE SUB-APP: FILES / SD */}
                {bootState === 'bruce' && activeApp === 'files' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-emerald-400">BRUCE / SD &amp; SPIFFS</div>
                        <h3 className="text-xl font-bold text-white">
                          /nfc/ Saved Tag Dumps
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload File (.nfc / .bin / .txt)</span>
                          <input
                            type="file"
                            accept=".nfc,.bin,.txt,.json,.hex,.sub,.ir,application/octet-stream,text/plain"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) onUploadEmulatorFile(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => onChangeApp('menu')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Back</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {savedTags.map((tag) => (
                        <div
                          key={tag.id}
                          className="bg-[#111726] hover:bg-[#172033] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onRelayTagOverWifi(tag);
                              onChangeApp('nfc');
                            }}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                          >
                            {tag.imageDataUrl ? (
                              <img
                                src={tag.imageDataUrl}
                                alt={`${tag.label} preview`}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded object-cover border border-slate-700 shrink-0"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                                <Nfc className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block text-slate-100 font-semibold truncate">
                                /nfc/{tag.label.toLowerCase().replace(/\s+/g, '_')}.nfc
                              </span>
                              <span className="block text-[11px] text-cyan-300 tabular-nums">
                                {tag.uid}
                              </span>
                            </span>
                          </button>

                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer shrink-0">
                            <ImagePlus className="w-3.5 h-3.5 text-orange-400" />
                            <span>{tag.imageDataUrl ? 'Change Img' : 'Upload Img'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onAttachTagImage(tag.id, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* BRUCE SUB-APP: CONFIG */}
                {bootState === 'bruce' && activeApp === 'config' && (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-amber-400">BRUCE / HARDWARE CONFIG</div>
                        <h3 className="text-xl font-bold text-white">
                          Display, Pins &amp; Firmware State
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeApp('menu')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-[#111726] border border-slate-800 rounded-lg p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-amber-400" />
                            <span>IPS Brightness</span>
                          </span>
                          <span className="tabular-nums text-white">{screenBrightness}%</span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={100}
                          value={screenBrightness}
                          onChange={(e) => setScreenBrightness(Number(e.target.value))}
                          className="w-full accent-orange-500 cursor-pointer"
                        />
                      </div>

                      <div className="bg-[#111726] border border-slate-800 rounded-lg p-3.5 flex items-center justify-between">
                        <div>
                          <div className="text-slate-200 font-medium">WS2812 Encoder Ring</div>
                          <div className="text-slate-400 mt-0.5">GPIO42 RGB Feedback</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRgbRingEnabled((p) => !p)}
                          className={`px-3 py-1.5 rounded font-semibold cursor-pointer ${
                            rgbRingEnabled
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {rgbRingEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={onRebootDevice}
                        className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md cursor-pointer"
                      >
                        Soft Reboot Bruce
                      </button>
                      <button
                        type="button"
                        onClick={onResetToStock}
                        className="px-3.5 py-2 text-xs font-semibold bg-rose-950/80 hover:bg-rose-900 border border-rose-800/70 text-rose-200 rounded-md cursor-pointer"
                      >
                        Erase Flash (Factory Bootloader)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT HARDWARE CONTROLS: ROTARY ENCODER + PHYSICAL BUTTONS */}
          <div className="flex flex-col items-center justify-center gap-5 py-2">
            {/* Rotary Encoder Dial with WS2812 RGB Ring */}
            <div className="flex flex-col items-center gap-3">
              <div
                onWheel={(e) => {
                  e.preventDefault();
                  rotateEncoder(e.deltaY > 0 ? 1 : -1);
                }}
                style={{
                  boxShadow: rgbRingEnabled ? `0 0 28px ${ringColor}` : 'none',
                  borderColor: rgbRingEnabled ? ringColor : 'rgba(51,65,85,0.6)',
                }}
                className="relative w-40 h-40 rounded-full border-4 bg-[#1B202B] flex items-center justify-center transition-all duration-200 select-none"
              >
                {/* Rotating knurled outer dial */}
                <div
                  style={{ transform: `rotate(${encoderAngle}deg)` }}
                  className="absolute inset-2 rounded-full border border-slate-700 bg-gradient-to-b from-[#262D3B] to-[#171C26] transition-transform duration-150"
                >
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-3.5 rounded-full bg-orange-500" />
                </div>

                {/* Center Push Button (OK) */}
                <button
                  type="button"
                  onClick={pressEncoderCenter}
                  aria-label="Rotary Encoder Center Press (OK)"
                  className="relative z-10 w-20 h-20 rounded-full bg-[#12161E] hover:bg-[#191F2B] active:scale-95 border border-slate-700 flex flex-col items-center justify-center text-xs font-mono font-bold text-slate-100 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  <span>OK</span>
                  <span className="text-[10px] font-normal text-slate-400">PRESS</span>
                </button>
              </div>

              {/* Explicit CCW / CW Stepper Buttons for mouse/touch precision */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => rotateEncoder(-1)}
                  aria-label="Rotate encoder counter-clockwise"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#222834] hover:bg-[#2B3342] text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>CCW</span>
                </button>
                <button
                  type="button"
                  onClick={() => rotateEncoder(1)}
                  aria-label="Rotate encoder clockwise"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#222834] hover:bg-[#2B3342] text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
                >
                  <span>CW</span>
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tactile Side Buttons: Back (GPIO0) & Reset (EN) */}
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-[210px]">
              <button
                type="button"
                onClick={pressBackButton}
                className="px-3 py-2.5 text-xs font-mono font-medium bg-[#202632] hover:bg-[#2A3242] text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
              >
                BACK (IO0)
              </button>
              <button
                type="button"
                onClick={onRebootDevice}
                className="px-3 py-2.5 text-xs font-mono font-medium bg-[#202632] hover:bg-[#2A3242] text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
              >
                RST (EN)
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
