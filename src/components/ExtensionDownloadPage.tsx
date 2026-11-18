import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileArchive,
  FileCode2,
  Package,
} from 'lucide-react';
import {
  buildExtensionCrxBytes,
  buildExtensionZipBytes,
  getChromeExtensionFiles,
  triggerBrowserDownload,
} from '../services/extensionPackager';

export const ExtensionDownloadPage: React.FC = () => {
  const files = getChromeExtensionFiles();
  const [selectedFilePath, setSelectedFilePath] = useState(files[0].path);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isPackaging, setIsPackaging] = useState<'crx' | 'zip' | null>(null);
  const [lastExportInfo, setLastExportInfo] = useState<{
    format: 'CRX3 (.crx)' | 'ZIP Archive (.zip)';
    filename: string;
    bytes: number;
    timestamp: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const activeFile = files.find((f) => f.path === selectedFilePath) ?? files[0];

  const handleDownloadFormat = async (format: 'crx' | 'zip') => {
    setDropdownOpen(false);
    setIsPackaging(format);
    try {
      if (format === 'crx') {
        const crxBytes = await buildExtensionCrxBytes();
        const filename = 'BruceLink-NFC-Bridge-v1.0.0.crx';
        triggerBrowserDownload(crxBytes, filename, 'application/x-chrome-extension');
        setLastExportInfo({
          format: 'CRX3 (.crx)',
          filename,
          bytes: crxBytes.byteLength,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        });
      } else {
        const zipBytes = await buildExtensionZipBytes();
        const filename = 'BruceLink-NFC-Bridge-v1.0.0.zip';
        triggerBrowserDownload(zipBytes, filename, 'application/zip');
        setLastExportInfo({
          format: 'ZIP Archive (.zip)',
          filename,
          bytes: zipBytes.byteLength,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        });
      }
    } finally {
      setIsPackaging(null);
    }
  };

  const handleCopySource = () => {
    navigator.clipboard?.writeText(activeFile.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  return (
    <div className="space-y-8">
      {/* Header + Dropdown Download Button */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-200 pb-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <span>Manifest V3 Package</span>
            <span aria-hidden="true">·</span>
            <span>CRX3 Signed Format</span>
            <span aria-hidden="true">·</span>
            <span>Unpacked ZIP Archive</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            Download Chrome Extension (.crx &amp; .zip)
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Package and download the complete BruceLink NFC Bridge Chrome Extension including the Wallet NFC Bridge, persistent USB TX/RX daemon, and Bruce ESP32-C6 Companion App.
          </p>
        </div>

        {/* Requested Dropdown Button for .crx and .zip */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            disabled={isPackaging !== null}
            onClick={() => setDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-3 px-5 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>
              {isPackaging === 'crx'
                ? 'Packaging .crx...'
                : isPackaging === 'zip'
                ? 'Packaging .zip...'
                : 'Download Extension'}
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {dropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => handleDownloadFormat('crx')}
                className="w-full text-left px-4 py-3.5 hover:bg-slate-50 flex items-start gap-3 transition-colors border-b border-slate-100 cursor-pointer"
              >
                <Package className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    Download .crx Package
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    CRX3 binary container (Cr24 header + Manifest V3 bundle)
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => handleDownloadFormat('zip')}
                className="w-full text-left px-4 py-3.5 hover:bg-slate-50 flex items-start gap-3 transition-colors cursor-pointer"
              >
                <FileArchive className="w-4 h-4 text-slate-800 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    Download .zip Archive
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Unpacked folder for Developer Mode in chrome://extensions
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Notice after Download */}
      {lastExportInfo && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              Packaged and downloaded <strong>{lastExportInfo.filename}</strong> ({lastExportInfo.format})
            </span>
          </div>
          <div className="font-mono text-emerald-800 tabular-nums">
            {(lastExportInfo.bytes / 1024).toFixed(1)} KB · Built at {lastExportInfo.timestamp}
          </div>
        </div>
      )}

      {/* Package Formats & Install Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-950">
              Chrome CRX3 Package (.crx)
            </h2>
            <button
              type="button"
              onClick={() => handleDownloadFormat('crx')}
              className="px-3.5 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors cursor-pointer"
            >
              Export .crx
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Built with standard <code className="font-mono text-slate-900">Cr24</code> v3 magic header, protobuf extension ID metadata, and compressed Manifest V3 bundle. Ideal for enterprise deployment or direct Chrome CRX drag-and-drop.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-950">
              Developer Unpacked Archive (.zip)
            </h2>
            <button
              type="button"
              onClick={() => handleDownloadFormat('zip')}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Export .zip
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Extract the <code className="font-mono text-slate-900">.zip</code>, open <code className="font-mono text-slate-900">chrome://extensions</code> on Desktop Chrome or Android Kiwi/Mises Browser, enable Developer Mode, and click <strong>Load unpacked</strong>.
          </p>
        </div>
      </div>

      {/* Bundled Extension Source Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 text-xs font-semibold text-slate-700">
            Packaged Extension Files ({files.length} + PNG Icons)
          </div>
          <div className="divide-y divide-slate-100">
            {files.map((file) => {
              const selected = file.path === activeFile.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedFilePath(file.path)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                    selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileCode2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selected ? 'text-orange-400' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs font-semibold truncate">
                      {file.path}
                    </span>
                  </div>
                  <div
                    className={`text-[11px] mt-1 line-clamp-1 ${
                      selected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {file.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 bg-[#0B0F17] text-slate-100 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs font-semibold text-orange-400">
                {activeFile.path}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {activeFile.description}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopySource}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
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
          <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto max-h-[460px] leading-relaxed">
            <code>{activeFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
