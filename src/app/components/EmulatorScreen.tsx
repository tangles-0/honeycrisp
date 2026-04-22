import React from 'react';
import { Expand } from 'lucide-react';

interface EmulatorScreenProps {
  isFullscreen: boolean;
  isReady: boolean;
  onFullScreen: () => void;
  children?: any;
}

export function EmulatorScreen({ isFullscreen, isReady, onFullScreen, children }: EmulatorScreenProps) {
  return (
    <section className="space-y-6">
      <div className="nav relative rounded-3xl border-8 border-[#8b7355] bg-[#2a1810] p-4 shadow-2xl md:p-8">
        <div className="flex flex-col items-center gap-6">
          <pre id="terminal" tabIndex={0} aria-label="Apple-1 terminal" className="scanlines block" />
        </div>
        <button
          type="button"
          aria-label="Fullscreen"
          title="Fullscreen"
          disabled={!isReady}
          onClick={onFullScreen}
          className="absolute bottom-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#5a4530] bg-[#8b7355] text-[#f5e6d3] transition-colors hover:bg-[#6d5940] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#8b7355]"
          style={{ boxShadow: '0 4px 0 #3a2820, 0 6px 10px rgba(0,0,0,0.4)' }}
        >
          <Expand />
        </button>
      </div>

      <div className="status-bar rounded-2xl border-4 border-[#8b7355] bg-[#1b120d] p-4 shadow-lg">

        <small className="block font-mono text-[#f5e6d3] opacity-90">
          Getting Started: Click CLEAR SCREEN, then SOFT RESET. Check HELP for more info. Happy
          Programming!
        </small>

        <div className="mt-3 grid gap-3 font-mono text-sm text-[#f5e6d3] md:grid-cols-[auto_auto_auto_1fr] md:items-center">
          <div id="ramstatus">RAM: 4KB</div>
          <div id="pcDisplay">
            CPU PC=<span id="pc">0000</span>{' '}
            <span
              className="indicator inline-block h-2.5 w-2.5 align-middle rounded-full border border-[var(--term-fg)] opacity-35"
              id="indicator"
            />
          </div>
          <div id="perfStats">0 kHz</div>
          <div id="err" className="min-h-[1.25rem] text-[#ff6666]" />
        </div>
      </div>

      {children}
    </section>
  );
}
