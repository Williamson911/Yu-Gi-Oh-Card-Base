import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DeckCard, DeckSectionId } from '../../models/deck';

@Component({
  selector: 'app-deck-section',
  templateUrl: './deck-section.html',
  styleUrl: './deck-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckSection {
  section = input.required<DeckSectionId>();
  title = input.required<string>();
  cards = input.required<DeckCard[]>();
  min = input<number | null>(null);
  max = input.required<number>();
  selectable = input<boolean>(false);
  active = input<boolean>(false);
  mode = input<'edit' | 'preview'>('edit');
  removeCard = output<number>();
  headerClick = output<void>();
  cardSelect = output<number>();

  protected readonly size = computed(() =>
    this.cards().reduce((s, c) => s + c.count, 0),
  );

  protected readonly outOfRange = computed(() => {
    const n = this.size();
    const lo = this.min();
    return (lo !== null && n < lo) || n > this.max();
  });

  protected readonly counterLabel = computed(() => {
    const n = this.size();
    const lo = this.min();
    return lo !== null ? `${n}/${lo}-${this.max()}` : `${n}/${this.max()}`;
  });

  protected expanded(card: DeckCard): number[] {
    return Array.from({ length: card.count }, (_, i) => i);
  }

  protected onRemove(cardId: number) {
    this.removeCard.emit(cardId);
  }

  protected onSelect(cardId: number) {
    this.cardSelect.emit(cardId);
  }

  protected onHeaderClick() {
    if (this.selectable()) this.headerClick.emit();
  }
}
