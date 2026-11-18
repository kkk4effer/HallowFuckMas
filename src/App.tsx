import { useCallback, useEffect, useRef, useState } from 'react';
import { Nfc, Wifi } from 'lucide-react';
import { TopNav } from './components/TopNav';
import { LilyGoTEmbedEmulator } from './components/LilyGoTEmbedEmulator';
import { NfcFetchPanel } from './components/NfcFetchPanel';
import { WifiTxRxPanel } from './components/WifiTxRxPanel';
import { FirmwarePanel } from './components/FirmwarePanel';
import { CarrierUnlockPanel } from './components/CarrierUnlockPanel';
import {
  buildBruceFirmwareBinary,
  clearPersistedFlashState,
  loadPersistedFlashState,
  parseUploadedFirmwareFile,
  savePersistedFlashState,
  triggerFirmwareBinDownload,
} from './services/bruceFirmwareService';
import {
  NFC_FETCH_PRESETS,
  createPhoneNdefReader,
  dataViewToHexPairs,
  formatClockTime,
  parseNfcDumpFileText,
  stringToHexPairs,
} from './services/nfcHardwareService';
import {
  buildTxRxFrame,
  createEsp32BruceTxAck,
  encodeNfcTagForWifiRx,
} from './services/wifiTxRxBridge';
import type {
  BruceAppId,
  FirmwareBinaryInfo,
  FirmwareBootState,
  FlashLogEntry,
  NavTab,
  NfcTagRecord,
  TxRxFrame,
  WifiTxRxConfig,
} from './types/hardware';

const INITIAL_FIRMWARE: FirmwareBinaryInfo = {
  fileName: 'bruce-lilygo-t-embed-cc1101-v1.9.1.bin',
  version: '1.9.1',
  board: 'LilyGO T-Embed CC1101',
  mcu: 'ESP32-S3R8 (Dual-Core 240MHz)',
  flashOffset: '0x10000',
  sizeBytes: 65536,
  sha256: 'preparing-sha256...',
  isCustom: false,
  bytes: new Uint8Array(65536),
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('emulator');
  const [bootState, setBootState] = useState<FirmwareBootState>('stock');
  const [activeApp, setActiveApp] = useState<BruceAppId>('menu');
  const [firmware, setFirmware] = useState<FirmwareBinaryInfo>(INITIAL_FIRMWARE);
  const [flashProgress, setFlashProgress] = useState(0);
  const [flashLogs, setFlashLogs] = useState<FlashLogEntry[]>([]);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const [tags, setTags] = useState<NfcTagRecord[]>(NFC_FETCH_PRESETS);
  const [activeTagId, setActiveTagId] = useState<string | null>(NFC_FETCH_PRESETS[0].id);

  const [wifiConfig, setWifiConfig] = useState<WifiTxRxConfig>({
    transport: 'onboard-tunnel',
    wifiMode: 'AP (192.168.4.1)',
    ssid: 'Bruce-TEmbed-Bridge',
    wsUrl: 'ws://192.168.4.1:81/ws',
    wsConnected: false,
    baudRate: 115200,
    txPin: 'GPIO43 (TX)',
    rxPin: 'GPIO44 (RX)',
    txEnabled: true,
    rxEnabled: true,
    autoForwardNfc: true,
    txBytes: 0,
    rxBytes: 0,
    txFrames: 0,
    rxFrames: 0,
  });

  const [frames, setFrames] = useState<TxRxFrame[]>(() => [
    buildTxRxFrame(
      'TX',
      'WIFI_TX_GPIO43',
      'Wi-Fi UART Bridge initialized (TX=GPIO43, RX=GPIO44, 115200 8N1)',
      'WIFI_BRIDGE_INIT|TX=43|RX=44|BAUD=115200'
    ),
    buildTxRxFrame(
      'RX',
      'WIFI_RX_GPIO44',
      '[GPIO44_RX] ESP32-S3 Onboard Wi-Fi Bridge Ready',
      '[GPIO44_RX] ESP32-S3 Onboard Wi-Fi Bridge Ready'
    ),
  ]);

  const [txPulseAt, setTxPulseAt] = useState(0);
  const [rxPulseAt, setRxPulseAt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const flashTimersRef = useRef<number[]>([]);

  const activeNfcTag = tags.find((t) => t.id === activeTagId) ?? null;

  // Restore permanently flashed firmware from IndexedDB, or build default Bruce .bin
  useEffect(() => {
    let active = true;
    void (async () => {
      const persisted = await loadPersistedFlashState();
      if (!active) return;
      if (persisted) {
        setFirmware(persisted.firmware);
        setBootState(persisted.bootState);
        return;
      }
      const built = await buildBruceFirmwareBinary();
      if (active) setFirmware(built);
    })();
    return () => {
      active = false;
    };
  }, []);

  // BroadcastChannel for cross-tab real-time NFC -> Wi-Fi TX/RX sync
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('tembed-wifi-txrx');
    bcRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type: string; frame?: TxRxFrame; tag?: NfcTagRecord }>) => {
      if (event.data?.type === 'RX_FRAME' && event.data.frame) {
        const frame = event.data.frame;
        setFrames((prev) => [frame, ...prev].slice(0, 150));
        setRxPulseAt(Date.now());
      }
    };
    return () => {
      channel.close();
      bcRef.current = null;
    };
  }, []);

  // Clear flash timers on unmount
  useEffect(() => {
    return () => {
      flashTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const recordFrame = useCallback((frame: TxRxFrame) => {
    setFrames((prev) => [frame, ...prev].slice(0, 150));
    setWifiConfig((prev) => ({
      ...prev,
      txBytes: frame.direction === 'TX' ? prev.txBytes + frame.bytes : prev.txBytes,
      rxBytes: frame.direction === 'RX' ? prev.rxBytes + frame.bytes : prev.rxBytes,
      txFrames: frame.direction === 'TX' ? prev.txFrames + 1 : prev.txFrames,
      rxFrames: frame.direction === 'RX' ? prev.rxFrames + 1 : prev.rxFrames,
    }));
    if (frame.direction === 'TX') setTxPulseAt(Date.now());
    else setRxPulseAt(Date.now());
  }, []);

  const sendWireCommand = useCallback(
    (command: string, tagContext?: NfcTagRecord | null) => {
      if (!wifiConfig.txEnabled) {
        setToastNotice(`TX line (${wifiConfig.txPin}) is muted in Wi-Fi TX/RX settings.`);
        return;
      }

      const txFrame = buildTxRxFrame('TX', 'WIFI_TX_GPIO43', command, `${command}\n`);
      recordFrame(txFrame);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`${command}\n`);
      }

      bcRef.current?.postMessage({ type: 'TX_FRAME', frame: txFrame });

      if (wifiConfig.rxEnabled && wifiConfig.transport === 'onboard-tunnel') {
        window.setTimeout(() => {
          const ackText = createEsp32BruceTxAck(command, tagContext ?? activeNfcTag);
          const rxFrame = buildTxRxFrame('RX', 'WIFI_RX_GPIO44', ackText, `${ackText}\n`);
          recordFrame(rxFrame);
        }, 110);
      }
    },
    [
      activeNfcTag,
      recordFrame,
      wifiConfig.rxEnabled,
      wifiConfig.transport,
      wifiConfig.txEnabled,
      wifiConfig.txPin,
    ]
  );

  const relayTagOverWifi = useCallback(
    (tag: NfcTagRecord) => {
      setActiveTagId(tag.id);
      if (!wifiConfig.rxEnabled) {
        setToastNotice(`Cannot receive ${tag.uid}: Wi-Fi RX line (${wifiConfig.rxPin}) is disabled.`);
        return;
      }

      const encoded = encodeNfcTagForWifiRx(tag);
      const rxFrame = buildTxRxFrame(
        'RX',
        'WIFI_RX_GPIO44',
        `Phone NFC -> Wi-Fi RX: ${tag.label} (${tag.uid})`,
        encoded.hex,
        true
      );
      recordFrame(rxFrame);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`${encoded.ascii}\n`);
      }

      if (wifiConfig.txEnabled && wifiConfig.transport === 'onboard-tunnel') {
        window.setTimeout(() => {
          const ack = createEsp32BruceTxAck(encoded.ascii, tag);
          recordFrame(buildTxRxFrame('TX', 'WIFI_TX_GPIO43', ack, `${ack}\n`));
        }, 130);
      }
    },
    [recordFrame, wifiConfig.rxEnabled, wifiConfig.rxPin, wifiConfig.transport, wifiConfig.txEnabled]
  );

  const handleFetchedTag = useCallback(
    (tag: NfcTagRecord) => {
      setTags((prev) => [tag, ...prev.filter((item) => item.id !== tag.id)]);
      setActiveTagId(tag.id);

      const phoneFrame = buildTxRxFrame(
        'RX',
        'PHONE_NFC',
        `Phone NFC Fetched ${tag.uid} (${tag.protocol})`,
        tag.rawHex,
        true
      );
      recordFrame(phoneFrame);

      if (wifiConfig.autoForwardNfc) {
        relayTagOverWifi(tag);
      }
    },
    [recordFrame, relayTagOverWifi, wifiConfig.autoForwardNfc]
  );

  const handleAttachTagImage = useCallback((tagId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined;
      if (!dataUrl) return;
      setTags((prev) =>
        prev.map((item) =>
          item.id === tagId
            ? { ...item, imageDataUrl: dataUrl, imageName: file.name }
            : item
        )
      );
      setToastNotice(`Attached image "${file.name}" to tag file in LilyGO inventory.`);
    };
    reader.readAsDataURL(file);
  }, []);

  const flashFirmwareToEmulator = useCallback(
    (targetFirmware: FirmwareBinaryInfo, forceInterrupt = false) => {
      if (bootState === 'flashing' && !forceInterrupt) return;
      flashTimersRef.current.forEach((id) => window.clearTimeout(id));
      flashTimersRef.current = [];

      setActiveTab('emulator');
      setBootState('flashing');
      setFlashProgress(0);
      setFlashLogs([
        {
          step: 'connect',
          progress: 5,
          detail: `Connecting to ESP32-S3 bootloader over Wi-Fi/UART (${wifiConfig.baudRate} baud)...`,
        },
      ]);

      const stages: Array<{ delay: number; progress: number; step: string; detail: string }> = [
        {
          delay: 220,
          progress: 22,
          step: 'chip',
          detail: `ESP32-S3 · ${targetFirmware.projectName || targetFirmware.fileName} (${targetFirmware.version})`,
        },
        {
          delay: 480,
          progress: 45,
          step: 'erase',
          detail: `Erasing flash region at ${targetFirmware.flashOffset} (${targetFirmware.sizeBytes} bytes)...`,
        },
        {
          delay: 780,
          progress: 74,
          step: 'write',
          detail: `Writing segments permanently to SPI Flash (${targetFirmware.segmentCount ?? 3} segments)...`,
        },
        {
          delay: 1080,
          progress: 92,
          step: 'verify',
          detail: `Verified SHA-256 ${targetFirmware.sha256.slice(0, 16)}... OK`,
        },
        {
          delay: 1340,
          progress: 100,
          step: 'boot',
          detail: `Saved permanently to T-Embed SPI Flash -> Booting ${targetFirmware.fileName}...`,
        },
      ];

      stages.forEach((stage) => {
        const id = window.setTimeout(() => {
          setFlashProgress(stage.progress);
          setFlashLogs((prev) => [
            ...prev,
            { step: stage.step, progress: stage.progress, detail: stage.detail },
          ]);
          if (stage.progress === 100) {
            setBootState('bruce');
            setActiveApp('menu');
            void savePersistedFlashState(targetFirmware, 'bruce');
            recordFrame(
              buildTxRxFrame(
                'RX',
                'BRUCE_CORE',
                `Permanently flashed & booted ${targetFirmware.fileName} (${targetFirmware.version})`,
                `BRUCE_BOOT_OK|${targetFirmware.version}`
              )
            );
          }
        }, stage.delay);
        flashTimersRef.current.push(id);
      });
    },
    [bootState, recordFrame, wifiConfig.baudRate]
  );

  const handleInstallBruceFirmware = useCallback(() => {
    flashFirmwareToEmulator(firmware, false);
  }, [firmware, flashFirmwareToEmulator]);

  const handleDownloadFirmware = useCallback(() => {
    triggerFirmwareBinDownload(firmware);
    setToastNotice(`Downloaded ${firmware.fileName} (${firmware.sizeBytes} bytes).`);
  }, [firmware]);

  const handleUploadCustomBin = useCallback(
    async (file: File) => {
      const parsed = await parseUploadedFirmwareFile(file);
      setFirmware(parsed);
      await savePersistedFlashState(parsed, 'bruce');
      flashFirmwareToEmulator(parsed, true);
      setToastNotice(`Uploaded & permanently flashed "${parsed.fileName}" (${parsed.version}) to LilyGO T-Embed.`);
    },
    [flashFirmwareToEmulator]
  );

  const handleUploadEmulatorFile = useCallback(
    async (file: File) => {
      if (file.type.startsWith('image/')) {
        setToastNotice('Please select a non-image file (.bin, .nfc, .txt, .hex, .sub, .ir).');
        return;
      }
      if (file.name.toLowerCase().endsWith('.bin')) {
        await handleUploadCustomBin(file);
        return;
      }
      const text = await file.text();
      const parsed = parseNfcDumpFileText(file.name, text);
      handleFetchedTag(parsed);
      setToastNotice(`Loaded non-image file "${file.name}" into LilyGO T-Embed SD inventory.`);
    },
    [handleFetchedTag, handleUploadCustomBin]
  );

  const handleConnectWebSocket = (url: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setWifiConfig((prev) => ({ ...prev, wsUrl: url, transport: 'websocket-lan' }));

      ws.onopen = () => {
        setWifiConfig((prev) => ({ ...prev, wsConnected: true }));
        recordFrame(
          buildTxRxFrame('TX', 'WIFI_TX_GPIO43', `Connected WebSocket ${url}`, `WS_OPEN ${url}`)
        );
      };

      ws.onmessage = (evt) => {
        const text = typeof evt.data === 'string' ? evt.data : '[BINARY_WS_RX]';
        recordFrame(buildTxRxFrame('RX', 'WIFI_RX_GPIO44', text, text));
      };

      ws.onerror = () => {
        setToastNotice(
          `Could not reach ${url}. Switched back to Onboard Wi-Fi Tunnel so TX/RX remains operational.`
        );
        setWifiConfig((prev) => ({
          ...prev,
          wsConnected: false,
          transport: 'onboard-tunnel',
          wifiMode: 'AP (192.168.4.1)',
        }));
      };

      ws.onclose = () => {
        setWifiConfig((prev) => ({ ...prev, wsConnected: false }));
      };
    } catch {
      setToastNotice(`Invalid WebSocket URL: ${url}`);
    }
  };

  const handleDisconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWifiConfig((prev) => ({ ...prev, wsConnected: false }));
  };

  const handleQuickPhoneNfcScan = async () => {
    const reader = createPhoneNdefReader();
    if (!reader) {
      // Trigger active/next preset tag across Wi-Fi TX/RX for instant desktop testing
      const currentIdx = tags.findIndex((t) => t.id === activeTagId);
      const nextTag = tags[(currentIdx + 1) % tags.length] ?? tags[0];
      if (nextTag) {
        relayTagOverWifi(nextTag);
        setToastNotice(
          `Desktop fallback: Received "${nextTag.label}" (${nextTag.uid}) on Wi-Fi RX (${wifiConfig.rxPin}). Open "NFC Fetch" for Android Web NFC & custom tags.`
        );
      }
      return;
    }

    try {
      await reader.scan();
      setToastNotice('Hold an NFC tag to your phone antenna...');
      reader.onreading = (event) => {
        const uid = event.serialNumber?.toUpperCase() || '04:PH:0N:E1:NF:C0';
        const rec = event.message.records[0];
        const payload = rec?.data ? new TextDecoder().decode(rec.data) : 'PHONE_NFC_TAG';
        handleFetchedTag({
          id: `phone-${Date.now()}`,
          label: `Phone NFC (${uid.slice(0, 8)})`,
          uid,
          protocol: 'ISO14443-A',
          atqa: '0x0044',
          sak: '0x20',
          ndefType: 'text',
          payload,
          rawHex: rec?.data ? dataViewToHexPairs(rec.data) : stringToHexPairs(uid),
          source: 'phone-webnfc',
          fetchedAt: formatClockTime(),
          rssiDbm: -34,
        });
      };
    } catch (err) {
      setToastNotice(err instanceof Error ? err.message : 'Unable to access phone NFC.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onInstallFirmwareClick={handleInstallBruceFirmware}
        isFlashing={bootState === 'flashing'}
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-7 space-y-6">
        {toastNotice && (
          <div className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-4">
            <span>{toastNotice}</span>
            <button
              type="button"
              onClick={() => setToastNotice(null)}
              className="text-orange-400 hover:text-orange-300 font-semibold shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'emulator' && (
          <>
            <LilyGoTEmbedEmulator
              bootState={bootState}
              firmware={firmware}
              flashLogs={flashLogs}
              flashProgress={flashProgress}
              activeApp={activeApp}
              onChangeApp={setActiveApp}
              activeNfcTag={activeNfcTag}
              savedTags={tags}
              wifiConfig={wifiConfig}
              recentFrames={frames}
              txPulseAt={txPulseAt}
              rxPulseAt={rxPulseAt}
              onInstallFirmware={handleInstallBruceFirmware}
              onDownloadFirmware={handleDownloadFirmware}
              onUploadCustomBin={(file) => void handleUploadCustomBin(file)}
              onUploadEmulatorFile={(file) => void handleUploadEmulatorFile(file)}
              onRebootDevice={() => {
                if (bootState === 'bruce') {
                  setActiveApp('menu');
                  sendWireCommand('system_reboot');
                } else {
                  handleInstallBruceFirmware();
                }
              }}
              onResetToStock={() => {
                setBootState('stock');
                setActiveApp('menu');
                setFlashProgress(0);
                setFlashLogs([]);
                void clearPersistedFlashState();
              }}
              onSendWireCommand={(cmd) => sendWireCommand(cmd)}
              onRelayTagOverWifi={relayTagOverWifi}
              onAttachTagImage={handleAttachTagImage}
              onOpenNfcFetchTab={() => setActiveTab('nfc-fetch')}
              onToggleWifiAutoForward={() =>
                setWifiConfig((prev) => ({
                  ...prev,
                  autoForwardNfc: !prev.autoForwardNfc,
                }))
              }
            />

            {/* Compact Phone NFC -> Onboard Wi-Fi TX/RX Live Strip */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-base">
                      <Nfc className="w-4 h-4 text-orange-600" />
                      <span>Phone NFC Hardware Feed</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Fetch NFC tags from your phone and stream them into the T-Embed&apos;s onboard Wi-Fi RX ({wifiConfig.rxPin}) line.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('nfc-fetch')}
                    className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open NFC Fetch
                  </button>
                </div>

                {activeNfcTag && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{activeNfcTag.label}</span>
                      <span className="text-slate-500">{activeNfcTag.protocol}</span>
                    </div>
                    <div className="text-cyan-700 font-semibold tabular-nums">
                      UID: {activeNfcTag.uid}
                    </div>
                    <div className="text-slate-600 truncate">{activeNfcTag.payload}</div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleQuickPhoneNfcScan()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Fetch Phone NFC &amp; Wire RX
                  </button>
                  {activeNfcTag && (
                    <button
                      type="button"
                      onClick={() => relayTagOverWifi(activeNfcTag)}
                      className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Re-Receive Active Tag
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-base">
                      <Wifi className="w-4 h-4 text-cyan-600" />
                      <span>Onboard Wi-Fi RX / TX Wire ({wifiConfig.rxPin} · {wifiConfig.txPin})</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {wifiConfig.ssid} · {wifiConfig.rxBytes} B RX / {wifiConfig.txBytes} B TX
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('wifi-bridge')}
                    className="text-xs font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Inspect RX/TX
                  </button>
                </div>

                <div className="bg-slate-950 text-slate-200 rounded-lg p-3.5 font-mono text-xs space-y-1.5 max-h-32 overflow-y-auto">
                  {frames.slice(0, 4).map((frm) => (
                    <div key={frm.id} className="flex items-center gap-2.5">
                      <span className="text-slate-500 tabular-nums shrink-0">{frm.timestamp}</span>
                      <span
                        className={`font-bold shrink-0 ${
                          frm.direction === 'TX' ? 'text-orange-400' : 'text-cyan-400'
                        }`}
                      >
                        {frm.direction}
                      </span>
                      <span className="truncate">{frm.summary}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'nfc-fetch' && (
          <NfcFetchPanel
            tags={tags}
            activeTagId={activeTagId}
            wifiConfig={wifiConfig}
            onFetchedTag={handleFetchedTag}
            onAttachTagImage={handleAttachTagImage}
            onSelectAndWireTag={(tag) => {
              relayTagOverWifi(tag);
              setToastNotice(`Received ${tag.uid} on Wi-Fi ${wifiConfig.rxPin} (LilyGO T-Embed RX).`);
            }}
            onOpenEmulator={() => {
              setActiveTab('emulator');
              if (bootState === 'bruce') setActiveApp('nfc');
            }}
          />
        )}

        {activeTab === 'wifi-bridge' && (
          <WifiTxRxPanel
            wifiConfig={wifiConfig}
            frames={frames}
            activeNfcTag={activeNfcTag}
            onUpdateConfig={(patch) => setWifiConfig((prev) => ({ ...prev, ...patch }))}
            onConnectWebSocket={handleConnectWebSocket}
            onDisconnectWebSocket={handleDisconnectWebSocket}
            onSendCommand={(cmd) => sendWireCommand(cmd)}
            onRelayActiveNfc={() => {
              if (activeNfcTag) relayTagOverWifi(activeNfcTag);
            }}
            onClearFrames={() => setFrames([])}
          />
        )}

        {activeTab === 'firmware' && (
          <FirmwarePanel
            firmware={firmware}
            bootState={bootState}
            flashProgress={flashProgress}
            flashLogs={flashLogs}
            onInstallFirmware={handleInstallBruceFirmware}
            onDownloadFirmware={handleDownloadFirmware}
            onUploadCustomBin={(file) => void handleUploadCustomBin(file)}
            onResetToStock={() => {
              setBootState('stock');
              setActiveApp('menu');
              setFlashProgress(0);
              setFlashLogs([]);
              void clearPersistedFlashState();
            }}
          />
        )}

        {activeTab === 'carrier-unlock' && <CarrierUnlockPanel />}
      </main>
    </div>
  );
}
