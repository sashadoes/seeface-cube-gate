// Optional accounts: register a nickname + password to save progress and play
// on any device. Without an account, progress stays in this browser only.
// The session token lives in this browser; the password is never stored here.
import { apiBase, apiReady } from "./api";
import { onProgress, readProgress, writeProgress, type Progress } from "./progress";

export type Account = { nick: string; email: string | null; progress: Progress; instagram?: string | null };

const TOKEN_KEY = "seeface-account-token";
const ACCOUNT_KEY = "seeface-account";

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // ignore
  }
};

export const accountsReady = apiReady;

/** does this server offer instagram login? (asked once) */
let igKnown: boolean | null = null;
export async function instagramReady() {
  if (!apiBase) return false;
  if (igKnown !== null) return igKnown;
  try {
    const r = await fetch(`${apiBase}/api/health`);
    const d = await r.json();
    igKnown = Boolean(d.instagram);
  } catch {
    igKnown = false;
  }
  return igKnown;
}

export const instagramUrl = () => `${apiBase}/api/instagram/start`;

/** Instagram sent them back with a session token in the address: take it in */
export async function finishInstagram(): Promise<Account | null> {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  set(TOKEN_KEY, token);
  history.replaceState(null, "", location.pathname);
  const acc = await refresh();
  if (acc) void save();
  return acc;
}

export function currentAccount(): Account | null {
  try {
    return get(TOKEN_KEY) ? (JSON.parse(get(ACCOUNT_KEY) ?? "null") as Account | null) : null;
  } catch {
    return null;
  }
}

function merge(a: Progress, b: Progress): Progress {
  return {
    blood: Math.max(a.blood, b.blood),
    best: Math.max(a.best, b.best),
    metres: Math.max(a.metres, b.metres),
    runs: Math.max(a.runs, b.runs),
    levels: [...new Set([...a.levels, ...b.levels])].sort(),
  };
}

async function call(method: string, path: string, body?: unknown, keepalive = false) {
  const token = get(TOKEN_KEY);
  const r = await fetch(`${apiBase}${path}`, {
    method,
    keepalive,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

function signedIn(token: string, account: Account) {
  set(TOKEN_KEY, token);
  // the best of this device and the account
  const p = merge(readProgress(), account.progress);
  set(ACCOUNT_KEY, JSON.stringify({ ...account, progress: p }));
  writeProgress(p);
  void save();
}

export type AuthError = "taken" | "wrong" | "password" | "nick" | "email" | "offline" | "slow";
export type AuthResult = { ok: true; account: Account } | { ok: false; error: AuthError };

const failure = (status: number, error?: string): AuthResult => ({
  ok: false,
  error: status === 429 ? "slow" : status === 0 ? "offline" : ((error as AuthError) ?? "wrong"),
});

export async function register(nick: string, password: string, email?: string, consent = false): Promise<AuthResult> {
  try {
    const { status, data } = await call("POST", "/api/register", { nick, password, email: email || undefined, consent, progress: readProgress() });
    if (!data.ok) return failure(status, data.error);
    signedIn(data.token, data.account);
    return { ok: true, account: data.account };
  } catch {
    return failure(0);
  }
}

export async function login(nick: string, password: string): Promise<AuthResult> {
  try {
    const { status, data } = await call("POST", "/api/login", { nick, password });
    if (!data.ok) return failure(status, data.error);
    signedIn(data.token, data.account);
    return { ok: true, account: data.account };
  } catch {
    return failure(0);
  }
}

export async function logout() {
  try {
    await call("POST", "/api/logout");
  } catch {
    // offline: forget it here anyway
  }
  set(TOKEN_KEY, null);
  set(ACCOUNT_KEY, null);
}

/** delete the account forever (needs the password again) */
export async function deleteAccount(password: string): Promise<boolean> {
  try {
    const { data } = await call("POST", "/api/account/delete", { password });
    if (!data.ok) return false;
    set(TOKEN_KEY, null);
    set(ACCOUNT_KEY, null);
    return true;
  } catch {
    return false;
  }
}

/** refresh the account from the server (another device may have played) */
export async function refresh(): Promise<Account | null> {
  if (!get(TOKEN_KEY)) return null;
  try {
    const { status, data } = await call("GET", "/api/me");
    if (status === 401) {
      // signed out elsewhere or the account was deleted
      set(TOKEN_KEY, null);
      set(ACCOUNT_KEY, null);
      return null;
    }
    if (data.ok) {
      const p = merge(readProgress(), data.account.progress);
      set(ACCOUNT_KEY, JSON.stringify({ ...data.account, progress: p }));
      writeProgress(p);
      return { ...data.account, progress: p };
    }
  } catch {
    // offline: keep playing, it saves later
  }
  return currentAccount();
}

let saving = false;
export async function save(keepalive = false) {
  if (!get(TOKEN_KEY) || saving) return;
  saving = true;
  try {
    const { data } = await call("PUT", "/api/progress", { progress: readProgress() }, keepalive);
    if (data.ok) set(ACCOUNT_KEY, JSON.stringify(data.account));
  } catch {
    // offline: try again on the next change
  } finally {
    saving = false;
  }
}

// save a few seconds after progress changes, and when the page goes away
let timer = 0;
if (accountsReady) {
  onProgress(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void save(), 4000);
  });
  window.addEventListener("pagehide", () => void save(true));
}
