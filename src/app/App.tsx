import { useRef, useState } from 'react';
import { Header } from './components/Header';
import { Emulator, type EmulatorHandle } from './components/Emulator';
import { EmulatorScreen } from './components/EmulatorScreen';
import { ControlPanel } from './components/ControlPanel';
import { Footer } from './components/Footer';
import { CircleQuestionMark } from 'lucide-react';

function getInitialSpeed() {
  if (typeof window === 'undefined') {
    return 1;
  }

  const savedSpeed = window.localStorage.getItem('hc_speed');
  const parsedSpeed = savedSpeed ? Number.parseFloat(savedSpeed) : 1;
  return Number.isFinite(parsedSpeed) ? parsedSpeed : 1;
}

export default function App() {
  const emulatorRef = useRef<EmulatorHandle>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEmulatorReady, setIsEmulatorReady] = useState(false);
  const [cpuSpeed, setCpuSpeed] = useState(getInitialSpeed);

  const handleHardReset = () => {
    emulatorRef.current?.hardReset();
  };

  const handleSoftReset = () => {
    emulatorRef.current?.softReset();
  };

  const handleClearScreen = () => {
    emulatorRef.current?.clearScreen();
  };

  const handleBreak = () => {
    emulatorRef.current?.breakProgram();
  };

  const handleFullScreen = () => {
    emulatorRef.current?.toggleFullscreen();
  };

  const handleCpuSpeedChange = (speed: number) => {
    setCpuSpeed(speed);
  };

  const handleSaveState = () => {
    emulatorRef.current?.saveState();
  };

  const handleLoadState = () => {
    emulatorRef.current?.openStatePicker();
  };

  const handleSettings = () => {
    emulatorRef.current?.openSettings();
  };

  const handleHelp = () => {
    emulatorRef.current?.openHelp();
  };

  const handleLoadProgramFile = (file: File) => {
    emulatorRef.current?.loadProgramFile(file);
  };

  const handleOpenLibrary = () => {
    emulatorRef.current?.openLibrary();
  };

  const handleSaveRAM = () => {
    emulatorRef.current?.saveRAM();
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #2a1810 0%, #3a2820 50%, #2a1810 100%)',
      }}
    >
      <Header />

      <main className="flex-1 py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <EmulatorScreen
            isFullscreen={isFullscreen}
            isReady={isEmulatorReady}
            onFullScreen={handleFullScreen}
          >
            <Emulator
              ref={emulatorRef}
              speed={cpuSpeed}
              onReadyChange={setIsEmulatorReady}
              onFullscreenChange={setIsFullscreen}
              onSpeedChange={setCpuSpeed}
            />
          </EmulatorScreen>

          {!isFullscreen && (
            <ControlPanel
              cpuSpeed={cpuSpeed}
              isReady={isEmulatorReady}
              onHardReset={handleHardReset}
              onSoftReset={handleSoftReset}
              onClearScreen={handleClearScreen}
              onBreak={handleBreak}
              onFullScreen={handleFullScreen}
              onCpuSpeedChange={handleCpuSpeedChange}
              onSaveState={handleSaveState}
              onLoadState={handleLoadState}
              onSettings={handleSettings}
              onHelp={handleHelp}
              onLoadProgramFile={handleLoadProgramFile}
              onOpenLibrary={handleOpenLibrary}
              onSaveRAM={handleSaveRAM}
            />
          )}
        </div>
      </main>

      <button
        type="button"
        title="Help"
        aria-label="Help"
        onClick={handleHelp}
        // className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#2a1810] shadow-lg flex items-center justify-center hover:bg-[#4c3319] transition-colors border-2 border-[#8b7355] focus:outline-none focus:ring focus:ring-[#8b7355]/40"
        // style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.16)" }}
        className="fixed bottom-6 right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#5a4530] bg-[#8b7355] text-[#f5e6d3] transition-colors hover:bg-[#6d5940] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#8b7355]"
        style={{ boxShadow: '0 4px 0 #3a2820, 0 6px 10px rgba(0,0,0,0.4)' }}
      >
        <CircleQuestionMark className="w-7 h-7 text-[#f5ddb6]" />
      </button> 

      {!isFullscreen && <Footer />}
    </div>
  );
}