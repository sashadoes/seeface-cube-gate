// The visitor's real weather, felt in the room (never written on screen).
// 1. approximate, city-level location from the visitor's IP (get.geojs.io)
// 2. current weather there (Open-Meteo, free, no key)
// Nothing is stored or shown. Testing: /marks?weather=rain|snow|storm|fog|cloudy|clear|night

export type WeatherKind = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export type Weather = {
  kind: WeatherKind;
  intensity: number; // 0..1
  wind: number; // km/h
  isDay: boolean;
  temp: number; // °C
};

const FALLBACK: Weather = { kind: "clear", intensity: 0, wind: 4, isDay: false, temp: 12 };

// WMO weather codes → our kinds
function fromCode(code: number, precip: number, cloud: number): { kind: WeatherKind; intensity: number } {
  if (code >= 95) return { kind: "storm", intensity: code >= 96 ? 1 : 0.8 };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", intensity: code >= 75 || code === 86 ? 1 : 0.6 };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: "rain", intensity: Math.min(0.4 + precip / 6, 1) };
  if (code >= 51 && code <= 57) return { kind: "drizzle", intensity: 0.35 };
  if (code === 45 || code === 48) return { kind: "fog", intensity: 0.9 };
  if (code === 3 || cloud > 75) return { kind: "cloudy", intensity: cloud / 100 };
  return { kind: "clear", intensity: 0 };
}

function override(): Weather | null {
  const w = new URLSearchParams(location.search).get("weather");
  if (!w) return null;
  const presets: Record<string, Weather> = {
    clear: { kind: "clear", intensity: 0, wind: 6, isDay: true, temp: 24 },
    night: { kind: "clear", intensity: 0, wind: 3, isDay: false, temp: 8 },
    cloudy: { kind: "cloudy", intensity: 0.8, wind: 14, isDay: true, temp: 13 },
    fog: { kind: "fog", intensity: 0.9, wind: 2, isDay: true, temp: 7 },
    drizzle: { kind: "drizzle", intensity: 0.35, wind: 10, isDay: true, temp: 11 },
    rain: { kind: "rain", intensity: 0.8, wind: 22, isDay: false, temp: 9 },
    snow: { kind: "snow", intensity: 0.8, wind: 8, isDay: false, temp: -4 },
    storm: { kind: "storm", intensity: 1, wind: 45, isDay: false, temp: 14 },
  };
  return presets[w] ?? null;
}

async function getJson(url: string, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function loadWeather(): Promise<Weather> {
  const forced = override();
  if (forced) return forced;
  try {
    const geo = await getJson("https://get.geojs.io/v1/ip/geo.json");
    const lat = Number(geo.latitude);
    const lon = Number(geo.longitude);
    if (!isFinite(lat) || !isFinite(lon)) return FALLBACK;
    const w = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
        "&current=temperature_2m,weather_code,wind_speed_10m,is_day,cloud_cover,precipitation"
    );
    const c = w.current;
    const { kind, intensity } = fromCode(c.weather_code, c.precipitation ?? 0, c.cloud_cover ?? 0);
    return { kind, intensity, wind: c.wind_speed_10m ?? 0, isDay: c.is_day === 1, temp: c.temperature_2m ?? 12 };
  } catch {
    return FALLBACK; // offline or blocked: a quiet clear night
  }
}
