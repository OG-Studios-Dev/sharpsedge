"use client";

import { Bet, BankrollState } from "./data/types";
import { sampleBets, calculateSampleBankroll } from "./data/bets";

const STORE_KEY = "sharpedge_bankroll";

function getDefaultState(): BankrollState {
  return {
    balance: calculateSampleBankroll(),
    initialBalance: 10000,
    bets: [...sampleBets],
  };
}

export function loadState(): BankrollState {
  if (typeof window === "undefined") return getDefaultState();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return getDefaultState();
    return JSON.parse(raw);
  } catch {
    return getDefaultState();
  }
}

export function saveState(state: BankrollState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function placeBet(bet: Omit<Bet, "id" | "status" | "placedAt">): BankrollState {
  const state = loadState();
  if (bet.amount > state.balance) throw new Error("Insufficient balance");

  const newBet: Bet = {
    ...bet,
    id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: "pending",
    placedAt: new Date().toISOString(),
  };

  state.balance -= bet.amount;
  state.bets.push(newBet);
  saveState(state);
  return state;
}

export function resolveBet(betId: string, won: boolean): BankrollState {
  const state = loadState();
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet || bet.status !== "pending") throw new Error("Bet not found or already resolved");

  bet.status = won ? "won" : "lost";
  bet.resolvedAt = new Date().toISOString();
  if (won) {
    state.balance += bet.potentialPayout;
  }

  saveState(state);
  return state;
}

export function resetBankroll(): BankrollState {
  const state = getDefaultState();
  saveState(state);
  return state;
}

export function calculatePayout(amount: number, odds: number): number {
  if (odds > 0) {
    return amount + (amount * odds) / 100;
  } else {
    return amount + (amount * 100) / Math.abs(odds);
  }
}
