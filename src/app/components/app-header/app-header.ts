import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth-service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);

  protected readonly session = this._auth.session;

  protected logout(): void {
    this._auth.logout();
    this._router.navigate(['/']);
  }
}
