import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CardQuery, YuGiService } from '../../services/yu-gi-service';
import { Daum, YuGiResult } from '../../models/yu-gi-result';
import { DraftService } from '../../services/draft-service';
import { ToastService } from '../../services/toast-service';
import { BanlistService } from '../../services/banlist-service';
import { DeckSectionId } from '../../models/deck';
import { AppHeader } from '../../components/app-header/app-header';
import { YuGiFilters } from '../../components/yu-gi-filters/yu-gi-filters';
import { CardGrid } from '../../components/card-grid/card-grid';
import { DeckPanel } from '../../components/deck-panel/deck-panel';
import { YuGiCardDetail } from '../../components/yu-gi-card-detail/yu-gi-card-detail';
import { defaultSectionFor } from '../../utils/deck-rules';
import { Language } from '../../utils/filter-translations';

@Component({
  selector: 'app-deck-builder',
  imports: [AppHeader, YuGiFilters, CardGrid, DeckPanel, YuGiCardDetail],
  templateUrl: './deck-builder.html',
  styleUrl: './deck-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckBuilder {
  private readonly _yuGiService = inject(YuGiService);
  private readonly _draftService = inject(DraftService);
  private readonly _toast = inject(ToastService);
  private readonly _banlist = inject(BanlistService);
  private readonly _router = inject(Router);

  readonly draft = this._draftService.draft;

  yugiResult: WritableSignal<YuGiResult | undefined> = signal(undefined);
  selectedCard: WritableSignal<Daum | null> = signal(null);
  filters: WritableSignal<CardQuery> = signal({});
  language: WritableSignal<Language> = signal('fr');
  loading: WritableSignal<boolean> = signal(false);
  activeSection: WritableSignal<DeckSectionId | null> = signal(null);

  currentPage = 0;

  constructor() {
    this.getCards(0);
  }

  previous() {
    if (this.currentPage === 0) return;
    this.getCards(--this.currentPage);
  }

  next() {
    const total = this.yugiResult()?.meta.total_pages ?? 0;
    if (this.currentPage + 1 >= total) return;
    this.getCards(++this.currentPage);
  }

  getCards(page: number) {
    this.loading.set(true);
    this._yuGiService.getCards(page, this.filters(), this.language()).subscribe({
      next: (r) => { this.yugiResult.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onApplyFilters(q: CardQuery) {
    this.filters.set(q);
    this.currentPage = 0;
    this.getCards(0);
  }

  onLanguageChange(l: Language) {
    this.language.set(l);
    this.selectedCard.set(null);
    this.currentPage = 0;
    this.getCards(0);
  }

  select(card: Daum) { this.selectedCard.set(card); }
  closeDetail() { this.selectedCard.set(null); }

  onNameChange(name: string) {
    this._draftService.setName(name);
  }

  onAddToDeck(section: DeckSectionId) {
    const card = this.selectedCard();
    if (!card) return;
    this._draftService.addCard(section, card);
  }

  onRemoveFromDeck(payload: { section: DeckSectionId; cardId: number }) {
    this._draftService.removeCard(payload.section, payload.cardId);
  }

  onSave() {
    const r = this._draftService.save();
    if (r.ok) {
      this._toast.show('Deck enregistré ✓', 'success');
      this._router.navigate(['/decks', r.id]);
      return;
    }
    if (r.reason === 'no-name') this._toast.show('Donne un nom au deck d’abord.', 'error');
    else if (r.reason === 'invalid') this._toast.show('Le deck n’est pas valide.', 'error');
    else this._toast.show('Tu dois être connecté.', 'error');
  }

  onNew() {
    if (this._draftService.isDirty()) {
      if (!window.confirm('Perdre le brouillon en cours ?')) return;
    }
    this._draftService.reset();
    this._toast.show('Nouveau brouillon.', 'info');
  }

  onQuickAdd(card: Daum) {
    this._draftService.addCard(this.targetFor(card), card);
  }

  onQuickRemove(card: Daum) {
    const d = this.draft();
    const preferred = this.targetFor(card);
    const sections: DeckSectionId[] = [preferred, 'main', 'extra', 'side'];
    for (const s of sections) {
      if (d[s].some((c) => c.cardId === card.id)) {
        this._draftService.removeCard(s, card.id);
        return;
      }
    }
  }

  onQuickMax(card: Daum) {
    const section = this.targetFor(card);
    const max = this._banlist.maxCopies(card.id);
    const countOf = () => {
      const d = this.draft();
      const sum = (list: { cardId: number; count: number }[]) =>
        list.reduce((s, c) => (c.cardId === card.id ? s + c.count : s), 0);
      return sum(d.main) + sum(d.extra) + sum(d.side);
    };
    while (countOf() < max) this._draftService.addCard(section, card);
  }

  onSectionSelect(section: DeckSectionId) {
    this.activeSection.update((cur) => (cur === section ? null : section));
  }

  private targetFor(card: Daum): DeckSectionId {
    return this.activeSection() ?? defaultSectionFor(card);
  }
}
