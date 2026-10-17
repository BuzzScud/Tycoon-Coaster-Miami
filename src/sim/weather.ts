// Weather: a temperate climate. Kinds: 0 sunny, 1 partly cloudy, 2 cloudy, 3 rain, 4 heavy rain, 5 thunder.
import type { GameState, Weather } from './types';
import { rand } from './rng';

const MONTH_TEMP = [8, 12, 16, 20, 23, 22, 18, 12];                 // March..October, °C
const MONTH_RAIN = [0.35, 0.3, 0.25, 0.2, 0.15, 0.2, 0.3, 0.38];    // chance a change picks rain

export const WEATHER_NAMES = ['Sunny', 'Partly cloudy', 'Cloudy', 'Rain', 'Heavy rain', 'Thunderstorm'];
export function newWeather(): Weather { return { month: 0, temp: 12, kind: 1, next: 4000, rainLevel: 0, gloom: 0 }; }

export function updateWeather(g: GameState) {
  const w = g.weather; const m = g.monthsElapsed % 8;
  if (w.month !== m) { w.month = m; }
  w.next--;
  if (w.next <= 0) {
    const r = rand(g);
    if (r < MONTH_RAIN[m]) w.kind = r < MONTH_RAIN[m] * 0.15 ? 5 : r < MONTH_RAIN[m] * 0.45 ? 4 : 3;
    else if (r < 0.55) w.kind = 0; else if (r < 0.8) w.kind = 1; else w.kind = 2;
    w.next = 2400 + Math.floor(rand(g) * 6000);
    w.temp = MONTH_TEMP[m] + (g.climate ?? 0) + Math.round((rand(g) - 0.5) * 8) - (w.kind >= 3 ? 3 : 0);
  }
  const targetRain = w.kind === 3 ? 0.5 : w.kind === 4 ? 0.85 : w.kind === 5 ? 1 : 0;
  w.rainLevel += (targetRain - w.rainLevel) * 0.002;
  const targetGloom = [0, 0.08, 0.2, 0.35, 0.45, 0.6][w.kind];
  w.gloom += (targetGloom - w.gloom) * 0.002;
}
export const isRaining = (g: GameState) => g.weather.kind >= 3;
