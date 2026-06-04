import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { AppHeader } from '../../components/app-header/app-header';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('password')?.value;
  const conf = group.get('passwordConfirm')?.value;
  return pw && conf && pw !== conf ? { passwordsMismatch: true } : null;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, AppHeader],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly _fb: FormBuilder = inject(FormBuilder);
  private readonly _auth = inject(AuthService);
  private readonly _router: Router = inject(Router);
  private readonly _route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  registerForm: FormGroup = this._fb.group(
    {
      username: ['', {
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(20),
          Validators.pattern(/^[A-Za-z0-9_-]+$/),
        ],
        updateOn: 'blur',
      }],
      email: ['', {
        validators: [Validators.required, Validators.email],
        updateOn: 'blur',
      }],
      password: ['', {
        validators: [Validators.required, Validators.minLength(8)],
        updateOn: 'blur',
      }],
      passwordConfirm: ['', {
        validators: [Validators.required],
        updateOn: 'blur',
      }],
    },
    { validators: [passwordsMatch], updateOn: 'blur' },
  );

  async submit(): Promise<void> {
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid || this.busy()) return;

    this.formError.set('');
    this.busy.set(true);
    const r = await this._auth.register({
      username: this.registerForm.value.username,
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
    });
    this.busy.set(false);

    if (!r.ok) {
      if (r.reason === 'username-taken') {
        this.registerForm.get('username')?.setErrors({ taken: true });
      } else if (r.reason === 'email-taken') {
        this.registerForm.get('email')?.setErrors({ taken: true });
      } else {
        this.formError.set('Champs invalides.');
      }
      return;
    }

    const returnTo = this._route.snapshot.queryParamMap.get('returnTo') ?? '/';
    this._router.navigateByUrl(returnTo);
  }
}
