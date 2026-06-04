import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeckStore } from '../../services/deck-store';
import { DraftService } from '../../services/draft-service';
import { AppHeader } from '../../components/app-header/app-header';
import { Deck } from '../../models/deck';
// DraftService kept for the "+ Nouveau deck" reset-then-go flow.

@Component({
  selector: 'app-deck-list',
  imports: [AppHeader],
  templateUrl: './deck-list.html',
  styleUrl: './deck-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckList {
  private readonly _store = inject(DeckStore);
  private readonly _draft = inject(DraftService);
  private readonly _router = inject(Router);

  protected readonly decks = this._store.myDecks;
  protected readonly count = computed(() => this.decks().length);

  protected sizeOf(deck: Deck): number {
    return deck.main.reduce((s, c) => s + c.count, 0)
         + deck.extra.reduce((s, c) => s + c.count, 0)
         + deck.side.reduce((s, c) => s + c.count, 0);
  }

  protected previewThumbs(deck: Deck): string[] {
    return deck.main.slice(0, 3).map((c) => c.snapshot.image_url_small).filter(Boolean);
  }

  protected formatDate(ts: number): string {
    const diff = Date.now() - ts;
    const day = 86400000;
    if (diff < day) return 'aujourd\'hui';
    if (diff < 2 * day) return 'hier';
    if (diff < 30 * day) return `il y a ${Math.floor(diff / day)} jours`;
    return new Date(ts).toLocaleDateString('fr-FR');
  }

  protected create(): void {
    this._draft.reset();
    this._router.navigate(['/deck-builder']);
  }

  protected rename(deck: Deck, event: Event): void {
    event.stopPropagation();
    const name = window.prompt('Nouveau nom :', deck.name);
    if (name === null || name.trim() === '') return;
    this._store.rename(deck.id, name);
  }

  protected remove(deck: Deck, event: Event): void {
    event.stopPropagation();
    if (!window.confirm(`Supprimer "${deck.name}" ?`)) return;
    this._store.remove(deck.id);
  }

  protected open(deck: Deck): void {
    this._router.navigate(['/decks', deck.id]);
  }
}
