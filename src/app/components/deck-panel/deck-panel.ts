import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeckSectionId } from '../../models/deck';
import { DeckSection } from '../deck-section/deck-section';
import { BanlistService } from '../../services/banlist-service';
import { Draft } from '../../services/draft-service';
import { validateDeck } from '../../utils/deck-validation';

@Component({
  selector: 'app-deck-panel',
  imports: [FormsModule, DeckSection],
  templateUrl: './deck-panel.html',
  styleUrl: './deck-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckPanel {
  draft = input.required<Draft>();
  activeSection = input<DeckSectionId | null>(null);
  nameChange = output<string>();
  saveRequest = output<void>();
  newRequest = output<void>();
  sectionSelect = output<DeckSectionId>();
  removeCard = output<{ section: DeckSectionId; cardId: number }>();

  private readonly _banlist = inject(BanlistService);

  protected readonly saveLabel = computed(() =>
    this.draft().linkedDeckId ? 'Mettre à jour' : 'Enregistrer',
  );

  protected readonly issues = computed(() => {
    const d = this.draft();
    const pseudo = {
      id: d.linkedDeckId ?? 'draft',
      ownerId: 'me',
      name: d.name,
      main: d.main, extra: d.extra, side: d.side,
      createdAt: 0, updatedAt: 0,
    };
    return validateDeck(pseudo, this._banlist);
  });

  protected readonly canSave = computed(() => {
    if (!this.draft().name.trim()) return false;
    return !this.issues().some((i) => i.severity === 'error');
  });

  protected onNameInput(value: string): void {
    this.nameChange.emit(value);
  }

  protected onRemove(section: DeckSectionId, cardId: number): void {
    this.removeCard.emit({ section, cardId });
  }
}
