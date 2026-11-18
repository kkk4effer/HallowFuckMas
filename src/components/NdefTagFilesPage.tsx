import React, { useRef, useState } from 'react';
import {
  Download,
  FileCode2,
  Plus,
  Radio,
  Search,
  Smartphone,
  Square,
  Upload,
} from 'lucide-react';
import type { NdefRecordType, NdefTagFile, UsbBridgeState } from '../types/nfc';
import { triggerBrowserDownload } from '../services/extensionPackager';

interface NdefTagFilesPageProps {
  tagFiles: NdefTagFile[];
  emulatingTagId: string | null;
  usbState: UsbBridgeState;
  onCreateTagFile: (
    title: string,
    recordType: NdefRecordType,
    payload: string,
    fileName?: string
  ) => void;
  onEmulateTagWithPhone: (tag: NdefTagFile) => void;
  onStopEmulation: () => void;
}

export const NdefTagFilesPage: React.FC<NdefTagFilesPageProps> = ({
  tagFiles,
  emulatingTagId,
  usbState,
  onCreateTagFile,
  onEmulateTagWithPhone,
  onStopEmulation,
}) => {
  const [title, setTitle] = useState('');
  const [recordType, setRecordType] = useState<NdefRecordType>('URI');
  const [payload, setPayload] = useState('https://bruce.firmware.local/tag');
  const [fileName, setFileName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | NdefRecordType>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emulatingTag = tagFiles.find((t) => t.id === emulatingTagId) ?? null;

  const filteredTags = tagFiles.filter((tag) => {
    const matchesType = typeFilter === 'ALL' || tag.recordType === typeFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      tag.title.toLowerCase().includes(q) ||
      tag.fileName.toLowerCase().includes(q) ||
      tag.payload.toLowerCase().includes(q);
    return matchesType && matchesQuery;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !payload.trim()) return;
    onCreateTagFile(title.trim(), recordType, payload.trim(), fileName.trim());
    setTitle('');
    setFileName('');
  };

  const handleDownloadNdef = (tag: NdefTagFile) => {
    const bytes = new Uint8Array(tag.rawNdefBytes);
    triggerBrowserDownload(bytes, tag.fileName, 'application/octet-stream');
  };

  const handleImportNdefFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const textPreview = new TextDecoder('utf-8', { fatal: false })
      .decode(buf)
      .replace(/[^\x20-\x7E]+/g, ' ')
      .trim();
    onCreateTagFile(
      file.name.replace(/\.ndef$/i, ''),
      'Text',
      textPreview || 'Imported binary NDEF tag',
      file.name
    );
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <span>NFC Forum NDEF Tag List</span>
            <span aria-hidden="true">·</span>
            <span>Binary .ndef Downloads</span>
            <span aria-hidden="true">·</span>
            <span>Emulate Thru Phone</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            NFC NDEF Tag List
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Browse, create, or import standard NDEF tag files. Each tag includes a <strong>Download .ndef</strong> button and an <strong>Emulate Thru Phone</strong> button to broadcast directly from your phone.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ndef,.bin,.txt"
            onChange={(e) => void handleImportNdefFile(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Import .ndef File</span>
          </button>

          {emulatingTag && (
            <button
              type="button"
              onClick={onStopEmulation}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
              <span>Stop Emulating</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Phone Emulation Banner */}
      {emulatingTag && (
        <div className="bg-[#0B0F17] text-white border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <Radio className="w-4 h-4 animate-pulse" aria-hidden="true" />
              <span>
                Emulating Thru Phone ({usbState.mode !== 'disconnected' ? 'Phone + USB TX/RX' : 'Phone WebNFC / HCE'})
              </span>
            </div>
            <div className="font-display text-lg font-bold">
              {emulatingTag.title} ({emulatingTag.fileName})
            </div>
            <div className="font-mono text-xs text-slate-300 break-all">
              {emulatingTag.rawNdefHex}
            </div>
          </div>
          <button
            type="button"
            onClick={onStopEmulation}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Stop Emulating
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 4 cols: Create New NDEF Tag File */}
        <form
          onSubmit={handleCreate}
          className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-950">
              Add Tag to List
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Encode a new NFC Forum NDEF tag file
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tag Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Workshop Portal Tag"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                NDEF Record Type
              </label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value as NdefRecordType)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              >
                <option value="URI">URI / URL</option>
                <option value="Text">Plain Text</option>
                <option value="Wi-Fi">Wi-Fi Config</option>
                <option value="vCard">vCard Contact</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Filename (.ndef)
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="portal-tag.ndef"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Record Payload
            </label>
            <textarea
              rows={3}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add NDEF Tag to List</span>
          </button>
        </form>

        {/* Right 8 cols: Tag List with Download + Emulate Thru Phone buttons beside each row */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-950">
                  Tag List ({filteredTags.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Download each .ndef tag file or click Emulate Thru Phone
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['ALL', 'URI', 'Text', 'Wi-Fi', 'vCard'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      typeFilter === t
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tags by title, filename, or payload..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {filteredTags.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No NDEF tags match your filter. Add a tag or clear search.
              </div>
            ) : (
              filteredTags.map((tag) => {
                const isEmulating = emulatingTagId === tag.id;
                return (
                  <div
                    key={tag.id}
                    className={`p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-colors ${
                      isEmulating ? 'bg-orange-50/70' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <FileCode2 className="w-4 h-4 text-orange-600 shrink-0" aria-hidden="true" />
                        <span className="font-display text-sm font-bold text-slate-950">
                          {tag.title}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="font-mono text-slate-600">{tag.fileName}</span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="text-slate-600">{tag.recordType}</span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {tag.rawNdefBytes.length} B
                        </span>
                      </div>

                      <div className="font-mono text-xs text-slate-700 truncate">
                        {tag.payload}
                      </div>

                      <div className="font-mono text-[11px] text-slate-400 truncate">
                        NDEF Hex: {tag.rawNdefHex}
                      </div>
                    </div>

                    {/* Download button + Emulate Thru Phone button side by side for each tag */}
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadNdef(tag)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download .ndef</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          isEmulating ? onStopEmulation() : onEmulateTagWithPhone(tag)
                        }
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isEmulating
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                            : 'bg-orange-600 text-white hover:bg-orange-700'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {isEmulating ? 'Emulating Thru Phone' : 'Emulate Thru Phone'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
