import { Component, inject, signal, WritableSignal } from '@angular/core';
import { CardQuery, YuGiService } from '../../services/yu-gi-service';
import { Daum, YuGiResult } from '../../models/yu-gi-result';
import { YuGiCardDetail } from '../../components/yu-gi-card-detail/yu-gi-card-detail';
import { CardIcon } from '../../components/card-icon/card-icon';
import { YuGiFilters } from '../../components/yu-gi-filters/yu-gi-filters';
import {
  getFrameStyle,
  getSpellTrapIcon,
  isSpellOrTrap,
} from '../../utils/card-style';
import { Language, translateRace } from '../../utils/filter-translations';
import { HoloCard } from '../../directives/holo-card';

@Component({
  selector: 'app-yu-gi-index',
  imports: [YuGiCardDetail, CardIcon, YuGiFilters, HoloCard],
  templateUrl: './yu-gi-index.html',
  styleUrl: './yu-gi-index.scss',
})
export class YuGiIndex {
  private readonly _yuGiService: YuGiService = inject(YuGiService);

  yugiResult: WritableSignal<YuGiResult | undefined> = signal(undefined);
  selectedCard: WritableSignal<Daum | null> = signal(null);
  filters: WritableSignal<CardQuery> = signal({});
  language: WritableSignal<Language> = signal('fr');
  loading: WritableSignal<boolean> = signal(false);

  currentPage: number = 0;

  constructor() {
    this.getCards(this.currentPage);
  }

  previous() {
    if (this.currentPage === 0) {
      return;
    }
    this.getCards(--this.currentPage);
  }

  next() {
    if (!this.yugiResult) return;
    const total = this.yugiResult()?.meta.total_pages ?? 0;
    if (this.currentPage + 1 >= total) return;
    this.getCards(++this.currentPage);
  }

  getCards(page: number) {
    this.loading.set(true);
    this._yuGiService.getCards(page, this.filters(), this.language()).subscribe({
      next: (result) => {
        this.yugiResult.set(result);
        this.loading.set(false);
      },
      error: (err) => {
        console.log('Error fetching Yu-Gi cards:', err);
        this.loading.set(false);
      },
    });
  }

  onApplyFilters(query: CardQuery) {
    this.filters.set(query);
    this.currentPage = 0;
    this.getCards(0);
  }

  onLanguageChange(lang: Language) {
    this.language.set(lang);
    this.selectedCard.set(null);
    this.currentPage = 0;
    this.getCards(0);
  }

  select(card: Daum) {
    this.selectedCard.set(card);
  }

  closeDetail() {
    this.selectedCard.set(null);
  }

  frameStyle(card: Daum) {
    return getFrameStyle(card.frameType);
  }

  cardIcon(card: Daum) {
    return getSpellTrapIcon(card.race, card.type);
  }

  isSpellTrap(card: Daum) {
    return isSpellOrTrap(card.type);
  }

  raceLabel(card: Daum) {
    return translateRace(card.race, this.language());
  }

  isRare(card: Daum): boolean {
    const ft = (card.frameType || '').toLowerCase();
    return (
      ft.startsWith('xyz') ||
      ft.startsWith('synchro') ||
      ft.includes('pendulum') ||
      ft.startsWith('link')
    );
  }
}
