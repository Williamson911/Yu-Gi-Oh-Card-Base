import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';
import { Daum, YuGiResult } from '../models/yu-gi-result';
import { Category, Language } from '../utils/filter-translations';

export interface CardQuery {
  fname?: string;
  category?: Category;
  subType?: string;
  race?: string;
  attribute?: string;
  levelMin?: number | null;
  levelMax?: number | null;
  atkMin?: number | null;
  atkMax?: number | null;
  defMin?: number | null;
  defMax?: number | null;
  sort?: string;
}

const EMPTY_RESULT: YuGiResult = {
  data: [],
  meta: {
    generated: '',
    current_rows: 0,
    total_rows: 0,
    rows_remaining: 0,
    total_pages: 0,
    pages_remaining: 0,
    next_page: '',
    next_page_offset: 0,
  },
};

@Injectable({
  providedIn: 'root',
})
export class YuGiService {
  private apiUrl = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
  private readonly _http: HttpClient = inject(HttpClient);

  static readonly PAGE_SIZE = 12;

  getCards(
    pageNumber: number,
    query: CardQuery = {},
    language: Language = 'fr',
  ): Observable<YuGiResult> {
    const limit = YuGiService.PAGE_SIZE;
    const offset = pageNumber * limit;

    let params = new HttpParams().set('num', limit).set('offset', offset);
    if (language === 'fr') {
      params = params.set('language', 'fr');
    }

    if (query.fname?.trim()) {
      params = params.set('fname', query.fname.trim());
    }

    const typeParam = this.buildTypeParam(query);
    if (typeParam) params = params.set('type', typeParam);

    if (query.category === 'monster' && query.race) {
      params = params.set('race', query.race);
    }
    if ((query.category === 'spell' || query.category === 'trap') && query.subType) {
      params = params.set('race', query.subType);
    }

    if (query.category === 'monster' && query.attribute) {
      params = params.set('attribute', query.attribute);
    }

    const level = rangeParam(query.levelMin, query.levelMax);
    if (level) params = params.set('level', level);

    const atk = rangeParam(query.atkMin, query.atkMax);
    if (atk) params = params.set('atk', atk);

    const def = rangeParam(query.defMin, query.defMax);
    if (def) params = params.set('def', def);

    if (query.sort) params = params.set('sort', query.sort);

    return this._http.get<YuGiResult>(this.apiUrl, { params }).pipe(
      map((res) =>
        query.sort ? res : { ...res, data: [...res.data].sort(compareBySet) },
      ),
      catchError(() => of(EMPTY_RESULT)),
    );
  }

  private buildTypeParam(query: CardQuery): string {
    if (query.category === 'spell') return 'Spell Card';
    if (query.category === 'trap') return 'Trap Card';
    if (query.category === 'monster' && query.subType) return query.subType;
    return '';
  }
}

function rangeParam(min?: number | null, max?: number | null): string {
  const hasMin = min != null && !Number.isNaN(min);
  const hasMax = max != null && !Number.isNaN(max);
  if (hasMin && hasMax) return `gte${min},lte${max}`;
  if (hasMin) return `gte${min}`;
  if (hasMax) return `lte${max}`;
  return '';
}

function parseSetCode(code: string): { prefix: string; num: number } {
  const match = code.match(/^([A-Z0-9]+)-(?:[A-Z]+)?(\d+)/i);
  if (!match) return { prefix: code, num: Number.MAX_SAFE_INTEGER };
  return { prefix: match[1].toUpperCase(), num: parseInt(match[2], 10) };
}

function compareBySet(a: Daum, b: Daum): number {
  const ca = a.card_sets?.[0]?.set_code ?? '';
  const cb = b.card_sets?.[0]?.set_code ?? '';
  if (!ca && !cb) return 0;
  if (!ca) return 1;
  if (!cb) return -1;
  const pa = parseSetCode(ca);
  const pb = parseSetCode(cb);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  return pa.num - pb.num;
}
