// The labyrinth's own weather: it changes every 3–6 minutes, unpredictably but
// the same for everyone at the same moment (picked from the clock). Rain and
// snow fall inside the labyrinth too.
import type { Weather, WeatherKind } from "../marks/weather";

const SLOT_MS = 3 * 60_000;
// weights: mostly wet, sometimes dry, now and then a storm or snow
const TABLE: [WeatherKind, number, number][] = [
  // kind, weight, intensity
  ["clear", 18, 0],
  ["cloudy", 8, 0.7],
  ["fog", 12, 0.9],
  ["drizzle", 16, 0.4],
  ["rain", 22, 0.8],
  ["storm", 14, 1],
  ["snow", 10, 0.8],
];
const TOTAL = TABLE.reduce((s, r) => s + r[1], 0);

function hash(n: number) {
  let h = Math.imul(n ^ 0x1f3d5b79, 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

export function skyAt(now = Date.now()): Weather {
  // some slots are merged so a weather can last 3, 6 or 9 minutes
  let slot = Math.floor(now / SLOT_MS);
  while (hash(slot * 7 + 3) < 0.35) slot -= 1;
  let r = hash(slot) * TOTAL;
  let pick = TABLE[0];
  for (const row of TABLE) {
    r -= row[1];
    if (r <= 0) {
      pick = row;
      break;
    }
  }
  return { kind: pick[0], intensity: pick[2], wind: 4 + hash(slot + 11) * 40, isDay: false, temp: pick[0] === "snow" ? -3 : 12 };
}

export const SKY_NOTICE: Record<WeatherKind, string> = {
  clear: "the rain stopped",
  cloudy: "the air got heavy",
  fog: "fog is coming through the walls",
  drizzle: "it's drizzling. inside.",
  rain: "it's raining in the labyrinth",
  storm: "a storm broke inside the labyrinth",
  snow: "it's snowing in here",
};
