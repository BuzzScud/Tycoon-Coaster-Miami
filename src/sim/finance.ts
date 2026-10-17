import { type GameState, type Finance } from './types';

export const CATEGORIES = ['Ride construction', 'Land purchase', 'Landscaping', 'Park entrance tickets', 'Ride tickets', 'Shop sales', 'Shop stock', 'Food & drink sales', 'Food & drink stock', 'Marketing', 'Ride running costs', 'Wages', 'Research', 'Loan interest'];
export const enum Cat { RideConstruction = 0, Land = 1, Landscaping = 2, EntranceTickets = 3, RideTickets = 4, ShopSales = 5, ShopStock = 6, FoodSales = 7, FoodStock = 8, Marketing = 9, RunningCosts = 10, Wages = 11, Research = 12, Interest = 13 }

export function newFinance(cash: number, loan: number, maxLoan: number, payPerRide: boolean, entranceFee: number): Finance {
  return { cash, loan, maxLoan, interestRate: 10, entranceFee, payPerRide, expenditure: [new Array(14).fill(0)], categories: CATEGORIES, researchFunding: 2, researchPriorities: { gentle: true, thrill: true, coaster: true, stall: true, scenery: true, transport: true, water: true }, value: 0, companyValue: 0, weeklyProfit: 0 };
}
export const canAfford = (g: GameState, cents: number) => g.noMoney || g.finance.cash >= cents;
/** Record money leaving (positive cents) or arriving (negative cents) under a category. */
export function spend(g: GameState, cents: number, cat: number) {
  if (g.noMoney && cents > 0) cents = 0;
  g.finance.cash -= cents;
  g.finance.expenditure[0][cat] -= cents;
}
export const earn = (g: GameState, cents: number, cat: number) => spend(g, -cents, cat);

export function weeklyInterest(g: GameState) {
  const f = g.finance; if (g.noMoney) return;
  const interest = Math.floor((f.loan * f.interestRate) / 100 / 32);     // a year has 8 months of 4 weeks
  spend(g, interest, Cat.Interest);
}
export const RESEARCH_COST = [0, 10000, 20000, 40000];   // cents per month
export function weeklyResearchCost(g: GameState) { if (!g.noMoney) spend(g, RESEARCH_COST[g.finance.researchFunding] / 4, Cat.Research); }

export function shiftMonth(g: GameState) {
  g.finance.expenditure.unshift(new Array(14).fill(0));
  if (g.finance.expenditure.length > 16) g.finance.expenditure.length = 16;
}
export function monthProfit(g: GameState, monthBack = 0): number {
  const e = g.finance.expenditure[monthBack]; if (!e) return 0; return e.reduce((a, b) => a + b, 0);
}
export function borrow(g: GameState, cents: number): boolean {
  const f = g.finance; const amount = Math.min(cents, f.maxLoan - f.loan); if (amount <= 0) return false;
  f.loan += amount; f.cash += amount; return true;
}
export function repay(g: GameState, cents: number): boolean {
  const f = g.finance; const amount = Math.min(cents, f.loan, f.cash); if (amount <= 0) return false;
  f.loan -= amount; f.cash -= amount; return true;
}
