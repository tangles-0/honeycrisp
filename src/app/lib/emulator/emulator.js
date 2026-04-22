import { mose } from './mose';
import { INTBASIC_BASE64, WOZMON_BASE64 } from './program-consts';

export const EMULATOR_THEMES = {
  green: { fg: '#00FF00', bg: '#000000' },
  amber: { fg: '#FFB000', bg: '#000000' },
  white: { fg: '#FFFFFF', bg: '#000000' },
  purple: { fg: '#B68CFF', bg: '#000000' },
  yellow: { fg: '#FFFF00', bg: '#000000' },
  cyan: { fg: '#00D9FF', bg: '#000000' },
  red: { fg: '#FF3333', bg: '#000000' },
};

export const RAM_OPTIONS = [4, 8, 16, 32, 48];

const ROWS = 24;
const COLS = 40;
const CHAR_OUTPUT_DELAY = 1000 / 30;
const CHAR_OUTPUT_DELAY_PASTE = 1000 / 500;

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch (_error) {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch (_error) {
    // Ignore storage failures so the emulator still runs.
  }
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem(key);
  } catch (_error) {
    // Ignore storage failures so the emulator still runs.
  }
}

function getRamByteSize(ramSizeKB) {
  const ramSizeMap = {
    4: 0x1000,
    8: 0x2000,
    16: 0x4000,
    32: 0x8000,
    48: 0xC000,
  };

  return ramSizeMap[ramSizeKB] || ramSizeMap[4];
}

function b64ToBytes(base64) {
  const binString = atob(base64);
  const len = binString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i += 1) {
    bytes[i] = binString.charCodeAt(i);
  }

  return bytes;
}

function clampSpeed(speed) {
  const numericSpeed = Number.parseFloat(String(speed));
  if (!Number.isFinite(numericSpeed)) {
    return 1;
  }

  return Math.min(10, Math.max(0.25, numericSpeed));
}

export function sanitizeHexInput(value) {
  return String(value).toUpperCase().replace(/[^0-9A-F]/g, '');
}

export function getStoredEmulatorPreferences(storage = globalThis.localStorage) {
  const storedTheme = readStorage(storage, 'hc_theme') || 'white';
  const storedSpeed = clampSpeed(readStorage(storage, 'hc_speed') || 1);
  const storedRamSize = Number.parseInt(readStorage(storage, 'hc_memsize') || '4', 10);
  const storedShowPC = readStorage(storage, 'hc_showPC') !== 'false';
  const storedAutoRestore = readStorage(storage, 'hc_autoRestore') === 'true';

  return {
    theme: EMULATOR_THEMES[storedTheme] ? storedTheme : 'white',
    speed: storedSpeed,
    ramSize: RAM_OPTIONS.includes(storedRamSize) ? storedRamSize : 4,
    showPC: storedShowPC,
    autoRestore: storedAutoRestore,
  };
}

export function createHoneyCrispEmulator(options) {
  const {
    elements,
    storage = globalThis.localStorage,
    alert: alertFn = globalThis.alert?.bind(globalThis),
    confirm: confirmFn = globalThis.confirm?.bind(globalThis),
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    locationRef = globalThis.location,
    onReady,
    onFullscreenChange,
    onLoadingStateChange,
    onSettingsChange,
    onOpenLibrary,
  } = options;

  const {
    termEl,
    pcEl,
    errEl,
    indicatorEl,
    ramStatusEl,
    pcDisplayEl,
    perfEl,
  } = elements ?? {};

  if (!termEl || !pcEl || !indicatorEl || !ramStatusEl || !pcDisplayEl || !perfEl) {
    throw new Error('HoneyCrisp emulator requires terminal and status element references.');
  }

  let destroyed = false;
  let ready = false;
  let animationFrameId = null;
  let blinkIntervalId = null;
  let wozmonActive = false;
  let programLoaded = false;
  let running = true;
  let isPasting = false;
  let pasteTimeout = null;
  let activeInjectionTimeout = null;
  let pendingUserAt = false;
  let showPromptCursor = false;
  let blinkState = true;
  let renderScheduled = false;
  let videoOutputQueue = [];
  let lastCharOutputTime = 0;
  let cpu = null;
  let perfStats = {
    cycles: 0,
    lastTime: performance.now(),
    kHz: 0,
  };
  let currentSettings = getStoredEmulatorPreferences(storage);
  let screen = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  let cursor = { x: 0, y: 0 };
  let userTyped = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let dirtyRows = new Set();
  let lastCursorPos = { x: 0, y: 0 };
  let backBuffer = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  let frontBuffer = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));

  const listeners = [];

  function showAlert(message) {
    if (typeof alertFn === 'function') {
      alertFn(message);
    }
  }

  function showConfirm(message) {
    if (typeof confirmFn === 'function') {
      return confirmFn(message);
    }

    return false;
  }

  function setError(message = '') {
    if (errEl) {
      errEl.textContent = message;
    }
  }

  function addListener(target, eventName, handler, options) {
    if (!target?.addEventListener) {
      return;
    }

    target.addEventListener(eventName, handler, options);
    listeners.push(() => target.removeEventListener(eventName, handler, options));
  }

  function clearListeners() {
    listeners.splice(0).reverse().forEach((removeListener) => removeListener());
  }

  function focusTerminal() {
    if (termEl instanceof HTMLElement) {
      termEl.focus();
    }
  }

  function emitSettingsChange(partial = {}) {
    currentSettings = { ...currentSettings, ...partial };
    if (typeof onSettingsChange === 'function') {
      onSettingsChange({ ...currentSettings });
    }
  }

  function emitFullscreenChange() {
    if (typeof onFullscreenChange === 'function') {
      onFullscreenChange(documentRef.fullscreenElement === termEl);
    }
  }

  function emitLoadingState(loadingState) {
    if (typeof onLoadingStateChange === 'function') {
      onLoadingStateChange(loadingState);
    }
  }

  function delay(ms) {
    return new Promise((resolve) => {
      windowRef.setTimeout(() => {
        if (!destroyed) {
          resolve();
        }
      }, ms);
    });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = url;
    link.download = filename;
    documentRef.body.appendChild(link);
    link.click();
    documentRef.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function updateRamStatus() {
    const ramSize = cpu ? cpu.ramSize : currentSettings.ramSize;
    ramStatusEl.textContent = `RAM: ${ramSize}KB`;
  }

  function setTheme(themeName, { persist = true, emit = true } = {}) {
    const nextTheme = EMULATOR_THEMES[themeName] ? themeName : 'green';
    const theme = EMULATOR_THEMES[nextTheme];

    documentRef.documentElement.style.setProperty('--term-fg', theme.fg);
    documentRef.documentElement.style.setProperty('--term-bg', theme.bg);

    if (persist) {
      writeStorage(storage, 'hc_theme', nextTheme);
    }

    if (emit) {
      emitSettingsChange({ theme: nextTheme });
    } else {
      currentSettings = { ...currentSettings, theme: nextTheme };
    }
  }

  function setSpeed(speed, { persist = true, emit = true } = {}) {
    const nextSpeed = clampSpeed(speed);

    if (persist) {
      writeStorage(storage, 'hc_speed', String(nextSpeed));
    }

    if (emit) {
      emitSettingsChange({ speed: nextSpeed });
    } else {
      currentSettings = { ...currentSettings, speed: nextSpeed };
    }
  }

  function setShowProgramCounter(showPC, { persist = true, emit = true } = {}) {
    pcDisplayEl.style.display = showPC ? 'block' : 'none';

    if (persist) {
      writeStorage(storage, 'hc_showPC', String(showPC));
    }

    if (emit) {
      emitSettingsChange({ showPC });
    } else {
      currentSettings = { ...currentSettings, showPC };
    }
  }

  function setAutoRestore(autoRestore, { persist = true, emit = true } = {}) {
    if (persist) {
      writeStorage(storage, 'hc_autoRestore', String(autoRestore));
      if (!autoRestore) {
        removeStorage(storage, 'hc_lastSession');
      }
    }

    if (emit) {
      emitSettingsChange({ autoRestore });
    } else {
      currentSettings = { ...currentSettings, autoRestore };
    }
  }

  function markRowDirty(row) {
    if (row >= 0 && row < ROWS) {
      dirtyRows.add(row);
    }
  }

  function scheduleRender() {
    if (!renderScheduled) {
      renderScheduled = true;
      windowRef.requestAnimationFrame(() => {
        renderScheduled = false;
        renderScreen();
      });
    }
  }

  function renderScreen() {
    const display = backBuffer;

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        display[y][x] = screen[y][x];
      }
    }

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (display[y][x] === '@' && !userTyped[y][x]) {
          const isCursor = cursor.y === y && cursor.x === x;
          const isBootPattern = x > 0 && display[y][x - 1] === '_';

          if (!blinkState && (isCursor || isBootPattern)) {
            display[y][x] = ' ';
          }
        }
      }
    }

    if ((wozmonActive && documentRef.activeElement === termEl) || showPromptCursor) {
      if (cursor.y < ROWS && cursor.x < COLS) {
        display[cursor.y][cursor.x] = blinkState ? '@' : screen[cursor.y][cursor.x];
      }
    }

    const cursorMoved = cursor.x !== lastCursorPos.x || cursor.y !== lastCursorPos.y;

    if (cursorMoved) {
      markRowDirty(lastCursorPos.y);
      markRowDirty(cursor.y);
      lastCursorPos = { x: cursor.x, y: cursor.y };
    }

    if (dirtyRows.size === 0 && !cursorMoved) {
      return;
    }

    let hasChanges = false;
    for (const y of dirtyRows) {
      if (y >= ROWS) {
        continue;
      }

      for (let x = 0; x < COLS; x += 1) {
        if (display[y][x] !== frontBuffer[y][x]) {
          hasChanges = true;
          break;
        }
      }

      if (hasChanges) {
        break;
      }
    }

    if (hasChanges || dirtyRows.size > 0) {
      const temp = frontBuffer;
      frontBuffer = backBuffer;
      backBuffer = temp;
      termEl.textContent = frontBuffer.map((row) => row.join('')).join('\n');
    }

    dirtyRows.clear();
  }

  function scroll() {
    screen.shift();
    screen.push(Array(COLS).fill(' '));
    userTyped.shift();
    userTyped.push(Array(COLS).fill(false));
    cursor.y = ROWS - 1;

    for (let i = 0; i < ROWS; i += 1) {
      markRowDirty(i);
    }
  }

  function newline() {
    cursor.x = 0;
    cursor.y += 1;
    if (cursor.y >= ROWS) {
      scroll();
    }
    markRowDirty(cursor.y);
  }

  function printChar(ch) {
    if (ch === '\n') {
      newline();
      return;
    }

    let charCode = ch & 0x7F;
    if (charCode >= 0x60 && charCode <= 0x7F) {
      charCode -= 0x20;
    }

    if (charCode === 0x7E) {
      charCode = 0x5E;
    }

    if (charCode === 0x5F) {
      if (wozmonActive && cpu.PC >= 0xFF1F && cpu.PC <= 0xFF40 && videoOutputQueue.length > 0 && videoOutputQueue[0] === 0x5C) {
        return;
      }
    }

    let character = String.fromCharCode(charCode);
    if (character >= 'a' && character <= 'z') {
      character = character.toUpperCase();
    }

    const apple1Charset = /^[ !"#$%&'()*+,\-./0-9:;<=>?@A-Z[\]\\^_]$/;

    if (apple1Charset.test(character)) {
      if (pendingUserAt && character === '@') {
        userTyped[cursor.y][cursor.x] = true;
        pendingUserAt = false;
      } else {
        userTyped[cursor.y][cursor.x] = character === '@';
      }

      screen[cursor.y][cursor.x] = character;
      markRowDirty(cursor.y);
      cursor.x += 1;
    }

    if (cursor.x >= COLS) {
      newline();
    }
  }

  function initVideoPattern() {
    screen = Array.from({ length: ROWS }, (_, row) => Array.from({ length: COLS }, (_, col) => (col % 2 === 0 ? '_' : '@')));
    cursor = { x: 0, y: 0 };
    userTyped = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    showPromptCursor = false;

    for (let i = 0; i < ROWS; i += 1) {
      markRowDirty(i);
    }

    scheduleRender();
  }

  function clearScreen() {
    screen = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
    cursor = { x: 0, y: 0 };
    userTyped = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    showPromptCursor = true;

    for (let i = 0; i < ROWS; i += 1) {
      markRowDirty(i);
    }

    scheduleRender();
  }

  function initCPU() {
    cpu = new mose(currentSettings.ramSize);
    cpu._videoHook = (byte7) => {
      videoOutputQueue.push(byte7 & 0x7F);
    };
    cpu._clearVideoHook = () => {
      videoOutputQueue = [];
    };
    cpu._wozmonActiveHook = (isActive) => {
      wozmonActive = isActive;
    };

    updateRamStatus();
    setError('');
    console.log(
      `Initialized HoneyCrisp with ${currentSettings.ramSize}KB RAM (${cpu.ram.length.toString(16).toUpperCase()} bytes, $0000-$${(cpu.ram.length - 1).toString(16).toUpperCase()})`,
    );
  }

  function enqueueKey(ascii) {
    const upper = String.fromCharCode(ascii).toUpperCase().charCodeAt(0) & 0x7F;
    cpu._kbdBuf.push(upper | 0x80);
  }

  function handleMainKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    if (!wozmonActive) {
      e.preventDefault();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      return;
    }

    if (e.key === ' ' || e.key === "'" || e.key === '\\' || e.key === '/') {
      e.preventDefault();
    }

    if (['Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key.length === 1) {
      if (e.key === '@') {
        pendingUserAt = true;
      }
      enqueueKey(e.key.charCodeAt(0));
    } else if (e.key === 'Enter') {
      cpu._kbdBuf.push(0x8D);
    } else if (e.key === 'Backspace') {
      cpu._kbdBuf.push(0xDF);
    } else if (e.key === 'Escape') {
      cpu._kbdBuf.push(0x9B);
      e.preventDefault();
    }
  }

  function handlePaste(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    e.preventDefault();

    if (!wozmonActive) {
      return;
    }

    const text = e.clipboardData.getData('text');
    if (!text) {
      return;
    }

    if (text.length > 10000) {
      showAlert('Paste text too large (max 10,000 characters)');
      return;
    }

    isPasting = true;
    if (pasteTimeout) {
      windowRef.clearTimeout(pasteTimeout);
    }

    for (const ch of text) {
      if (ch === '\n' || ch === '\r') {
        cpu._kbdBuf.push(0x8D);
      } else {
        const code = ch.toUpperCase().charCodeAt(0) & 0x7F;
        cpu._kbdBuf.push(code | 0x80);
      }
    }

    const estimatedPasteTime = text.length * CHAR_OUTPUT_DELAY_PASTE + 500;
    pasteTimeout = windowRef.setTimeout(() => {
      isPasting = false;
      pasteTimeout = null;
    }, estimatedPasteTime);
  }

  function handleDocumentClick(e) {
    if (e.target.closest('[data-emulator-modal="true"]')) {
      return;
    }

    if (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'SELECT' ||
      e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'LABEL' ||
      e.target.tagName === 'OPTION'
    ) {
      return;
    }

    if (e.target.closest('.controls, .nav, .shortcuts-box, .status-bar')) {
      return;
    }

    windowRef.setTimeout(() => {
      focusTerminal();
    }, 50);
  }

  function handleVisibilityChange() {
    if (!documentRef.hidden && wozmonActive) {
      focusTerminal();
    }
  }

  function handleWindowFocus() {
    if (wozmonActive) {
      focusTerminal();
    }
  }

  function toggleFullscreen() {
    if (documentRef.fullscreenElement === termEl) {
      documentRef.exitFullscreen();
      return;
    }

    termEl.requestFullscreen().catch((error) => {
      console.error('Fullscreen request failed:', error);
    });
  }

  function handleShortcutKeydown(e) {
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }

    switch (e.key.toUpperCase()) {
      case 'H':
        e.preventDefault();
        hardReset();
        return;
      case 'S':
        e.preventDefault();
        warmReset();
        return;
      case 'E':
        e.preventDefault();
        clearScreen();
        focusTerminal();
        return;
      case 'C':
        e.preventDefault();
        triggerBreak();
        return;
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        return;
      case 'B':
        e.preventDefault();
        if (typeof onOpenLibrary === 'function') {
          onOpenLibrary();
        }
        return;
      default:
        break;
    }
  }

  function handleFullscreenChange() {
    windowRef.setTimeout(() => {
      focusTerminal();
      emitFullscreenChange();
    }, 100);
  }

  function tick(timestamp) {
    if (destroyed) {
      return;
    }

    if (running) {
      try {
        const APPLE1_CYCLES_PER_FRAME = 1023000 / 60;
        const cyclesRun = cpu.runCycles(Math.floor(APPLE1_CYCLES_PER_FRAME * currentSettings.speed));

        perfStats.cycles += cyclesRun;
        if (timestamp - perfStats.lastTime >= 1000) {
          perfStats.kHz = Math.round(perfStats.cycles / 1000);
          perfStats.cycles = 0;
          perfStats.lastTime = timestamp;
          perfEl.textContent = `${perfStats.kHz} kHz`;

          if (currentSettings.autoRestore && wozmonActive) {
            saveSessionToStorage();
          }
        }

        indicatorEl.classList.add('running');
      } catch (error) {
        if (error?.message === 'CPU_CRASH_0000') {
          hardReset();
        } else {
          console.error('Unexpected error:', error);
          setError(error?.message || 'Unexpected emulator error');
          running = false;
        }
      }

      const baseCharsPerSecond = 1000 / CHAR_OUTPUT_DELAY;
      const targetCharsThisFrame = (baseCharsPerSecond * currentSettings.speed) / 60;
      const maxCharsThisFrame = isPasting
        ? Math.min(Math.ceil(targetCharsThisFrame * 10), 500)
        : Math.min(Math.ceil(targetCharsThisFrame), 200);

      let charsProcessed = 0;
      while (videoOutputQueue.length > 0 && charsProcessed < maxCharsThisFrame) {
        const ch = videoOutputQueue.shift();
        if (ch === 0x0D) {
          printChar('\n');
        } else {
          printChar(ch);
        }
        charsProcessed += 1;
      }

      if (charsProcessed > 0) {
        scheduleRender();
      }

      pcEl.textContent = cpu.PC.toString(16).padStart(4, '0').toUpperCase();
    }

    animationFrameId = windowRef.requestAnimationFrame(tick);
  }

  function loadWozmonROM(wozBytes) {
    const rom = new Uint8Array(0x0400).fill(0xFF);
    if (wozBytes.length !== 256) {
      throw new Error('WOZMON must be 256 bytes');
    }

    rom.set(wozBytes, 0x300);
    rom[0x3FA] = 0x00;
    rom[0x3FB] = 0xFF;
    rom[0x3FC] = 0x00;
    rom[0x3FD] = 0xFF;
    rom[0x3FE] = 0x00;
    rom[0x3FF] = 0xFF;
    cpu.rom.set(rom);
  }

  function loadIntegerBasicROM(b64) {
    const bytes = b64ToBytes(b64);
    const rom = new Uint8Array(0x1000).fill(0xFF);
    rom.set(bytes.slice(0, 0x1000), 0);
    cpu.basic.set(rom);
  }

  function resetInputState() {
    isPasting = false;
    if (pasteTimeout) {
      windowRef.clearTimeout(pasteTimeout);
      pasteTimeout = null;
    }
    if (activeInjectionTimeout) {
      windowRef.clearTimeout(activeInjectionTimeout);
      activeInjectionTimeout = null;
    }
  }

  function hardReset() {
    resetInputState();
    programLoaded = false;
    cpu._kbdBuf = [];
    videoOutputQueue = [];
    wozmonActive = false;
    cpu.A = cpu.X = cpu.Y = 0;
    cpu.S = 0xFF;
    cpu.C = cpu.Z = cpu.I = cpu.D = cpu.B = cpu.V = cpu.N = 0;
    cpu.ram.fill(0);
    cpu.modifiedAddresses.clear();
    cpu.basic.fill(0);
    initVideoPattern();
    cpu.PC = 0x0000;
    running = false;
    setError('');
    focusTerminal();
  }

  function warmReset() {
    resetInputState();
    programLoaded = false;
    cpu._kbdBuf = [];
    videoOutputQueue = [];
    cpu.PC = 0xFF00;
    wozmonActive = true;
    if (screen && screen[0]) {
      const isBootRow = screen[0].every((character, index) => (index % 2 === 0 ? character === '_' : character === '@'));
      if (isBootRow) {
        screen[0] = Array(COLS).fill(' ');
        renderScreen();
      }
    }
    running = true;
    setError('');
    focusTerminal();
  }

  function triggerBreak() {
    cpu.triggerBreak();
    focusTerminal();
  }

  function findMemoryTarget() {
    if (cpu && cpu.ram instanceof Uint8Array) {
      return cpu.ram;
    }
    return null;
  }

  function getSnapshotState() {
    return {
      version: '1.2.6',
      ramSize: cpu.ramSize,
      ram: Array.from(cpu.ram),
      basic: Array.from(cpu.basic),
      modifiedAddresses: Array.from(cpu.modifiedAddresses),
      speed: currentSettings.speed,
      theme: currentSettings.theme,
      registers: {
        A: cpu.A,
        X: cpu.X,
        Y: cpu.Y,
        PC: cpu.PC,
        S: cpu.S,
        C: cpu.C,
        Z: cpu.Z,
        I: cpu.I,
        D: cpu.D,
        B: cpu.B,
        V: cpu.V,
        N: cpu.N,
      },
      screen: screen.map((row) => row.slice()),
      cursor: { ...cursor },
      userTyped: userTyped.map((row) => row.slice()),
      wozmonActive,
      programLoaded,
      showPromptCursor,
      running,
      kbdBuf: Array.from(cpu._kbdBuf),
      videoOutputQueue: Array.from(videoOutputQueue),
      lastCharOutputTime,
      isPasting,
      timestamp: Date.now(),
    };
  }

  function getRamInfo() {
    const ramSize = cpu ? cpu.ramSize : currentSettings.ramSize;
    const ramLength = cpu ? cpu.ram.length : getRamByteSize(ramSize);
    return {
      ramSize,
      ramLength,
      maxAddressHex: (ramLength - 1).toString(16).toUpperCase().padStart(4, '0'),
      label: `${ramSize}KB ($0000-$${(ramLength - 1).toString(16).toUpperCase()})`,
    };
  }

  function setRamSize(ramSize, { pendingState = null, pendingProgram = null } = {}) {
    const nextRamSize = Number.parseInt(String(ramSize), 10);

    if (!RAM_OPTIONS.includes(nextRamSize)) {
      showAlert('Required RAM size not available');
      return;
    }

    writeStorage(storage, 'hc_memsize', String(nextRamSize));
    currentSettings = { ...currentSettings, ramSize: nextRamSize };

    if (pendingState) {
      writeStorage(storage, 'hc_pending_state', JSON.stringify(pendingState));
    } else {
      removeStorage(storage, 'hc_pending_state');
    }

    if (pendingProgram) {
      writeStorage(storage, 'hc_pending_program', JSON.stringify(pendingProgram));
    } else {
      removeStorage(storage, 'hc_pending_program');
    }

    programLoaded = false;
    emitSettingsChange({ ramSize: nextRamSize });
    locationRef.reload();
  }

  function parseMachineCodeLines(lines, mem) {
    let addr = 0;
    let hasError = false;
    let startAddress = null;
    let endAddress = 0;
    let addressCount = 0;
    let hasValidAddress = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }

      if (!line.startsWith(':') && /^[0-9A-Fa-f]{4,}$/.test(line)) {
        addr = Number.parseInt(line.substring(0, 4), 16);

        if (!(cpu.ramSize >= 8 && addr >= 0xE000 && addr <= 0xEFFF)) {
          if (addr >= mem.length) {
            if (!hasError) {
              hasError = true;
              windowRef.setTimeout(() => {
                showAlert(
                  `Unable to safely load program! \nLoad address $${addr.toString(16).toUpperCase()} exceeds RAM size!\nMax address: $${(mem.length - 1).toString(16).toUpperCase()}\nCurrent RAM: ${cpu.ramSize}KB`,
                );
              }, 0);
            }
            return null;
          }
        }

        if (startAddress === null) {
          startAddress = addr;
        }

        addressCount += 1;
        hasValidAddress = true;
        console.log(`Load address: $${addr.toString(16).toUpperCase()}`);
        continue;
      }

      if (line.startsWith(':')) {
        if (!hasValidAddress) {
          if (!hasError) {
            hasError = true;
            windowRef.setTimeout(() => {
              showAlert('Error: Data found before load address!\nFile format should be:\n2000\n: A9 42 ...');
            }, 0);
          }
          return null;
        }

        const bytes = line.substring(1).trim().split(/\s+/);
        for (const byte of bytes) {
          if (byte === '') {
            continue;
          }

          if (!(cpu.ramSize >= 8 && addr >= 0xE000 && addr <= 0xEFFF)) {
            if (addr >= mem.length) {
              if (!hasError) {
                hasError = true;
                windowRef.setTimeout(() => {
                  showAlert(
                    `Unable to load safely load program! \nAddress $${addr.toString(16).toUpperCase()} exceeds RAM size! \nProgram truncated at $${(addr - 1).toString(16).toUpperCase()}\nYou may need more RAM for this program.`,
                  );
                }, 0);
              }
              break;
            }
          }

          const val = Number.parseInt(byte, 16);
          if (Number.isNaN(val)) {
            console.warn(`Invalid hex byte: ${byte} at address $${addr.toString(16).toUpperCase()}`);
            continue;
          }

          cpu.write(addr, val);
          endAddress = addr;
          addr += 1;
        }
      }

      if (hasError) {
        return null;
      }
    }

    if (!hasValidAddress || startAddress === null) {
      if (!hasError) {
        windowRef.setTimeout(() => {
          showAlert('Error: No valid load address found in file!\n\nFile should start with a 4-digit hex address like:\n2000\n: A9 42 8D 00 20');
        }, 0);
      }
      return null;
    }

    return {
      startAddress,
      endAddress,
      addressCount,
    };
  }

  function machineCodeTouchesBasicRom(lines) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }

      if (!line.startsWith(':') && /^[0-9A-Fa-f]{4,}$/.test(line)) {
        const addr = Number.parseInt(line.substring(0, 4), 16);
        if (cpu.ramSize >= 8 && addr >= 0xE000 && addr <= 0xEFFF) {
          return true;
        }
      }
    }

    return false;
  }

  async function loadFile(file) {
    resetInputState();

    if (!file) {
      focusTerminal();
      return;
    }

    const fileName = file.name.toLowerCase();

    if (programLoaded && !fileName.endsWith('.bas') && !fileName.endsWith('.txt')) {
      console.log('Program already loaded. Resetting system...');
      programLoaded = false;
      hardReset();
      await delay(100);
      clearScreen();
      await delay(100);
      warmReset();
      await delay(500);
      await loadFile(file);
      return;
    }

    if (!wozmonActive) {
      console.log('System not initialized. Performing soft-reset and loading program...');
      clearScreen();
      warmReset();
    }

    if (fileName.endsWith('.hc')) {
      const fileText = await file.text();
      const lines = fileText.split(/\r?\n/).filter((line) => line.trim() !== '');
      const mem = findMemoryTarget();
      if (!mem) {
        showAlert('No writable memory found!');
        return;
      }

      const touchesBasicROM = machineCodeTouchesBasicRom(lines);
      if (touchesBasicROM) {
        if (wozmonActive) {
          console.log('Program loads into E000-EFFF range. Performing soft reset...');
          clearScreen();
          warmReset();
          await delay(500);
        } else {
          console.log('Program will load into E000-EFFF range. BASIC ROM will be cleared.');
        }
      }

      if (touchesBasicROM && wozmonActive) {
        console.log('Clearing Integer BASIC ROM area with zeros...');
        cpu.basic.fill(0x00);
      }

      const result = parseMachineCodeLines(lines, mem);
      if (!result) {
        return;
      }

      console.log(`Loaded HC file with ${result.addressCount} address block(s)`);
      console.log(
        `Written to RAM: $${result.startAddress.toString(16).toUpperCase()} - $${result.endAddress
          .toString(16)
          .toUpperCase()} (${result.endAddress - result.startAddress + 1} bytes)`,
      );
      programLoaded = true;
      focusTerminal();
      return;
    }

    if (fileName.endsWith('.bas') || fileName.endsWith('.txt')) {
      if (cpu.ramSize < 8) {
        showAlert(
          `Integer BASIC requires 8KB or more RAM!\n\nCurrent RAM: ${cpu.ramSize}KB\nRequired: 8KB minimum\n\nPlease switch to 8KB or higher RAM and try again.`,
        );
        focusTerminal();
        return;
      }

      if (programLoaded && cpu.PC < 0xE000) {
        console.log('Machine code program running. Resetting before loading BASIC...');
        hardReset();
        await delay(100);
        loadIntegerBasicROM(INTBASIC_BASE64);
        programLoaded = false;
        clearScreen();
        await delay(100);
        warmReset();
        await delay(500);
        await loadFile(file);
        return;
      }

      const basicSignature = cpu.basic[0] === 0x4C && cpu.basic[1] === 0xB0 && cpu.basic[2] === 0xE2;
      if (!basicSignature) {
        console.log('Integer BASIC not loaded. Loading BASIC ROM...');
        loadIntegerBasicROM(INTBASIC_BASE64);
        if (!wozmonActive) {
          console.log('WOZMON not active, performing warm reset...');
          clearScreen();
          warmReset();
          await delay(500);
        } else {
          await delay(100);
        }
      }

      const programText = await file.text();
      focusTerminal();
      programLoaded = true;
      const basicAlreadyRunning = cpu.PC >= 0xE000 && cpu.PC <= 0xEFFF;

      if (basicAlreadyRunning) {
        console.log('BASIC program already loaded. Resetting system...');
        hardReset();
        await delay(100);
        loadIntegerBasicROM(INTBASIC_BASE64);
        programLoaded = false;
        clearScreen();
        await delay(100);
        warmReset();
        await delay(500);
        await loadFile(file);
        return;
      }

      const needsBasicStart = !basicAlreadyRunning;

      function injectCommand(cmd) {
        for (const ch of cmd) {
          const code = ch.toUpperCase().charCodeAt(0) & 0x7F;
          enqueueKey(code);
        }
        enqueueKey(0x0D);
      }

      function typeBasicProgram(lines, index = 0) {
        if (isPasting === false && pasteTimeout === null && activeInjectionTimeout === null) {
          console.log('BASIC program injection cancelled by reset');
          return;
        }

        if (index >= lines.length) {
          activeInjectionTimeout = null;
          return;
        }

        const line = lines[index].trim();
        if (line === '') {
          activeInjectionTimeout = windowRef.setTimeout(() => typeBasicProgram(lines, index + 1), 50);
          return;
        }

        for (const ch of line) {
          const code = ch.toUpperCase().charCodeAt(0) & 0x7F;
          enqueueKey(code);
        }
        enqueueKey(0x0D);
        activeInjectionTimeout = windowRef.setTimeout(() => typeBasicProgram(lines, index + 1), 200);
      }

      const lines = programText.split(/\r?\n/).filter((line) => line.trim() !== '');

      if (!needsBasicStart) {
        console.log('BASIC already running, loading program...');
        activeInjectionTimeout = windowRef.setTimeout(() => {
          if (!isPasting) {
            typeBasicProgram(lines);
          }
        }, 100);
      } else {
        console.log('Starting BASIC with E000R...');
        injectCommand('E000R');
        activeInjectionTimeout = windowRef.setTimeout(() => {
          if (!isPasting) {
            console.log('BASIC started, loading program...');
            typeBasicProgram(lines);
          }
        }, 1000);
      }

      return;
    }

    showAlert('Unsupported file type. Please use .hc, .bas, or .txt files.');
    focusTerminal();
  }

  async function loadFileWithAutoRun(file, customRunAddress) {
    if (!file) {
      focusTerminal();
      return;
    }

    if (!file.name.toLowerCase().endsWith('.hc')) {
      await loadFile(file);
      return;
    }

    if (wozmonActive && programLoaded) {
      console.log('Program already loaded. Resetting system...');
      hardReset();
      await delay(100);
      clearScreen();
      await delay(100);
      warmReset();
      await delay(500);
      await loadFile(file);
      return;
    }

    if (!wozmonActive) {
      console.log('System not initialized. Performing soft-reset and loading program...');
      clearScreen();
      warmReset();
    }

    const fileText = await file.text();
    const lines = fileText.split(/\r?\n/).filter((line) => line.trim() !== '');
    const mem = findMemoryTarget();
    if (!mem) {
      showAlert('No writable memory found!');
      return;
    }

    const touchesBasicROM = machineCodeTouchesBasicRom(lines);
    if (touchesBasicROM) {
      if (wozmonActive) {
        console.log('Program loads into E000-EFFF range. Performing soft reset...');
        clearScreen();
        warmReset();
        await delay(500);
      } else {
        console.log('Program will load into E000-EFFF range. BASIC ROM will be cleared.');
      }
    }

    if (touchesBasicROM && wozmonActive) {
      console.log('Clearing Integer BASIC ROM area with zeros...');
      cpu.basic.fill(0x00);
    }

    const result = parseMachineCodeLines(lines, mem);
    if (!result) {
      return;
    }

    console.log(`Loaded HC file with ${result.addressCount} address block(s)`);
    console.log(
      `Written to RAM: $${result.startAddress.toString(16).toUpperCase()} - $${result.endAddress
        .toString(16)
        .toUpperCase()} (${result.endAddress - result.startAddress + 1} bytes)`,
    );
    programLoaded = true;

    const runCommand = customRunAddress || result.startAddress.toString(16).toUpperCase();
    console.log(`Auto-running with command: ${runCommand}${customRunAddress ? '' : 'R'}`);

    activeInjectionTimeout = windowRef.setTimeout(() => {
      for (const ch of runCommand) {
        enqueueKey(ch.charCodeAt(0));
      }

      if (!customRunAddress || /^[0-9A-F]+$/i.test(customRunAddress)) {
        enqueueKey(0x52);
      }

      enqueueKey(0x0D);
      activeInjectionTimeout = null;
    }, 300);

    focusTerminal();
  }

  function saveState() {
    const state = getSnapshotState();
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadBlob(`hc-state-${dateStr}.hcstate`, new Blob([JSON.stringify(state)], { type: 'application/json' }));
    console.log('State saved successfully');
    showAlert('State saved successfully!');
  }

  async function loadStateFromData(state) {
    function updateProgress(percent, stage, detail) {
      emitLoadingState({
        open: true,
        percent,
        stage,
        detail,
      });
    }

    updateProgress(0, 'Initializing...', 'Starting state load...');
    await delay(100);

    try {
      updateProgress(5, 'Validating...', 'Checking state version...');
      if (!state.version) {
        emitLoadingState({ open: false });
        showAlert('Invalid state file: No version information');
        throw new Error('No version information');
      }

      updateProgress(10, 'Validating...', 'Checking RAM compatibility...');
      if (state.ramSize > cpu.ramSize) {
        emitLoadingState({ open: false });
        showAlert(`RAM size mismatch. State requires ${state.ramSize}KB but system only has ${cpu.ramSize}KB`);
        throw new Error('RAM size mismatch');
      }

      updateProgress(15, 'Preparing...', 'Stopping active operations...');
      resetInputState();

      await delay(50);
      updateProgress(25, 'Loading RAM...', `Loading ${state.ram.length} bytes`);
      cpu.ram.set(new Uint8Array(state.ram));

      await delay(50);
      updateProgress(40, 'Loading reserved RAM...', 'Restoring E000-EFFF locations...');
      if (state.basic) {
        cpu.basic.set(new Uint8Array(state.basic));
      }

      await delay(50);
      updateProgress(50, 'Loading metadata...', 'Restoring modified addresses...');
      cpu.modifiedAddresses = state.modifiedAddresses ? new Set(state.modifiedAddresses) : new Set();

      await delay(50);
      updateProgress(60, 'Loading registers...', 'Restoring CPU state...');
      Object.assign(cpu, state.registers);

      await delay(50);
      updateProgress(75, 'Loading screen...', 'Restoring display...');
      screen = state.screen.map((row) => row.slice());
      cursor = { ...state.cursor };
      userTyped = state.userTyped ? state.userTyped.map((row) => row.slice()) : Array.from({ length: ROWS }, () => Array(COLS).fill(false));

      await delay(50);
      updateProgress(85, 'Restoring system...', 'Applying configurations...');
      wozmonActive = state.wozmonActive ?? true;
      programLoaded = state.programLoaded ?? false;
      showPromptCursor = state.showPromptCursor ?? false;
      running = state.running ?? true;

      if (state.speed) {
        setSpeed(state.speed);
      }

      if (state.theme) {
        setTheme(state.theme);
      }

      await delay(50);
      updateProgress(95, 'Finalizing...', 'Restoring keyboard buffer...');
      cpu._kbdBuf = state.kbdBuf ? [...state.kbdBuf] : [];
      videoOutputQueue = state.videoOutputQueue ? [...state.videoOutputQueue] : [];
      lastCharOutputTime = performance.now() - CHAR_OUTPUT_DELAY;
      isPasting = false;

      await delay(50);
      updateProgress(100, 'Finished!', 'Tidying up...');
      for (let i = 0; i < ROWS; i += 1) {
        markRowDirty(i);
      }
      scheduleRender();

      await delay(200);
      emitLoadingState({ open: false });

      let statusMessage = '';
      if (!wozmonActive && cpu.PC >= 0x2000 && cpu.PC < 0xFF00) {
        statusMessage = `System state loaded successfully! \n Program resuming from $${cpu.PC.toString(16).toUpperCase().padStart(4, '0')}`;
        console.log(`Resuming program execution at PC=$${cpu.PC.toString(16).toUpperCase()}`);
      } else if (cpu.PC >= 0xE000 && cpu.PC <= 0xEFFF) {
        statusMessage = 'System state loaded successfully! \n Integer BASIC resumed';
      } else if (wozmonActive || cpu.PC >= 0xFF00) {
        statusMessage = 'System state loaded successfully!';
      } else {
        statusMessage = `State loaded - PC at $${cpu.PC.toString(16).toUpperCase().padStart(4, '0')}`;
      }

      showAlert(statusMessage);
      focusTerminal();
      return true;
    } catch (error) {
      emitLoadingState({ open: false });
      console.error('Error loading state:', error);
      if (error instanceof Error && error.message !== 'No version information' && error.message !== 'RAM size mismatch') {
        showAlert(`Error loading state: ${error.message}`);
      }
      throw error;
    }
  }

  async function loadStateFile(file) {
    if (!file) {
      return;
    }

    try {
      const state = JSON.parse(await file.text());

      if (!state.version) {
        showAlert('Invalid state file: No version information');
        return;
      }

      if (state.ramSize > cpu.ramSize) {
        const shouldSwitchRam = showConfirm(
          `State file requires ${state.ramSize}KB RAM.\nCurrent RAM: ${cpu.ramSize}KB\n\nSwitch RAM size and load state?`,
        );

        if (shouldSwitchRam) {
          setRamSize(state.ramSize, { pendingState: state });
        }
        return;
      }

      if (state.ramSize < cpu.ramSize) {
        console.log(`Loading ${state.ramSize}KB state into ${cpu.ramSize}KB RAM`);
      }

      await loadStateFromData(state);
    } catch (error) {
      console.error('Error loading state:', error);
      showAlert(`Error loading state: ${error.message}`);
    }
  }

  async function handleDroppedFile(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.hcstate')) {
      await loadStateFile(file);
      return;
    }

    if ((fileName.endsWith('.bas') || fileName.endsWith('.txt')) && cpu.ramSize < 8) {
      showAlert(
        `Integer BASIC requires 8KB or more RAM!\n\nCurrent RAM: ${cpu.ramSize}KB\nRequired: 8KB minimum\n\nPlease switch to 8KB or higher RAM and try again.`,
      );
      focusTerminal();
      return;
    }

    if (fileName.endsWith('.hc')) {
      await loadFileWithAutoRun(file);
      return;
    }

    await loadFile(file);
  }

  async function loadProgramFromLibrary(program) {
    try {
      if (program.minRAM && program.minRAM > cpu.ramSize) {
        const shouldSwitchRam = showConfirm(
          `This program requires ${program.minRAM}KB RAM or more!\n\nCurrent RAM: ${cpu.ramSize}KB\nRequired: ${program.minRAM}KB minimum\n\nWould you like to switch to ${program.minRAM}KB RAM now?\n(The page will reload with the new RAM setting)`,
        );

        if (shouldSwitchRam) {
          setRamSize(program.minRAM, { pendingProgram: program });
        }
        return;
      }

      if (program.type === 'BASIC' && cpu.ramSize < 8) {
        const shouldSwitchRam = showConfirm(
          `Integer BASIC requires 8KB or more RAM!\n\nCurrent RAM: ${cpu.ramSize}KB\nRequired: 8KB minimum\n\nWould you like to switch to 8KB RAM now?\n(The page will reload with the new RAM setting)`,
        );

        if (shouldSwitchRam) {
          setRamSize(8, { pendingProgram: program });
        }
        return;
      }

      const response = await fetch(program.url);
      if (!response.ok) {
        throw new Error('Failed to load program');
      }

      const blob = await response.blob();
      const file = new File(
        [blob],
        `${program.name}.${program.type.toLowerCase() === 'basic' ? 'bas' : 'hc'}`,
        { type: 'text/plain' },
      );

      if (program.type === 'Machine Code' && ((cpu.PC >= 0xE000 && cpu.PC <= 0xEFFF) || programLoaded)) {
        console.log('Resetting from BASIC/loaded program before loading machine code...');
        hardReset();
        await delay(50);
        clearScreen();
        await delay(50);
        warmReset();
        await delay(200);
        if (program.runAddress) {
          await loadFileWithAutoRun(file, program.runAddress);
        } else {
          await loadFileWithAutoRun(file);
        }
        return;
      }

      if (program.type === 'Machine Code' && program.runAddress) {
        await loadFileWithAutoRun(file, program.runAddress);
      } else if (program.type === 'Machine Code') {
        await loadFileWithAutoRun(file);
      } else {
        await loadFile(file);
      }
    } catch (error) {
      console.error('Error loading program:', error);
      showAlert(`Error loading program: ${error.message}`);
    }
  }

  function saveRAMToFile(options = {}) {
    const {
      saveRange = 'modified',
      skipZeros = true,
      filename = 'program',
      startAddr = '0000',
      endAddr = getRamInfo().maxAddressHex,
    } = options;

    let addressesToSave = [];

    if (saveRange === 'modified') {
      addressesToSave = Array.from(cpu.modifiedAddresses).sort((a, b) => a - b);

      if (addressesToSave.length === 0) {
        showAlert('No modified RAM to save');
        return false;
      }
    } else if (saveRange === 'full') {
      for (let addr = 0; addr < cpu.ram.length; addr += 1) {
        if (!skipZeros || cpu.ram[addr] !== 0) {
          addressesToSave.push(addr);
        }
      }
    } else {
      const normalizedStartHex = sanitizeHexInput(startAddr);
      const normalizedEndHex = sanitizeHexInput(endAddr);

      if (!normalizedStartHex || !normalizedEndHex) {
        showAlert('Please enter valid start and end addresses');
        return false;
      }

      const numericStartAddr = Number.parseInt(normalizedStartHex, 16);
      const numericEndAddr = Number.parseInt(normalizedEndHex, 16);

      if (Number.isNaN(numericStartAddr) || Number.isNaN(numericEndAddr)) {
        showAlert('Invalid hex addresses');
        return false;
      }

      if (numericStartAddr > numericEndAddr) {
        showAlert('Start address must be less than or equal to end address');
        return false;
      }

      const maxAddr = (cpu.ram.length - 1).toString(16).toUpperCase().padStart(4, '0');
      if (numericEndAddr >= cpu.ram.length) {
        showAlert(`End address exceeds RAM size (max: $${maxAddr})`);
        return false;
      }

      for (let addr = numericStartAddr; addr <= numericEndAddr; addr += 1) {
        if (!skipZeros || cpu.ram[addr] !== 0) {
          addressesToSave.push(addr);
        }
      }
    }

    if (addressesToSave.length === 0) {
      showAlert('No data to save (memory is empty or all zeros)');
      return false;
    }

    let content = '';
    let currentBlockStart = null;
    let currentBlock = [];
    let lastAddr = -2;

    for (let i = 0; i < addressesToSave.length; i += 1) {
      const addr = addressesToSave[i];
      const byte = cpu.ram[addr];

      if (addr !== lastAddr + 1) {
        if (currentBlock.length > 0) {
          content += `${currentBlockStart.toString(16).toUpperCase().padStart(4, '0')}\n:`;
          for (let j = 0; j < currentBlock.length; j += 1) {
            content += ` ${currentBlock[j].toString(16).toUpperCase().padStart(2, '0')}`;
            if ((j + 1) % 8 === 0 && j < currentBlock.length - 1) {
              content += '\n:';
            }
          }
          content += '\n';
        }

        currentBlockStart = addr;
        currentBlock = [];
      }

      currentBlock.push(byte);
      lastAddr = addr;

      if (currentBlock.length >= 64) {
        content += `${currentBlockStart.toString(16).toUpperCase().padStart(4, '0')}\n:`;
        for (let j = 0; j < currentBlock.length; j += 1) {
          content += ` ${currentBlock[j].toString(16).toUpperCase().padStart(2, '0')}`;
          if ((j + 1) % 8 === 0 && j < currentBlock.length - 1) {
            content += '\n:';
          }
        }
        content += '\n';
        currentBlock = [];
        currentBlockStart = null;
        lastAddr = -2;
      }
    }

    if (currentBlock.length > 0) {
      content += `${currentBlockStart.toString(16).toUpperCase().padStart(4, '0')}\n:`;
      for (let j = 0; j < currentBlock.length; j += 1) {
        content += ` ${currentBlock[j].toString(16).toUpperCase().padStart(2, '0')}`;
        if ((j + 1) % 8 === 0 && j < currentBlock.length - 1) {
          content += '\n:';
        }
      }
      content += '\n';
    }

    downloadBlob(`${filename.trim() || 'program'}.hc`, new Blob([content], { type: 'text/plain' }));

    const summaryStart = addressesToSave[0];
    const summaryEnd = addressesToSave[addressesToSave.length - 1];
    console.log(
      `Saved ${addressesToSave.length} modified bytes from $${summaryStart.toString(16).toUpperCase()} to $${summaryEnd.toString(16).toUpperCase()}`,
    );

    return true;
  }

  function saveSessionToStorage() {
    try {
      writeStorage(storage, 'hc_lastSession', JSON.stringify(getSnapshotState()));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  async function restoreSessionFromStorage() {
    try {
      const saved = readStorage(storage, 'hc_lastSession');
      if (!saved) {
        return false;
      }

      const state = JSON.parse(saved);
      const age = Date.now() - state.timestamp;
      const maxAge = 24 * 60 * 60 * 1000;

      if (age > maxAge) {
        console.log('Saved session too old, not restoring');
        removeStorage(storage, 'hc_lastSession');
        return false;
      }

      console.log('Restoring last session...');
      await loadStateFromData(state);
      return true;
    } catch (error) {
      console.error('Failed to restore session:', error);
      return false;
    }
  }

  function handleTerminalDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    termEl.style.opacity = '0.5';
    termEl.style.border = '2px dashed var(--term-fg)';
  }

  function handleTerminalDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    termEl.style.opacity = '1';
    termEl.style.border = '1px solid #333';
  }

  async function handleTerminalDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    termEl.style.opacity = '1';
    termEl.style.border = '1px solid #333';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleDroppedFile(files[0]);
    }

    focusTerminal();
  }

  async function handlePendingStartup() {
    const pendingState = readStorage(storage, 'hc_pending_state');
    if (pendingState) {
      try {
        const parsedState = JSON.parse(pendingState);
        removeStorage(storage, 'hc_pending_state');
        await delay(500);
        await loadStateFromData(parsedState);
      } catch (error) {
        console.error('Error loading pending state:', error);
        removeStorage(storage, 'hc_pending_state');
      }
      return;
    }

    const pendingProgram = readStorage(storage, 'hc_pending_program');
    if (pendingProgram) {
      try {
        const program = JSON.parse(pendingProgram);
        removeStorage(storage, 'hc_pending_program');
        console.log('Loading pending program after RAM switch:', program.name);
        await delay(500);
        clearScreen();
        await delay(100);
        warmReset();
        await delay(500);
        await loadProgramFromLibrary(program);
      } catch (error) {
        console.error('Error loading pending program:', error);
        removeStorage(storage, 'hc_pending_program');
      }
      return;
    }

    if (currentSettings.autoRestore) {
      await delay(500);
      const restored = await restoreSessionFromStorage();
      if (restored) {
        console.log('Session auto-restored');
      }
    }
  }

  function mount() {
    if (ready) {
      return;
    }

    blinkIntervalId = windowRef.setInterval(() => {
      blinkState = !blinkState;
      if (cursor.y < ROWS) {
        dirtyRows.add(cursor.y);
      }
      scheduleRender();
    }, 350);

    addListener(documentRef, 'keydown', handleMainKeydown);
    addListener(documentRef, 'paste', handlePaste);
    addListener(documentRef, 'click', handleDocumentClick);
    addListener(documentRef, 'visibilitychange', handleVisibilityChange);
    addListener(documentRef, 'keydown', handleShortcutKeydown);
    addListener(documentRef, 'fullscreenchange', handleFullscreenChange);
    addListener(windowRef, 'focus', handleWindowFocus);
    addListener(termEl, 'dragover', handleTerminalDragOver);
    addListener(termEl, 'dragleave', handleTerminalDragLeave);
    addListener(termEl, 'drop', handleTerminalDrop);

    setTheme(currentSettings.theme, { persist: false, emit: false });
    setSpeed(currentSettings.speed, { persist: false, emit: false });
    setShowProgramCounter(currentSettings.showPC, { persist: false, emit: false });
    setAutoRestore(currentSettings.autoRestore, { persist: false, emit: false });
    emitSettingsChange(currentSettings);

    initCPU();

    const fontsReady = documentRef.fonts?.ready ?? Promise.resolve();
    Promise.resolve(fontsReady).then(async () => {
      if (destroyed) {
        return;
      }

      console.log('Fonts loaded');
      focusTerminal();
      loadWozmonROM(b64ToBytes(WOZMON_BASE64));
      hardReset();
      animationFrameId = windowRef.requestAnimationFrame(tick);
      await handlePendingStartup();
      ready = true;
      emitFullscreenChange();
      if (typeof onReady === 'function') {
        onReady();
      }
    });
  }

  function destroy() {
    destroyed = true;
    ready = false;
    clearListeners();

    if (blinkIntervalId) {
      windowRef.clearInterval(blinkIntervalId);
      blinkIntervalId = null;
    }

    if (animationFrameId) {
      windowRef.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    resetInputState();
    emitLoadingState({ open: false });
  }

  return {
    mount,
    destroy,
    hardReset,
    warmReset,
    clearScreen,
    triggerBreak,
    toggleFullscreen,
    focusTerminal,
    saveState,
    loadStateFile,
    loadProgramFile(file) {
      return loadFile(file);
    },
    loadProgramFromLibrary,
    saveRAMToFile,
    setTheme,
    setSpeed,
    setShowProgramCounter,
    setAutoRestore,
    setRamSize,
    getRamInfo,
    getSettings() {
      return { ...currentSettings };
    },
    isReady() {
      return ready;
    },
  };
}
