import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * "Which word was #N?" questions that prove the user wrote their recovery phrase down.
 * Pure logic with no storage or React, so it can be tested on its own. Picking positions and decoys is
 * not security-sensitive (a wrong guess only makes the user look at their notes), so Math.random is fine.
 */
export type QuizQuestion = {
  /** 1-based position in the phrase. */
  position: number;
  /** The correct word and decoys, shuffled. */
  options: string[];
  answer: string;
};

export const QUIZ_LENGTH = 3;
const OPTIONS_PER_QUESTION = 4;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * `count` questions about distinct positions, in ascending order. Decoys come from the BIP-39 list and
 * never repeat a word of the user's phrase, so exactly one option is right however the phrase repeats.
 */
export function buildRecoveryQuiz(words: string[], count: number = QUIZ_LENGTH): QuizQuestion[] {
  if (words.length < count) throw new Error('Recovery phrase is too short to quiz.');
  const inPhrase = new Set(words);
  const decoyPool = wordlist.filter((word) => !inPhrase.has(word));

  const indices = shuffle(words.map((_, i) => i))
    .slice(0, count)
    .sort((a, b) => a - b);

  return indices.map((index) => {
    const answer = words[index];
    const decoys = shuffle(decoyPool).slice(0, OPTIONS_PER_QUESTION - 1);
    return { position: index + 1, answer, options: shuffle([answer, ...decoys]) };
  });
}
