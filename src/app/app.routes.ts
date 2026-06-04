import { Routes } from '@angular/router';
import { authGuard, guestOnlyGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/yu-gi-index/yu-gi-index').then((m) => m.YuGiIndex),
  },
  {
    path: 'login',
    canActivate: [guestOnlyGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestOnlyGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  {
    path: 'deck-builder',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/deck-builder/deck-builder').then((m) => m.DeckBuilder),
  },
  {
    path: 'decks',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/deck-list/deck-list').then((m) => m.DeckList),
  },
  {
    path: 'decks/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/deck-detail/deck-detail').then((m) => m.DeckDetail),
  },
  { path: '**', redirectTo: '' },
];
