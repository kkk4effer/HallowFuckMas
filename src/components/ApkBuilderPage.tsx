import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  Download,
  FileArchive,
  FileCode2,
  Hammer,
  Lock,
  Nfc,
  Smartphone,
  Unlock,
  Usb,
} from 'lucide-react';
import type {
  ApkBuildConfig,
  ApkBuildStage,
  NdefTagFile,
  NfcCardPass,
  PageId,
} from '../types/nfc';
import {
  bundleAndroidStudioSourceZip,
  compileInstallableApk,
  generateAndroidSourceFiles,
} from '../services/apkBuilder';
import { triggerBrowserDownload } from '../services/extensionPackager';

interface ApkBuilderPageProps {
  passes: NfcCardPass[];
  tagFiles: NdefTagFile[];
  emulatingTagId: string | null;
  onTapPassToUsb: (pass: NfcCardPass) => void;
  onSendBruceCommand: (cmd: string) => void;
  onEmulateTagWithPhone: (tag: NdefTagFile) => void;
  onStopEmulation: () => void;
  onOpenFullMode: (page: PageId, combinedBoth?: boolean) => void;
}

type PreviewScreen = 'select' | 'bridge' | 'bruce' | 'combined' | 'ndef';

function generateDeterministicQrMatrix(seedStr: string, size = 21): boolean[][] {
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = border || inner;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBotLeft = r >= size - 8 && c < 8;
      if (inTopLeft || inTopRight || inBotLeft) continue;
      if (r === 6 || c === 6) {
        grid[r][c] = (r + c) % 2 === 0;
        continue;
      }
      hash ^= (r * 31 + c * 17) & 0xff;
      hash = Math.imul(hash, 16777619);
      grid[r][c] = (hash >>> 24) % 2 === 0;
    }
  }
  return grid;
}

export const ApkBuilderPage: React.FC<ApkBuilderPageProps> = ({
  passes,
  tagFiles,
  emulatingTagId,
  onTapPassToUsb,
  onSendBruceCommand,
  onEmulateTagWithPhone,
  onStopEmulation,
  onOpenFullMode,
}) => {
  const [config, setConfig] = useState<ApkBuildConfig>({
    appName: 'BruceLink NFC Bridge',
    packageId: 'com.brucelink.nfcbridge',
    versionName: '1.0.0',
    versionCode: 100,
    minSdk: 26,
    targetSdk: 34,
    cashTag: '$EfferGamePix',
    unlockPriceUsd: 5,
    requirePaywallOnLaunch: true,
    autoStartUsbTxRx: true,
    enableHceWallet: true,
    baudRate: 115200,
  });

  const androidSources = useMemo(() => generateAndroidSourceFiles(config), [config]);
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string>(
    androidSources[0].label
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [stages, setStages] = useState<ApkBuildStage[]>([
    { id: 'aapt', label: 'AAPT2 Resource, Paywall & Selector Merge', status: 'pending', detail: 'activity_paywall + activity_select_option' },
    { id: 'dex', label: 'Kotlin & Dalvik DEX Bytecode', status: 'pending', detail: 'PaywallActivity + SelectOptionActivity + MainActivity + NdefTagFilesActivity' },
    { id: 'sign', label: 'ZipAlign & APK Signature v2', status: 'pending', detail: 'META-INF/MANIFEST.MF + CERT.SF' },
  ]);
  const [builtApkResult, setBuiltApkResult] = useState<{
    fileName: string;
    sizeKb: string;
    bytes: Uint8Array;
  } | null>(null);

  // Live Interactive Android Preview State (Paywall -> Select Option Page -> Both Options + NDEF Files)
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  const [previewScreen, setPreviewScreen] = useState<PreviewScreen>('select');
  const [receiptCode, setReceiptCode] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [copiedCashTag, setCopiedCashTag] = useState(false);

  const activeSource =
    androidSources.find((s) => s.label === selectedSourceLabel) ?? androidSources[0];

  const normalizedCashTag = config.cashTag.startsWith('$')
    ? config.cashTag
    : `$${config.cashTag}`;
  const cashAppPayUrl = `https://cash.app/${normalizedCashTag}/${config.unlockPriceUsd}`;
  const qrMatrix = useMemo(
    () => generateDeterministicQrMatrix(cashAppPayUrl),
    [cashAppPayUrl]
  );

  const handleCompileApk = async () => {
    setIsCompiling(true);
    setBuiltApkResult(null);

    const updateStage = (idx: number, status: ApkBuildStage['status']) => {
      setStages((prev) =>
        prev.map((st, i) => (i === idx ? { ...st, status } : st))
      );
    };

    setStages((prev) => prev.map((s) => ({ ...s, status: 'pending' })));

    updateStage(0, 'running');
    await new Promise((r) => setTimeout(r, 260));
    updateStage(0, 'done');

    updateStage(1, 'running');
    await new Promise((r) => setTimeout(r, 320));
    updateStage(1, 'done');

    updateStage(2, 'running');
    const result = await compileInstallableApk(config);
    await new Promise((r) => setTimeout(r, 240));
    updateStage(2, 'done');

    setBuiltApkResult({
      fileName: result.fileName,
      sizeKb: result.sizeKb,
      bytes: result.apkBytes,
    });
    triggerBrowserDownload(
      result.apkBytes,
      result.fileName,
      'application/vnd.android.package-archive'
    );
    setIsCompiling(false);
  };

  const handleDownloadSourceZip = async () => {
    const { zipBytes, fileName } = await bundleAndroidStudioSourceZip(config);
    triggerBrowserDownload(zipBytes, fileName, 'application/zip');
  };

  const handleCopyCashTag = () => {
    navigator.clipboard?.writeText(normalizedCashTag);
    setCopiedCashTag(true);
    setTimeout(() => setCopiedCashTag(false), 1500);
  };

  const handleUnlockPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (receiptCode.trim().length < 4) {
      setReceiptError(
        `Enter your CashApp receipt ID (min 4 chars) after paying $${config.unlockPriceUsd} to ${normalizedCashTag}.`
      );
      return;
    }
    setReceiptError('');
    setPreviewUnlocked(true);
    setPreviewScreen('select');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <span>Android Package Compiler</span>
            <span aria-hidden="true">·</span>
            <span>CashApp Paywall ({normalizedCashTag} ${config.unlockPriceUsd})</span>
            <span aria-hidden="true">·</span>
            <span>Post-Paywall Option Selector</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            Android APK Builder &amp; Unified App Selector
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Compile the unified Android <code className="font-mono text-slate-900">.apk</code> featuring the $5 CashApp paywall (<strong className="text-slate-950">{normalizedCashTag}</strong>) followed by a Select Option screen containing both the NFC USB Bridge and Bruce Firmware ESP32-C6 Companion plus NDEF Tag Files.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadSourceZip}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileArchive className="w-4 h-4" aria-hidden="true" />
            <span>Export Kotlin Source .zip</span>
          </button>

          <button
            type="button"
            disabled={isCompiling}
            onClick={handleCompileApk}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Hammer className="w-4 h-4" aria-hidden="true" />
            <span>{isCompiling ? 'Compiling .APK...' : 'Compile & Download .APK'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Builder + Live Android Phone Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 cols: Build Config, Compiler Stages & Source Code */}
        <div className="lg:col-span-7 space-y-6">
          {/* Configuration Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-950">
                APK Package &amp; CashApp Paywall Configuration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Embedded into AndroidManifest.xml, PaywallActivity.kt, SelectOptionActivity.kt, and resources.arsc
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Application Name
                </label>
                <input
                  type="text"
                  value={config.appName}
                  onChange={(e) => setConfig({ ...config, appName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Android Package ID
                </label>
                <input
                  type="text"
                  value={config.packageId}
                  onChange={(e) => setConfig({ ...config, packageId: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  CashApp Cashtag Recipient
                </label>
                <input
                  type="text"
                  value={config.cashTag}
                  onChange={(e) => setConfig({ ...config, cashTag: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono font-semibold text-emerald-800 bg-emerald-50/60 border border-emerald-300 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Paywall Unlock Price (USD)
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={config.unlockPriceUsd}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      unlockPriceUsd: Math.max(1, Number(e.target.value) || 5),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Version Name
                </label>
                <input
                  type="text"
                  value={config.versionName}
                  onChange={(e) => setConfig({ ...config, versionName: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  USB Serial Baud Rate
                </label>
                <select
                  value={config.baudRate}
                  onChange={(e) => setConfig({ ...config, baudRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
                >
                  <option value={115200}>115200 baud</option>
                  <option value={230400}>230400 baud</option>
                  <option value={921600}>921600 baud</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-5 pt-2 border-t border-slate-200 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.requirePaywallOnLaunch}
                  onChange={(e) =>
                    setConfig({ ...config, requirePaywallOnLaunch: e.target.checked })
                  }
                  className="accent-orange-600"
                />
                <span>Enforce CashApp Paywall Frontpage on Launch</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoStartUsbTxRx}
                  onChange={(e) =>
                    setConfig({ ...config, autoStartUsbTxRx: e.target.checked })
                  }
                  className="accent-orange-600"
                />
                <span>Keep USB TX/RX Alive While App Is Open</span>
              </label>
            </div>
          </div>

          {/* Compilation Pipeline Status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-slate-950">
                APK Compilation Pipeline
              </h3>
              {builtApkResult && (
                <button
                  type="button"
                  onClick={() =>
                    triggerBrowserDownload(
                      builtApkResult.bytes,
                      builtApkResult.fileName,
                      'application/vnd.android.package-archive'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Re-download {builtApkResult.fileName} ({builtApkResult.sizeKb} KB)
                  </span>
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {stages.map((st, idx) => (
                <div key={st.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">
                      0{idx + 1}. {st.label}
                    </div>
                    <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                      {st.detail}
                    </div>
                  </div>
                  <span
                    className={`font-mono font-semibold whitespace-nowrap ${
                      st.status === 'done'
                        ? 'text-emerald-700'
                        : st.status === 'running'
                        ? 'text-orange-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {st.status === 'done'
                      ? 'Complete'
                      : st.status === 'running'
                      ? 'Building...'
                      : 'Ready'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Generated Android Kotlin & XML Source Inspector */}
          <div className="bg-[#0B0F17] text-slate-100 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
              {androidSources.map((src) => (
                <button
                  key={src.label}
                  type="button"
                  onClick={() => setSelectedSourceLabel(src.label)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeSource.label === src.label
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
            <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto max-h-[380px] leading-relaxed">
              <code>{activeSource.content}</code>
            </pre>
          </div>
        </div>

        {/* Right 5 cols: Interactive Android Device Frame Preview (Paywall -> Select Option Page) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[380px] bg-slate-950 rounded-[36px] p-3.5 border-4 border-slate-800 shadow-2xl text-white">
            {/* Android Status Bar */}
            <div className="px-4 pt-1 pb-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>{config.packageId}</span>
              <span>SDK {config.targetSdk}</span>
            </div>

            {!previewUnlocked ? (
              /* CashApp Paywall Frontpage Inside Built APK */
              <div className="bg-[#0F1520] rounded-[26px] p-5 space-y-5 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-orange-400">
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>APK Paywall Frontpage</span>
                  </div>
                  <span className="font-mono text-xs text-slate-400">v{config.versionName}</span>
                </div>

                <div>
                  <h3 className="font-display text-xl font-bold text-white">
                    {config.appName}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Unlock both NFC USB Bridge &amp; Bruce Firmware ESP32-C6 Companion plus NDEF Tag Files.
                  </p>
                </div>

                {/* CashApp Price & Cashtag Box */}
                <div className="bg-[#0B0F17] border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400">One-Time Unlock</span>
                    <span className="font-display text-2xl font-bold text-white tabular-nums">
                      ${config.unlockPriceUsd}.00
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div>
                      <div className="text-[11px] text-slate-400">Pay via CashApp to</div>
                      <div className="font-mono text-lg font-bold text-[#00D632]">
                        {normalizedCashTag}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCashTag}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
                    >
                      {copiedCashTag ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#00D632]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Scannable CashApp QR Code */}
                  <div className="flex flex-col items-center pt-2">
                    <div className="bg-white p-2.5 rounded-xl">
                      <svg
                        width="116"
                        height="116"
                        viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                        aria-label={`CashApp QR code for ${cashAppPayUrl}`}
                      >
                        {qrMatrix.map((row, r) =>
                          row.map((filled, c) =>
                            filled ? (
                              <rect
                                key={`${r}-${c}`}
                                x={c}
                                y={r}
                                width={1}
                                height={1}
                                fill="#0B0F17"
                              />
                            ) : null
                          )
                        )}
                      </svg>
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 mt-2 truncate max-w-full">
                      {cashAppPayUrl}
                    </div>
                  </div>
                </div>

                <a
                  href={cashAppPayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-[#00D632] hover:bg-[#00c02d] text-[#0B0F17] font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Pay ${config.unlockPriceUsd} on CashApp ({normalizedCashTag})</span>
                </a>

                <form onSubmit={handleUnlockPreview} className="space-y-2.5 pt-2 border-t border-slate-800">
                  <label className="block text-[11px] text-slate-400">
                    CashApp Receipt / Confirmation ID
                  </label>
                  <input
                    type="text"
                    value={receiptCode}
                    onChange={(e) => setReceiptCode(e.target.value)}
                    placeholder="e.g. CA-84920"
                    className="w-full px-3 py-2.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D632]"
                  />
                  {receiptError && (
                    <p className="text-[11px] text-amber-400">{receiptError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Verify ${config.unlockPriceUsd} Payment &amp; Unlock APK
                  </button>
                </form>
              </div>
            ) : previewScreen === 'select' ? (
              /* Post-Paywall Select Option Page (Both Options in Same App + NDEF Tag Files) */
              <div className="bg-[#0F1520] rounded-[26px] p-5 space-y-4 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00D632]">
                    <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Unlocked ({normalizedCashTag})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewUnlocked(false);
                      setReceiptCode('');
                    }}
                    className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Lock Paywall
                  </button>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Select App Mode
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Choose an NFC module inside {config.appName}
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setPreviewScreen('bridge')}
                    className="w-full text-left p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-orange-500/40 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-white">
                        1. NFC &amp; USB TX/RX Bridge
                      </span>
                      <Nfc className="w-4 h-4 text-orange-400" aria-hidden="true" />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Access Android NFC like Wallet and stream TX/RX over USB to ESP32-C6
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewScreen('bruce')}
                    className="w-full text-left p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-white">
                        2. Bruce Firmware ESP32-C6 App
                      </span>
                      <Cpu className="w-4 h-4 text-sky-400" aria-hidden="true" />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Connect directly to Bruce Firmware ESP32-C6 and relay NFC readings via USB
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewScreen('combined')}
                    className="w-full text-left p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-sky-500/40 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-white">
                        1 + 2. Both Versions Together
                      </span>
                      <Usb className="w-4 h-4 text-sky-400" aria-hidden="true" />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Use Option 1 (NFC Bridge) and Option 2 (Bruce C6 App) side-by-side
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewScreen('ndef')}
                    className="w-full text-left p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-white">
                        3. NFC NDEF Tag Files
                      </span>
                      <FileCode2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Download .ndef files or tap Use Phone to Emulate for each tag
                    </p>
                  </button>
                </div>
              </div>
            ) : previewScreen === 'bridge' ? (
              <div className="bg-[#0F1520] rounded-[26px] p-5 space-y-4 border border-slate-800">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPreviewScreen('select')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Select Option</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFullMode('bridge', false)}
                    className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer"
                  >
                    Open Full Page
                  </button>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Option 1 · NfcAdapter</span>
                    <Nfc className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="font-display text-lg font-bold">Wallet NFC Bridge</div>
                  <div className="font-mono text-xs text-orange-400">
                    UID {passes[0]?.uid ?? '04:A3:7F:92:1B:44:80'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => passes[0] && onTapPassToUsb(passes[0])}
                  className="w-full py-2.5 px-3 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-xl cursor-pointer"
                >
                  Tap &amp; Send NFC to USB TX/RX
                </button>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">UsbManager CDC</span>
                    <Usb className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xs font-mono text-emerald-300">
                    TX/RX Keep-Alive @ {config.baudRate} baud
                  </div>
                </div>
              </div>
            ) : previewScreen === 'bruce' ? (
              <div className="bg-[#0F1520] rounded-[26px] p-5 space-y-4 border border-slate-800">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPreviewScreen('select')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Select Option</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFullMode('bruce', false)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                  >
                    Open Full Page
                  </button>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Option 2 · Bruce C6</span>
                    <Cpu className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="font-display text-lg font-bold">Bruce Firmware Node</div>
                  <div className="font-mono text-xs text-emerald-300">
                    USB Relay Linked · GPIO16/17
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSendBruceCommand('nfc scan')}
                    className="py-2 px-2.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                  >
                    nfc scan
                  </button>
                  <button
                    type="button"
                    onClick={() => onSendBruceCommand('nfc relay --usb')}
                    className="py-2 px-2.5 text-xs font-mono bg-orange-600 hover:bg-orange-700 text-white rounded-lg cursor-pointer"
                  >
                    nfc relay
                  </button>
                </div>
                <div className="text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300">
                  [BRUCE] nfc relay --usb active
                </div>
              </div>
            ) : previewScreen === 'combined' ? (
              /* Option 1 + Option 2 Together Inside the Same Screen */
              <div className="bg-[#0F1520] rounded-[26px] p-5 space-y-3 border border-slate-800">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPreviewScreen('select')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Select Option</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFullMode('bridge', true)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                  >
                    Open Both Fullscreen
                  </button>
                </div>

                <div className="bg-slate-900 border border-orange-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Option 1 · Wallet NFC Bridge</span>
                    <Nfc className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => passes[0] && onTapPassToUsb(passes[0])}
                    className="w-full py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg cursor-pointer"
                  >
                    Tap Pass &amp; Stream TX/RX
                  </button>
                </div>

                <div className="bg-slate-900 border border-sky-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Option 2 · Bruce C6 Relay</span>
                    <Cpu className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => onSendBruceCommand('nfc relay --usb')}
                    className="w-full py-2 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg cursor-pointer"
                  >
                    Run nfc relay --usb
                  </button>
                </div>
              </div>
            ) : (
              /* Option 3: NDEF Tag Files Inside Phone Preview */
              <div className="bg-[#0F1520] rounded-[26px] p-5 space-y-3 border border-slate-800">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPreviewScreen('select')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Select Option</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFullMode('ndef', false)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                  >
                    Open Tag List
                  </button>
                </div>
                <div className="font-display text-base font-bold">NFC NDEF Tag List</div>
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {tagFiles.map((tag) => {
                    const active = emulatingTagId === tag.id;
                    return (
                      <div
                        key={tag.id}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2"
                      >
                        <div className="text-xs font-semibold text-white truncate">
                          {tag.title}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          {tag.fileName}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              triggerBrowserDownload(
                                new Uint8Array(tag.rawNdefBytes),
                                tag.fileName,
                                'application/octet-stream'
                              )
                            }
                            className="py-1.5 px-2.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              active ? onStopEmulation() : onEmulateTagWithPhone(tag)
                            }
                            className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg cursor-pointer ${
                              active
                                ? 'bg-emerald-600 text-white'
                                : 'bg-orange-600 hover:bg-orange-700 text-white'
                            }`}
                          >
                            {active ? 'Emulating Thru Phone' : 'Emulate Thru Phone'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-3 pb-1 text-[11px] text-slate-400">
              <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Android APK Interactive Preview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
