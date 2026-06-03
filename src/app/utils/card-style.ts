export type SpellTrapIcon =
  | 'none'
  | 'infinity'
  | 'fire'
  | 'compass'
  | 'cross'
  | 'lightning'
  | 'arrow';

export interface FrameStyle {
  background: string;
  borderColor: string;
  textColor: string;
  label: string;
}

const COLORS = {
  normal: '#c9b88a',
  effect: '#a05a2c',
  fusion: '#7e3f9a',
  ritual: '#5d9cb7',
  synchro: '#e8e4d8',
  xyz: '#1a1a1a',
  link: '#0c3a8b',
  pendulum: '#3fbab0',
  spell: '#1e9b6e',
  trap: '#bd446a',
} as const;

const LABELS: Record<string, string> = {
  normal: 'Monstre Normal',
  effect: 'Monstre à Effet',
  fusion: 'Fusion',
  ritual: 'Rituel',
  synchro: 'Synchro',
  xyz: 'XYZ',
  link: 'Lien',
  spell: 'Magie',
  trap: 'Piège',
};

export function getFrameStyle(frameType: string): FrameStyle {
  const ft = (frameType || '').toLowerCase();

  if (ft.endsWith('_pendulum')) {
    const base = ft.replace('_pendulum', '') as keyof typeof COLORS;
    const top = COLORS[base] ?? COLORS.normal;
    return {
      background: `linear-gradient(180deg, ${top} 0%, ${top} 45%, ${COLORS.pendulum} 100%)`,
      borderColor: COLORS.pendulum,
      textColor: textOn(top),
      label: `${LABELS[base] ?? 'Pendule'} Pendule`,
    };
  }

  const key = ft as keyof typeof COLORS;
  const color = COLORS[key] ?? COLORS.normal;
  return {
    background: color,
    borderColor: color,
    textColor: textOn(color),
    label: LABELS[ft] ?? 'Monstre',
  };
}

function textOn(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1208' : '#f5e6c5';
}

export function getSpellTrapIcon(race: string, type: string): SpellTrapIcon {
  const t = (type || '').toLowerCase();
  const r = (race || '').toLowerCase();

  const isSpell = t.includes('spell') || t.includes('magie');
  const isTrap = t.includes('trap') || t.includes('piège') || t.includes('piege');
  if (!isSpell && !isTrap) return 'none';

  if (r.startsWith('normal')) return 'none';
  if (r.startsWith('continu')) return 'infinity';

  if (isSpell) {
    if (r.startsWith('ritu')) return 'fire';
    if (r.startsWith('field') || r.startsWith('terr')) return 'compass';
    if (r.startsWith('equip') || r.startsWith('équip')) return 'cross';
    if (r.startsWith('quick') || r.startsWith('jeu')) return 'lightning';
  }

  if (isTrap) {
    if (r.startsWith('counter') || r.startsWith('contre')) return 'arrow';
  }

  return 'none';
}

export function isSpellOrTrap(type: string): boolean {
  const t = (type || '').toLowerCase();
  return (
    t.includes('spell') ||
    t.includes('magie') ||
    t.includes('trap') ||
    t.includes('piège') ||
    t.includes('piege')
  );
}

export function isPendulum(frameType: string): boolean {
  return (frameType || '').toLowerCase().endsWith('_pendulum');
}
