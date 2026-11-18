import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { NfcBridgePage } from './components/NfcBridgePage';
import { BruceCompanionPage } from './components/BruceCompanionPage';
import { NdefTagFilesPage } from './components/NdefTagFilesPage';
import { ExtensionDownloadPage } from './components/ExtensionDownloadPage';
import { ApkBuilderPage } from './components/ApkBuilderPage';
import {
  DEFAULT_NFC_PASSES,
  buildBruceNfcFrame,
  buildKeepAliveFrame,
  createNdefReader,
  createPacket,
  formatTimeStamp,
  isWebSerialSupported,
  requestEsp32SerialPort,
  stringToHex,
  writeBytesToSerialPort,
} from './services/usbSerialService';
import {
  buildAllTagsArchiveBytes,
  buildNdefTagFile,
  convertSerialPacketToCardPass,
  convertSerialPacketToNdefTag,
  getDefaultNdefTagFiles,
  isRawPacketConvertible,
} from './services/ndefService';
import { triggerBrowserDownload } from './services/extensionPackager';
import type {
  BruceModuleMode,
  BruceRelayedReading,
  NdefRecordType,
  NdefTagFile,
  NfcCardPass,
  NfcProtocol,
  PageId,
  SerialPacket,
  UsbBridgeState,
  WebSerialPort,
} from './types/nfc';

const INITIAL_READINGS: BruceRelayedReading[] = [
  {
    id: 'rel-init-1',
    timestamp: formatTimeStamp(),
    source: 'Phone WebNFC -> USB TX',
    uid: '04:A3:7F:92:1B:44:80',
    protocol: 'ISO14443-A',
    atqa: '0x0044',
    sak: '0x20',
    ndefPayload: 'bruce://nfc-relay?target=esp32c6&tx=GPIO16&rx=GPIO17',
    rawFrameHex: 'AA 55 10 4A 4E 46 43 7C 49 53 4F 31 34 34 34 33 2D 41 0A',
    rssiDbm: -42,
  },
  {
    id: 'rel-init-2',
    timestamp: formatTimeStamp(),
    source: 'ESP32-C6 Bruce RX -> Chrome',
    uid: '9A:41:C0:2E',
    protocol: 'MIFARE Classic 1K',
    atqa: '0x0004',
    sak: '0x08',
    ndefPayload: 'TRANSIT:ZONE-1|BAL:$24.50|SEQ:0891',
    rawFrameHex: 'AA 55 10 38 4E 46 43 7C 4D 49 46 41 52 45 7C 39 41 3A 34 31 0A',
    rssiDbm: -48,
  },
];

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('bridge');
  const [combinedDualMode, setCombinedDualMode] = useState<boolean>(true);
  const [passes, setPasses] = useState<NfcCardPass[]>(DEFAULT_NFC_PASSES);
  const [selectedPassId, setSelectedPassId] = useState<string>(DEFAULT_NFC_PASSES[0].id);

  const [tagFiles, setTagFiles] = useState<NdefTagFile[]>(() => getDefaultNdefTagFiles());
  const [emulatingTagId, setEmulatingTagId] = useState<string | null>(null);
  const [convertedPacketIds, setConvertedPacketIds] = useState<Record<string, boolean>>({});
  const [autoConvertRawToTags, setAutoConvertRawToTags] = useState<boolean>(false);

  const [usbState, setUsbState] = useState<UsbBridgeState>({
    mode: 'virtual',
    portName: 'ESP32-C6 Loopback (CDC0)',
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    dtr: true,
    rts: false,
    txPin: 'GPIO16 (U0TXD)',
    rxPin: 'GPIO17 (U0RXD)',
    keepAliveEnabled: true,
    wakeLockActive: false,
    webNfcScanning: false,
    txBytesTotal: 0,
    rxBytesTotal: 0,
    txPacketsTotal: 0,
    rxPacketsTotal: 0,
    lastHeartbeatAt: null,
  });

  const [packets, setPackets] = useState<SerialPacket[]>([
    createPacket(
      'TX',
      'SYSTEM',
      'AA 55 01 0E 42 52 55 43 45 5F 42 52 49 44 47 45 0A',
      'BruceLink USB TX/RX Bridge initialized (115200 8N1)'
    ),
    createPacket(
      'RX',
      'BRUCE_CMD',
      '5B 42 52 55 43 45 5D 20 45 53 50 33 32 2D 43 36 20 52 45 41 44 59 0A',
      '[BRUCE] ESP32-C6 NFC Relay Ready on UART0'
    ),
  ]);

  const [relayedReadings, setRelayedReadings] =
    useState<BruceRelayedReading[]>(INITIAL_READINGS);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const serialPortRef = useRef<WebSerialPort | null>(null);
  const readerCancelRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const keepAliveSeqRef = useRef<number>(1);
  const autoConvertRef = useRef<boolean>(false);

  useEffect(() => {
    autoConvertRef.current = autoConvertRawToTags;
  }, [autoConvertRawToTags]);

  const convertPacketInternal = useCallback((pkt: SerialPacket) => {
    const newTag = convertSerialPacketToNdefTag(pkt);
    setTagFiles((prev) => [newTag, ...prev]);

    const maybePass = convertSerialPacketToCardPass(pkt);
    if (maybePass) {
      setPasses((prev) =>
        prev.some((existing) => existing.uid.toUpperCase() === maybePass.uid.toUpperCase())
          ? prev
          : [maybePass, ...prev]
      );
    }

    setConvertedPacketIds((prev) => ({ ...prev, [pkt.id]: true }));
    return newTag;
  }, []);

  const appendPacket = useCallback(
    (pkt: SerialPacket) => {
      setPackets((prev) => [pkt, ...prev].slice(0, 120));
      setUsbState((prev) => ({
        ...prev,
        txBytesTotal:
          pkt.direction === 'TX' ? prev.txBytesTotal + pkt.bytes : prev.txBytesTotal,
        rxBytesTotal:
          pkt.direction === 'RX' ? prev.rxBytesTotal + pkt.bytes : prev.rxBytesTotal,
        txPacketsTotal:
          pkt.direction === 'TX' ? prev.txPacketsTotal + 1 : prev.txPacketsTotal,
        rxPacketsTotal:
          pkt.direction === 'RX' ? prev.rxPacketsTotal + 1 : prev.rxPacketsTotal,
      }));

      if (autoConvertRef.current && isRawPacketConvertible(pkt)) {
        convertPacketInternal(pkt);
      }
    },
    [convertPacketInternal]
  );

  const transmitBytes = useCallback(
    async (
      bytes: Uint8Array,
      hex: string,
      ascii: string,
      channel: SerialPacket['channel'],
      simulatedRxAck?: string
    ) => {
      const activePort = serialPortRef.current;
      if (activePort && usbState.mode === 'webserial') {
        try {
          await writeBytesToSerialPort(activePort, bytes);
        } catch (err) {
          setStatusNotice(
            err instanceof Error
              ? `USB write warning: ${err.message}`
              : 'USB write interrupted'
          );
        }
      }

      appendPacket(createPacket('TX', channel, hex, ascii, bytes.byteLength));

      if (simulatedRxAck && usbState.mode === 'virtual') {
        setTimeout(() => {
          const ackBytes = new TextEncoder().encode(simulatedRxAck);
          appendPacket(
            createPacket(
              'RX',
              channel,
              stringToHex(simulatedRxAck),
              simulatedRxAck,
              ackBytes.byteLength
            )
          );
        }, 120);
      }
    },
    [appendPacket, usbState.mode]
  );

  // Persistent TX/RX keep-alive loop: stays streaming while software is active
  useEffect(() => {
    if (usbState.mode === 'disconnected' || !usbState.keepAliveEnabled) {
      return;
    }

    const sendHeartbeat = () => {
      const seq = keepAliveSeqRef.current++;
      const { bytes, hex, ascii } = buildKeepAliveFrame(seq);
      setUsbState((prev) => ({
        ...prev,
        lastHeartbeatAt: formatTimeStamp(),
      }));
      void transmitBytes(
        bytes,
        hex,
        ascii,
        'KEEPALIVE',
        `[BRUCE_RX] KA_ACK#${seq} TX/RX_LOCKED`
      );
    };

    const timer = window.setInterval(sendHeartbeat, 4500);
    return () => window.clearInterval(timer);
  }, [usbState.mode, usbState.keepAliveEnabled, transmitBytes]);

  const startSerialReadLoop = useCallback(
    (port: WebSerialPort) => {
      if (!port.readable) return;
      const reader = port.readable.getReader();
      let cancelled = false;
      readerCancelRef.current = () => {
        cancelled = true;
        void reader.cancel();
      };

      const decoder = new TextDecoder();
      void (async () => {
        try {
          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done || !value) break;
            const ascii = decoder.decode(value).trim() || '[BINARY_RX_FRAME]';
            const hex = Array.from(value)
              .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
              .join(' ');
            appendPacket(createPacket('RX', 'USB->NFC', hex, ascii, value.byteLength));

            if (ascii.includes('UID') || ascii.includes('NFC')) {
              setRelayedReadings((prev) => [
                {
                  id: `rx-${Date.now()}`,
                  timestamp: formatTimeStamp(),
                  source: 'ESP32-C6 Bruce RX -> Chrome',
                  uid: ascii.match(/([0-9A-Fa-f]{2}:){3,}[0-9A-Fa-f]{2}/)?.[0] ?? '04:C6:BR:UC:E1',
                  protocol: 'ISO14443-A',
                  atqa: '0x0044',
                  sak: '0x20',
                  ndefPayload: ascii,
                  rawFrameHex: hex,
                  rssiDbm: -45,
                },
                ...prev,
              ]);
            }
          }
        } catch {
          // Port closed cleanly
        } finally {
          reader.releaseLock();
        }
      })();
    },
    [appendPacket]
  );

  const handleConnectWebSerial = async () => {
    setStatusNotice(null);
    if (!isWebSerialSupported()) {
      setStatusNotice(
        'Web Serial requires Chrome/Edge over HTTPS or localhost. Activated Virtual ESP32-C6 Loopback Bridge so TX/RX streaming remains operational.'
      );
      setUsbState((prev) => ({
        ...prev,
        mode: 'virtual',
        portName: 'ESP32-C6 Loopback (CDC0)',
      }));
      return;
    }

    try {
      const port = await requestEsp32SerialPort(usbState.baudRate);
      serialPortRef.current = port;
      const info = port.getInfo ? port.getInfo() : {};
      const vid = info.usbVendorId
        ? `VID:0x${info.usbVendorId.toString(16).toUpperCase()}`
        : 'ESP32-C6';
      setUsbState((prev) => ({
        ...prev,
        mode: 'webserial',
        portName: `USB Serial (${vid})`,
      }));
      appendPacket(
        createPacket(
          'TX',
          'SYSTEM',
          'AA 55 02 04 4F 50 45 4E 0A',
          `Opened WebSerial port (${vid}) at ${usbState.baudRate} baud`
        )
      );
      startSerialReadLoop(port);
    } catch (err) {
      setStatusNotice(
        err instanceof Error
          ? `USB port selection skipped: ${err.message}`
          : 'USB port selection cancelled'
      );
    }
  };

  const handleConnectVirtualLoopback = () => {
    setStatusNotice(null);
    setUsbState((prev) => ({
      ...prev,
      mode: 'virtual',
      portName: 'ESP32-C6 Loopback (CDC0)',
    }));
    appendPacket(
      createPacket(
        'TX',
        'SYSTEM',
        'AA 55 02 08 4C 4F 4F 50 42 41 43 4B 0A',
        'Virtual ESP32-C6 Bruce TX/RX Bridge active'
      )
    );
  };

  const handleDisconnectUsb = async () => {
    if (readerCancelRef.current) {
      readerCancelRef.current();
      readerCancelRef.current = null;
    }
    if (serialPortRef.current) {
      try {
        await serialPortRef.current.close();
      } catch {
        // Ignore close errors
      }
      serialPortRef.current = null;
    }
    setUsbState((prev) => ({
      ...prev,
      mode: 'disconnected',
      portName: 'Disconnected',
    }));
    appendPacket(
      createPacket(
        'TX',
        'SYSTEM',
        'AA 55 00 04 48 41 4C 54 0A',
        'USB TX/RX bridge disconnected'
      )
    );
  };

  const handleToggleUsbTopBar = () => {
    if (usbState.mode === 'disconnected') {
      void handleConnectWebSerial();
    } else {
      void handleDisconnectUsb();
    }
  };

  const handleToggleWakeLock = async () => {
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
      };
    };

    if (usbState.wakeLockActive && wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setUsbState((prev) => ({ ...prev, wakeLockActive: false }));
      return;
    }

    if (nav.wakeLock) {
      try {
        const sentinel = await nav.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setUsbState((prev) => ({ ...prev, wakeLockActive: true }));
        return;
      } catch {
        // Fallback state toggle below
      }
    }
    setUsbState((prev) => ({ ...prev, wakeLockActive: !prev.wakeLockActive }));
  };

  const handleTapPassToUsb = (pass: NfcCardPass) => {
    if (usbState.mode === 'disconnected') {
      handleConnectVirtualLoopback();
    }
    const { bytes, hex, ascii } = buildBruceNfcFrame(
      pass.uid,
      pass.protocol,
      pass.ndefRecord
    );
    void transmitBytes(
      bytes,
      hex,
      ascii,
      'NFC->USB',
      `[BRUCE_C6] RX_NFC_OK UID=${pass.uid} ATQA=${pass.atqa} SAK=${pass.sak}`
    );

    setRelayedReadings((prev) => [
      {
        id: `rel-${Date.now()}`,
        timestamp: formatTimeStamp(),
        source: 'Phone WebNFC -> USB TX',
        uid: pass.uid,
        protocol: pass.protocol,
        atqa: pass.atqa,
        sak: pass.sak,
        ndefPayload: pass.ndefRecord,
        rawFrameHex: hex,
        rssiDbm: -39,
      },
      ...prev,
    ]);
  };

  const handleSendCustomNfcPayload = (
    uid: string,
    protocol: NfcProtocol,
    ndef: string
  ) => {
    if (usbState.mode === 'disconnected') {
      handleConnectVirtualLoopback();
    }
    const { bytes, hex, ascii } = buildBruceNfcFrame(uid, protocol, ndef);
    void transmitBytes(
      bytes,
      hex,
      ascii,
      'NFC->USB',
      `[BRUCE_C6] CUSTOM_UID_RELAYED ${uid}`
    );
    setRelayedReadings((prev) => [
      {
        id: `rel-custom-${Date.now()}`,
        timestamp: formatTimeStamp(),
        source: 'Phone WebNFC -> USB TX',
        uid,
        protocol,
        atqa: '0x0044',
        sak: '0x20',
        ndefPayload: ndef,
        rawFrameHex: hex,
        rssiDbm: -41,
      },
      ...prev,
    ]);
  };

  const handleStartPhysicalWebNfc = async () => {
    const reader = createNdefReader();
    if (!reader) {
      setStatusNotice(
        'Physical Web NFC (NDEFReader) is supported on Android Chrome. Desktop mode ready: use Tap & Send TX/RX or Custom Frame Injector.'
      );
      setUsbState((prev) => ({ ...prev, webNfcScanning: !prev.webNfcScanning }));
      return;
    }

    try {
      await reader.scan();
      setUsbState((prev) => ({ ...prev, webNfcScanning: true }));
      setStatusNotice('Web NFC listener active. Hold an NFC tag to the back of your Android phone.');
      reader.onreading = (event) => {
        const uid = event.serialNumber || '04:WE:BN:FC:00:01';
        const firstRecord = event.message.records[0];
        let decoded = 'WEBNFC_RAW_TAG';
        if (firstRecord?.data) {
          decoded = new TextDecoder().decode(firstRecord.data);
        }
        handleSendCustomNfcPayload(uid, 'ISO14443-A', decoded);
      };
      reader.onreadingerror = () => {
        setStatusNotice('NFC read error: hold tag steady near phone antenna.');
      };
    } catch (err) {
      setStatusNotice(
        err instanceof Error ? `Web NFC error: ${err.message}` : 'Unable to start Web NFC'
      );
    }
  };

  const handleSendBruceCommand = (command: string, mode: BruceModuleMode) => {
    if (usbState.mode === 'disconnected') {
      handleConnectVirtualLoopback();
    }
    const cmdText = `${command}\n`;
    const bytes = new TextEncoder().encode(cmdText);
    const hex = stringToHex(cmdText);
    void transmitBytes(
      bytes,
      hex,
      `CMD> ${command}`,
      'BRUCE_CMD',
      `[BRUCE:${mode.toUpperCase()}] EXEC_OK "${command}" -> USB_TXRX_STREAMING`
    );
  };

  const handleSimulateEsp32TagRead = () => {
    const sample = passes[Math.floor(Math.random() * passes.length)];
    const { bytes, hex } = buildBruceNfcFrame(
      sample.uid,
      sample.protocol,
      `ESP32_C6_RF_SCAN|${sample.ndefRecord}`
    );
    appendPacket(
      createPacket(
        'RX',
        'USB->NFC',
        hex,
        `[ESP32-C6 RX] Read ${sample.uid} (${sample.protocol})`,
        bytes.byteLength
      )
    );
    setRelayedReadings((prev) => [
      {
        id: `esp-${Date.now()}`,
        timestamp: formatTimeStamp(),
        source: 'ESP32-C6 Bruce RX -> Chrome',
        uid: sample.uid,
        protocol: sample.protocol,
        atqa: sample.atqa,
        sak: sample.sak,
        ndefPayload: sample.ndefRecord,
        rawFrameHex: hex,
        rssiDbm: -36 - Math.floor(Math.random() * 14),
      },
      ...prev,
    ]);
  };

  const handleCreateTagFile = (
    title: string,
    recordType: NdefRecordType,
    payload: string,
    fileName?: string
  ) => {
    const created = buildNdefTagFile(title, recordType, payload, fileName);
    setTagFiles((prev) => [created, ...prev]);
  };

  const handleEmulateTagWithPhone = async (tag: NdefTagFile) => {
    setEmulatingTagId(tag.id);

    // Relay NDEF payload over USB TX/RX if bridge is active
    if (usbState.mode !== 'disconnected') {
      const { bytes, hex, ascii } = buildBruceNfcFrame(
        '04:ND:EF:00:00:01',
        'NTAG215',
        tag.payload
      );
      void transmitBytes(
        bytes,
        hex,
        `PHONE_EMULATE> ${ascii}`,
        'NFC->USB',
        `[BRUCE_C6] NDEF_EMULATE_SYNC ${tag.fileName}`
      );
    }

    // Use Web NFC NDEFReader.write when running on Android Chrome
    const reader = createNdefReader();
    if (reader && reader.write) {
      try {
        await reader.write({
          records: [
            {
              recordType: tag.recordType === 'URI' ? 'url' : 'text',
              data: tag.payload,
            },
          ],
        });
        setStatusNotice(`Phone Web NFC broadcast active for ${tag.fileName}.`);
        return;
      } catch {
        setStatusNotice(
          `Phone HCE / USB NDEF emulation active for ${tag.fileName} (Tap Android NFC target or ESP32-C6).`
        );
        return;
      }
    }

    setStatusNotice(
      `Phone NDEF emulation active for ${tag.fileName} (${tag.rawNdefBytes.length} bytes).`
    );
  };

  const handleStopEmulation = () => {
    setEmulatingTagId(null);
    setStatusNotice('Phone NDEF emulation stopped.');
  };

  const handleConvertPacketToTag = (pkt: SerialPacket) => {
    if (convertedPacketIds[pkt.id]) {
      setStatusNotice('Reading already converted into a tag in Tag List.');
      return;
    }
    const created = convertPacketInternal(pkt);
    setStatusNotice(
      `Converted raw ${pkt.direction} reading into tag ${created.fileName} (${created.recordType}).`
    );
  };

  const handleConvertAllRawPackets = () => {
    const candidates = packets.filter(
      (pkt) => !convertedPacketIds[pkt.id] && isRawPacketConvertible(pkt)
    );
    if (candidates.length === 0) {
      setStatusNotice(
        'No unconverted raw data readings in the stream. Tap a pass, run a Bruce scan, or click -> Tag on any row.'
      );
      return;
    }

    const createdTags: NdefTagFile[] = [];
    const createdPasses: NfcCardPass[] = [];
    const newConvertedMap: Record<string, boolean> = {};

    for (const pkt of candidates) {
      createdTags.push(convertSerialPacketToNdefTag(pkt));
      const pass = convertSerialPacketToCardPass(pkt);
      if (pass) {
        createdPasses.push(pass);
      }
      newConvertedMap[pkt.id] = true;
    }

    setTagFiles((prev) => [...createdTags, ...prev]);
    if (createdPasses.length > 0) {
      setPasses((prev) => {
        const next = [...prev];
        for (const p of createdPasses) {
          if (!next.some((existing) => existing.uid.toUpperCase() === p.uid.toUpperCase())) {
            next.unshift(p);
          }
        }
        return next;
      });
    }
    setConvertedPacketIds((prev) => ({ ...prev, ...newConvertedMap }));
    setStatusNotice(
      `Converted ${createdTags.length} raw stream reading${createdTags.length === 1 ? '' : 's'} into NDEF tags in Tag List.`
    );
  };

  const handleDownloadAllTags = async () => {
    const zipBytes = await buildAllTagsArchiveBytes(tagFiles, passes, packets);
    const filename = 'BruceLink-All-Tags-Bundle.zip';
    triggerBrowserDownload(zipBytes, filename, 'application/zip');
    setStatusNotice(
      `Exported ${filename} (${tagFiles.length} .ndef files, ${passes.length} .nfc backups, ${packets.length} TX/RX frames).`
    );
  };

  const renderNfcBridge = () => (
    <NfcBridgePage
      passes={passes}
      selectedPassId={selectedPassId}
      onSelectPass={setSelectedPassId}
      usbState={usbState}
      packets={packets}
      convertedPacketIds={convertedPacketIds}
      autoConvertRawToTags={autoConvertRawToTags}
      onToggleAutoConvertRaw={() => {
        setAutoConvertRawToTags((prev) => {
          const next = !prev;
          setStatusNotice(
            next
              ? 'Auto-Tag enabled: incoming raw TX/RX NFC readings will automatically convert into NDEF tags.'
              : 'Auto-Tag paused. Use Convert Raw -> Tags or -> Tag per row anytime.'
          );
          return next;
        });
      }}
      onConvertPacketToTag={handleConvertPacketToTag}
      onConvertAllRawPackets={handleConvertAllRawPackets}
      onConnectWebSerial={() => void handleConnectWebSerial()}
      onConnectVirtualLoopback={handleConnectVirtualLoopback}
      onDisconnectUsb={() => void handleDisconnectUsb()}
      onToggleKeepAlive={() =>
        setUsbState((prev) => ({
          ...prev,
          keepAliveEnabled: !prev.keepAliveEnabled,
        }))
      }
      onToggleWakeLock={() => void handleToggleWakeLock()}
      onChangeBaudRate={(baudRate) =>
        setUsbState((prev) => ({ ...prev, baudRate }))
      }
      onToggleDtr={() => {
        const nextDtr = !usbState.dtr;
        setUsbState((prev) => ({ ...prev, dtr: nextDtr }));
        if (serialPortRef.current?.setSignals) {
          void serialPortRef.current.setSignals({ dataTerminalReady: nextDtr });
        }
      }}
      onToggleRts={() => {
        const nextRts = !usbState.rts;
        setUsbState((prev) => ({ ...prev, rts: nextRts }));
        if (serialPortRef.current?.setSignals) {
          void serialPortRef.current.setSignals({ requestToSend: nextRts });
        }
      }}
      onStartPhysicalWebNfc={() => void handleStartPhysicalWebNfc()}
      onTapPassToUsb={handleTapPassToUsb}
      onSendCustomNfcPayload={handleSendCustomNfcPayload}
      onClearPackets={() => setPackets([])}
      onDownloadAllTags={() => void handleDownloadAllTags()}
    />
  );

  const renderBruceCompanion = () => (
    <BruceCompanionPage
      usbState={usbState}
      relayedReadings={relayedReadings}
      passes={passes}
      onConnectWebSerial={() => void handleConnectWebSerial()}
      onConnectVirtualLoopback={handleConnectVirtualLoopback}
      onSendBruceCommand={handleSendBruceCommand}
      onSimulateEsp32TagRead={handleSimulateEsp32TagRead}
      onRelayPassToBruce={(pass) => {
        handleTapPassToUsb(pass);
      }}
    />
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-slate-900 pb-20 md:pb-12">
      <TopBar
        activePage={activePage}
        onSelectPage={setActivePage}
        usbState={usbState}
        onToggleUsb={handleToggleUsbTopBar}
      />

      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 pt-6">
        {(activePage === 'bridge' || activePage === 'bruce') && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
            <div className="text-xs text-slate-600">
              Workspace Mode: <strong className="text-slate-950">{combinedDualMode ? 'Option 1 + Option 2 Active Together' : 'Single Option View'}</strong>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCombinedDualMode(true)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    combinedDualMode
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Use Both (Option 1 + 2)
                </button>
                <button
                  type="button"
                  onClick={() => setCombinedDualMode(false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    !combinedDualMode
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Single Option
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadAllTags()}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Download Tags
              </button>
              <button
                type="button"
                onClick={() => setActivePage('ndef')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Open Tag List ({tagFiles.length})
              </button>
            </div>
          </div>
        )}

        {statusNotice && (
          <div className="mb-6 bg-slate-900 text-slate-100 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-4">
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-orange-400 hover:text-orange-300 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {(activePage === 'bridge' || activePage === 'bruce') && combinedDualMode ? (
          <div className="space-y-12">
            {activePage === 'bruce' ? (
              <>
                <div>{renderBruceCompanion()}</div>
                <div className="border-t border-slate-200 pt-10">{renderNfcBridge()}</div>
                <div className="border-t border-slate-200 pt-10">
                  <NdefTagFilesPage
                    tagFiles={tagFiles}
                    emulatingTagId={emulatingTagId}
                    usbState={usbState}
                    onCreateTagFile={handleCreateTagFile}
                    onEmulateTagWithPhone={(tag) => void handleEmulateTagWithPhone(tag)}
                    onStopEmulation={handleStopEmulation}
                  />
                </div>
              </>
            ) : (
              <>
                <div>{renderNfcBridge()}</div>
                <div className="border-t border-slate-200 pt-10">{renderBruceCompanion()}</div>
                <div className="border-t border-slate-200 pt-10">
                  <NdefTagFilesPage
                    tagFiles={tagFiles}
                    emulatingTagId={emulatingTagId}
                    usbState={usbState}
                    onCreateTagFile={handleCreateTagFile}
                    onEmulateTagWithPhone={(tag) => void handleEmulateTagWithPhone(tag)}
                    onStopEmulation={handleStopEmulation}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {activePage === 'bridge' && renderNfcBridge()}
            {activePage === 'bruce' && renderBruceCompanion()}
          </>
        )}

        {activePage === 'ndef' && (
          <NdefTagFilesPage
            tagFiles={tagFiles}
            emulatingTagId={emulatingTagId}
            usbState={usbState}
            onCreateTagFile={handleCreateTagFile}
            onEmulateTagWithPhone={(tag) => void handleEmulateTagWithPhone(tag)}
            onStopEmulation={handleStopEmulation}
          />
        )}

        {activePage === 'download' && <ExtensionDownloadPage />}

        {activePage === 'apk' && (
          <ApkBuilderPage
            passes={passes}
            tagFiles={tagFiles}
            emulatingTagId={emulatingTagId}
            onTapPassToUsb={handleTapPassToUsb}
            onSendBruceCommand={(cmd) => handleSendBruceCommand(cmd, 'relay')}
            onEmulateTagWithPhone={(tag) => void handleEmulateTagWithPhone(tag)}
            onStopEmulation={handleStopEmulation}
            onOpenFullMode={(page, both) => {
              setCombinedDualMode(Boolean(both));
              setActivePage(page);
            }}
          />
        )}
      </main>
    </div>
  );
}
