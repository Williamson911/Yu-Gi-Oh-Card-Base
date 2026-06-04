import { inject, Injectable, signal, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited';

interface BanlistResponse {
  data: Array<{
    id: number;
    banlist_info?: { ban_tcg?: BanStatus };
  }>;
}

@Injectable({ providedIn: 'root' })
export class BanlistService {
  private readonly _http = inject(HttpClient);
  private readonly _status = signal<Map<number, BanStatus>>(new Map());

  readonly status: Signal<Map<number, BanStatus>> = this._status.asReadonly();

  constructor() {
    this.load();
  }

  get(cardId: number): BanStatus | undefined {
    return this._status().get(cardId);
  }

  maxCopies(cardId: number): 0 | 1 | 2 | 3 {
    const s = this._status().get(cardId);
    if (s === 'Banned') return 0;
    if (s === 'Limited') return 1;
    if (s === 'Semi-Limited') return 2;
    return 3;
  }

  private load(): void {
    try {
      this._http
        .get<BanlistResponse>(
          'https://db.ygoprodeck.com/api/v7/cardinfo.php?banlist=tcg',
        )
        .pipe(catchError(() => of<BanlistResponse>({ data: [] })))
        .subscribe((res) => {
          const map = new Map<number, BanStatus>();
          for (const c of res.data ?? []) {
            const s = c.banlist_info?.ban_tcg;
            if (s) map.set(c.id, s);
          }
          this._status.set(map);
        });
    } catch {
      // leave empty map — maxCopies will return 3 by default
    }
  }
}
