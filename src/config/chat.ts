// "The circle": live chat between visitors, via Firebase Realtime Database.
// Paste the web app config from the Firebase console here (it is public by
// design; security comes from database.rules.json). While it is null, the
// circle stays hidden.
export const FIREBASE_CONFIG: Record<string, string> | null = null;

export const CHAT_PATH = "circle";
export const MAX_LEN = 160;
export const SLOW_MODE_MS = 5000;
export const HISTORY = 50;
