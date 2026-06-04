import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { Daum } from '../../models/yu-gi-result';
import { Deck, DeckSectionId } from '../../models/deck';
import { CardIcon } from '../card-icon/card-icon';
import { HoloCard } from '../../directives/holo-card';
import {
  getFrameStyle,
  getSpellTrapIcon,
  isSpellOrTrap,
} from '../../utils/card-style';
import { Language, translateRace } from '../../utils/filter-translations';
import { defaultSectionFor } from '../../utils/deck-rules';
import { canAddCard } from '../../utils/deck-validation';
import { BanlistService, BanStatus } from '../../services/banlist-service';

@Component({
  selector: 'app-card-grid',
  imports: [CardIcon, HoloCard],
  templateUrl: './card-grid.html',
  styleUrl: './card-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardGrid {
  cards = input.required<Daum[]>();
  language = input<Language>('fr');
  loading = input<boolean>(false);
  selectedId = input<number | null>(null);
  quickControls = input<boolean>(false);
  deck = input<Deck | null>(null);
  targetSection = input<DeckSectionId | null>(null);
  cardClick = output<Daum>();
  quickAdd = output<Daum>();
  quickRemove = output<Daum>();
  quickMax = output<Daum>();

  private readonly _banlist = inject(BanlistService);

  protected frameStyle(card: Daum) { return getFrameStyle(card.frameType); }
  protected cardIcon(card: Daum) { return getSpellTrapIcon(card.race, card.type); }
  protected isSpellTrap(card: Daum) { return isSpellOrTrap(card.type); }
  protected raceLabel(card: Daum) { return translateRace(card.race, this.language()); }

  protected banStatus(card: Daum): BanStatus | undefined {
    return this._banlist.get(card.id);
  }

  protected banLabel(status: BanStatus): string {
    return status === 'Banned' ? 'INTERDITE'
      : status === 'Limited' ? 'LIMITÉE'
      : 'SEMI';
  }

  protected banClass(status: BanStatus): string {
    return status === 'Banned' ? 'card-grid__ban card-grid__ban--banned'
      : status === 'Limited' ? 'card-grid__ban card-grid__ban--limited'
      : 'card-grid__ban card-grid__ban--semi';
  }

  protected isRare(card: Daum): boolean {
    const ft = (card.frameType || '').toLowerCase();
    return ft.startsWith('xyz') || ft.startsWith('synchro')
        || ft.includes('pendulum') || ft.startsWith('link');
  }

  protected onSelect(card: Daum) {
    this.cardClick.emit(card);
  }

  protected countOf(card: Daum): number {
    const d = this.deck();
    if (!d) return 0;
    const sum = (list: { cardId: number; count: number }[]) =>
      list.reduce((s, c) => (c.cardId === card.id ? s + c.count : s), 0);
    return sum(d.main) + sum(d.extra) + sum(d.side);
  }

  protected maxCopies(card: Daum): number {
    return this._banlist.maxCopies(card.id);
  }

  protected canAddOne(card: Daum): boolean {
    const d = this.deck();
    if (!d) return false;
    const section = this.targetSection() ?? defaultSectionFor(card);
    return canAddCard(d, section, card, this._banlist).allowed;
  }

  protected onQuickAdd(card: Daum, ev: Event): void {
    ev.stopPropagation();
    this.quickAdd.emit(card);
  }

  protected onQuickRemove(card: Daum, ev: Event): void {
    ev.stopPropagation();
    this.quickRemove.emit(card);
  }

  protected onQuickMax(card: Daum, ev: Event): void {
    ev.stopPropagation();
    this.quickMax.emit(card);
  }
}
