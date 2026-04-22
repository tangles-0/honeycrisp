import type { ChangeEvent } from 'react';
import { CirclePower, RefreshCw, BrushCleaning, OctagonMinus, Expand, HardDriveDownload, HardDriveUpload, SlidersHorizontal, CircleQuestionMark, FileUp, SquareLibrary, MemoryStick } from 'lucide-react';

interface ControlPanelProps {
  cpuSpeed: number;
  isReady: boolean;
  onHardReset: () => void;
  onSoftReset: () => void;
  onClearScreen: () => void;
  onBreak: () => void;
  onFullScreen: () => void;
  onCpuSpeedChange: (speed: number) => void;
  onSaveState: () => void;
  onLoadState: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onLoadProgramFile: (file: File) => void;
  onOpenLibrary: () => void;
  onSaveRAM: () => void;
}

export function ControlPanel({
  onHardReset,
  onSoftReset,
  onClearScreen,
  onBreak,
  onFullScreen,
  onCpuSpeedChange,
  onSaveState,
  onLoadState,
  onSettings,
  onHelp,
  onLoadProgramFile,
  onOpenLibrary,
  onSaveRAM,
  cpuSpeed,
  isReady,
}: ControlPanelProps) {
  const handleSpeedChange = (e: ChangeEvent<HTMLInputElement>) => {
    const speed = parseFloat(e.target.value);
    onCpuSpeedChange(speed);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadProgramFile(file);
    }
    e.target.value = '';
  };

  const buttonClass =
    'flex justify-center items-center gap-2 bg-[#8b7355] hover:bg-[#6d5940] text-[#f5e6d3] px-4 py-2 border-4 border-[#5a4530] transition-colors font-mono disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#8b7355]';
  const buttonShadow = { boxShadow: '0 4px 0 #3a2820, 0 6px 10px rgba(0,0,0,0.4)' };

  return (
    <div
      className="controls bg-[#d4c5a9] border-8 border-[#8b7355] p-6 space-y-6"
      style={{
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.5)',
      }}
    >
      {/* Main Controls */}
      <div className="space-y-3">
        <div className="text-[#2a1810] mb-2 border-b-2 border-[#8b7355] pb-1 font-mono">SYSTEM CONTROLS</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button disabled={!isReady} onClick={onHardReset} className={buttonClass} style={buttonShadow}>
            <CirclePower />
            HARD RESET
          </button>
          <button disabled={!isReady} onClick={onSoftReset} className={buttonClass} style={buttonShadow}>
          <RefreshCw />
            SOFT RESET
          </button>
          <button disabled={!isReady} onClick={onClearScreen} className={buttonClass} style={buttonShadow}>
          <BrushCleaning />
            CLEAR SCREEN
          </button>
          <button disabled={!isReady} onClick={onBreak} className={buttonClass} style={buttonShadow}>
          <OctagonMinus />
            BREAK
          </button>
          {/* <button disabled={!isReady} onClick={onFullScreen} className={buttonClass} style={buttonShadow}>
          <Expand />
            FULLSCREEN
          </button> */}
        </div>
      </div>

      {/* CPU Speed */}
      {/* <div className="space-y-2">
        <div className="text-[#2a1810] border-b-2 border-[#8b7355] pb-1 font-mono">
          CPU SPEED: {cpuSpeed.toFixed(2)}x
        </div>
        <input
          type="range"
          min="0.25"
          max="10"
          step="0.25"
          value={cpuSpeed}
          disabled={!isReady}
          onChange={handleSpeedChange}
          className="w-full h-3 bg-[#8b7355] appearance-none cursor-pointer border-4 border-[#5a4530]"
          style={{
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)'
          }}
        />
      </div> */}

      {/* State Management */}
      <div className="space-y-3">
        <div className="text-[#2a1810] border-b-2 border-[#8b7355] pb-1 font-mono">STATE & SETTINGS</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button disabled={!isReady} onClick={onSaveState} className={buttonClass} style={buttonShadow}>
          <HardDriveDownload />
            SAVE STATE
          </button>
          <button disabled={!isReady} onClick={onLoadState} className={buttonClass} style={buttonShadow}>
          <HardDriveUpload />
            LOAD STATE
          </button>
          <button disabled={!isReady} onClick={onSettings} className={buttonClass} style={buttonShadow}>
          <SlidersHorizontal />
            SETTINGS
          </button>
          {/* <button disabled={!isReady} onClick={onHelp} className={buttonClass} style={buttonShadow}>
          <CircleQuestionMark />
            HELP
          </button> */}
        </div>
      </div>

      {/* Program Management */}
      <div className="space-y-3">
        <div className="text-[#2a1810] border-b-2 border-[#8b7355] pb-1 font-mono">PROGRAM MANAGEMENT</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label
            className={`${buttonClass} ${!isReady ? 'pointer-events-none' : 'cursor-pointer'} text-center`}
            style={buttonShadow}
          >
            <FileUp />
            LOAD PROGRAM FILE
            <input
              type="file"
              disabled={!isReady}
              onChange={handleFileChange}
              className="hidden"
              accept=".hc,.bas,.txt"
            />
          </label>
          <button disabled={!isReady} onClick={onOpenLibrary} className={buttonClass} style={buttonShadow}>
          <SquareLibrary />
            PROGRAM LIBRARY
          </button>
          <button disabled={!isReady} onClick={onSaveRAM} className={buttonClass} style={buttonShadow}>
          <MemoryStick />
            SAVE RAM
          </button>
        </div>
      </div>

      {!isReady ? (
        <div className="border-t-2 border-[#8b7355] pt-3 font-mono text-sm text-[#5a4530]">
          Initializing emulator runtime...
        </div>
      ) : null}

    </div>
  );
}
