import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';
import { Daum } from '../../models/yu-gi-result';
import {
  getFrameStyle,
  getSpellTrapIcon,
  isPendulum,
  isSkillCard,
  isSpellOrTrap,
} from '../../utils/card-style';
import { CardIcon } from '../card-icon/card-icon';
import {
  Language,
  translateAttribute,
  translateRace,
  translateSpellTrapSubtype,
} from '../../utils/filter-translations';
import { Deck, DeckSectionId } from '../../models/deck';
import { canAddCard } from '../../utils/deck-validation';
import { defaultSectionFor } from '../../utils/deck-rules';
import { BanlistService } from '../../services/banlist-service';

@Component({
  selector: 'app-yu-gi-card-detail',
  imports: [CardIcon],
  templateUrl: './yu-gi-card-detail.html',
  styleUrl: './yu-gi-card-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YuGiCardDetail {
  card = input<Daum | null>(null);
  language = input<Language>('fr');
  mode = input<'view' | 'deckbuilder'>('view');
  deck = input<Deck | null>(null);
  close = output<void>();
  addToDeck = output<DeckSectionId>();

  private readonly _banlist = inject(BanlistService);

  protected raceLabel = computed(() => {
    const c = this.card();
    return c ? translateRace(c.race, this.language()) : '';
  });

  protected attributeLabel = computed(() => {
    const c = this.card();
    return c ? translateAttribute(c.attribute ?? '', this.language()) : '';
  });

  protected subtypeLabel = computed(() => {
    const c = this.card();
    return c ? translateSpellTrapSubtype(c.race, this.language()) : '';
  });

  protected frame = computed(() => {
    const c = this.card();
    return c ? getFrameStyle(c.frameType) : null;
  });

  protected icon = computed(() => {
    const c = this.card();
    return c ? getSpellTrapIcon(c.race, c.type) : 'none';
  });

  protected isMonster = computed(() => {
    const c = this.card();
    return c ? !isSpellOrTrap(c.type) && !isSkillCard(c.type) : false;
  });

  protected isSkill = computed(() => {
    const c = this.card();
    return c ? isSkillCard(c.type) : false;
  });

  protected isPendule = computed(() => {
    const c = this.card();
    return c ? isPendulum(c.frameType) : false;
  });

  protected mainSection = computed<DeckSectionId>(() => {
    const c = this.card();
    return c ? defaultSectionFor(c) : 'main';
  });

  protected mainButtonLabel = computed(() =>
    this.mainSection() === 'extra' ? '+ Extra Deck' : '+ Main Deck',
  );

  protected mainAddCheck = computed(() => {
    const c = this.card();
    const d = this.deck();
    if (!c || !d) return { allowed: false, reason: '' };
    return canAddCard(d, this.mainSection(), c, this._banlist);
  });

  protected sideAddCheck = computed(() => {
    const c = this.card();
    const d = this.deck();
    if (!c || !d) return { allowed: false, reason: '' };
    return canAddCard(d, 'side', c, this._banlist);
  });

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.card()) this.close.emit();
  }

  protected onClose() {
    this.close.emit();
  }

  protected onAdd(section: DeckSectionId) {
    this.addToDeck.emit(section);
  }
}
