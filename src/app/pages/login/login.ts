import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { AppHeader } from '../../components/app-header/app-header';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, AppHeader],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly _fb: FormBuilder = inject(FormBuilder);
  private readonly _auth = inject(AuthService);
  private readonly _router: Router = inject(Router);
  private readonly _route = inject(ActivatedRoute);

  protected readonly error = signal('');
  protected readonly busy = signal(false);

  loginForm: FormGroup = this._fb.group(
    {
      email: ['', { validators: [Validators.required, Validators.email], updateOn: 'blur' }],
      password: ['', { validators: [Validators.required], updateOn: 'blur' }],
    },
    { validators: [] },
  );

  async submit(): Promise<void> {
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid || this.busy()) return;

    this.error.set('');
    this.busy.set(true);
    const r = await this._auth.login({
      usernameOrEmail: this.loginForm.value.email,
      password: this.loginForm.value.password,
    });
    this.busy.set(false);

    if (!r.ok) {
      this.error.set('Identifiant ou mot de passe incorrect.');
      return;
    }

    const returnTo = this._route.snapshot.queryParamMap.get('returnTo') ?? '/';
    this._router.navigateByUrl(returnTo);
  }
}
