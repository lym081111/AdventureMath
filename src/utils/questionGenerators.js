const OBJECTS = ['🍎', '⭐', '🎈', '🚗', '⚽', '🧁', '🌼', '🚌'];

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const DIFFICULTY_CONFIG = {
  easy: {
    label: 'Easy',
    countingMin: 1,
    countingMax: 5,
    placeMin: 10,
    placeMax: 29,
    wordMin: 1,
    wordMax: 20,
    sequenceMin: 1,
    sequenceMax: 30,
    sequenceLength: 3,
    sequenceDirections: ['smallToBig'],
    optionSpread: 2,
  },
  normal: {
    label: 'Normal',
    countingMin: 6,
    countingMax: 12,
    placeMin: 30,
    placeMax: 69,
    wordMin: 21,
    wordMax: 60,
    sequenceMin: 10,
    sequenceMax: 60,
    sequenceLength: 4,
    sequenceDirections: ['smallToBig', 'bigToSmall'],
    optionSpread: 4,
  },
  challenge: {
    label: 'Challenge',
    countingMin: 10,
    countingMax: 18,
    placeMin: 70,
    placeMax: 99,
    wordMin: 61,
    wordMax: 99,
    sequenceMin: 20,
    sequenceMax: 99,
    sequenceLength: 5,
    sequenceDirections: ['smallToBig', 'bigToSmall'],
    optionSpread: 6,
    clusteredSequence: true,
  },
};

const getDifficultyConfig = (difficulty) =>
  DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.normal;

const uniqueNumbers = (count, min, max) => {
  const numbers = new Set();
  while (numbers.size < count) {
    numbers.add(randomInt(min, max));
  }
  return [...numbers];
};

export const shuffle = (items) =>
  [...items].sort(() => Math.random() - 0.5);

export const numberToWords = (number) => {
  if (number < 20) {
    return ONES[number];
  }

  const tens = Math.floor(number / 10);
  const ones = number % 10;

  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
};

const multipleChoiceOptions = (answer, min, max, count = 4, spread = 4) => {
  const options = new Set([answer]);
  let attempts = 0;

  while (options.size < count && attempts < 40) {
    attempts += 1;
    const offset = randomInt(-spread, spread);
    const candidate = Math.min(max, Math.max(min, answer + offset));
    if (candidate !== answer) {
      options.add(candidate);
    }
  }

  while (options.size < count) {
    options.add(randomInt(min, max));
  }

  return shuffle([...options]);
};

const placeValueOptions = (number) => {
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  const candidates = new Map();

  const add = (t, o) => {
    const safeTens = Math.max(1, Math.min(9, t));
    const safeOnes = Math.max(0, Math.min(9, o));
    candidates.set(`${safeTens}-${safeOnes}`, {
      label: `${safeTens} tens and ${safeOnes} ones`,
      tens: safeTens,
      ones: safeOnes,
    });
  };

  add(tens, ones);
  add(tens + 1, ones);
  add(tens, ones + 1);
  add(Math.max(1, tens - 1), Math.max(0, ones - 1));

  while (candidates.size < 4) {
    add(randomInt(1, 9), randomInt(0, 9));
  }

  return shuffle([...candidates.values()]).slice(0, 4);
};

const wordOptions = (answer, config) => {
  const correctWord = numberToWords(answer);
  const options = new Set([correctWord]);
  let attempts = 0;

  while (options.size < 4 && attempts < 40) {
    attempts += 1;
    const candidate = config.clusteredSequence
      ? Math.min(
          config.wordMax,
          Math.max(config.wordMin, answer + randomInt(-config.optionSpread, config.optionSpread))
        )
      : randomInt(config.wordMin, config.wordMax);

    if (candidate !== answer) {
      options.add(numberToWords(candidate));
    }
  }

  while (options.size < 4) {
    options.add(numberToWords(randomInt(config.wordMin, config.wordMax)));
  }

  return shuffle([...options]);
};

const sequenceNumbers = (config) => {
  if (!config.clusteredSequence) {
    return uniqueNumbers(config.sequenceLength, config.sequenceMin, config.sequenceMax);
  }

  const clusterMax = Math.max(config.sequenceMin, config.sequenceMax - 12);
  const base = randomInt(config.sequenceMin, clusterMax);
  return uniqueNumbers(
    config.sequenceLength,
    base,
    Math.min(config.sequenceMax, base + 12)
  );
};

export const generateQuestion = (topicId, difficulty = 'normal') => {
  const config = getDifficultyConfig(difficulty);

  if (topicId === 'counting') {
    const answer = randomInt(config.countingMin, config.countingMax);
    const object = OBJECTS[randomInt(0, OBJECTS.length - 1)];

    return {
      type: 'choice',
      topicId,
      prompt: 'How many objects do you see?',
      helper: `${config.label}: count ${config.countingMin}-${config.countingMax} objects, then tap the number.`,
      answer,
      display: {
        kind: 'objects',
        object,
        count: answer,
      },
      options: multipleChoiceOptions(
        answer,
        config.countingMin,
        config.countingMax,
        4,
        config.optionSpread
      ),
      hint: 'Touch each object with your finger and say one number for each object.',
      correctText: 'Great counting!',
      wrongText: `Try again. There are ${answer} objects.`,
    };
  }

  if (topicId === 'placeValue') {
    const answer = randomInt(config.placeMin, config.placeMax);
    const tens = Math.floor(answer / 10);
    const ones = answer % 10;

    return {
      type: 'choice',
      topicId,
      prompt: `What does ${answer} show?`,
      helper: `${config.label}: read a number from ${config.placeMin}-${config.placeMax} as tens and ones.`,
      answer: `${tens} tens and ${ones} ones`,
      display: {
        kind: 'placeValue',
        number: answer,
        tens,
        ones,
      },
      options: placeValueOptions(answer).map((item) => item.label),
      hint: `Look at the first digit for tens and the second digit for ones.`,
      correctText: 'Nice! You found the tens and ones.',
      wrongText: `${answer} has ${tens} tens and ${ones} ones.`,
    };
  }

  if (topicId === 'numberWords') {
    const answer = randomInt(config.wordMin, config.wordMax);
    const correctWord = numberToWords(answer);

    return {
      type: 'choice',
      topicId,
      prompt: `Which word says ${answer}?`,
      helper: `${config.label}: match numbers from ${config.wordMin}-${config.wordMax} to their words.`,
      answer: correctWord,
      display: {
        kind: 'bigNumber',
        number: answer,
      },
      options: wordOptions(answer, config),
      hint: `The word starts with "${correctWord[0].toUpperCase()}".`,
      correctText: 'Excellent reading!',
      wrongText: `${answer} is written as "${correctWord}".`,
    };
  }

  const direction =
    config.sequenceDirections[randomInt(0, config.sequenceDirections.length - 1)];
  const numbers = sequenceNumbers(config);
  const answer =
    direction === 'smallToBig'
      ? [...numbers].sort((a, b) => a - b)
      : [...numbers].sort((a, b) => b - a);

  return {
    type: 'sequence',
    topicId,
    prompt:
      direction === 'smallToBig'
        ? 'Tap the numbers from smallest to biggest.'
        : 'Tap the numbers from biggest to smallest.',
    helper: `${config.label}: order ${config.sequenceLength} numbers from ${config.sequenceMin}-${config.sequenceMax}.`,
    answer,
    display: {
      kind: 'sequence',
      direction,
    },
    options: shuffle(numbers),
    hint:
      direction === 'smallToBig'
        ? 'Find the smallest number first, then keep choosing the next bigger number.'
        : 'Find the biggest number first, then keep choosing the next smaller number.',
    correctText: 'Perfect order!',
    wrongText: `The correct order is ${answer.join(', ')}.`,
  };
};
