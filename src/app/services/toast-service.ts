import { Injectable, signal, Signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  level: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _current = signal<Toast | null>(null);
  private _timer: ReturnType<typeof setTimeout> | null = null;

  readonly current: Signal<Toast | null> = this._current.asReadonly();

  show(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
    if (this._timer) clearTimeout(this._timer);
    this._current.set({ id: crypto.randomUUID(), message, level });
    this._timer = setTimeout(() => this._current.set(null), 3000);
  }
}
