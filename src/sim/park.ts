// Park rating (0..999), park value, soft guest cap. Follows the original's arithmetic.
import { clamp, type GameState } from './types';
import { RIDE_BY_KEY } from './rides';
import { PIECE_BY_KEY } from './track';
import { rideById } from './runtime';

export function updateParkRating(g: GameState) {
  let r = g.difficultGuests ? 1050 : 1150;
  const guests = g.guests.filter(x => x.state !== 'left' && x.state !== 'entering');
  const n = guests.length;
  r -= 150 - Math.min(2000, n) / 13;
  // happiness
  r -= 500;
  if (n) { const happy = guests.filter(x => x.happiness > 128).length; r += 2 * Math.min(250, (happy * 300) / n); } else r += 500;
  // lost guests
  const lost = guests.filter(x => x.flags.leaving && x.lostTimer > 0).length; g.lostCount = lost;
  if (lost > 25) r -= (lost - 25) * 7;
  // rides
  r -= 200; r -= 100;
  const rides = g.rides.filter(x => RIDE_BY_KEY[x.type].kind !== 'stall');
  if (rides.length) {
    let up = 0, ex = 0, inn = 0, rated = 0, sumE = 0, sumI = 0;
    for (const ride of rides) { up += 100 - ride.downtime; if (ride.ratings) { rated++; ex += ride.ratings.e / 8; inn += ride.ratings.i / 8; sumE += ride.ratings.e / 8; sumI += ride.ratings.i / 8; } }
    r += (up / rides.length) * 2;
    if (rated) {
      const ae = ex / rated, ai = inn / rated;
      const pe = Math.min(50, Math.abs(ae - 46) / 2), pi = Math.min(50, Math.abs(ai - 65) / 2);
      r += 100 - pe - pi;
    }
    r -= 200 - (Math.min(1000, sumE) + Math.min(1000, sumI)) / 10;
  }
  // litter older than ~5 minutes
  let litter = 0; for (const t of g.tiles) if (t.litterAge > 7680 && (t.litter || t.vomit)) litter += t.litter + t.vomit;
  r -= 600 - 4 * (150 - Math.min(150, litter));
  r -= g.ratingCasualtyPenalty;
  g.rating = clamp(Math.round(r), 0, 999);
}

export function updateSuggestedMax(g: GameState) {
  let s = 0;
  for (const r of g.rides) {
    if (r.status !== 'open' || r.breakdown) continue; const def = RIDE_BY_KEY[r.type]; if (def.kind === 'stall') continue;
    s += def.bonusValue;
  }
  if (g.difficultGuests) {
    s = Math.min(s, 1000);
    for (const r of g.rides) { const def = RIDE_BY_KEY[r.type]; if (r.status === 'open' && def.kind === 'coaster' && r.stats && r.stats.length >= 600 && r.ratings && r.ratings.e >= 600) s += def.bonusValue * 2; }
  }
  g.suggestedMax = Math.min(65535, s);
}

export function updateParkValue(g: GameState) {
  let v = 0;
  for (const r of g.rides) { const def = RIDE_BY_KEY[r.type]; if (def.kind === 'stall') continue; const recent = r.recent[0] || 0; v += r.value * (recent + def.bonusValue * 4) / 10; }
  v += g.guestsInPark * 700;
  g.finance.value = Math.round(v);
  g.finance.companyValue = g.finance.value - g.finance.loan + g.finance.cash;
}

/** Sum over open rides of (value - price) * 2 when positive; compared with the entrance fee for spawning. */
export function totalRideValueForMoney(g: GameState): number {
  let total = 0;
  for (const r of g.rides) { if (r.status !== 'open' || r.breakdown) continue; const def = RIDE_BY_KEY[r.type]; if (def.kind === 'stall') continue; const v = r.value - (g.finance.payPerRide ? r.price : 0); if (v > 0) total += v * 2; }
  return total;
}
export const coasterLengthM = (g: GameState, rideId: number) => { const r = rideById(g, rideId); return r ? r.pieces.reduce((a, p) => a + PIECE_BY_KEY[p.type].length, 0) : 0; };
