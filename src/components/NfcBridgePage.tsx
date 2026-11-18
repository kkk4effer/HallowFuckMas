import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  Copy,
  Download,
  Nfc,
  Radio,
  Send,
  ShieldCheck,
  Tag,
  Trash2,
  Usb,
  Waves,
} from 'lucide-react';
import type {
  NfcCardPass,
  NfcProtocol,
  SerialPacket,
  UsbBridgeState,
} from '../types/nfc';
import { isWebNfcSupported, isWebSerialSupported } from '../services/usbSerialService';
import { isRawPacketConvertible } from '../services/ndefService';

interface NfcBridgePageProps {
  passes: NfcCardPass[];
  selectedPassId: string;
  onSelectPass: (id: string) => void;
  usbState: UsbBridgeState;
  packets: SerialPacket[];
  convertedPacketIds: Record<string, boolean>;
  autoConvertRawToTags: boolean;
  onToggleAutoConvertRaw: () => void;
  onConvertPacketToTag: (packet: SerialPacket) => void;
  onConvertAllRawPackets: () => void;
  onConnectWebSerial: () => void;
  onConnectVirtualLoopback: () => void;
  onDisconnectUsb: () => void;
  onToggleKeepAlive: () => void;
  onToggleWakeLock: () => void;
  onChangeBaudRate: (baud: number) => void;
  onToggleDtr: () => void;
  onToggleRts: () => void;
  onStartPhysicalWebNfc: () => void;
  onTapPassToUsb: (pass: NfcCardPass) => void;
  onSendCustomNfcPayload: (uid: string, protocol: NfcProtocol, ndef: string) => void;
  onClearPackets: () => void;
  onDownloadAllTags: () => void;
}

export const NfcBridgePage: React.FC<NfcBridgePageProps> = ({
  passes,
  selectedPassId,
  onSelectPass,
  usbState,
  packets,
  convertedPacketIds,
  autoConvertRawToTags,
  onToggleAutoConvertRaw,
  onConvertPacketToTag,
  onConvertAllRawPackets,
  onConnectWebSerial,
  onConnectVirtualLoopback,
  onDisconnectUsb,
  onToggleKeepAlive,
  onToggleWakeLock,
  onChangeBaudRate,
  onToggleDtr,
  onToggleRts,
  onStartPhysicalWebNfc,
  onTapPassToUsb,
  onSendCustomNfcPayload,
  onClearPackets,
  onDownloadAllTags,
}) => {
  const activePass = passes.find((p) => p.id === selectedPassId) ?? passes[0];
  const [packetFilter, setPacketFilter] = useState<'ALL' | 'TX' | 'RX'>('ALL');
  const [customUid, setCustomUid] = useState('04:91:BC:22:7A:10:80');
  const [customProtocol, setCustomProtocol] = useState<NfcProtocol>('ISO14443-A');
  const [customNdef, setCustomNdef] = useState('bruce://esp32c6/nfc-bridge');
  const [copiedUid, setCopiedUid] = useState(false);

  const webNfcAvailable = isWebNfcSupported();
  const webSerialAvailable = isWebSerialSupported();
  const isUsbActive = usbState.mode !== 'disconnected';

  const convertibleCount = packets.filter(
    (pkt) => !convertedPacketIds[pkt.id] && isRawPacketConvertible(pkt)
  ).length;

  const filteredPackets = packets.filter((pkt) =>
    packetFilter === 'ALL' ? true : pkt.direction === packetFilter
  );

  const handleCopyUid = () => {
    navigator.clipboard?.writeText(activePass.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 1500);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUid.trim()) return;
    onSendCustomNfcPayload(customUid.trim(), customProtocol, customNdef.trim() || 'EMPTY_NDEF');
  };

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <span>Wallet HCE &amp; WebNFC</span>
            <span aria-hidden="true">·</span>
            <span>USB TX/RX Bridge</span>
            <span aria-hidden="true">·</span>
            <span>ESP32-C6 Target</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            NFC Access &amp; Persistent USB TX/RX Bridge
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Tap or scan NFC credentials like a mobile wallet and continuously reroute TX/RX serial frames over USB to your ESP32-C6 running Bruce Firmware.
          </p>
        </div>

        {/* Hardware Connection Strip + Download Tags */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onDownloadAllTags}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <span>Download Tags</span>
          </button>

          {!isUsbActive ? (
            <>
              <button
                type="button"
                onClick={onConnectWebSerial}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Usb className="w-4 h-4" aria-hidden="true" />
                <span>{webSerialAvailable ? 'Select USB Serial Port' : 'Open USB Port'}</span>
              </button>
              <button
                type="button"
                onClick={onConnectVirtualLoopback}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
                <span>Start Loopback Bridge</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDisconnectUsb}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Usb className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span>Active: {usbState.portName} · Disconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Hardware + Wallet Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols): Google Wallet-style NFC Deck */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-950">
                  Mobile Wallet NFC Deck
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a pass or tap physical hardware to send TX/RX over USB
                </p>
              </div>
              <Nfc className="w-5 h-5 text-orange-600 shrink-0" aria-hidden="true" />
            </div>

            {/* Wallet Visual Card */}
            <div className="relative rounded-2xl overflow-hidden bg-[#0B0F17] text-white border border-slate-800">
              <div className="relative h-40 w-full overflow-hidden bg-slate-900">
                <img
                  src="/src/assets/images/nfc_contactless_card_1794962546125.jpg"
                  alt="Contactless NFC smartcard pass hardware"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-85"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/40 to-transparent" />
                <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-xs text-slate-200">
                  <span className="font-medium">{activePass.issuer}</span>
                  <Waves className="w-4 h-4 text-orange-400" aria-hidden="true" />
                </div>
                <div className="absolute bottom-3 left-4 right-4">
                  <div className="text-xs text-slate-400">{activePass.protocol}</div>
                  <div className="font-display text-xl font-bold text-white tracking-tight">
                    {activePass.label}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-400">Card UID</div>
                    <div className="font-mono text-sm font-semibold text-orange-400 tabular-nums">
                      {activePass.uid}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUid}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                  >
                    {copiedUid ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy UID</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-400 block">ATQA / SAK</span>
                    <span className="font-mono text-slate-100 tabular-nums">
                      {activePass.atqa} · {activePass.sak}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">USB Target</span>
                    <span className="font-mono text-slate-100">ESP32-C6 Bruce</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">NDEF / Payload</span>
                  <div className="font-mono text-xs text-slate-200 truncate mt-0.5">
                    {activePass.ndefRecord}
                  </div>
                </div>
              </div>
            </div>

            {/* Pass Switcher List */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600">Wallet Passes</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {passes.map((pass) => {
                  const selected = pass.id === activePass.id;
                  return (
                    <button
                      key={pass.id}
                      type="button"
                      onClick={() => onSelectPass(pass.id)}
                      className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-900'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{pass.label}</div>
                      <div
                        className={`font-mono text-[11px] mt-0.5 truncate ${
                          selected ? 'text-orange-300' : 'text-slate-500'
                        }`}
                      >
                        {pass.uid}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary NFC Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => onTapPassToUsb(activePass)}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>Tap &amp; Send TX/RX</span>
              </button>

              <button
                type="button"
                onClick={onStartPhysicalWebNfc}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${
                  usbState.webNfcScanning
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Radio className="w-4 h-4" aria-hidden="true" />
                <span>
                  {usbState.webNfcScanning
                    ? 'WebNFC Listening'
                    : webNfcAvailable
                    ? 'Read Phone NFC'
                    : 'Enable NFC Listener'}
                </span>
              </button>
            </div>
          </div>

          {/* Custom NFC Frame Injector */}
          <form
            onSubmit={handleCustomSubmit}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div>
              <h3 className="font-display text-base font-semibold text-slate-950">
                Custom NFC Frame to USB TX
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inject any UID or NDEF payload straight onto the ESP32-C6 USB data lines
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tag UID (Hex)
                </label>
                <input
                  type="text"
                  value={customUid}
                  onChange={(e) => setCustomUid(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                  placeholder="04:A3:7F:92:1B:44:80"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Protocol
                </label>
                <select
                  value={customProtocol}
                  onChange={(e) => setCustomProtocol(e.target.value as NfcProtocol)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                >
                  <option value="ISO14443-A">ISO14443-A</option>
                  <option value="MIFARE Classic 1K">MIFARE Classic 1K</option>
                  <option value="NTAG215">NTAG215</option>
                  <option value="EMV Contactless">EMV Contactless</option>
                  <option value="FeliCa">FeliCa</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                NDEF / Relay Payload
              </label>
              <input
                type="text"
                value={customNdef}
                onChange={(e) => setCustomNdef(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                placeholder="bruce://esp32c6/nfc-bridge"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Transmit Custom NFC Frame Over USB TX
            </button>
          </form>
        </section>

        {/* Right Column (7 cols): Continuous USB TX/RX Reroute & Live Stream */}
        <section className="lg:col-span-7 space-y-6">
          {/* TX/RX Reroute Controls & Signal Path */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-950">
                  USB TX / RX Continuous Reroute Engine
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Keeps TX/RX active and streaming NFC functions to ESP32-C6 while software is running
                </p>
              </div>

              {/* Persistent Keep-Alive Toggle */}
              <button
                type="button"
                onClick={onToggleKeepAlive}
                className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  usbState.keepAliveEnabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    usbState.keepAliveEnabled && isUsbActive
                      ? 'bg-emerald-600 animate-pulse'
                      : usbState.keepAliveEnabled
                      ? 'bg-emerald-600'
                      : 'bg-slate-400'
                  }`}
                />
                <span>
                  {usbState.keepAliveEnabled
                    ? 'TX/RX Keep-Alive: Active'
                    : 'TX/RX Keep-Alive: Paused'}
                </span>
              </button>
            </div>

            {/* Signal Line Architecture Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <div className="text-[11px] text-slate-500">Source Input</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">
                  Phone / Chrome NFC
                </div>
                <div className="font-mono text-xs text-slate-600 mt-0.5">
                  NDEF + HCE APDU
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">USB Data Lines</div>
                <div className="text-sm font-semibold text-orange-700 mt-0.5">
                  {usbState.txPin} / {usbState.rxPin}
                </div>
                <div className="font-mono text-xs text-slate-600 mt-0.5 tabular-nums">
                  {usbState.baudRate} baud · 8N1
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Hardware Sink</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">
                  ESP32-C6 Bruce
                </div>
                <div className="font-mono text-xs text-slate-600 mt-0.5 tabular-nums">
                  TX {usbState.txPacketsTotal} pkts · RX {usbState.rxPacketsTotal} pkts
                </div>
              </div>
            </div>

            {/* UART Port Configuration Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Baud Rate
                </label>
                <select
                  value={usbState.baudRate}
                  onChange={(e) => onChangeBaudRate(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                >
                  <option value={115200}>115200</option>
                  <option value={230400}>230400</option>
                  <option value={460800}>460800</option>
                  <option value={921600}>921600</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  DTR Line
                </label>
                <button
                  type="button"
                  onClick={onToggleDtr}
                  className={`w-full py-2 px-3 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                    usbState.dtr
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  DTR: {usbState.dtr ? 'HIGH' : 'LOW'}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  RTS Line
                </label>
                <button
                  type="button"
                  onClick={onToggleRts}
                  className={`w-full py-2 px-3 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                    usbState.rts
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  RTS: {usbState.rts ? 'HIGH' : 'LOW'}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Wake Lock
                </label>
                <button
                  type="button"
                  onClick={onToggleWakeLock}
                  className={`w-full py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                    usbState.wakeLockActive
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{usbState.wakeLockActive ? 'Locked On' : 'Keep Awake'}</span>
                </button>
              </div>
            </div>

            {/* Byte Throughput Summary */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">USB TX Sent</span>
                <span className="font-mono text-base font-semibold text-slate-950 tabular-nums">
                  {usbState.txBytesTotal.toLocaleString()} B
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">USB RX Received</span>
                <span className="font-mono text-base font-semibold text-slate-950 tabular-nums">
                  {usbState.rxBytesTotal.toLocaleString()} B
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Last Keep-Alive</span>
                <span className="font-mono text-base font-semibold text-slate-950 tabular-nums">
                  {usbState.lastHeartbeatAt ?? 'Waiting'}
                </span>
              </div>
            </div>
          </div>

          {/* Live TX / RX Packet Stream Table */}
          <div className="bg-[#0B0F17] text-slate-100 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  Live USB TX/RX Serial Stream
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time hex frames routed between NFC and ESP32-C6
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
                  {(['ALL', 'TX', 'RX'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setPacketFilter(dir)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        packetFilter === dir
                          ? 'bg-orange-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onConvertAllRawPackets}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
                  <span>
                    Convert Raw -&gt; Tags{convertibleCount > 0 ? ` (${convertibleCount})` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleAutoConvertRaw}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    autoConvertRawToTags
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                  }`}
                >
                  <span>Auto-Tag: {autoConvertRawToTags ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={onDownloadAllTags}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export Tags .zip</span>
                </button>

                <button
                  type="button"
                  onClick={onClearPackets}
                  aria-label="Clear serial log"
                  className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-800/80">
              {filteredPackets.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No TX/RX frames logged yet. Connect USB or tap a Wallet pass to begin streaming.
                </div>
              ) : (
                filteredPackets.map((pkt) => {
                  const isConverted = Boolean(convertedPacketIds[pkt.id]);
                  return (
                    <div
                      key={pkt.id}
                      className="px-5 py-3 text-xs hover:bg-slate-900/60 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 font-mono">
                          <span
                            className={`font-semibold ${
                              pkt.direction === 'TX' ? 'text-orange-400' : 'text-emerald-400'
                            }`}
                          >
                            {pkt.direction}
                          </span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-300">{pkt.channel}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400 tabular-nums">{pkt.bytes} B</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onConvertPacketToTag(pkt)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                              isConverted
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70'
                                : 'bg-slate-900 text-orange-300 border-slate-700 hover:bg-orange-600 hover:text-white hover:border-orange-500'
                            }`}
                          >
                            {isConverted ? (
                              <>
                                <Check className="w-3 h-3" aria-hidden="true" />
                                <span>Tagged</span>
                              </>
                            ) : (
                              <>
                                <Tag className="w-3 h-3" aria-hidden="true" />
                                <span>-&gt; Tag</span>
                              </>
                            )}
                          </button>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {pkt.timestamp}
                          </span>
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-slate-200 break-all">
                        {pkt.asciiSummary}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 mt-1 break-all">
                        {pkt.hexPayload}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Bottom Center: Cell Phone USB Port TX / RX Wiring Pinout */}
      <section className="pt-4">
        <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1.5">
            <div className="text-xs text-slate-500">
              Hardware Wiring Reference · Cell Phone USB OTG to ESP32-C6
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">
              Cell Phone USB Port TX / RX Pinout
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Wiring reference for routing phone USB data lines (D+ / D- CDC or UART bridge TX / RX) to the ESP32-C6 running Bruce Firmware.
            </p>
          </div>

          {/* Interactive USB-C Receptacle Pinout Visual */}
          <div className="bg-[#0B0F17] text-slate-100 rounded-2xl p-5 sm:p-6 border border-slate-800">
            <div className="flex flex-col items-center">
              <div className="text-[11px] font-mono text-slate-400 mb-3">
                USB-C Port (Cell Phone Host Side) — Front Receptacle View
              </div>
              <svg
                viewBox="0 0 680 150"
                className="w-full max-w-2xl h-auto"
                role="img"
                aria-label="Cell phone USB-C port TX and RX wiring pinout diagram"
              >
                {/* Outer USB-C Shell */}
                <rect
                  x="20"
                  y="18"
                  width="640"
                  height="114"
                  rx="48"
                  fill="#111827"
                  stroke="#475569"
                  strokeWidth="2.5"
                />
                {/* Center Tongue */}
                <rect
                  x="56"
                  y="68"
                  width="568"
                  height="14"
                  rx="6"
                  fill="#1E293B"
                  stroke="#334155"
                  strokeWidth="1.5"
                />

                {/* Top Row Pins (A1..A12 key pins) */}
                {[
                  { x: 80, label: 'A1 GND', color: '#94A3B8' },
                  { x: 165, label: 'A4 VBUS', color: '#EF4444' },
                  { x: 250, label: 'A5 CC1', color: '#F59E0B' },
                  { x: 340, label: 'A6 D+ (TX)', color: '#10B981' },
                  { x: 430, label: 'A7 D- (RX)', color: '#EA580C' },
                  { x: 520, label: 'A9 VBUS', color: '#EF4444' },
                  { x: 595, label: 'A12 GND', color: '#94A3B8' },
                ].map((pin) => (
                  <g key={pin.label}>
                    <rect
                      x={pin.x - 16}
                      y="38"
                      width="32"
                      height="22"
                      rx="4"
                      fill={pin.color}
                    />
                    <text
                      x={pin.x}
                      y="31"
                      textAnchor="middle"
                      fill="#E2E8F0"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {pin.label}
                    </text>
                  </g>
                ))}

                {/* Bottom Row Pins (B12..B1 key pins) */}
                {[
                  { x: 80, label: 'B12 GND', color: '#94A3B8' },
                  { x: 165, label: 'B9 VBUS', color: '#EF4444' },
                  { x: 250, label: 'B8 SBU2', color: '#64748B' },
                  { x: 340, label: 'B7 D- (RX)', color: '#EA580C' },
                  { x: 430, label: 'B6 D+ (TX)', color: '#10B981' },
                  { x: 520, label: 'B4 VBUS', color: '#EF4444' },
                  { x: 595, label: 'B1 GND', color: '#94A3B8' },
                ].map((pin) => (
                  <g key={pin.label}>
                    <rect
                      x={pin.x - 16}
                      y="90"
                      width="32"
                      height="22"
                      rx="4"
                      fill={pin.color}
                    />
                    <text
                      x={pin.x}
                      y="126"
                      textAnchor="middle"
                      fill="#E2E8F0"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {pin.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Pin Mapping Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Cell USB Pin</th>
                  <th className="py-2.5 px-4">Wire Signal</th>
                  <th className="py-2.5 px-4">ESP32-C6 Native USB</th>
                  <th className="py-2.5 px-4">UART Bridge (TX/RX Cross)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="py-2.5 px-4 text-slate-900 font-semibold">A6 / B6 (D+)</td>
                  <td className="py-2.5 px-4 text-emerald-700">USB Data+ / TX Path</td>
                  <td className="py-2.5 px-4 text-slate-700">GPIO13 (USB_DP)</td>
                  <td className="py-2.5 px-4 text-orange-700">Bridge TXD -&gt; GPIO17 (U0RXD)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-900 font-semibold">A7 / B7 (D-)</td>
                  <td className="py-2.5 px-4 text-orange-700">USB Data- / RX Path</td>
                  <td className="py-2.5 px-4 text-slate-700">GPIO12 (USB_DN)</td>
                  <td className="py-2.5 px-4 text-emerald-700">Bridge RXD &lt;- GPIO16 (U0TXD)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-900 font-semibold">A4 / B4 (VBUS)</td>
                  <td className="py-2.5 px-4 text-rose-700">+5V OTG Power</td>
                  <td className="py-2.5 px-4 text-slate-700">5V / VBUS Pin</td>
                  <td className="py-2.5 px-4 text-slate-700">5V / VIN (3.3V Regulated)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-900 font-semibold">A5 (CC1)</td>
                  <td className="py-2.5 px-4 text-amber-700">OTG Host ID</td>
                  <td className="py-2.5 px-4 text-slate-700">5.1kΩ Pull-Down to GND</td>
                  <td className="py-2.5 px-4 text-slate-700">OTG Cable Pull-Down Active</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-900 font-semibold">A1 / B1 / A12</td>
                  <td className="py-2.5 px-4 text-slate-700">Ground Return</td>
                  <td className="py-2.5 px-4 text-slate-700">GND</td>
                  <td className="py-2.5 px-4 text-slate-700">Common GND</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};

