import { isExtraDeckMonster, defaultSectionFor, snapshotOf } from './deck-rules';

const baseCard = (frameType: string) => ({ frameType }) as any;

describe('isExtraDeckMonster', () => {
  it('returns true for fusion frames', () => {
    expect(isExtraDeckMonster(baseCard('fusion'))).toBe(true);
    expect(isExtraDeckMonster(baseCard('fusion_pendulum'))).toBe(true);
  });

  it('returns true for synchro frames', () => {
    expect(isExtraDeckMonster(baseCard('synchro'))).toBe(true);
    expect(isExtraDeckMonster(baseCard('synchro_pendulum'))).toBe(true);
  });

  it('returns true for xyz frames', () => {
    expect(isExtraDeckMonster(baseCard('xyz'))).toBe(true);
    expect(isExtraDeckMonster(baseCard('xyz_pendulum'))).toBe(true);
  });

  it('returns true for link frames', () => {
    expect(isExtraDeckMonster(baseCard('link'))).toBe(true);
  });

  it('returns false for main-deck frames', () => {
    expect(isExtraDeckMonster(baseCard('normal'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('effect'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('ritual'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('spell'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('trap'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('normal_pendulum'))).toBe(false);
    expect(isExtraDeckMonster(baseCard('effect_pendulum'))).toBe(false);
  });

  it('handles missing/empty frameType safely', () => {
    expect(isExtraDeckMonster(baseCard(''))).toBe(false);
    expect(isExtraDeckMonster({} as any)).toBe(false);
  });
});

describe('defaultSectionFor', () => {
  it('returns "extra" for extra-deck frames', () => {
    expect(defaultSectionFor(baseCard('fusion'))).toBe('extra');
    expect(defaultSectionFor(baseCard('synchro'))).toBe('extra');
  });

  it('returns "main" for main-deck frames', () => {
    expect(defaultSectionFor(baseCard('effect'))).toBe('main');
    expect(defaultSectionFor(baseCard('spell'))).toBe('main');
  });
});

describe('snapshotOf', () => {
  it('copies only the fields needed for thumbnail display', () => {
    const card: any = {
      id: 1,
      name: 'Dark Magician',
      frameType: 'normal',
      type: 'Normal Monster',
      race: 'Spellcaster',
      attribute: 'DARK',
      level: 7,
      atk: 2500,
      def: 2100,
      desc: 'long description ignored',
      card_images: [{ image_url_small: 'small.png', image_url: 'big.png' }],
    };
    expect(snapshotOf(card)).toEqual({
      name: 'Dark Magician',
      image_url_small: 'small.png',
      frameType: 'normal',
      type: 'Normal Monster',
      race: 'Spellcaster',
      attribute: 'DARK',
      level: 7,
      atk: 2500,
      def: 2100,
    });
  });

  it('omits undefined monster stats for spells/traps', () => {
    const card: any = {
      name: 'Pot of Greed',
      frameType: 'spell',
      type: 'Spell Card',
      race: 'Normal',
      card_images: [{ image_url_small: 'pot.png' }],
    };
    const snap = snapshotOf(card);
    expect(snap.attribute).toBeUndefined();
    expect(snap.level).toBeUndefined();
    expect(snap.atk).toBeUndefined();
    expect(snap.def).toBeUndefined();
  });
});
