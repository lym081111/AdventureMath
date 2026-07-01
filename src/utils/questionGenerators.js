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
    countingMax: 5,
    placeMin: 10,
    placeMax: 30,
    wordMax: 20,
    sequenceMax: 30,
  },
  normal: {
    countingMax: 9,
    placeMin: 10,
    placeMax: 60,
    wordMax: 50,
    sequenceMax: 60,
  },
  challenge: {
    countingMax: 9,
    placeMin: 10,
    placeMax: 99,
    wordMax: 99,
    sequenceMax: 99,
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

const multipleChoiceOptions = (answer, min, max, count = 4) => {
  const options = new Set([answer]);

  while (options.size < count) {
    const offset = randomInt(-4, 4);
    const candidate = Math.min(max, Math.max(min, answer + offset));
    if (candidate !== answer) {
      options.add(candidate);
    }
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

export const generateQuestion = (topicId, difficulty = 'normal') => {
  const config = getDifficultyConfig(difficulty);

  if (topicId === 'counting') {
    const answer = randomInt(1, config.countingMax);
    const object = OBJECTS[randomInt(0, OBJECTS.length - 1)];

    return {
      type: 'choice',
      topicId,
      prompt: 'How many objects do you see?',
      helper: 'Count slowly, then tap the number.',
      answer,
      display: {
        kind: 'objects',
        object,
        count: answer,
      },
      options: multipleChoiceOptions(answer, 1, config.countingMax),
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
      helper: 'A ten is one full group. Ones are single pieces.',
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
    const answer = randomInt(1, config.wordMax);
    const correctWord = numberToWords(answer);
    const options = new Set([correctWord]);

    while (options.size < 4) {
      options.add(numberToWords(randomInt(1, config.wordMax)));
    }

    return {
      type: 'choice',
      topicId,
      prompt: `Which word says ${answer}?`,
      helper: 'Read each card and choose the matching word.',
      answer: correctWord,
      display: {
        kind: 'bigNumber',
        number: answer,
      },
      options: shuffle([...options]),
      hint: `The word starts with "${correctWord[0].toUpperCase()}".`,
      correctText: 'Excellent reading!',
      wrongText: `${answer} is written as "${correctWord}".`,
    };
  }

  const direction = Math.random() > 0.5 ? 'smallToBig' : 'bigToSmall';
  const numbers = uniqueNumbers(4, 1, config.sequenceMax);
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
    helper: 'Tap one card at a time to build the row.',
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
