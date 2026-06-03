import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SpellTrapIcon } from '../../utils/card-style';

@Component({
  selector: 'app-card-icon',
  templateUrl: './card-icon.html',
  styleUrl: './card-icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardIcon {
  icon = input.required<SpellTrapIcon>();
  size = input<number>(20);
  label = input<string>('');
}
