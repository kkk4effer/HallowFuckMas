import React from 'react';
import { Usb } from 'lucide-react';
import type { PageId, UsbBridgeState } from '../types/nfc';

interface TopBarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  usbState: UsbBridgeState;
  onToggleUsb: () => void;
}

const NAV_ITEMS: Array<{ id: PageId; label: string }> = [
  { id: 'bridge', label: 'NFC Bridge' },
  { id: 'bruce', label: 'Bruce App' },
  { id: 'ndef', label: 'Tag List' },
  { id: 'download', label: 'Export' },
  { id: 'apk', label: 'APK Builder' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activePage,
  onSelectPage,
  usbState,
  onToggleUsb,
}) => {
  const isConnected = usbState.mode !== 'disconnected';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
        {/* Zone 1: Single-line Brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectPage('bridge')}
          className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 rounded cursor-pointer"
        >
          BruceLink NFC Bridge
        </button>

        {/* Zone 2: 5 clean single-line nav links (desktop & wide tablet) */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center justify-center gap-5 lg:gap-7 text-sm font-medium min-w-0"
        >
          {NAV_ITEMS.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPage(item.id)}
                className={`relative py-5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
                  active
                    ? 'text-slate-950 font-semibold'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onToggleUsb}
            className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
              isConnected
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Usb className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isConnected ? 'Disconnect USB' : 'Connect USB'}</span>
          </button>
        </div>
      </div>

      {/* Tablet / Mobile Top Strip so Tag List and all tabs are always visible without scrolling */}
      <nav
        aria-label="Mobile top navigation"
        className="md:hidden flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-2 border-t border-slate-100 text-xs font-medium bg-white"
      >
        {NAV_ITEMS.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectPage(item.id)}
              className={`px-2 py-1 rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                active
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
