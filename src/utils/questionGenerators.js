const OBJECT_DETAILS = [
  { emoji: '🍎', plural: 'apples', place: 'orchard basket' },
  { emoji: '🍐', plural: 'pears', place: 'orchard basket' },
  { emoji: '🍓', plural: 'strawberries', place: 'berry patch' },
  { emoji: '🍒', plural: 'cherries', place: 'tree basket' },
];

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

const pick = (items) => items[randomInt(0, items.length - 1)];

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
    wordPairCount: 2,
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
    wordPairCount: 3,
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
    wordPairCount: 3,
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

const visualObjectOptions = (answer, object, config) =>
  multipleChoiceOptions(
    answer,
    config.countingMin,
    config.countingMax,
    4,
    config.optionSpread
  ).map((count) => ({
    id: `objects-${count}`,
    kind: 'objectGroup',
    count,
    object,
  }));

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

const visualPlaceValueOptions = (number) =>
  placeValueOptions(number).map(({ tens, ones }) => ({
    count: tens * 10 + ones,
    id: `machine-${tens}-${ones}`,
    kind: 'placeMachine',
    ones,
    tens,
  }));

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

const wordPairCards = (config) => {
  const numbers = uniqueNumbers(
    config.wordPairCount,
    config.wordMin,
    config.wordMax
  );
  const cards = numbers.flatMap((number) => [
    {
      cardType: 'number',
      id: `number-${number}`,
      kind: 'matchCard',
      label: String(number),
      pairId: String(number),
    },
    {
      cardType: 'word',
      id: `word-${number}`,
      kind: 'matchCard',
      label: numberToWords(number),
      pairId: String(number),
    },
  ]);

  return {
    cards: shuffle(cards),
    pairs: numbers.map((number) => ({
      number,
      word: numberToWords(number),
    })),
  };
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
    const objectDetail = pick(OBJECT_DETAILS);
    const object = objectDetail.emoji;

    if (Math.random() < 0.24) {
      const capacity = answer <= 10 ? 10 : 20;

      return {
        type: 'tenFrame',
        interaction: 'tenFrame',
        topicId,
        gameLabel: 'Pack the ten-frame tray',
        prompt: pick([
          `Pack exactly ${answer} ${objectDetail.plural} for Nova's picnic.`,
          `Nova's tray needs ${answer} ${objectDetail.plural}. Fill the spaces.`,
          `Can you build ${answer} with ${objectDetail.plural} in the counting frames?`,
        ]),
        helper: `${config.label}: tap a space to add or remove one item, then check the tray.`,
        answer,
        display: {
          capacity,
          kind: 'tenFrameTarget',
          number: answer,
          object,
          plural: objectDetail.plural,
        },
        options: [],
        hint: `Fill one row from left to right. Stop when the tray count reaches ${answer}.`,
        correctText: 'Picnic tray packed. Every space was counted!',
        wrongText: `The tray needs ${answer} ${objectDetail.plural}. Count the filled spaces once more.`,
      };
    }

    if (Math.random() < 0.28) {
      let secondCount = randomInt(config.countingMin, config.countingMax);
      while (secondCount === answer) {
        secondCount = randomInt(config.countingMin, config.countingMax);
      }

      const findMore = Math.random() < 0.5;
      const leftCount = answer;
      const rightCount = secondCount;
      const answerSide =
        (findMore && leftCount > rightCount) || (!findMore && leftCount < rightCount)
          ? 'Left basket'
          : 'Right basket';

      return {
        type: 'choice',
        topicId,
        gameLabel: findMore ? 'Spot the bigger basket' : 'Spot the smaller basket',
        prompt: findMore
          ? `Nova can only carry one basket. Which basket has more ${objectDetail.plural}?`
          : `Nova needs the lighter basket. Which basket has fewer ${objectDetail.plural}?`,
        helper: `${config.label}: count both baskets, then compare the two totals.`,
        answer: answerSide,
        display: {
          kind: 'compareObjects',
          object,
          leftCount,
          rightCount,
          goal: findMore ? 'more' : 'fewer',
        },
        options: shuffle(['Left basket', 'Right basket']),
        hint: `Count each basket once. ${findMore ? 'Choose the bigger total.' : 'Choose the smaller total.'}`,
        correctText: 'Great spotting. Nova picked the right basket!',
        wrongText: `Count both baskets again, then find the ${findMore ? 'bigger' : 'smaller'} total.`,
      };
    }

    if (Math.random() < 0.5) {
      return {
        type: 'choice',
        topicId,
        gameLabel: 'Pack the right basket',
        prompt: pick([
          `Nova needs ${answer} ${objectDetail.plural} for the orchard basket. Which picture should Nova pack?`,
          `The orchard basket needs ${answer} ${objectDetail.plural}. Choose the matching picture.`,
          `Which basket has exactly ${answer} ${objectDetail.plural}?`,
        ]),
        helper: `${config.label}: count each group once, then choose the exact match.`,
        answer,
        display: {
          kind: 'targetNumber',
          number: answer,
          object,
          plural: objectDetail.plural,
        },
        options: visualObjectOptions(answer, object, config),
        hint: `Point to every picture item as you count. Look for exactly ${answer}.`,
        correctText: 'Perfect. Nova packed the right orchard basket!',
        wrongText: `Try again. The basket needs exactly ${answer} ${objectDetail.plural}.`,
      };
    }

    return {
      type: 'choice',
      topicId,
      gameLabel: 'Orchard count-up',
      prompt: pick([
        `Nova found these ${objectDetail.plural} in the ${objectDetail.place}. How many are there?`,
        `Count the ${objectDetail.plural} before Nova packs them for the journey.`,
        `Nova picked these ${objectDetail.plural}. What number belongs on the basket label?`,
      ]),
      helper: `${config.label}: count from left to right, then choose the matching number.`,
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
      hint: 'Touch each picture item once as you count so none are counted twice.',
      correctText: 'Great counting. Nova can pack the orchard basket!',
      wrongText: `Try again. There are ${answer} ${objectDetail.plural}.`,
    };
  }

  if (topicId === 'placeValue') {
    const answer = randomInt(config.placeMin, config.placeMax);
    const tens = Math.floor(answer / 10);
    const ones = answer % 10;
    const workshopMode = Math.random();

    if (workshopMode < 0.28) {
      return {
        type: 'choice',
        interaction: 'choice',
        topicId,
        gameLabel: 'Read the workshop machine',
        prompt: pick([
          'Nova\'s workshop blocks made this number. What does it read?',
          'Read the tens blocks and single sparks. Which number did Nova make?',
          'The number machine is ready. What total has it built?',
        ]),
        helper: `${config.label}: tens blocks are groups of ten; single sparks are ones.`,
        answer,
        display: {
          kind: 'placeValue',
          number: answer,
          tens,
          ones,
          showNumber: false,
        },
        options: multipleChoiceOptions(
          answer,
          config.placeMin,
          config.placeMax,
          4,
          config.optionSpread * 2
        ),
        hint: `${tens} blocks make ${tens * 10}; then add ${ones} single sparks.`,
        correctText: 'Workshop machine fixed. That is the right number!',
        wrongText: `${tens} tens and ${ones} ones make ${answer}.`,
      };
    }

    if (workshopMode < 0.52) {
      return {
        type: 'choice',
        interaction: 'choice',
        topicId,
        gameLabel: 'Choose the right machine',
        prompt: `Nova needs a machine that makes ${answer}. Which machine has the right parts?`,
        helper: `${config.label}: each blue rod is 10 and each gold gem is 1.`,
        answer,
        display: {
          kind: 'workshopTarget',
          number: answer,
        },
        options: visualPlaceValueOptions(answer),
        hint: `Look for ${tens} blue rods and ${ones} gold gems.`,
        correctText: 'That machine has exactly the right parts!',
        wrongText: `${answer} needs ${tens} tens and ${ones} ones.`,
      };
    }

    if (workshopMode < 0.75) {
      const missingPart = Math.random() < 0.5 ? 'tens' : 'ones';
      const missingAnswer = missingPart === 'tens' ? tens : ones;

      return {
        type: 'choice',
        interaction: 'choice',
        topicId,
        gameLabel: 'Find the missing part',
        prompt:
          missingPart === 'tens'
            ? `The machine must make ${answer}. How many tens rods are missing?`
            : `The machine must make ${answer}. How many single gems are missing?`,
        helper: `${config.label}: use the target number and the part already shown.`,
        answer: missingAnswer,
        display: {
          kind: 'workshopMissing',
          missingPart,
          number: answer,
          ones,
          tens,
        },
        options: multipleChoiceOptions(missingAnswer, 0, 9, 4, 3),
        hint:
          missingPart === 'tens'
            ? `The first digit in ${answer} tells you the tens.`
            : `The last digit in ${answer} tells you the ones.`,
        correctText: 'Missing part found. The machine is complete!',
        wrongText: `${answer} has ${tens} tens and ${ones} ones.`,
      };
    }

    return {
      type: 'builder',
      interaction: 'builder',
      topicId,
      gameLabel: 'Power the number machine',
      prompt: pick([
        `Tap the parts that make ${answer}.`,
        `Nova's machine needs ${answer}. Load the right parts.`,
        `Power the workshop machine to exactly ${answer}.`,
      ]),
      helper: `${config.label}: tap ADD TEN for a rod or ADD ONE for a gem.`,
      answer: `${tens} tens and ${ones} ones`,
      display: {
        kind: 'workshopTarget',
        number: answer,
        tens,
        ones,
      },
      options: placeValueOptions(answer).map((item) => item.label),
      hint: `For ${answer}, use ${tens} tens and ${ones} ones.`,
      correctText: 'Perfect build. The workshop machine is running!',
      wrongText: `${answer} has ${tens} tens and ${ones} ones.`,
    };
  }

  if (topicId === 'numberWords') {
    const answer = randomInt(config.wordMin, config.wordMax);
    const correctWord = numberToWords(answer);

    if (Math.random() < 0.3) {
      const { cards, pairs } = wordPairCards(config);

      return {
        type: 'pairs',
        interaction: 'pairs',
        topicId,
        gameLabel: 'Bloom the matching flowers',
        prompt: 'Match every number seed with the word flower that says its name.',
        helper: `${config.label}: choose one number and one word. A correct pair stays in bloom.`,
        answer: pairs.map((pair) => String(pair.number)),
        display: {
          kind: 'wordPairs',
          pairCount: pairs.length,
          pairs,
        },
        options: cards,
        hint: 'Say the number aloud, then look for the word that sounds the same.',
        correctText: 'Every word flower is blooming!',
        wrongText: 'Those two cards do not name the same number. Look at each digit and say the word slowly.',
      };
    }

    if (Math.random() < 0.5) {
      return {
        type: 'choice',
        topicId,
        gameLabel: 'Read the garden label',
        prompt: pick([
          `A flower label reads "${correctWord}". Which number seed should Nova plant?`,
          `Nova found a garden label saying "${correctWord}". Find the matching number.`,
          `Read the word on the seed packet: "${correctWord}". Which number does it name?`,
        ]),
        helper: `${config.label}: say the word slowly, then choose its number.`,
        answer,
        display: {
          kind: 'word',
          word: correctWord,
        },
        options: multipleChoiceOptions(
          answer,
          config.wordMin,
          config.wordMax,
          4,
          config.optionSpread
        ),
        hint: `Say "${correctWord}" slowly, then find the number it names.`,
        correctText: 'The flower blooms. Excellent matching!',
        wrongText: `"${correctWord}" means ${answer}.`,
      };
    }

    return {
      type: 'choice',
      topicId,
      gameLabel: 'Grow a word flower',
      prompt: pick([
        `Nova\'s flower bed is marked ${answer}. Which word belongs on its label?`,
        `The garden label says ${answer}. Choose the word that reads it.`,
        `Find the word label for ${answer} before Nova plants the seed.`,
      ]),
      helper: `${config.label}: read the number, then choose the word that says it.`,
      answer: correctWord,
      display: {
        kind: 'bigNumber',
        number: answer,
      },
      options: wordOptions(answer, config),
      hint: `The answer begins with "${correctWord[0].toUpperCase()}". Say the full word before you choose.`,
      correctText: 'Excellent reading. Nova found the right spell!',
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
    gameLabel: 'Set the comet route',
    prompt:
      direction === 'smallToBig'
        ? pick([
            'Guide Nova\'s star trail from smallest to biggest.',
            'Put the comet path in order: smallest to biggest.',
            'Help Nova climb the number ladder from smallest to biggest.',
          ])
        : pick([
            'Guide Nova\'s star trail from biggest to smallest.',
            'Bring the comet path down: biggest to smallest.',
            'Help Nova climb down the number ladder from biggest to smallest.',
          ]),
    helper: `${config.label}: tap ${config.sequenceLength} numbers in the correct order.`,
    answer,
    display: {
      kind: 'sequence',
      direction,
    },
    options: shuffle(numbers),
    hint:
      direction === 'smallToBig'
        ? 'Find the smallest number first, then choose the next bigger number.'
        : 'Find the biggest number first, then choose the next smaller number.',
    correctText: 'Perfect order. Nova followed your trail!',
    wrongText: `The correct order is ${answer.join(', ')}.`,
  };
};
