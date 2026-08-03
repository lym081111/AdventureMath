import { readFile } from 'node:fs/promises';

const generatorPath = new URL('../src/utils/questionGenerators.js', import.meta.url);
const source = await readFile(generatorPath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { generateQuestion } = await import(moduleUrl);

const topics = ['counting', 'placeValue', 'numberWords', 'sequence'];
const difficulties = ['easy', 'normal', 'challenge'];
const samplesPerCombination = 500;

const assert = (condition, message, question) => {
  if (!condition) {
    const context = question ? `\n${JSON.stringify(question, null, 2)}` : '';
    throw new Error(`${message}${context}`);
  }
};

const optionValue = (option) =>
  typeof option === 'object' && option !== null ? option.count : option;

let validated = 0;
const typeCounts = new Map();

for (const topic of topics) {
  for (const difficulty of difficulties) {
    for (let index = 0; index < samplesPerCombination; index += 1) {
      const question = generateQuestion(topic, difficulty);
      const typeKey = `${topic}:${question.display.kind}`;
      typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);

      assert(question.topicId === topic, 'Question topic does not match the request.', question);
      assert(question.prompt && question.helper, 'Question copy is incomplete.', question);
      assert(question.display?.kind, 'Question display kind is missing.', question);

      if (question.type === 'choice') {
        const values = question.options.map(optionValue);
        assert(values.includes(question.answer), 'Choice answer is missing from its options.', question);
        assert(new Set(values).size === values.length, 'Choice options contain duplicate answers.', question);
      }

      if (question.type === 'sequence') {
        assert(
          question.answer.length === question.options.length,
          'Sequence answer and option lengths differ.',
          question
        );
        assert(
          question.answer.every((value) => question.options.includes(value)),
          'Sequence answer contains an unavailable number.',
          question
        );
      }

      if (question.type === 'tenFrame') {
        assert(
          question.display.kind === 'tenFrameTarget',
          'Ten-frame question has the wrong display kind.',
          question
        );
        assert(
          question.answer > 0 && question.answer <= question.display.capacity,
          'Ten-frame answer does not fit its frame capacity.',
          question
        );
      }

      if (question.type === 'pairs') {
        const pairIds = question.options.map((option) => option.pairId);
        const cardIds = question.options.map((option) => option.id);
        const uniquePairIds = new Set(pairIds);

        assert(
          question.display.kind === 'wordPairs',
          'Matching question has the wrong display kind.',
          question
        );
        assert(
          question.options.length === question.display.pairCount * 2,
          'Matching question does not contain two cards per pair.',
          question
        );
        assert(
          uniquePairIds.size === question.display.pairCount,
          'Matching question contains the wrong number of pairs.',
          question
        );
        assert(
          new Set(cardIds).size === cardIds.length,
          'Matching question contains duplicate card IDs.',
          question
        );
        uniquePairIds.forEach((pairId) => {
          const pairCards = question.options.filter((option) => option.pairId === pairId);
          assert(
            pairCards.length === 2 && new Set(pairCards.map((option) => option.cardType)).size === 2,
            'Matching pair must contain one number and one word card.',
            question
          );
        });
      }

      if (question.display.kind === 'workshopMissing') {
        const expected =
          question.display.missingPart === 'tens'
            ? question.display.tens
            : question.display.ones;
        assert(question.answer === expected, 'Workshop missing-part answer is inconsistent.', question);
      }

      if (question.display.kind === 'workshopTarget' && question.type === 'builder') {
        const expected = `${question.display.tens} tens and ${question.display.ones} ones`;
        assert(question.answer === expected, 'Workshop builder answer is inconsistent.', question);
        assert(
          question.display.tens * 10 + question.display.ones === question.display.number,
          'Workshop target does not equal its tens and ones.',
          question
        );
      }

      if (question.options?.some((option) => option?.kind === 'placeMachine')) {
        question.options.forEach((option) => {
          assert(
            option.count === option.tens * 10 + option.ones,
            'Visual machine option has an invalid total.',
            question
          );
        });
      }

      if (topic === 'sequence') {
        assert(
          question.type === 'sequence' && question.display.kind === 'sequence',
          'Comet Track must only generate direct number-ordering questions.',
          question
        );
      }

      validated += 1;
    }
  }
}

console.log(`Validated ${validated} generated questions.`);
console.log(
  [...typeCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}=${count}`)
    .join('\n')
);
