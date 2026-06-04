import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DeckStore } from '../../services/deck-store';
import { DraftService } from '../../services/draft-service';
import { ToastService } from '../../services/toast-service';
import { BanlistService } from '../../services/banlist-service';
import { YuGiService } from '../../services/yu-gi-service';
import { AppHeader } from '../../components/app-header/app-header';
import { DeckSection } from '../../components/deck-section/deck-section';
import { YuGiCardDetail } from '../../components/yu-gi-card-detail/yu-gi-card-detail';
import { Deck, DeckCard } from '../../models/deck';
import { Daum } from '../../models/yu-gi-result';
import { validateDeck } from '../../utils/deck-validation';
import { exportDeckPdf, openDeckPrintWindow } from '../../utils/deck-pdf';

@Component({
  selector: 'app-deck-detail',
  imports: [AppHeader, DeckSection, YuGiCardDetail],
  templateUrl: './deck-detail.html',
  styleUrl: './deck-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckDetail {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _store = inject(DeckStore);
  private readonly _draft = inject(DraftService);
  private readonly _toast = inject(ToastService);
  private readonly _banlist = inject(BanlistService);
  private readonly _yuGiService = inject(YuGiService);

  private readonly _params = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });

  readonly deckId = computed(() => this._params().get('id') ?? '');
  readonly deck = computed(() => this._store.get(this.deckId()));

  readonly totalCards = computed(() => {
    const d = this.deck();
    if (!d) return 0;
    return this.sumOf(d.main) + this.sumOf(d.extra) + this.sumOf(d.side);
  });

  readonly issues = computed(() => {
    const d = this.deck();
    return d ? validateDeck(d, this._banlist) : [];
  });

  readonly isValid = computed(() =>
    !this.issues().some((i) => i.severity === 'error'),
  );

  readonly selectedCard = signal<Daum | null>(null);
  readonly loadingCard = signal<boolean>(false);

  constructor() {
    effect(() => {
      if (this.deckId() && !this.deck()) {
        this._router.navigate(['/decks']);
      }
    });
  }

  sumOf(cards: DeckCard[]): number {
    return cards.reduce((s, c) => s + c.count, 0);
  }

  onCardSelect(cardId: number): void {
    this.loadingCard.set(true);
    this._yuGiService.getCardById(cardId).subscribe({
      next: (card) => {
        this.loadingCard.set(false);
        if (card) this.selectedCard.set(card);
        else this._toast.show('Impossible de charger la carte.', 'error');
      },
      error: () => {
        this.loadingCard.set(false);
        this._toast.show('Impossible de charger la carte.', 'error');
      },
    });
  }

  closeDetail(): void {
    this.selectedCard.set(null);
  }

  edit(): void {
    const d = this.deck();
    if (!d) return;
    this._draft.load(d);
    this._router.navigate(['/deck-builder']);
  }

  remove(): void {
    const d = this.deck();
    if (!d) return;
    if (!window.confirm(`Supprimer "${d.name}" ?`)) return;
    this._store.remove(d.id);
    this._toast.show('Deck supprimé.', 'info');
    this._router.navigate(['/decks']);
  }

  duplicate(): void {
    const d = this.deck();
    if (!d) return;
    const copy = this._store.duplicate(d.id);
    if (!copy) {
      this._toast.show('Impossible de dupliquer.', 'error');
      return;
    }
    this._toast.show(`Dupliqué : ${copy.name}`, 'success');
    this._router.navigate(['/decks', copy.id]);
  }

  async exportPdf(): Promise<void> {
    const d = this.deck();
    if (!d) return;
    this._toast.show('Génération du PDF…', 'info');
    const ok = await exportDeckPdf(d);
    if (ok) {
      this._toast.show('PDF généré ✓', 'success');
      return;
    }
    // Fallback to print window if jsPDF CDN failed (offline, blocked, etc.)
    const printed = openDeckPrintWindow(d);
    if (!printed) {
      this._toast.show('Export PDF impossible — autorise les popups.', 'error');
    }
  }
}
