import React, { useState } from 'react';
import { Cpu, Play, Radio, Send, Terminal, Usb } from 'lucide-react';
import type {
  BruceModuleMode,
  BruceRelayedReading,
  NfcCardPass,
  UsbBridgeState,
} from '../types/nfc';

interface BruceCompanionPageProps {
  usbState: UsbBridgeState;
  relayedReadings: BruceRelayedReading[];
  passes: NfcCardPass[];
  onConnectWebSerial: () => void;
  onConnectVirtualLoopback: () => void;
  onSendBruceCommand: (command: string, mode: BruceModuleMode) => void;
  onSimulateEsp32TagRead: () => void;
  onRelayPassToBruce: (pass: NfcCardPass) => void;
}

export const BruceCompanionPage: React.FC<BruceCompanionPageProps> = ({
  usbState,
  relayedReadings,
  passes,
  onConnectWebSerial,
  onConnectVirtualLoopback,
  onSendBruceCommand,
  onSimulateEsp32TagRead,
  onRelayPassToBruce,
}) => {
  const [moduleMode, setModuleMode] = useState<BruceModuleMode>('relay');
  const [cliInput, setCliInput] = useState('nfc relay --usb --baud 115200');
  const [selectedReadingId, setSelectedReadingId] = useState<string>(
    relayedReadings[0]?.id ?? ''
  );

  const isConnected = usbState.mode !== 'disconnected';
  const activeReading =
    relayedReadings.find((r) => r.id === selectedReadingId) ?? relayedReadings[0] ?? null;

  const handleRunCli = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliInput.trim()) return;
    onSendBruceCommand(cliInput.trim(), moduleMode);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <span>Embedded Extension App</span>
            <span aria-hidden="true">·</span>
            <span>ESP32-C6 Hardware</span>
            <span aria-hidden="true">·</span>
            <span>Bruce Firmware USB Relay</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            Bruce Firmware ESP32-C6 Companion
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Connect this Chrome extension device directly to an ESP32-C6 flashed with Bruce Firmware and relay live NFC readings bi-directionally over USB.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!isConnected ? (
            <>
              <button
                type="button"
                onClick={onConnectWebSerial}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Usb className="w-4 h-4" aria-hidden="true" />
                <span>Link ESP32-C6 USB</span>
              </button>
              <button
                type="button"
                onClick={onConnectVirtualLoopback}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Cpu className="w-4 h-4" aria-hidden="true" />
                <span>Pair Virtual ESP32-C6</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSimulateEsp32TagRead}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Radio className="w-4 h-4 text-orange-400" aria-hidden="true" />
              <span>Pull NFC Read from ESP32-C6</span>
            </button>
          )}
        </div>
      </div>

      {/* Hardware Target + Bruce Firmware Control Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 cols: ESP32-C6 Hardware Target Card & Command Deck */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="relative h-48 bg-slate-900">
              <img
                src="/src/assets/images/esp32_c6_board_1794962544811.jpg"
                alt="ESP32-C6 microcontroller development board with USB-C and RF antenna"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                <div>
                  <div className="text-[11px] text-orange-300 font-mono">
                    ESP32-C6-WROOM-1 · RISC-V 160MHz
                  </div>
                  <div className="font-display text-lg font-bold">
                    Bruce Firmware NFC Node
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-200 tabular-nums">
                  {isConnected ? usbState.portName : 'Awaiting USB'}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div>
                  <span className="text-slate-500 block">UART TX / RX Pins</span>
                  <span className="font-mono font-semibold text-slate-900">
                    GPIO16 / GPIO17
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">USB Link Speed</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {usbState.baudRate} 8N1
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">NFC Subsystem</span>
                  <span className="font-mono font-semibold text-slate-900">
                    PN532 / HCE Bridge
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Relay State</span>
                  <span
                    className={`font-semibold ${
                      isConnected ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {isConnected ? 'USB Streaming' : 'Standby'}
                  </span>
                </div>
              </div>

              {/* Bruce Firmware Mode Tabs */}
              <div>
                <div className="text-xs font-medium text-slate-600 mb-2">
                  Bruce NFC Firmware Mode
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'relay', label: 'USB NFC Relay' },
                      { id: 'reader', label: 'Tag Reader' },
                      { id: 'mifare_dump', label: 'MIFARE 1K Dump' },
                      { id: 'emulate', label: 'UID Emulate' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setModuleMode(tab.id);
                        onSendBruceCommand(`nfc mode ${tab.id}`, tab.id);
                      }}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                        moduleMode === tab.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Bruce CLI Commands */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-600">
                  Bruce Firmware Quick Commands
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    'nfc scan',
                    'nfc relay --usb',
                    'nfc dump --sectors 0-3',
                    'nfc emulate 04A37F921B4480',
                    'bruce info',
                  ].map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => onSendBruceCommand(cmd, moduleMode)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-orange-600" aria-hidden="true" />
                      <span>{cmd}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* CLI Input */}
              <form onSubmit={handleRunCli} className="pt-2 border-t border-slate-200">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Send Command to ESP32-C6 Bruce Shell
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Terminal
                      className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={cliInput}
                      onChange={(e) => setCliInput(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Send TX
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Push Wallet Pass into Bruce Firmware */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="font-display text-base font-semibold text-slate-950">
              Push Extension Pass to ESP32-C6
            </h3>
            <p className="text-xs text-slate-500">
              Select a credential from your NFC Wallet Deck to relay immediately over USB to Bruce Firmware.
            </p>
            <div className="divide-y divide-slate-100">
              {passes.map((pass) => (
                <div
                  key={pass.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {pass.label}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">
                      {pass.uid} · {pass.protocol}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRelayPassToBruce(pass)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-orange-600 hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Send className="w-3 h-3" aria-hidden="true" />
                    <span>Relay USB</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 7 cols: Relayed NFC Readings Table & Hex Inspector */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-950">
                  USB Relayed NFC Readings
                </h2>
                <p className="text-xs text-slate-500">
                  Live tags bridged between Chrome Extension NFC and ESP32-C6 Bruce Firmware
                </p>
              </div>
              <button
                type="button"
                onClick={onSimulateEsp32TagRead}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Capture New Tag Read
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <th className="py-2.5 px-4">Time</th>
                    <th className="py-2.5 px-4">Relay Path</th>
                    <th className="py-2.5 px-4">UID</th>
                    <th className="py-2.5 px-4">Protocol</th>
                    <th className="py-2.5 px-4 text-right">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {relayedReadings.map((reading) => {
                    const selected = activeReading?.id === reading.id;
                    return (
                      <tr
                        key={reading.id}
                        onClick={() => setSelectedReadingId(reading.id)}
                        className={`cursor-pointer transition-colors ${
                          selected ? 'bg-orange-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                          {reading.timestamp}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {reading.source}
                        </td>
                        <td className="py-3 px-4 font-mono text-orange-700 font-semibold whitespace-nowrap">
                          {reading.uid}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {reading.protocol}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700 tabular-nums whitespace-nowrap">
                          {reading.rssiDbm} dBm
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Reading Frame & Bruce Decoder */}
          {activeReading && (
            <div className="bg-[#0B0F17] text-slate-100 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs text-slate-400">Inspected USB Relay Frame</div>
                  <div className="font-display text-lg font-semibold text-white">
                    UID {activeReading.uid} · {activeReading.protocol}
                  </div>
                </div>
                <div className="font-mono text-xs text-orange-400 tabular-nums">
                  ATQA {activeReading.atqa} · SAK {activeReading.sak}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1">Decoded NDEF / Relay Payload</div>
                <div className="font-mono text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 text-emerald-300 break-all">
                  {activeReading.ndefPayload}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1">Raw UART TX/RX Hex Frame</div>
                <div className="font-mono text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-300 break-all leading-relaxed">
                  {activeReading.rawFrameHex}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
