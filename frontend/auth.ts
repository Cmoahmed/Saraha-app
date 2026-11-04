import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { SARAHA_API_URL } from '../auth.config';

interface SarahaSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0: return 'Cannot reach Saraha. Start the backend on localhost:3001 and check its CORS origin.';
      case 401: return 'Google identity could not be verified. Sign in again and check that both Client IDs match.';
      case 409: return 'This email already has a password account. Use password login; automatic Google linking is disabled.';
      case 429: return 'Too many sign-in attempts. Please wait and try again.';
      case 503: return 'Google login is not configured on the backend. Check GOOGLE_CLIENT_ID and restart it.';
    }
  }
  return 'We could not complete sign-in. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  // Session credentials live only in this service instance; reload requires a new sign-in.
  private session: SarahaSession | null = null;

  get signedIn(): boolean { return this.session !== null; }

  async googleLogin(idToken: string): Promise<void> {
    this.session = null;
    if (!idToken?.trim()) throw new Error('Missing Google credential');
    // Exchange the Google ID token once; do not persist it, log it, or put it in a URL.
    const response = await firstValueFrom(
      this.http.post<SarahaSession>(`${SARAHA_API_URL}/auth/google`, { idToken }).pipe(timeout(10000)),
    );
    if (!response || typeof response.accessToken !== 'string' || !response.accessToken ||
        typeof response.refreshToken !== 'string' || !response.refreshToken || response.tokenType !== 'Bearer') {
      throw new Error('Invalid Saraha session response');
    }
    this.session = { accessToken: response.accessToken, refreshToken: response.refreshToken, tokenType: 'Bearer' };
  }

  clearSession(): void { this.session = null; }
}
