import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from './app';
import { Auth } from './services/auth';
import { GOOGLE_CLIENT_ID } from './auth.config';

describe('Original Google sign-in screen', () => {
  let auth: jasmine.SpyObj<Auth>;
  let callback: (response: { credential: string }) => void;
  let previousGoogle: unknown;
  const browser = window as unknown as { google?: unknown };
  beforeEach(async () => {
    previousGoogle = browser.google;
    browser.google = { accounts: { id: {
      initialize: (options: { client_id: string; callback: typeof callback }) => {
        expect(options.client_id).toBe(GOOGLE_CLIENT_ID); callback = options.callback;
      }, renderButton: () => {},
    } } };
    auth = jasmine.createSpyObj<Auth>('Auth', ['googleLogin', 'clearSession']);
    auth.googleLogin.and.resolveTo();
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [{ provide: Auth, useValue: auth }] }).compileComponents();
  });
  afterEach(() => { browser.google = previousGoogle; });
  async function screen() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges(); await fixture.whenStable(); return fixture;
  }
  it('preserves the existing headline and Google button', async () => {
    const fixture = await screen();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('A better way to connect.');
    expect(fixture.nativeElement.querySelector('#google-btn')).toBeTruthy();
  });
  it('exchanges the provider credential and renders success', async () => {
    const fixture = await screen(); callback({ credential: 'test-id-token' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(auth.googleLogin).toHaveBeenCalledOnceWith('test-id-token');
    expect(fixture.nativeElement.textContent).toContain("You're signed in successfully.");
    expect(fixture.componentInstance.isLoading()).toBeFalse();
  });
  it('shows account-conflict errors without logging credentials', async () => {
    const log = spyOn(console, 'log'); const error = spyOn(console, 'error');
    auth.googleLogin.and.rejectWith(new HttpErrorResponse({ status: 409 }));
    const fixture = await screen(); callback({ credential: 'test-id-token' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('password account');
    expect(fixture.componentInstance.hasError()).toBeTrue();
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it('rejects an empty provider response and prevents duplicate pending exchanges', async () => {
    const fixture = await screen(); callback({ credential: '' });
    expect(auth.googleLogin).not.toHaveBeenCalled();
    let finish!: () => void;
    auth.googleLogin.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    callback({ credential: 'one' }); callback({ credential: 'two' });
    expect(auth.googleLogin).toHaveBeenCalledOnceWith('one');
    finish(); await fixture.whenStable();
  });
});
