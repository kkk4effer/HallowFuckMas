import { useState } from 'react';
import { ArrowRight, Send, Trash2, Wifi } from 'lucide-react';
import type { NfcTagRecord, TxRxFrame, WifiTxRxConfig } from '../types/hardware';

interface WifiTxRxPanelProps {
  wifiConfig: WifiTxRxConfig;
  frames: TxRxFrame[];
  activeNfcTag: NfcTagRecord | null;
  onUpdateConfig: (patch: Partial<WifiTxRxConfig>) => void;
  onConnectWebSocket: (url: string) => void;
  onDisconnectWebSocket: () => void;
  onSendCommand: (command: string) => void;
  onRelayActiveNfc: () => void;
  onClearFrames: () => void;
}

export function WifiTxRxPanel({
  wifiConfig,
  frames,
  activeNfcTag,
  onUpdateConfig,
  onConnectWebSocket,
  onDisconnectWebSocket,
  onSendCommand,
  onRelayActiveNfc,
  onClearFrames,
}: WifiTxRxPanelProps) {
  const [commandInput, setCommandInput] = useState('nfc_scan');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'TX' | 'RX'>('ALL');
  const [wsUrlDraft, setWsUrlDraft] = useState(wifiConfig.wsUrl);

  const visibleFrames = frames.filter((f) =>
    directionFilter === 'ALL' ? true : f.direction === directionFilter
  );

  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onSendCommand(commandInput.trim());
    setCommandInput('');
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Onboard Wi-Fi TX / RX Line Bridge
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
            <span>Transport: {wifiConfig.transport === 'websocket-lan' ? 'LAN WebSocket' : 'Onboard Wi-Fi Tunnel'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{wifiConfig.txPin}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{wifiConfig.rxPin}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{wifiConfig.baudRate} baud</span>
          </div>
        </div>

        {activeNfcTag && (
          <button
            type="button"
            onClick={onRelayActiveNfc}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-cyan-700 hover:bg-cyan-600 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Wifi className="w-4 h-4" />
            <span>Stream NFC to Wi-Fi RX ({activeNfcTag.uid})</span>
          </button>
        )}
      </div>

      {/* Signal Flow Schematic */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">1. Input Hardware</div>
            <div className="font-semibold text-slate-900 mt-1">Phone Web NFC</div>
            <div className="font-mono text-slate-600 mt-1 truncate">
              {activeNfcTag ? activeNfcTag.uid : 'Ready for tag'}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">2. Onboard Wi-Fi 802.11</div>
            <div className="font-semibold text-slate-900 mt-1">{wifiConfig.ssid}</div>
            <div className="font-mono text-emerald-700 mt-1">
              {wifiConfig.wifiMode}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">3. Wired UART Lines</div>
            <div className="font-mono font-semibold text-cyan-700 mt-1">
              RX (NFC In): {wifiConfig.rxPin} ({wifiConfig.rxEnabled ? 'ON' : 'MUTED'})
            </div>
            <div className="font-mono font-semibold text-orange-700 mt-0.5">
              TX (Ack Out): {wifiConfig.txPin} ({wifiConfig.txEnabled ? 'ON' : 'MUTED'})
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-900 text-slate-100">
            <div className="text-slate-400">4. Bruce Firmware Core</div>
            <div className="font-semibold mt-1 flex items-center gap-1.5">
              <span>ESP32-S3 T-Embed</span>
              <ArrowRight className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="font-mono text-slate-300 mt-1 tabular-nums">
              {wifiConfig.txBytes} TX B / {wifiConfig.rxBytes} RX B
            </div>
          </div>
        </div>
      </div>

      {/* Config + Live Wire Log */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* Left Controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Wi-Fi &amp; UART Line Configuration
          </h2>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Bridge Mode</label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    transport: 'onboard-tunnel',
                    wifiMode: 'AP (192.168.4.1)',
                  })
                }
                className={`py-1.5 px-2 rounded-md font-medium cursor-pointer ${
                  wifiConfig.transport === 'onboard-tunnel'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Onboard Tunnel
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    transport: 'websocket-lan',
                    wifiMode: 'STA (LAN Bridge)',
                  })
                }
                className={`py-1.5 px-2 rounded-md font-medium cursor-pointer ${
                  wifiConfig.transport === 'websocket-lan'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                LAN WebSocket
              </button>
            </div>
          </div>

          {wifiConfig.transport === 'websocket-lan' && (
            <div className="space-y-2 pt-1">
              <label className="block font-medium text-slate-700">
                ESP32 Bruce WebSocket Endpoint
              </label>
              <input
                type="text"
                value={wsUrlDraft}
                onChange={(e) => setWsUrlDraft(e.target.value)}
                placeholder="ws://192.168.4.1:81/ws"
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg text-slate-900"
              />
              <div className="flex gap-2">
                {!wifiConfig.wsConnected ? (
                  <button
                    type="button"
                    onClick={() => onConnectWebSocket(wsUrlDraft)}
                    className="flex-1 py-2 font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    Connect Hardware WS
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onDisconnectWebSocket}
                    className="flex-1 py-2 font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-500 cursor-pointer"
                  >
                    Disconnect WS
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">UART Baud Rate</label>
            <select
              value={wifiConfig.baudRate}
              onChange={(e) =>
                onUpdateConfig({ baudRate: Number(e.target.value) as 115200 | 460800 | 921600 })
              }
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value={115200}>115200 bps (8N1)</option>
              <option value={460800}>460800 bps (8N1)</option>
              <option value={921600}>921600 bps (High-Speed NFC)</option>
            </select>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between py-1.5 cursor-pointer">
              <span className="font-medium text-slate-700">Enable TX Line ({wifiConfig.txPin})</span>
              <input
                type="checkbox"
                checked={wifiConfig.txEnabled}
                onChange={(e) => onUpdateConfig({ txEnabled: e.target.checked })}
                className="accent-orange-600 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between py-1.5 cursor-pointer">
              <span className="font-medium text-slate-700">Enable RX Line ({wifiConfig.rxPin})</span>
              <input
                type="checkbox"
                checked={wifiConfig.rxEnabled}
                onChange={(e) => onUpdateConfig({ rxEnabled: e.target.checked })}
                className="accent-orange-600 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between py-1.5 cursor-pointer">
              <span className="font-medium text-slate-700">Auto-Forward Phone NFC Fetch</span>
              <input
                type="checkbox"
                checked={wifiConfig.autoForwardNfc}
                onChange={(e) => onUpdateConfig({ autoForwardNfc: e.target.checked })}
                className="accent-orange-600 w-4 h-4"
              />
            </label>
          </div>
        </div>

        {/* Right Live Packet Stream */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              {(['ALL', 'TX', 'RX'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirectionFilter(dir)}
                  className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                    directionFilter === dir
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClearFrames}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </button>
          </div>

          <form
            onSubmit={handleSubmitCommand}
            className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2"
          >
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Type Bruce UART command (e.g., nfc_scan, wifi_status, subghz_rx, help)..."
              className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send TX</span>
            </button>
          </form>

          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto font-mono text-xs">
            {visibleFrames.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No TX/RX frames captured yet. Trigger an NFC Fetch or send a command above.
              </div>
            ) : (
              visibleFrames.map((frm) => (
                <div key={frm.id} className="px-5 py-3 space-y-1 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400 tabular-nums">{frm.timestamp}</span>
                      <span
                        className={`font-bold ${
                          frm.direction === 'TX' ? 'text-orange-600' : 'text-cyan-700'
                        }`}
                      >
                        {frm.direction}
                      </span>
                      <span className="text-slate-500">{frm.line}</span>
                    </div>
                    <span className="text-slate-400 tabular-nums">{frm.bytes} B</span>
                  </div>
                  <div className="text-slate-900 break-all">{frm.summary}</div>
                  <div className="text-[11px] text-slate-500 break-all">{frm.hex}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
