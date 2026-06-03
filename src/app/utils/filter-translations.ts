export type Category = 'monster' | 'spell' | 'trap' | '';
export type Language = 'fr' | 'en';

export interface SelectOption {
  value: string;
  label: string;
}

function toFrMap(options: SelectOption[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const o of options) {
    if (o.value) m[o.value] = o.label;
  }
  return m;
}

export const CATEGORIES: SelectOption[] = [
  { value: '', label: 'Toutes catégories' },
  { value: 'monster', label: 'Monstre' },
  { value: 'spell', label: 'Magie' },
  { value: 'trap', label: 'Piège' },
];

export const MONSTER_SUBTYPES: SelectOption[] = [
  { value: '', label: 'Tous types de Monstre' },
  { value: 'Normal Monster', label: 'Normal' },
  { value: 'Effect Monster', label: 'À Effet' },
  { value: 'Fusion Monster', label: 'Fusion' },
  { value: 'Ritual Monster', label: 'Rituel' },
  { value: 'Synchro Monster', label: 'Synchro' },
  { value: 'XYZ Monster', label: 'XYZ' },
  { value: 'Pendulum Effect Monster', label: 'Pendule' },
  { value: 'Link Monster', label: 'Lien' },
];

export const SPELL_SUBTYPES: SelectOption[] = [
  { value: '', label: 'Toutes Magies' },
  { value: 'Normal', label: 'Normale' },
  { value: 'Continuous', label: 'Continue' },
  { value: 'Ritual', label: 'Rituelle' },
  { value: 'Field', label: 'Terrain' },
  { value: 'Equip', label: 'Équipement' },
  { value: 'Quick-Play', label: 'Jeu-Rapide' },
];

export const TRAP_SUBTYPES: SelectOption[] = [
  { value: '', label: 'Tous Pièges' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Continu' },
  { value: 'Counter', label: 'Contre-piège' },
];

export const MONSTER_RACES: SelectOption[] = [
  { value: '', label: 'Tous les types' },
  { value: 'Aqua', label: 'Aqua' },
  { value: 'Beast', label: 'Bête' },
  { value: 'Winged Beast', label: 'Bête ailée' },
  { value: 'Beast-Warrior', label: 'Bête-Guerrier' },
  { value: 'Divine-Beast', label: 'Bête-Divine' },
  { value: 'Cyberse', label: 'Cyberse' },
  { value: 'Fiend', label: 'Démon' },
  { value: 'Dinosaur', label: 'Dinosaure' },
  { value: 'Dragon', label: 'Dragon' },
  { value: 'Fairy', label: 'Elfe' },
  { value: 'Warrior', label: 'Guerrier' },
  { value: 'Illusion', label: 'Illusion' },
  { value: 'Insect', label: 'Insecte' },
  { value: 'Machine', label: 'Machine' },
  { value: 'Spellcaster', label: 'Magicien' },
  { value: 'Plant', label: 'Plante' },
  { value: 'Fish', label: 'Poisson' },
  { value: 'Psychic', label: 'Psychique' },
  { value: 'Pyro', label: 'Pyro' },
  { value: 'Reptile', label: 'Reptile' },
  { value: 'Rock', label: 'Rocher' },
  { value: 'Sea Serpent', label: 'Serpent de mer' },
  { value: 'Thunder', label: 'Tonnerre' },
  { value: 'Wyrm', label: 'Wyrm' },
  { value: 'Zombie', label: 'Zombie' },
];

export const MONSTER_ATTRIBUTES: SelectOption[] = [
  { value: '', label: 'Tous les attributs' },
  { value: 'DARK', label: 'TÉNÈBRES' },
  { value: 'LIGHT', label: 'LUMIÈRE' },
  { value: 'FIRE', label: 'FEU' },
  { value: 'WATER', label: 'EAU' },
  { value: 'EARTH', label: 'TERRE' },
  { value: 'WIND', label: 'VENT' },
  { value: 'DIVINE', label: 'DIVIN' },
];

export const SORT_OPTIONS: SelectOption[] = [
  { value: '', label: 'Set & numéro' },
  { value: 'name', label: 'Nom (A→Z)' },
  { value: 'atk', label: 'ATK' },
  { value: 'def', label: 'DEF' },
  { value: 'level', label: 'Niveau' },
  { value: 'new', label: 'Nouveauté' },
];

export const LEVELS: SelectOption[] = [
  { value: '', label: '—' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  })),
];

const RACE_FR = toFrMap(MONSTER_RACES);
const ATTRIBUTE_FR = toFrMap(MONSTER_ATTRIBUTES);
const SPELL_SUBTYPE_FR = toFrMap(SPELL_SUBTYPES);
const TRAP_SUBTYPE_FR = toFrMap(TRAP_SUBTYPES);

export function translateRace(en: string, lang: Language): string {
  if (lang !== 'fr' || !en) return en;
  return RACE_FR[en] ?? en;
}

export function translateAttribute(en: string, lang: Language): string {
  if (lang !== 'fr' || !en) return en;
  return ATTRIBUTE_FR[en] ?? en;
}

export function translateSpellTrapSubtype(en: string, lang: Language): string {
  if (lang !== 'fr' || !en) return en;
  return SPELL_SUBTYPE_FR[en] ?? TRAP_SUBTYPE_FR[en] ?? en;
}
