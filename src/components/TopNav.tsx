import type { NavTab } from '../types/hardware';

interface TopNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onInstallFirmwareClick: () => void;
  isFlashing: boolean;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'emulator', label: 'T-Embed Emu' },
  { id: 'nfc-fetch', label: 'NFC Fetch' },
  { id: 'wifi-bridge', label: 'Wi-Fi TX/RX' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'carrier-unlock', label: 'Carrier Unlock' },
];

export function TopNav({
  activeTab,
  onSelectTab,
  onInstallFirmwareClick,
  isFlashing,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark (single text element) */}
        <button
          type="button"
          onClick={() => onSelectTab('emulator')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded"
        >
          T-Embed Studio
        </button>

        {/* Zone 2: Clean single-line text navigation tabs */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  isActive
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-orange-600"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary CTA */}
        <div className="hidden sm:flex items-center shrink-0">
          <button
            type="button"
            disabled={isFlashing}
            onClick={onInstallFirmwareClick}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            {isFlashing ? 'Flashing .bin...' : 'Install Bruce Firmware .bin'}
          </button>
        </div>
      </div>
    </header>
  );
}
