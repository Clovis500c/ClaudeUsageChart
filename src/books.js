// Books used to give the output-token count a human scale.
// Word counts are the commonly cited figures for the English text; tokens are
// estimated at ~1.3 tokens per English word, so the comparison is approximate.
// `fr` includes the preposition ("du Hobbit") so the French sentence reads right.
export const TOKENS_PER_WORD = 1.3;

export const BOOKS = [
  { words: 47_094, en: 'The Great Gatsby', fr: 'de Gatsby le Magnifique' },
  { words: 76_944, en: "Harry Potter and the Philosopher's Stone", fr: "de Harry Potter à l'école des sorciers" },
  { words: 95_356, en: 'The Hobbit', fr: 'du Hobbit' },
  { words: 206_052, en: 'Moby-Dick', fr: 'de Moby Dick' },
  { words: 481_103, en: 'The Lord of the Rings', fr: 'du Seigneur des Anneaux' },
  { words: 783_137, en: 'the King James Bible', fr: 'de la Bible (King James)' },
  { words: 1_267_069, en: 'In Search of Lost Time', fr: "d'À la recherche du temps perdu" },
];

// Picks the biggest book that still fits at least 10 times, so the number
// stays readable (≈ 12× The Lord of the Rings rather than ≈ 125× Gatsby).
// Below that, falls back to the shortest book.
export function pickBook(outputTokens) {
  const withRatio = BOOKS.map((b) => ({ ...b, ratio: outputTokens / (b.words * TOKENS_PER_WORD) }));
  return withRatio.filter((b) => b.ratio >= 10).at(-1) ?? withRatio[0];
}
