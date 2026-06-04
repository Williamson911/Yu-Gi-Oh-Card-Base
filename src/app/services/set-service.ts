import { inject, Injectable, signal, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

export interface CardSetInfo {
  set_name: string;
  set_code: string;
  num_of_cards: number;
  tcg_date?: string;
}

@Injectable({ providedIn: 'root' })
export class SetService {
  private readonly _http = inject(HttpClient);
  private readonly _sets = signal<CardSetInfo[]>([]);

  readonly sets: Signal<CardSetInfo[]> = this._sets.asReadonly();

  constructor() {
    this.load();
  }

  private load(): void {
    this._http
      .get<CardSetInfo[]>('https://db.ygoprodeck.com/api/v7/cardsets.php')
      .pipe(catchError(() => of<CardSetInfo[]>([])))
      .subscribe((data) => {
        const sorted = [...data].sort((a, b) => {
          const da = a.tcg_date ?? '0000-00-00';
          const db = b.tcg_date ?? '0000-00-00';
          return db.localeCompare(da);
        });
        this._sets.set(sorted);
      });
  }
}
