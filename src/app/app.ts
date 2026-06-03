import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('yu-gi-oh');
  protected readonly embers = Array.from({ length: 22 }, (_, i) => i);
  protected readonly hieroglyphs: string[] = [
    '\u{13080}', // Eye of Horus
    '\u{132F9}', // Ankh
    '\u{131A3}', // Scarab
    '\u{13153}', // Owl
    '\u{13000}', // Man with arm
    '\u{132A8}', // Throne (Isis)
    '\u{1339F}', // Basket
    '\u{13153}', // Owl again
    '\u{132F9}', // Ankh again
    '\u{13080}', // Eye of Horus
    '\u{131CB}', // Reed
    '\u{132AA}', // Pyramid-ish
  ];
}
