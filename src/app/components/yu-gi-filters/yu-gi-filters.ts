import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SetService } from '../../services/set-service';
import { CardQuery } from '../../services/yu-gi-service';
import {
  Category,
  CATEGORIES,
  Language,
  LEVELS,
  MONSTER_ATTRIBUTES,
  MONSTER_RACES,
  MONSTER_SUBTYPES,
  SORT_OPTIONS,
  SPELL_SUBTYPES,
  TRAP_SUBTYPES,
} from '../../utils/filter-translations';

const EMPTY_QUERY: CardQuery = {
  fname: '',
  category: '',
  subType: '',
  race: '',
  attribute: '',
  levelMin: null,
  levelMax: null,
  atkMin: null,
  atkMax: null,
  defMin: null,
  defMax: null,
  sort: '',
  sets: [],
};

@Component({
  selector: 'app-yu-gi-filters',
  imports: [FormsModule],
  templateUrl: './yu-gi-filters.html',
  styleUrl: './yu-gi-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YuGiFilters {
  applied = input<CardQuery>(EMPTY_QUERY);
  language = input<Language>('fr');
  apply = output<CardQuery>();
  languageChange = output<Language>();

  private readonly _setService = inject(SetService);
  protected readonly sets = this._setService.sets;
  protected readonly setSearch = signal('');
  protected readonly filteredSets = computed(() => {
    const term = this.setSearch().trim().toLowerCase();
    const all = this.sets();
    if (!term) return all;
    return all.filter((s) =>
      s.set_name.toLowerCase().includes(term) ||
      s.set_code.toLowerCase().includes(term),
    );
  });

  protected readonly categories = CATEGORIES;
  protected readonly monsterSubtypes = MONSTER_SUBTYPES;
  protected readonly spellSubtypes = SPELL_SUBTYPES;
  protected readonly trapSubtypes = TRAP_SUBTYPES;
  protected readonly monsterRaces = MONSTER_RACES;
  protected readonly monsterAttributes = MONSTER_ATTRIBUTES;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly levels = LEVELS;

  protected readonly panelOpen = signal(false);

  protected readonly draft = signal<CardQuery>({ ...EMPTY_QUERY });

  protected readonly category = computed(() => this.draft().category ?? '');

  protected readonly subtypeOptions = computed(() => {
    switch (this.category()) {
      case 'monster': return this.monsterSubtypes;
      case 'spell':   return this.spellSubtypes;
      case 'trap':    return this.trapSubtypes;
      default:        return [];
    }
  });

  protected readonly activeFilterCount = computed(() => {
    const q = this.applied();
    let n = 0;
    if (q.category) n++;
    if (q.subType) n++;
    if (q.race) n++;
    if (q.attribute) n++;
    if (q.levelMin != null || q.levelMax != null) n++;
    if (q.atkMin != null || q.atkMax != null) n++;
    if (q.defMin != null || q.defMax != null) n++;
    if (q.sort) n++;
    if (q.sets && q.sets.length > 0) n++;
    return n;
  });

  protected togglePanel() {
    this.panelOpen.update((v) => !v);
  }

  protected onCategoryChange(value: string) {
    this.draft.update((q) => ({
      ...q,
      category: value as Category,
      subType: '',
      race: value === 'monster' ? q.race : '',
      attribute: value === 'monster' ? q.attribute : '',
      levelMin: value === 'monster' ? q.levelMin : null,
      levelMax: value === 'monster' ? q.levelMax : null,
      atkMin: value === 'monster' ? q.atkMin : null,
      atkMax: value === 'monster' ? q.atkMax : null,
      defMin: value === 'monster' ? q.defMin : null,
      defMax: value === 'monster' ? q.defMax : null,
    }));
  }

  protected updateField<K extends keyof CardQuery>(key: K, value: CardQuery[K]) {
    this.draft.update((q) => ({ ...q, [key]: value }));
  }

  protected isSetSelected(setName: string): boolean {
    return (this.draft().sets ?? []).includes(setName);
  }

  protected toggleSet(setName: string, checked: boolean): void {
    this.draft.update((q) => {
      const current = q.sets ?? [];
      const next = checked
        ? [...current.filter((s) => s !== setName), setName]
        : current.filter((s) => s !== setName);
      return { ...q, sets: next };
    });
  }

  protected clearSets(): void {
    this.draft.update((q) => ({ ...q, sets: [] }));
  }

  protected updateNumber(key: keyof CardQuery, raw: string) {
    const v = raw === '' ? null : Number(raw);
    this.draft.update((q) => ({ ...q, [key]: Number.isNaN(v as number) ? null : v }));
  }

  protected onSearchInput(value: string) {
    this.draft.update((q) => ({ ...q, fname: value }));
  }

  protected onSearchEnter() {
    this.applyFilters();
  }

  protected onSortChange(value: string) {
    this.draft.update((q) => ({ ...q, sort: value }));
    this.apply.emit({ ...this.applied(), sort: value });
  }

  protected applyFilters() {
    this.apply.emit({ ...this.draft() });
    this.panelOpen.set(false);
  }

  protected resetFilters() {
    this.draft.set({ ...EMPTY_QUERY });
    this.apply.emit({ ...EMPTY_QUERY });
  }

  protected setLanguage(lang: Language) {
    if (this.language() === lang) return;
    this.languageChange.emit(lang);
  }
}
