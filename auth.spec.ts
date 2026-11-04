import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Auth, loginErrorMessage } from './auth';

describe('Saraha Google exchange', () => {
  let service: Auth;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(Auth); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('posts only the ID token to Saraha and keeps session tokens in memory', async () => {
    const localSet = spyOn(Storage.prototype, 'setItem');
    const login = service.googleLogin('test-google-id-token');
    const req = http.expectOne('http://localhost:3001/auth/google');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ idToken: 'test-google-id-token' });
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ accessToken: 'local-access', refreshToken: 'local-refresh', tokenType: 'Bearer' });
    await login;
    expect(service.signedIn).toBeTrue(); expect(localSet).not.toHaveBeenCalled();
    service.clearSession(); expect(service.signedIn).toBeFalse();
  });
  it('rejects empty credentials without an HTTP request', async () => {
    await expectAsync(service.googleLogin('')).toBeRejected(); expect(service.signedIn).toBeFalse();
  });
  it('clears the session on failed sign-in and does not log response bodies', async () => {
    const log = spyOn(console, 'log'); const error = spyOn(console, 'error');
    const login = service.googleLogin('rejected-credential');
    http.expectOne('http://localhost:3001/auth/google').flush({ message: 'sensitive detail' }, { status: 401, statusText: 'Unauthorized' });
    await expectAsync(login).toBeRejected();
    expect(service.signedIn).toBeFalse(); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it('rejects malformed successful session responses', async () => {
    const login = service.googleLogin('test-credential');
    http.expectOne('http://localhost:3001/auth/google').flush({ success: true });
    await expectAsync(login).toBeRejected(); expect(service.signedIn).toBeFalse();
  });
  it('explains expected errors without displaying arbitrary server content', () => {
    for (const status of [0, 401, 409, 429, 503]) {
      const message = loginErrorMessage(new HttpErrorResponse({ status, error: { message: 'private-response' } }));
      expect(message).not.toContain('private-response'); expect(message.length).toBeGreaterThan(20);
    }
    expect(loginErrorMessage(new HttpErrorResponse({ status: 409 }))).toContain('password account');
  });
});
