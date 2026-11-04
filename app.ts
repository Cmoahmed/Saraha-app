import { AfterViewInit, Component, OnDestroy, signal } from '@angular/core';
import { Auth, loginErrorMessage } from './services/auth';
import { GOOGLE_CLIENT_ID } from './auth.config';

interface GoogleCredentialResponse { credential: string; }
interface GoogleIdentityServices {
  accounts: { id: {
    initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
    renderButton: (element: HTMLElement, options: { theme: 'outline'; size: 'large'; width: number }) => void;
  } };
}
type GoogleWindow = Window & { google?: GoogleIdentityServices };

@Component({
  selector: 'app-root', standalone: true,
  templateUrl: './app.html', styleUrl: './app.scss',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  readonly isLoading = signal(false);
  readonly feedback = signal('');
  readonly hasError = signal(false);
  private destroyed = false;

  constructor(private readonly authService: Auth) {}

  ngAfterViewInit(): void { void this.initializeGoogleButton(); }
  ngOnDestroy(): void { this.destroyed = true; this.authService.clearSession(); }

  private async initializeGoogleButton(): Promise<void> {
    try {
      await this.loadGoogleIdentityServices();
      if (this.destroyed) return;
      const google = (window as GoogleWindow).google;
      const button = document.getElementById('google-btn');
      if (!google || !button) throw new Error('Google sign-in could not be initialized');
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: response => { if (!this.destroyed) void this.handleCredential(response); },
      });
      google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', width: 320 });
    } catch {
      if (!this.destroyed) {
        this.hasError.set(true);
        this.feedback.set('Google sign-in is unavailable right now. Please refresh and try again.');
      }
    }
  }

  private loadGoogleIdentityServices(): Promise<void> {
    if ((window as GoogleWindow).google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = window.setTimeout(() => {
        script.remove();
        reject(new Error('Google Identity Services load timed out'));
      }, 10000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true; script.defer = true;
      script.onload = () => { window.clearTimeout(timer); resolve(); };
      script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error('Google Identity Services failed to load')); };
      document.head.appendChild(script);
    });
  }

  private async handleCredential(response: GoogleCredentialResponse): Promise<void> {
    if (this.isLoading()) return;
    if (!response?.credential) {
      this.authService.clearSession();
      this.hasError.set(true);
      this.feedback.set('Google did not return a sign-in credential. Please try again.');
      return;
    }
    this.isLoading.set(true); this.feedback.set(''); this.hasError.set(false);
    try {
      await this.authService.googleLogin(response.credential);
      if (!this.destroyed) this.feedback.set("You're signed in successfully.");
    } catch (error) {
      if (!this.destroyed) {
        this.hasError.set(true);
        this.feedback.set(loginErrorMessage(error));
      }
    } finally {
      if (this.destroyed) this.authService.clearSession();
      this.isLoading.set(false);
    }
  }
}
