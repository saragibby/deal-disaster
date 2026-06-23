import { PropertyCase } from '../types';
import {
  CLOSING_RATE,
  GOOD_ROI_THRESHOLD,
  computeDeal,
  issueCost,
  lienSurvives,
} from './dealFinancials';

export type { CaseArchetype } from '../types';
import type { CaseArchetype } from '../types';

/**
 * The three deliberate "shapes" a case can take. The goal is to reward real
 * analysis over pattern-matching the headline numbers:
 *
 * - `clear-buy`     — the listing-visible spread looks good AND the true deal
 *                     is good. Rewards confident action.
 * - `clear-trap`    — the listing-visible spread looks great, but surviving
 *                     liens / severe hidden issues turn it into a loss.
 * - `misdirection`  — the read and the reality diverge in a subtler way
 *                     (looks weak but is fine, or marginal-but-ambiguous), so
 *                     only investigation reveals the right call.
 */

/**
 * The "naive" ROI a player can read straight off the listing, before any
 * investigation: estimated market value minus the auction price, base repairs
 * and closing costs. It deliberately ignores surviving liens, occupancy and
 * undiscovered issues — those are what investigation is meant to surface.
 */
export function naiveRoi(c: PropertyCase): number {
  const closing = Math.round(c.auctionPrice * CLOSING_RATE);
  const naiveInvestment = c.auctionPrice + c.repairEstimate + closing;
  if (naiveInvestment <= 0) return 0;
  return (c.propertyValue - naiveInvestment) / naiveInvestment;
}

/**
 * "Alarm" score: how much scary-but-ultimately-survivable noise a case carries.
 * Wiped (junior) liens vanish at the sale, red herrings cost nothing, occupancy
 * and severe-sounding-but-cheap issues look frightening but barely move the
 * math. A good deal buried under high alarm is the classic misdirection: the
 * pattern-matcher walks away from real profit.
 */
export function alarmScore(c: PropertyCase): number {
  const redHerrings = (c.redFlags ?? []).filter((f) => f.severity === 'red-herring').length;
  const wipedLiens = (c.liens ?? []).filter((l) => !lienSurvives(l)).length;
  const scaryButCheap = (c.redFlags ?? []).filter(
    (f) => (f.severity === 'high' || f.severity === 'severe') && issueCost(f) < 8000
  ).length;
  const occupied =
    (c.occupant != null && c.occupant !== 'vacant') || c.occupancyStatus === 'occupied';
  return redHerrings + wipedLiens + scaryButCheap + (occupied ? 1 : 0);
}

/** A good deal carries enough scary noise to read as a trap at this threshold. */
const MISDIRECTION_ALARM_THRESHOLD = 3;

/**
 * Classify a case into one of the three archetypes from the financial model.
 * Prefers an explicit `archetype` on the case; otherwise derives it so static
 * and AI-generated cases are classified consistently.
 *
 * - A losing deal that still shows an attractive listing spread is a
 *   `clear-trap`.
 * - A genuinely profitable deal that is clean and obvious is a `clear-buy`.
 * - A genuinely profitable deal smothered in alarming-but-survivable noise is
 *   a `misdirection` — it looks like a trap but rewards real analysis.
 */
export function deriveArchetype(c: PropertyCase): CaseArchetype {
  if (c.archetype) return c.archetype;

  const trueGood = computeDeal(c).roi >= GOOD_ROI_THRESHOLD;
  if (!trueGood) return 'clear-trap';
  return alarmScore(c) >= MISDIRECTION_ALARM_THRESHOLD ? 'misdirection' : 'clear-buy';
}

/**
 * Derive a difficulty tier from how easy the deal is to *misread*. A deal whose
 * true ROI sits far from the buy/walk boundary is easy to call; surviving
 * liens, redemption windows and alarming noise all make the right call harder
 * to see. Prefers an explicit `difficulty` on the case; otherwise derives one.
 */
export function deriveDifficulty(c: PropertyCase): 'easy' | 'medium' | 'hard' {
  if (c.difficulty) return c.difficulty;

  const trueRoi = computeDeal(c).roi;
  const survivingLiens = (c.liens ?? []).filter(lienSurvives).length;
  const hasRedemption = (c.redemptionPeriodDays ?? 0) > 0;
  const alarm = alarmScore(c);

  // The closer the true ROI is to the decision boundary, the more ambiguous
  // (and harder) the call.
  const clarity = Math.abs(trueRoi);
  const ambiguity = clarity >= 0.35 ? 0 : clarity >= 0.18 ? 1 : 2;

  const score = ambiguity + survivingLiens * 1 + alarm * 0.5 + (hasRedemption ? 1.5 : 0);

  if (score >= 4) return 'hard';
  if (score >= 2) return 'medium';
  return 'easy';
}

