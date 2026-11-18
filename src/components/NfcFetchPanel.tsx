import { useRef, useState } from 'react';
import {
  FileUp,
  ImagePlus,
  Nfc,
  RadioTower,
  Send,
  Smartphone,
  Wifi,
} from 'lucide-react';
import type { NfcProtocol, NfcTagRecord, WifiTxRxConfig } from '../types/hardware';
import {
  createPhoneNdefReader,
  dataViewToHexPairs,
  formatClockTime,
  isPhoneWebNfcSupported,
  parseNfcDumpFileText,
  stringToHexPairs,
} from '../services/nfcHardwareService';

interface NfcFetchPanelProps {
  tags: NfcTagRecord[];
  activeTagId: string | null;
  wifiConfig: WifiTxRxConfig;
  onFetchedTag: (tag: NfcTagRecord) => void;
  onAttachTagImage: (tagId: string, file: File) => void;
  onSelectAndWireTag: (tag: NfcTagRecord) => void;
  onOpenEmulator: () => void;
}

export function NfcFetchPanel({
  tags,
  activeTagId,
  wifiConfig,
  onFetchedTag,
  onAttachTagImage,
  onSelectAndWireTag,
  onOpenEmulator,
}: NfcFetchPanelProps) {
  const webNfcAvailable = isPhoneWebNfcSupported();
  const [scanning, setScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [writePayload, setWritePayload] = useState('https://bruce.local/t-embed');
  const [writing, setWriting] = useState(false);

  const [customLabel, setCustomLabel] = useState('Lab Access Card');
  const [customUid, setCustomUid] = useState('04:9F:22:B8:1C:40:80');
  const [customProtocol, setCustomProtocol] = useState<NfcProtocol>('ISO14443-A');
  const [customPayload, setCustomPayload] = useState('ACCESS_GRANTED|DOOR=LAB_2');
  const [customImageDataUrl, setCustomImageDataUrl] = useState<string | undefined>(undefined);
  const [customImageName, setCustomImageName] = useState<string | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);

  const handleStartPhoneScan = async () => {
    setStatusMessage(null);
    if (scanning && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setScanning(false);
      setStatusMessage('Phone NFC listener stopped.');
      return;
    }

    const reader = createPhoneNdefReader();
    if (!reader) {
      setStatusMessage(
        'Native Web NFC (NDEFReader) is only exposed on Android Chrome over HTTPS. You can still load presets, import .nfc dumps, or inject custom tags below to test the Wi-Fi TX/RX bridge.'
      );
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await reader.scan({ signal: controller.signal });
      setScanning(true);
      setStatusMessage('Phone NFC antenna active. Tap an NFC card or tag against the back of your phone.');

      reader.onreading = (event) => {
        const uid = event.serialNumber
          ? event.serialNumber.toUpperCase()
          : '04:PH:0N:E1:NF:C0';

        const firstRecord = event.message.records[0];
        let payload = 'EMPTY_NDEF_TAG';
        let rawHex = stringToHexPairs(uid);
        let ndefType: NfcTagRecord['ndefType'] = 'raw';

        if (firstRecord?.data) {
          const decoded = new TextDecoder().decode(firstRecord.data).trim();
          payload = decoded || `Record type: ${firstRecord.recordType}`;
          rawHex = dataViewToHexPairs(firstRecord.data);
          if (firstRecord.recordType === 'url') ndefType = 'uri';
          else if (firstRecord.recordType === 'text') ndefType = 'text';
          else if (firstRecord.recordType === 'mime') ndefType = 'mime';
        }

        const fetched: NfcTagRecord = {
          id: `phone-${Date.now()}`,
          label: `Phone NFC (${uid.slice(0, 8)})`,
          uid,
          protocol: 'ISO14443-A',
          atqa: '0x0044',
          sak: '0x20',
          ndefType,
          payload,
          rawHex,
          source: 'phone-webnfc',
          fetchedAt: formatClockTime(),
          rssiDbm: -34,
        };

        onFetchedTag(fetched);
        setStatusMessage(`Fetched UID ${uid} from phone NFC hardware into Wi-Fi RX (${wifiConfig.rxPin}).`);
      };

      reader.onreadingerror = () => {
        setStatusMessage('NFC read error: hold the tag steady near the phone NFC coil.');
      };
    } catch (err) {
      setScanning(false);
      setStatusMessage(
        err instanceof Error ? `Web NFC error: ${err.message}` : 'Unable to start phone NFC scan.'
      );
    }
  };

  const handleWritePhoneNfc = async () => {
    setStatusMessage(null);
    const reader = createPhoneNdefReader();
    if (!reader) {
      setStatusMessage(
        'Writing physical tags requires Android Chrome Web NFC. Use "Wire to Wi-Fi RX" to load tags directly into the T-Embed.'
      );
      return;
    }

    setWriting(true);
    try {
      await reader.write(writePayload);
      setStatusMessage(`Successfully wrote "${writePayload}" to physical NFC tag.`);
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? `NFC write failed: ${err.message}` : 'NFC write cancelled.'
      );
    } finally {
      setWriting(false);
    }
  };

  const handleImportNfcFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseNfcDumpFileText(file.name, text);
    onFetchedTag(parsed);
    setStatusMessage(`Imported ${file.name} (UID ${parsed.uid}) and routed to Wi-Fi RX (${wifiConfig.rxPin}).`);
  };

  const handleCreateCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = customUid.trim().toUpperCase() || '04:00:00:00:00:01';
    const record: NfcTagRecord = {
      id: `custom-${Date.now()}`,
      label: customLabel.trim() || 'Custom NFC Tag',
      uid: cleanUid,
      protocol: customProtocol,
      atqa: customProtocol === 'MIFARE Classic 1K' ? '0x0004' : '0x0044',
      sak: customProtocol === 'MIFARE Classic 1K' ? '0x08' : '0x20',
      ndefType: 'text',
      payload: customPayload.trim() || 'BRUCE_CUSTOM_PAYLOAD',
      rawHex: stringToHexPairs(`${cleanUid}|${customPayload}`),
      source: 'custom',
      fetchedAt: formatClockTime(),
      rssiDbm: -39,
      imageDataUrl: customImageDataUrl,
      imageName: customImageName,
    };
    onFetchedTag(record);
    setCustomImageDataUrl(undefined);
    setCustomImageName(undefined);
    setStatusMessage(`Created & wired ${record.uid} to Wi-Fi ${wifiConfig.rxPin}.`);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            NFC Fetch &amp; Phone Hardware Bridge
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
            <span>
              Phone Web NFC:{' '}
              <strong className={webNfcAvailable ? 'text-emerald-700' : 'text-slate-700'}>
                {webNfcAvailable ? 'Hardware Ready (NDEFReader)' : 'Desktop / Fallback Mode'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              NFC Ingest Line: <strong className="text-slate-700">{wifiConfig.rxPin} (Wi-Fi RX)</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Auto-Forward: {wifiConfig.autoForwardNfc ? 'Enabled' : 'Manual'}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleStartPhoneScan()}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              scanning
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-orange-600 hover:bg-orange-500 text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{scanning ? 'Listening to Phone NFC (Stop)' : 'Start Phone NFC Fetch'}</span>
          </button>

          <label className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer">
            <FileUp className="w-4 h-4 text-slate-600" />
            <span>Import .nfc Dump</span>
            <input
              type="file"
              accept=".nfc,.txt"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportNfcFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-4">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-orange-400 hover:text-orange-300 font-semibold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Workspace: Fetched Tags List + Custom / Physical Write Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
        {/* Left: Fetched & Preset NFC Tags */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Fetched NFC Tags ({tags.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select any tag to stream its UID and NDEF payload into the T-Embed&apos;s onboard Wi-Fi RX ({wifiConfig.rxPin}) line.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenEmulator}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              View on T-Embed Screen
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {tags.map((tag) => {
              const isActive = tag.id === activeTagId;
              return (
                <div
                  key={tag.id}
                  className={`p-4 sm:px-5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isActive ? 'bg-orange-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {tag.imageDataUrl ? (
                      <img
                        src={tag.imageDataUrl}
                        alt={`${tag.label} attachment`}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <Nfc className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {tag.label}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-mono text-slate-600">{tag.protocol}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500">{tag.source}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                        <span className="font-semibold text-slate-800">UID {tag.uid}</span>
                        <span className="text-slate-500">ATQA {tag.atqa}</span>
                        <span className="text-slate-500">SAK {tag.sak}</span>
                        <span className="text-slate-400">{tag.fetchedAt}</span>
                      </div>

                      <p className="text-xs font-mono text-slate-600 truncate max-w-xl">
                        {tag.payload}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5 text-orange-600" />
                      <span>{tag.imageDataUrl ? 'Replace Image' : 'Upload Image'}</span>
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

                    <button
                      type="button"
                      onClick={() => onSelectAndWireTag(tag)}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-cyan-700 text-white hover:bg-cyan-600'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      <span>{isActive ? 'Re-Send to Wi-Fi RX' : 'Wire to Wi-Fi RX'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Custom Tag Frame Builder & Physical Phone NDEF Writer */}
        <div className="space-y-6">
          <form
            onSubmit={handleCreateCustomTag}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Nfc className="w-4 h-4 text-orange-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Fetch / Inject Custom NFC Tag
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tag Label</label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">UID (Hex)</label>
                  <input
                    type="text"
                    value={customUid}
                    onChange={(e) => setCustomUid(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Protocol</label>
                  <select
                    value={customProtocol}
                    onChange={(e) => setCustomProtocol(e.target.value as NfcProtocol)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="ISO14443-A">ISO14443-A</option>
                    <option value="MIFARE Classic 1K">MIFARE Classic 1K</option>
                    <option value="NTAG215">NTAG215</option>
                    <option value="DESFire EV2">DESFire EV2</option>
                    <option value="FeliCa">FeliCa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  NDEF / Sector Payload
                </label>
                <textarea
                  rows={2}
                  value={customPayload}
                  onChange={(e) => setCustomPayload(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5 text-orange-600" />
                  <span>{customImageName ? `Image: ${customImageName}` : 'Attach Tag Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setCustomImageDataUrl(reader.result);
                          setCustomImageName(file.name);
                        }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {customImageDataUrl && (
                  <img
                    src={customImageDataUrl}
                    alt="Selected tag attachment preview"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded object-cover border border-slate-200"
                  />
                )}
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Fetch &amp; Wire to Wi-Fi RX</span>
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <RadioTower className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Write Physical Tag (Phone Web NFC)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Write an NDEF record back to a physical tag using your phone&apos;s NFC hardware.
            </p>
            <input
              type="text"
              value={writePayload}
              onChange={(e) => setWritePayload(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="button"
              disabled={writing}
              onClick={() => void handleWritePhoneNfc()}
              className="w-full px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              {writing ? 'Hold Tag to Phone...' : 'Write NDEF Payload to Tag'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
