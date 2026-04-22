import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  createHoneyCrispEmulator,
  EMULATOR_THEMES,
  getStoredEmulatorPreferences,
  RAM_OPTIONS,
  sanitizeHexInput,
} from '../lib/emulator/emulator';
import { ProgramLibraryModal } from './ProgramLibraryModal';
import '../lib/emulator/emulator.css';
import { DEFAULT_SAVE_RAM_LABEL, DEFAULT_SAVE_RAM_OPTIONS, ramSizeMap } from '../lib/emulator/consts';

export interface EmulatorHandle {
  hardReset: () => void;
  softReset: () => void;
  clearScreen: () => void;
  breakProgram: () => void;
  toggleFullscreen: () => void;
  saveState: () => void;
  openStatePicker: () => void;
  openSettings: () => void;
  openHelp: () => void;
  loadProgramFile: (file: File) => void;
  openLibrary: () => void;
  saveRAM: () => void;
  focusTerminal: () => void;
}

interface EmulatorProps {
  speed: number;
  onReadyChange?: (ready: boolean) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onSpeedChange?: (speed: number) => void;
}

interface EmulatorSettings {
  autoRestore: boolean;
  ramSize: number;
  showPC: boolean;
  speed: number;
  theme: string;
}

interface LoadingState {
  detail?: string;
  open: boolean;
  percent?: number;
  stage?: string;
}

interface SaveRamOptions {
  endAddr: string;
  filename: string;
  saveRange: 'custom' | 'full' | 'modified';
  skipZeros: boolean;
  startAddr: string;
}

const FAVORITES_STORAGE_KEY = 'hc_favorites';

function getRamByteSize(ramSize: number) {
  return ramSizeMap[ramSize] ?? ramSizeMap[4];
}

function getStoredFavorites() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const favorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    return favorites ? (JSON.parse(favorites) as string[]) : [];
  } catch (_error) {
    return [];
  }
}

function saveFavorites(favorites: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
}

function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-emulator-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        data-emulator-modal="true"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border-4 border-[#8b7355] bg-[#1b120d] px-6 py-5 text-[#f5e6d3] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b-2 border-[#8b7355] pb-3">
          <h2 className="font-mono text-xl tracking-wide">HELP</h2>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[#8b7355] bg-[#2a1810] px-3 py-1 font-mono text-sm hover:bg-[#3a2820]"
          >
            CLOSE
          </button>
        </div>

        <div className="space-y-5 font-mono text-sm leading-6 text-[#f5e6d3]">
          <section>
            <h3 className="mb-2 border-b border-[#5a4530] pb-1 text-base">Getting Started</h3>
            <p>
              <strong>Counting Hexadecimal:</strong> A simple tutorial can be found at{' '}
              <a className="underline hover:opacity-80" href="https://www.youtube.com/watch?v=kYTQcZu3C0o">
                Counting in Hexadecimal
              </a>
              .
            </p>
            <p className="mt-3">
              <strong>WOZMON:</strong> The system boots into WOZMON, the Apple-1&apos;s monitor
              program. You can examine memory by typing an address like `FF00`, write memory with
              `300: A9 42`, run programs with `300R`, and use CLEAR SCREEN to tidy the display.
            </p>
          </section>

          <section>
            <h3 className="mb-2 border-b border-[#5a4530] pb-1 text-base">Loading Programs</h3>
            <p>
              Use LOAD PROGRAM FILE for `.hc` machine code or `.bas` / `.txt` BASIC sources. Machine
              code from the library auto-runs. BASIC programs require 8KB or more RAM and will load
              into Integer BASIC.
            </p>
          </section>

          <section>
            <h3 className="mb-2 border-b border-[#5a4530] pb-1 text-base">Keyboard Shortcuts</h3>
            <div className="grid gap-1 md:grid-cols-2">
              <div>Ctrl+H - Hard Reset</div>
              <div>Ctrl+S - Soft Reset</div>
              <div>Ctrl+E - Clear Screen</div>
              <div>Ctrl+C - Break</div>
              <div>Ctrl+F - Toggle Fullscreen</div>
              <div>Ctrl+B - Open Program Library</div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 border-b border-[#5a4530] pb-1 text-base">Tips</h3>
            <p>
              Drag and drop `.hc`, `.bas`, or `.hcstate` files onto the terminal, use auto-restore
              to recover your last session, and remember that some programs need larger RAM sizes.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function LoadingModal({ loadingState }: { loadingState: LoadingState }) {
  if (!loadingState.open) {
    return null;
  }

  return (
    <div
      data-emulator-modal="true"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4"
    >
      <div
        data-emulator-modal="true"
        className="w-full max-w-xl rounded-2xl border-4 border-[#8b7355] bg-[#1b120d] px-6 py-5 text-[#f5e6d3] shadow-2xl"
      >
        <h2 className="mb-4 border-b-2 border-[#8b7355] pb-2 font-mono text-xl tracking-wide">
          Loading State...
        </h2>
        <div className="space-y-3 font-mono text-sm">
          <div>{loadingState.stage ?? 'Initializing...'}</div>
          <div className="relative h-8 overflow-hidden border border-[var(--term-fg)] bg-black">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--term-fg)]"
              style={{ width: `${loadingState.percent ?? 0}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center font-bold text-black mix-blend-difference">
              {Math.round(loadingState.percent ?? 0)}%
            </div>
          </div>
          <div className="text-xs opacity-80">{loadingState.detail ?? 'Starting...'}</div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  isOpen,
  onAutoRestoreChange,
  onClose,
  onRamSizeChange,
  onShowPcChange,
  onSpeedChange,
  onThemeChange,
  settings,
}: {
  isOpen: boolean;
  onAutoRestoreChange: (checked: boolean) => void;
  onClose: () => void;
  onRamSizeChange: (ramSize: number) => void;
  onShowPcChange: (checked: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onThemeChange: (themeName: string) => void;
  settings: EmulatorSettings;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-emulator-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        data-emulator-modal="true"
        className="w-full max-w-2xl rounded-2xl border-4 border-[#8b7355] bg-[#1b120d] px-6 py-5 text-[#f5e6d3] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b-2 border-[#8b7355] pb-3">
          <h2 className="font-mono text-xl tracking-wide">SETTINGS</h2>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[#8b7355] bg-[#2a1810] px-3 py-1 font-mono text-sm hover:bg-[#3a2820]"
          >
            CLOSE
          </button>
        </div>

        <div className="space-y-6 font-mono text-sm">
          <section>
            <h3 className="mb-3 border-b border-[#5a4530] pb-1 text-base">System Configuration</h3>
            <div className="flex flex-wrap gap-4">
              {RAM_OPTIONS.map((ramSize) => (
                <label key={ramSize} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="memsize"
                    checked={settings.ramSize === ramSize}
                    onChange={() => onRamSizeChange(ramSize)}
                  />
                  {ramSize}KB
                </label>
              ))}
            </div>
            <label className="block">
                <div className="mt-4">CPU Speed: {settings.speed.toFixed(2)}x</div>
                <input
                  type="range"
                  min="0.25"
                  max="10"
                  step="0.25"
                  value={settings.speed}
                  onChange={(event) => onSpeedChange(Number.parseFloat(event.target.value))}
                  className="h-3 w-full cursor-pointer appearance-none border-4 border-[#5a4530] bg-[#8b7355]"
                  style={{
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
                  }}
                />
              </label>
          </section>

          <section>
            <h3 className="mb-3 border-b border-[#5a4530] pb-1 text-base">Display Settings</h3>
            <div className="space-y-4">

              <label className="block">
                <div className="mb-2">Terminal Theme</div>
                <select
                  value={settings.theme}
                  onChange={(event) => onThemeChange(event.target.value)}
                  className="w-full border border-[var(--term-fg)] bg-black px-3 py-2 text-[var(--term-fg)]"
                >
                  {Object.keys(EMULATOR_THEMES).map((themeName) => (
                    <option key={themeName} value={themeName}>
                      {themeName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showPC}
                  onChange={(event) => onShowPcChange(event.target.checked)}
                />
                Show Program Counter
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 border-b border-[#5a4530] pb-1 text-base">Session Management</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoRestore}
                onChange={(event) => onAutoRestoreChange(event.target.checked)}
              />
              Auto-restore last session on startup
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}

function SaveRamModal({
  isOpen,
  onClose,
  onOptionsChange,
  onSave,
  options,
  ramLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOptionsChange: (nextOptions: SaveRamOptions) => void;
  onSave: () => void;
  options: SaveRamOptions;
  ramLabel: string;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-emulator-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        data-emulator-modal="true"
        className="w-full max-w-2xl rounded-2xl border-4 border-[#8b7355] bg-[#1b120d] px-6 py-5 text-[#f5e6d3] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b-2 border-[#8b7355] pb-3">
          <h2 className="font-mono text-xl tracking-wide">SAVE RAM CONTENTS</h2>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[#8b7355] bg-[#2a1810] px-3 py-1 font-mono text-sm hover:bg-[#3a2820]"
          >
            CLOSE
          </button>
        </div>

        <div className="space-y-5 font-mono text-sm">
          <section>
            <p className="mb-3">Choose the memory range to save.</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={options.saveRange === 'modified'}
                  onChange={() => onOptionsChange({ ...options, saveRange: 'modified' })}
                />
                Modified RAM Only
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={options.saveRange === 'full'}
                  onChange={() => onOptionsChange({ ...options, saveRange: 'full' })}
                />
                Full RAM ({ramLabel})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={options.saveRange === 'custom'}
                  onChange={() => onOptionsChange({ ...options, saveRange: 'custom' })}
                />
                Custom Range
              </label>
            </div>
          </section>

          {options.saveRange === 'custom' ? (
            <section className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2">Start Address (hex)</div>
                <input
                  type="text"
                  maxLength={4}
                  value={options.startAddr}
                  onChange={(event) =>
                    onOptionsChange({ ...options, startAddr: sanitizeHexInput(event.target.value) })
                  }
                  className="w-full border border-[var(--term-fg)] bg-black px-3 py-2 text-[var(--term-fg)]"
                />
              </label>
              <label className="block">
                <div className="mb-2">End Address (hex)</div>
                <input
                  type="text"
                  maxLength={4}
                  value={options.endAddr}
                  onChange={(event) =>
                    onOptionsChange({ ...options, endAddr: sanitizeHexInput(event.target.value) })
                  }
                  className="w-full border border-[var(--term-fg)] bg-black px-3 py-2 text-[var(--term-fg)]"
                />
              </label>
            </section>
          ) : null}

          <label className="block">
            <div className="mb-2">Filename</div>
            <input
              type="text"
              value={options.filename}
              onChange={(event) => onOptionsChange({ ...options, filename: event.target.value })}
              className="w-full border border-[var(--term-fg)] bg-black px-3 py-2 text-[var(--term-fg)]"
            />
            <div className="mt-1 text-xs opacity-80">`.hc` will be added automatically.</div>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.skipZeros}
              onChange={(event) => onOptionsChange({ ...options, skipZeros: event.target.checked })}
            />
            Skip empty memory (zeros only)
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border-2 border-[#8b7355] bg-[#2a1810] px-4 py-2 font-mono text-sm hover:bg-[#3a2820]"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={onSave}
              className="border-2 border-[#6bd968] bg-[#173614] px-4 py-2 font-mono text-sm hover:bg-[#21501d]"
            >
              SAVE FILE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Emulator = forwardRef<EmulatorHandle, EmulatorProps>(function Emulator(
  { speed, onReadyChange, onFullscreenChange, onSpeedChange },
  ref,
) {
  const emulatorInstanceRef = useRef<any>(null);
  const stateLoaderRef = useRef<HTMLInputElement | null>(null);
  const readyChangeRef = useRef(onReadyChange);
  const fullscreenChangeRef = useRef(onFullscreenChange);
  const speedChangeRef = useRef(onSpeedChange);
  const [settings, setSettings] = useState<EmulatorSettings>(() => getStoredEmulatorPreferences());
  const [favorites, setFavorites] = useState<string[]>(() => getStoredFavorites());
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSaveRamOpen, setIsSaveRamOpen] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({ open: false });
  const [saveRamLabel, setSaveRamLabel] = useState(DEFAULT_SAVE_RAM_LABEL);
  const [saveRamOptions, setSaveRamOptions] = useState<SaveRamOptions>(DEFAULT_SAVE_RAM_OPTIONS);

  useEffect(() => {
    readyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    fullscreenChangeRef.current = onFullscreenChange;
  }, [onFullscreenChange]);

  useEffect(() => {
    speedChangeRef.current = onSpeedChange;
  }, [onSpeedChange]);

  useEffect(() => {
    function focusTerminalSoon() {
      window.setTimeout(() => {
        emulatorInstanceRef.current?.focusTerminal();
      }, 50);
    }

    readyChangeRef.current?.(false);
    const termEl = document.getElementById('terminal');
    const pcEl = document.getElementById('pc');
    const errEl = document.getElementById('err');
    const indicatorEl = document.getElementById('indicator');
    const ramStatusEl = document.getElementById('ramstatus');
    const pcDisplayEl = document.getElementById('pcDisplay');
    const perfEl = document.getElementById('perfStats');

    if (
      !(termEl instanceof HTMLElement) ||
      !(pcEl instanceof HTMLElement) ||
      !(indicatorEl instanceof HTMLElement) ||
      !(ramStatusEl instanceof HTMLElement) ||
      !(pcDisplayEl instanceof HTMLElement) ||
      !(perfEl instanceof HTMLElement)
    ) {
      return undefined;
    }

    const emulator = createHoneyCrispEmulator({
      elements: {
        termEl,
        pcEl,
        errEl,
        indicatorEl,
        ramStatusEl,
        pcDisplayEl,
        perfEl,
      },
      onReady: () => {
        readyChangeRef.current?.(true);
      },
      onFullscreenChange: (isFullscreen: boolean) => {
        fullscreenChangeRef.current?.(isFullscreen);
      },
      onLoadingStateChange: (nextLoadingState: LoadingState) => {
        setLoadingState((previousState) => ({ ...previousState, ...nextLoadingState }));
      },
      onSettingsChange: (nextSettings: EmulatorSettings) => {
        setSettings(nextSettings);
        speedChangeRef.current?.(nextSettings.speed);
      },
      onOpenLibrary: () => {
        setIsLibraryOpen(true);
      },
    });

    emulatorInstanceRef.current = emulator;
    emulator.mount();

    return () => {
      emulator.destroy();
      emulatorInstanceRef.current = null;
      readyChangeRef.current?.(false);
      focusTerminalSoon();
    };
  }, []);

  useEffect(() => {
    const emulator = emulatorInstanceRef.current;
    if (!emulator) {
      return;
    }

    const emulatorSpeed = emulator.getSettings().speed;
    if (Math.abs(emulatorSpeed - speed) > 0.001) {
      emulator.setSpeed(speed);
    }
  }, [speed]);

  useImperativeHandle(
    ref,
    () => ({
      hardReset() {
        emulatorInstanceRef.current?.hardReset();
      },
      softReset() {
        emulatorInstanceRef.current?.warmReset();
      },
      clearScreen() {
        emulatorInstanceRef.current?.clearScreen();
      },
      breakProgram() {
        emulatorInstanceRef.current?.triggerBreak();
      },
      toggleFullscreen() {
        emulatorInstanceRef.current?.toggleFullscreen();
      },
      saveState() {
        emulatorInstanceRef.current?.saveState();
      },
      openStatePicker() {
        stateLoaderRef.current?.click();
      },
      openSettings() {
        setIsSettingsOpen(true);
      },
      openHelp() {
        setIsHelpOpen(true);
      },
      loadProgramFile(file: File) {
        emulatorInstanceRef.current?.loadProgramFile(file);
      },
      openLibrary() {
        setIsLibraryOpen(true);
      },
      saveRAM() {
        const ramInfo = emulatorInstanceRef.current?.getRamInfo();
        setSaveRamLabel(ramInfo?.label ?? `${settings.ramSize}KB`);
        setSaveRamOptions({ ...DEFAULT_SAVE_RAM_OPTIONS, endAddr: ramInfo?.maxAddressHex ?? (getRamByteSize(settings.ramSize) - 1).toString(16).toUpperCase().padStart(4, '0') });
        setIsSaveRamOpen(true);
      },
      focusTerminal() {
        emulatorInstanceRef.current?.focusTerminal();
      },
    }),
    [settings.ramSize],
  );

  function closeModalAndFocus(setter: (value: boolean) => void) {
    setter(false);
    window.setTimeout(() => {
      emulatorInstanceRef.current?.focusTerminal();
    }, 50);
  }

  function handleToggleFavorite(programName: string) {
    setFavorites((previousFavorites) => {
      const nextFavorites = previousFavorites.includes(programName)
        ? previousFavorites.filter((favorite) => favorite !== programName)
        : [...previousFavorites, programName];

      saveFavorites(nextFavorites);
      return nextFavorites;
    });
  }

  return (
    <>
      <input
        ref={stateLoaderRef}
        type="file"
        accept=".hcstate"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) {
            await emulatorInstanceRef.current?.loadStateFile(file);
          }
          event.target.value = '';
        }}
      />

      <ProgramLibraryModal
        favorites={favorites}
        isOpen={isLibraryOpen}
        onClose={() => closeModalAndFocus(setIsLibraryOpen)}
        onSelectProgram={async (program) => {
          setIsLibraryOpen(false);
          await emulatorInstanceRef.current?.loadProgramFromLibrary(program);
          window.setTimeout(() => {
            emulatorInstanceRef.current?.focusTerminal();
          }, 50);
        }}
        onToggleFavorite={handleToggleFavorite}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => closeModalAndFocus(setIsSettingsOpen)}
        onSpeedChange={(nextSpeed) => {
          emulatorInstanceRef.current?.setSpeed(nextSpeed);
        }}
        onThemeChange={(themeName) => {
          emulatorInstanceRef.current?.setTheme(themeName);
        }}
        onShowPcChange={(checked) => {
          emulatorInstanceRef.current?.setShowProgramCounter(checked);
        }}
        onAutoRestoreChange={(checked) => {
          emulatorInstanceRef.current?.setAutoRestore(checked);
        }}
        onRamSizeChange={(ramSize) => {
          emulatorInstanceRef.current?.setRamSize(ramSize);
        }}
      />

      <HelpModal isOpen={isHelpOpen} onClose={() => closeModalAndFocus(setIsHelpOpen)} />

      <SaveRamModal
        isOpen={isSaveRamOpen}
        ramLabel={saveRamLabel}
        options={saveRamOptions}
        onClose={() => closeModalAndFocus(setIsSaveRamOpen)}
        onOptionsChange={setSaveRamOptions}
        onSave={() => {
          const saved = emulatorInstanceRef.current?.saveRAMToFile(saveRamOptions);
          if (saved) {
            closeModalAndFocus(setIsSaveRamOpen);
          }
        }}
      />

      <LoadingModal loadingState={loadingState} />

    </>
  );
});
