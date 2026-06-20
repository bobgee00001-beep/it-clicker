import type { SoundThemeDef } from '../engine/types';

// v1 SOUND_THEMES (index.html). unlockAt 0 = immer verfügbar; darüber = ab Prestige-Level.
export const SOUND_THEMES: SoundThemeDef[] = [
  {
    id: 'none',
    name: 'None',
    description: 'Silent running. No audio output.',
    unlockAt: 0,
  },
  {
    id: 'dialup',
    name: 'Dial-Up',
    description: '1990s modem handshake nostalgia. Unlocks at prestige 1.',
    unlockAt: 1,
  },
  {
    id: 'mechanical',
    name: 'Mechanical',
    description: 'Clicky keyboard and office ambience. Unlocks at prestige 2.',
    unlockAt: 2,
  },
  {
    id: 'retro',
    name: 'Retro',
    description: '8-bit blips and arcade bleeps. Unlocks at prestige 3.',
    unlockAt: 3,
  },
  {
    id: 'scifi',
    name: 'Sci-Fi',
    description: 'Futuristic UI chirps and space hum. Unlocks at prestige 5.',
    unlockAt: 5,
  },
];

export const DEFAULT_SOUND_THEME = 'none';
