import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  input,
  output,
} from '@angular/core';
import { Daum } from '../../models/yu-gi-result';
import {
  getFrameStyle,
  getSpellTrapIcon,
  isPendulum,
  isSpellOrTrap,
} from '../../utils/card-style';
import { CardIcon } from '../card-icon/card-icon';
import {
  Language,
  translateAttribute,
  translateRace,
  translateSpellTrapSubtype,
} from '../../utils/filter-translations';

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
  close = output<void>();

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
    return c ? !isSpellOrTrap(c.type) : false;
  });

  protected isPendule = computed(() => {
    const c = this.card();
    return c ? isPendulum(c.frameType) : false;
  });

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.card()) this.close.emit();
  }

  protected onClose() {
    this.close.emit();
  }
}
