import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/yu-gi-index/yu-gi-index').then((m) => m.YuGiIndex),
  },
  { path: '**', redirectTo: '' },
];
