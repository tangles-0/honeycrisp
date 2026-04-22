export const ramSizeMap = {
  4: 0x1000,
  8: 0x2000,
  16: 0x4000,
  32: 0x8000,
  48: 0xC000,
};

export const DEFAULT_SAVE_RAM_LABEL = '4KB ($0000-$0FFF)';

export const DEFAULT_SAVE_RAM_OPTIONS = {
  saveRange: 'modified',
  filename: 'program',
  skipZeros: true,
  startAddr: '0000',
  endAddr: '0FFF',
}