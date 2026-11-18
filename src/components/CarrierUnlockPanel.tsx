import { useEffect, useRef, useState } from 'react';
import { Radio, RotateCcw, ScanLine, ShieldCheck, Terminal } from 'lucide-react';
import { formatClockTime } from '../services/nfcHardwareService';

interface NetworkBandItem {
  id: string;
  band: string;
  tech: '4G LTE' | '5G NR';
  frequency: string;
  status: 'Locked' | 'Unlocked';
}

interface DiagnosticLogLine {
  id: string;
  timestamp: string;
  level: 'INFO' | 'DIAG' | 'OK';
  message: string;
}

interface SimulatedDeviceProfile {
  id: string;
  model: string;
  modem: string;
  imei: string;
  sourceCarrier: string;
  targetCarrier: string;
  bands: NetworkBandItem[];
}

const SIMULATED_PROFILES: SimulatedDeviceProfile[] = [
  {
    id: 'pixel-9-sim',
    model: 'Pixel 9 Pro (Simulated)',
    modem: 'Exynos 5400 5G Modem',
    imei: '356938035643809',
    sourceCarrier: 'Carrier A (US Band Profile)',
    targetCarrier: 'Multi-Carrier Global Bands',
    bands: [
      { id: 'b2', band: 'B2 (PCS)', tech: '4G LTE', frequency: '1900 MHz', status: 'Unlocked' },
      { id: 'b4', band: 'B4 (AWS-1)', tech: '4G LTE', frequency: '1700/2100 MHz', status: 'Locked' },
      { id: 'b12', band: 'B12 (700ac)', tech: '4G LTE', frequency: '700 MHz', status: 'Locked' },
      { id: 'b66', band: 'B66 (AWS-3)', tech: '4G LTE', frequency: '1700/2100 MHz', status: 'Locked' },
      { id: 'n41', band: 'n41 (TDD)', tech: '5G NR', frequency: '2500 MHz', status: 'Locked' },
      { id: 'n77', band: 'n77 (C-Band)', tech: '5G NR', frequency: '3700 MHz', status: 'Locked' },
    ],
  },
  {
    id: 'galaxy-s24-sim',
    model: 'Galaxy S24 Ultra (Simulated)',
    modem: 'Snapdragon X75 5G RF',
    imei: '352490118472613',
    sourceCarrier: 'Carrier B (Regional Lock)',
    targetCarrier: 'Universal Carrier Profile',
    bands: [
      { id: 'b5', band: 'B5 (CLR)', tech: '4G LTE', frequency: '850 MHz', status: 'Unlocked' },
      { id: 'b13', band: 'B13 (700c)', tech: '4G LTE', frequency: '700 MHz', status: 'Locked' },
      { id: 'b71', band: 'B71 (600 MHz)', tech: '4G LTE', frequency: '600 MHz', status: 'Locked' },
      { id: 'n25', band: 'n25 (PCS)', tech: '5G NR', frequency: '1900 MHz', status: 'Locked' },
      { id: 'n71', band: 'n71 (600 MHz)', tech: '5G NR', frequency: '600 MHz', status: 'Locked' },
      { id: 'n78', band: 'n78 (Global C)', tech: '5G NR', frequency: '3500 MHz', status: 'Locked' },
    ],
  },
  {
    id: 'iphone-16-sim',
    model: 'iPhone 16 Pro (Simulated)',
    modem: 'Qualcomm SDX71M',
    imei: '358812094513207',
    sourceCarrier: 'Carrier C (SIM Profile)',
    targetCarrier: 'Open Dual-SIM Profile',
    bands: [
      { id: 'b1', band: 'B1 (IMT)', tech: '4G LTE', frequency: '2100 MHz', status: 'Unlocked' },
      { id: 'b7', band: 'B7 (IMT-E)', tech: '4G LTE', frequency: '2600 MHz', status: 'Locked' },
      { id: 'b20', band: 'B20 (EU 800)', tech: '4G LTE', frequency: '800 MHz', status: 'Locked' },
      { id: 'n1', band: 'n1 (2100)', tech: '5G NR', frequency: '2100 MHz', status: 'Locked' },
      { id: 'n28', band: 'n28 (APT 700)', tech: '5G NR', frequency: '700 MHz', status: 'Locked' },
      { id: 'n77', band: 'n77 (C-Band)', tech: '5G NR', frequency: '3700 MHz', status: 'Locked' },
    ],
  },
];

const TARGET_CARRIERS = [
  'Multi-Carrier Global Bands',
  'Universal Carrier Profile',
  'North America LTE / 5G NR',
  'Europe & APAC Global Roaming',
];

function validateImeiLuhn(imei: string): boolean {
  const digits = imei.replace(/\D/g, '');
  if (digits.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let digit = Number(digits[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function CarrierUnlockPanel() {
  const [selectedProfileId, setSelectedProfileId] = useState(SIMULATED_PROFILES[0].id);
  const [imeiInput, setImeiInput] = useState(SIMULATED_PROFILES[0].imei);
  const [targetCarrier, setTargetCarrier] = useState(SIMULATED_PROFILES[0].targetCarrier);
  const [imeiScanned, setImeiScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockCompleted, setUnlockCompleted] = useState(false);
  const [unlockProgress, setUnlockProgress] = useState(0);
  const [bands, setBands] = useState<NetworkBandItem[]>(SIMULATED_PROFILES[0].bands);
  const [logs, setLogs] = useState<DiagnosticLogLine[]>(() => [
    {
      id: 'init-1',
      timestamp: formatClockTime(),
      level: 'INFO',
      message: 'Carrier band simulation environment initialized. No real device radio is modified.',
    },
    {
      id: 'init-2',
      timestamp: formatClockTime(),
      level: 'DIAG',
      message: 'Ready: click "Scan IMEI" to inspect simulated TAC/SNR and RF band state.',
    },
  ]);

  const timersRef = useRef<number[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedProfile =
    SIMULATED_PROFILES.find((p) => p.id === selectedProfileId) ?? SIMULATED_PROFILES[0];

  const cleanImei = imeiInput.replace(/\D/g, '');
  const isLuhnValid = validateImeiLuhn(cleanImei);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const appendLog = (level: DiagnosticLogLine['level'], message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: formatClockTime(),
        level,
        message,
      },
    ]);
  };

  const clearScheduledTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const handleSelectProfile = (profileId: string) => {
    clearScheduledTimers();
    const next = SIMULATED_PROFILES.find((p) => p.id === profileId) ?? SIMULATED_PROFILES[0];
    setSelectedProfileId(next.id);
    setImeiInput(next.imei);
    setTargetCarrier(next.targetCarrier);
    setBands(next.bands.map((b) => ({ ...b })));
    setImeiScanned(false);
    setIsScanning(false);
    setIsUnlocking(false);
    setUnlockCompleted(false);
    setUnlockProgress(0);
    appendLog('INFO', `Loaded simulated profile: ${next.model} (${next.modem}).`);
  };

  const handleScanImei = () => {
    if (isScanning || isUnlocking) return;
    clearScheduledTimers();
    setIsScanning(true);
    setImeiScanned(false);
    setUnlockCompleted(false);
    setUnlockProgress(0);

    const effectiveImei = cleanImei.length === 15 ? cleanImei : selectedProfile.imei;
    if (cleanImei.length !== 15) {
      setImeiInput(selectedProfile.imei);
    }

    const tac = effectiveImei.slice(0, 8);
    const snr = effectiveImei.slice(8, 14);
    const checkDigit = effectiveImei.slice(14, 15);

    appendLog('DIAG', `Scanning simulated IMEI ${effectiveImei} on ${selectedProfile.model}...`);

    const t1 = window.setTimeout(() => {
      appendLog(
        'INFO',
        `TAC=${tac} · SNR=${snr} · CheckDigit=${checkDigit} · Luhn=${validateImeiLuhn(effectiveImei) ? 'VALID' : 'INVALID'}`
      );
    }, 240);

    const t2 = window.setTimeout(() => {
      const lockedCount = bands.filter((b) => b.status === 'Locked').length;
      appendLog(
        'OK',
        `RF band table read complete: ${bands.length} bands inspected (${lockedCount} simulated locked).`
      );
      setImeiScanned(true);
      setIsScanning(false);
    }, 520);

    timersRef.current.push(t1, t2);
  };

  const handleBeginUnlockProcess = () => {
    if (isUnlocking || isScanning) return;
    clearScheduledTimers();
    setIsUnlocking(true);
    setUnlockCompleted(false);
    setUnlockProgress(10);

    const effectiveImei = cleanImei.length === 15 ? cleanImei : selectedProfile.imei;
    const lockedBands = bands.filter((b) => b.status === 'Locked');

    appendLog(
      'INFO',
      `[SIMULATION] Starting band unlock sequence for ${selectedProfile.model} (IMEI ${effectiveImei}).`
    );

    const steps: Array<{ delay: number; progress: number; level: DiagnosticLogLine['level']; message: string }> = [
      {
        delay: 280,
        progress: 28,
        level: 'DIAG',
        message: `Checking modem capability map on ${selectedProfile.modem}...`,
      },
      {
        delay: 580,
        progress: 52,
        level: 'DIAG',
        message: `Verifying target profile "${targetCarrier}" compatibility (${lockedBands.length} bands queued).`,
      },
      {
        delay: 900,
        progress: 78,
        level: 'DIAG',
        message: `Updating simulated band mask: ${bands.map((b) => b.band.split(' ')[0]).join(', ')} -> ENABLED.`,
      },
      {
        delay: 1220,
        progress: 100,
        level: 'OK',
        message: `[SIMULATION COMPLETE] All ${bands.length} LTE / 5G NR bands marked Unlocked for ${targetCarrier}.`,
      },
    ];

    steps.forEach((step) => {
      const id = window.setTimeout(() => {
        setUnlockProgress(step.progress);
        appendLog(step.level, step.message);
        if (step.progress === 100) {
          setBands((prev) => prev.map((b) => ({ ...b, status: 'Unlocked' })));
          setImeiScanned(true);
          setUnlockCompleted(true);
          setIsUnlocking(false);
        }
      }, step.delay);
      timersRef.current.push(id);
    });
  };

  const handleResetSimulation = () => {
    clearScheduledTimers();
    setBands(selectedProfile.bands.map((b) => ({ ...b })));
    setImeiScanned(false);
    setIsScanning(false);
    setIsUnlocking(false);
    setUnlockCompleted(false);
    setUnlockProgress(0);
    setLogs([
      {
        id: `rst-${Date.now()}`,
        timestamp: formatClockTime(),
        level: 'INFO',
        message: `Simulation reset for ${selectedProfile.model}. Original locked band state restored.`,
      },
    ]);
  };

  const unlockedCount = bands.filter((b) => b.status === 'Unlocked').length;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Carrier Band Unlock Simulator
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Simulated Diagnostic Lab</span>
            <span aria-hidden="true">·</span>
            <span>LTE &amp; 5G NR Network Band Inspector</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {unlockedCount}/{bands.length} Bands Unlocked
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isScanning || isUnlocking}
            onClick={handleScanImei}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ScanLine className="w-4 h-4 text-slate-700" />
            <span>{isScanning ? 'Scanning IMEI...' : 'Scan IMEI'}</span>
          </button>

          <button
            type="button"
            disabled={isUnlocking || isScanning}
            onClick={handleBeginUnlockProcess}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {isUnlocking ? `Unlocking (${unlockProgress}%)` : 'Begin Unlock Process'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleResetSimulation}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout: Left Controls & Band Table | Right Diagnostic Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-6 items-start">
        {/* Left: Device Profile, IMEI Input & Simulated Band Table */}
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Simulated Device &amp; IMEI Parameters
              </h2>
              <span className="text-xs font-mono text-slate-500">
                UI Simulation Only
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Simulated Device Profile
                </label>
                <select
                  value={selectedProfileId}
                  onChange={(e) => handleSelectProfile(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {SIMULATED_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Target Band Profile
                </label>
                <select
                  value={targetCarrier}
                  onChange={(e) => setTargetCarrier(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {TARGET_CARRIERS.map((carrier) => (
                    <option key={carrier} value={carrier}>
                      {carrier}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <label htmlFor="imei-input" className="font-medium text-slate-700">
                  Simulated 15-Digit IMEI
                </label>
                <span
                  className={`font-mono ${
                    cleanImei.length === 15 && isLuhnValid
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {cleanImei.length === 15
                    ? isLuhnValid
                      ? 'Luhn Check Valid'
                      : 'Luhn Check Warning'
                    : `${cleanImei.length}/15 digits`}
                </span>
              </div>
              <input
                id="imei-input"
                type="text"
                maxLength={15}
                value={imeiInput}
                onChange={(e) => setImeiInput(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Modem</div>
                <div className="font-medium text-slate-900 mt-0.5 truncate">
                  {selectedProfile.modem}
                </div>
              </div>
              <div>
                <div className="text-slate-500">IMEI Scan</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {imeiScanned ? 'Verified' : 'Pending'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Unlock State</div>
                <div
                  className={`font-mono font-semibold mt-0.5 ${
                    unlockCompleted ? 'text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  {unlockCompleted ? 'Simulated Open' : 'Band Restricted'}
                </div>
              </div>
            </div>
          </div>

          {/* RF Network Bands Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-orange-600" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Simulated Network Bands
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {selectedProfile.sourceCarrier}
              </span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-5 font-medium">Band</th>
                  <th className="py-2.5 px-3 font-medium">Radio</th>
                  <th className="py-2.5 px-3 font-medium">Frequency</th>
                  <th className="py-2.5 px-5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {bands.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-5 font-semibold text-slate-900">{item.band}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.tech}</td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-600">{item.frequency}</td>
                    <td
                      className={`py-2.5 px-5 text-right font-semibold ${
                        item.status === 'Unlocked' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {item.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Diagnostic Terminal View */}
        <div className="bg-[#0B0F17] text-slate-100 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[520px]">
          <div className="px-5 py-3.5 bg-[#111726] border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Terminal className="w-4 h-4 text-orange-400" />
              <span className="font-semibold text-white">Diagnostic Unlock Terminal</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {isUnlocking
                ? `Progress ${unlockProgress}%`
                : unlockCompleted
                  ? 'Status: Simulated Complete'
                  : 'Status: Idle'}
            </span>
          </div>

          {/* Progress Bar inside Terminal */}
          <div className="h-1.5 w-full bg-slate-900">
            <div
              style={{ width: `${unlockProgress}%` }}
              className="h-full bg-orange-500 transition-all duration-200"
            />
          </div>

          <div
            ref={logContainerRef}
            className="flex-1 p-5 font-mono text-xs space-y-2.5 overflow-y-auto max-h-[430px]"
          >
            {logs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 leading-relaxed">
                <span className="text-slate-500 tabular-nums shrink-0">{entry.timestamp}</span>
                <span
                  className={`font-bold shrink-0 ${
                    entry.level === 'OK'
                      ? 'text-emerald-400'
                      : entry.level === 'DIAG'
                        ? 'text-cyan-400'
                        : 'text-orange-400'
                  }`}
                >
                  [{entry.level}]
                </span>
                <span className="text-slate-200 break-words">{entry.message}</span>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 bg-[#101622] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
            <span>Simulation Sandbox · No physical baseband or carrier lock is altered</span>
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-slate-300 hover:text-white cursor-pointer"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
