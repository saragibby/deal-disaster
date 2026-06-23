import { PropertyCase, RedFlag } from '../types';

/**
 * Quiz unification (Enhancement K).
 *
 * The AI-generated Daily Challenge attaches an authored quiz
 * (`question` / `choices` / `correctChoice` / `answerExplanation`) to every red
 * flag. The static Regular-game cases historically had none, so those flags only
 * flipped to reveal for a flat reward — a different mechanic per mode.
 *
 * `deriveQuiz()` closes that gap: when a flag has no authored quiz we generate a
 * sensible one from the data the flag already carries (its cost range and
 * severity). Authored quizzes always win, so AI cases are untouched. The result
 * is one consistent quiz mechanic and scoring path in both modes.
 */

const formatRange = (low: number, high: number): string =>
  `$${Math.round(low).toLocaleString()} – $${Math.round(high).toLocaleString()}`;

/** Whether a flag already carries a complete, authored quiz. */
function hasAuthoredQuiz(flag: RedFlag): boolean {
  return (
    typeof flag.question === 'string' &&
    Array.isArray(flag.choices) &&
    flag.choices.length > 1 &&
    typeof flag.correctChoice === 'number'
  );
}

/** Stable 0..(count-1) slot for the correct answer, derived from the flag id so
 * the right choice isn't always in the same position but is deterministic. */
function correctSlot(id: string, count: number): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum % count;
}

/** Place `correct` at a deterministic slot among `distractors`. */
function assemble(id: string, correct: string, distractors: string[]): { choices: string[]; correctChoice: number } {
  const slot = correctSlot(id, distractors.length + 1);
  const choices = [...distractors];
  choices.splice(slot, 0, correct);
  return { choices, correctChoice: slot };
}

/**
 * Return a copy of the flag guaranteed to have a quiz. Authored quizzes are
 * returned unchanged; otherwise a quiz is generated from cost/severity.
 */
export function deriveQuiz(flag: RedFlag): RedFlag {
  if (hasAuthoredQuiz(flag)) return flag;

  // Template B — red herring: sounds alarming, costs nothing.
  if (flag.severity === 'red-herring') {
    const { choices, correctChoice } = assemble(
      flag.id,
      "It's a distraction — no meaningful cost to the deal",
      [
        'Add tens of thousands to the repair budget',
        "It's an automatic walk-away",
        'Double your contingency to be safe',
      ]
    );
    return {
      ...flag,
      question: 'How should this finding affect your numbers?',
      choices,
      correctChoice,
      answerExplanation:
        flag.answerExplanation ??
        "This is a red herring — it sounds scary but doesn't materially change the economics of the deal.",
    };
  }

  // Template M — money-saver: a discovery that *reduces* the deal's cost (a
  // transferable warranty, an assumable credit, a paid-off balance, an
  // abatement). Modeled as a negative cost, so teach the player to bank it.
  if (
    (typeof flag.costLow === 'number' && flag.costLow < 0) ||
    (typeof flag.costHigh === 'number' && flag.costHigh < 0)
  ) {
    const lowSave = Math.abs(flag.costHigh ?? flag.costLow ?? 0);
    const highSave = Math.abs(flag.costLow ?? flag.costHigh ?? 0);
    const correct =
      lowSave === highSave
        ? `It saves about $${Math.round(lowSave).toLocaleString()} — subtract it from your costs`
        : `It saves about ${formatRange(lowSave, highSave)} — subtract it from your costs`;
    const { choices, correctChoice } = assemble(flag.id, correct, [
      'Ignore it — credits never transfer to the buyer',
      'Add it to your costs as a new expense',
      "It's too good to be true — treat it as a trap",
    ]);
    return {
      ...flag,
      question: 'How should this finding affect your numbers?',
      choices,
      correctChoice,
      answerExplanation:
        flag.answerExplanation ??
        flag.impact ??
        'This is real money in your favor — credits, warranties and abatements lower your total investment, so bank the savings.',
    };
  }

  // Template A — cost estimation: build dollar-range choices around the truth.
  if (typeof flag.costLow === 'number' && typeof flag.costHigh === 'number' && flag.costHigh > 0) {
    const low = flag.costLow;
    const high = flag.costHigh;
    const correct = formatRange(low, high);
    const distractors = [
      formatRange(Math.max(0, Math.round(low * 0.15)), Math.max(1, Math.round(low * 0.4))),
      formatRange(Math.round(high * 1.8), Math.round(high * 2.8)),
      'No real cost — purely cosmetic',
    ];
    const { choices, correctChoice } = assemble(flag.id, correct, distractors);
    return {
      ...flag,
      question: 'Roughly what should you budget to deal with this issue?',
      choices,
      correctChoice,
      answerExplanation:
        flag.answerExplanation ??
        flag.impact ??
        `Comparable foreclosure work in this category typically runs ${correct}.`,
    };
  }

  // Template C — no-cost informational (e.g. a surviving-lien note or legal risk
  // whose dollars are already counted in the lien stack). Teach how to treat it.
  const { choices, correctChoice } = assemble(
    flag.id,
    "Factor it in — it adds real cost or risk you'll inherit",
    [
      'Ignore it; it disappears at the foreclosure sale',
      'It guarantees a profit on resale',
      'It has no effect on your decision',
    ]
  );
  return {
    ...flag,
    question: "What's the right way to treat this finding?",
    choices,
    correctChoice,
    answerExplanation:
      flag.answerExplanation ??
      flag.impact ??
      'Obligations and legal risks that survive the sale follow the property — price them in.',
  };
}

/**
 * Return a copy of the case with every red flag guaranteed to carry a quiz.
 * Call this at every point a case is loaded so both modes share one mechanic.
 */
export function withDerivedQuizzes(caseData: PropertyCase): PropertyCase {
  return {
    ...caseData,
    redFlags: caseData.redFlags.map(deriveQuiz),
  };
}
