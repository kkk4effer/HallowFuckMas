import { useState } from 'react';
import { Download, HardDriveUpload, Upload, Usb } from 'lucide-react';
import type { FirmwareBinaryInfo, FirmwareBootState, FlashLogEntry } from '../types/hardware';
import { formatBytes, isWebSerialAvailable } from '../services/bruceFirmwareService';

interface FirmwarePanelProps {
  firmware: FirmwareBinaryInfo;
  bootState: FirmwareBootState;
  flashProgress: number;
  flashLogs: FlashLogEntry[];
  onInstallFirmware: () => void;
  onDownloadFirmware: () => void;
  onUploadCustomBin: (file: File) => void;
  onResetToStock: () => void;
}

const PARTITIONS = [
  { name: 'bootloader', type: 'boot', offset: '0x000000', size: '32 KB' },
  { name: 'partitions', type: 'table', offset: '0x008000', size: '4 KB' },
  { name: 'boot_app0', type: 'ota', offset: '0x00E000', size: '8 KB' },
  { name: 'bruce_fw', type: 'app (ota_0)', offset: '0x010000', size: '3.2 MB' },
  { name: 'spiffs_nfc', type: 'data / .nfc', offset: '0x340000', size: '12.6 MB' },
];

export function FirmwarePanel({
  firmware,
  bootState,
  flashProgress,
  flashLogs,
  onInstallFirmware,
  onDownloadFirmware,
  onUploadCustomBin,
  onResetToStock,
}: FirmwarePanelProps) {
  const [usbMessage, setUsbMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const webSerialOk = isWebSerialAvailable();

  const handleUsbProbe = async () => {
    setUsbMessage(null);
    if (!webSerialOk) {
      setUsbMessage(
        'Web Serial requires Chrome or Edge on desktop over HTTPS. Use "Upload & Flash .bin" below to permanently flash any .bin into the T-Embed emulator.'
      );
      return;
    }

    try {
      const nav = navigator as Navigator & {
        serial: { requestPort: () => Promise<{ open: (opts: { baudRate: number }) => Promise<void>; close: () => Promise<void> }> };
      };
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 115200 });
      setUsbMessage('USB ESP32-S3 port opened at 115200 baud. Ready for esptool / Bruce serial.');
      await port.close();
    } catch (err) {
      setUsbMessage(
        err instanceof Error ? `USB selection skipped: ${err.message}` : 'USB selection cancelled.'
      );
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Bruce Firmware .bin Installer &amp; Downloader
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
            <span>Target: {firmware.board}</span>
            <span aria-hidden="true">·</span>
            <span>{firmware.mcu}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatBytes(firmware.sizeBytes)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-emerald-700">
              {bootState === 'bruce' ? 'Saved Permanently in SPI Flash' : 'Not Flashed'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={bootState === 'flashing'}
            onClick={onInstallFirmware}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-orange-600" />
            <span>Download Bruce Firmware .bin</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Firmware .bin Uploader */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onUploadCustomBin(file);
        }}
        className={`block border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-orange-500 bg-orange-50/70'
            : 'border-slate-300 bg-white hover:border-orange-400 hover:bg-slate-50/70'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-6 h-6 text-orange-600" />
          <div className="text-sm font-semibold text-slate-900">
            Drop your .bin firmware file here, or click to select from device
          </div>
          <p className="text-xs text-slate-500">
            Automatically parses ESP32 headers (0xE9 / esp_app_desc_t) and flashes permanently to the LilyGO T-Embed emulator.
          </p>
        </div>
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

      {usbMessage && (
        <div className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-4">
          <span>{usbMessage}</span>
          <button
            type="button"
            onClick={() => setUsbMessage(null)}
            className="text-orange-400 hover:text-orange-300 font-semibold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Binary Metadata & Custom Upload */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Active Binary Image
          </h2>

          <dl className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Filename</dt>
              <dd className="font-mono font-semibold text-slate-900">{firmware.fileName}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Parsed Project / Version</dt>
              <dd className="font-mono text-slate-900">
                {firmware.projectName || 'Bruce'} · {firmware.version}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">ESP32 Header (0xE9)</dt>
              <dd className="font-mono text-slate-900">
                {firmware.espMagicValid ? `Valid · ${firmware.segmentCount ?? 0} segments · ${firmware.entryPoint}` : 'Raw Binary Image'}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Flash Offset / Size</dt>
              <dd className="font-mono tabular-nums text-slate-900">
                {firmware.flashOffset} · {formatBytes(firmware.sizeBytes)}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">SHA-256</dt>
              <dd className="font-mono text-slate-700 break-all text-right">{firmware.sha256}</dd>
            </div>
          </dl>

          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
              <span>Select Custom .bin File</span>
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

            <button
              type="button"
              onClick={() => void handleUsbProbe()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Probe Physical USB T-Embed</span>
            </button>

            {bootState === 'bruce' && (
              <button
                type="button"
                onClick={onResetToStock}
                className="px-3.5 py-2 text-xs font-medium text-rose-700 hover:text-rose-800 cursor-pointer"
              >
                Erase Flash
              </button>
            )}
          </div>
        </div>

        {/* ESP32-S3 Partition Table & Flash Output */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              16 MB ESP32-S3 Partition Map
            </h2>
          </div>

          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-5 font-medium">Name</th>
                <th className="py-2.5 px-3 font-medium">Type</th>
                <th className="py-2.5 px-3 font-medium">Offset</th>
                <th className="py-2.5 px-5 font-medium text-right">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PARTITIONS.map((p) => (
                <tr key={p.name} className="hover:bg-slate-50">
                  <td className="py-2.5 px-5 font-semibold text-slate-900">{p.name}</td>
                  <td className="py-2.5 px-3 text-slate-600">{p.type}</td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-700">{p.offset}</td>
                  <td className="py-2.5 px-5 tabular-nums text-slate-700 text-right">{p.size}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {flashLogs.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-950 text-slate-200 p-4 font-mono text-xs space-y-1">
              <div className="text-orange-400 font-semibold mb-1">Last Flash Output</div>
              {flashLogs.map((log, i) => (
                <div key={`${log.step}-${i}`}>
                  [{String(log.progress).padStart(3, ' ')}%] {log.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
