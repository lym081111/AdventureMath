import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  StatusBar as NativeStatusBar,
} from 'react-native';

import {
  DIFFICULTY_LEVELS,
  HEARTS_PER_ROUND,
  ROUND_SIZE,
  TOPICS,
  XP_PER_CORRECT,
} from './src/data/topics';
import { generateQuestion } from './src/utils/questionGenerators';

const MAX_MISTAKES = 12;
const APP_VERSION = '1.1.0';
const STORAGE_KEY = '@math-adventure/progress-v1';
const ANDROID_TOP_INSET =
  Platform.OS === 'android' ? Math.max(NativeStatusBar.currentHeight || 0, 44) : 0;

const getQuestionKey = (question) =>
  `${question.topicId}-${question.prompt}-${JSON.stringify(question.answer)}-${JSON.stringify(question.display)}`;

const getTopicAccuracy = (stats) =>
  stats.answered === 0 ? 0 : Math.round((stats.correct / stats.answered) * 100);

const getTopicStats = (stats, topicId) =>
  stats[topicId] || { answered: 0, correct: 0 };

const isTopicUnlocked = (index, stats) =>
  index === 0 || getTopicStats(stats, TOPICS[index - 1].id).correct >= 3;

const getTopicUnlockText = (index) =>
  index === 0 ? 'Ready now' : `Earn 3 stars in ${TOPICS[index - 1].mapLabel}`;

const getNextDifficulty = (difficultyId) => {
  const currentIndex = DIFFICULTY_LEVELS.findIndex(
    (level) => level.id === difficultyId
  );

  return currentIndex >= 0 && currentIndex < DIFFICULTY_LEVELS.length - 1
    ? DIFFICULTY_LEVELS[currentIndex + 1]
    : null;
};

const getRecommendedQuest = (stats) => {
  const topicRows = TOPICS.map((topic, index) => {
    const topicStats = getTopicStats(stats, topic.id);

    return {
      ...topic,
      accuracy: getTopicAccuracy(topicStats),
      answered: topicStats.answered,
      correct: topicStats.correct,
      unlocked: isTopicUnlocked(index, stats),
    };
  });
  const firstNewQuest = topicRows.find(
    (topic) => topic.unlocked && topic.answered === 0
  );

  if (firstNewQuest) {
    return {
      topic: firstNewQuest,
      reason: 'New quest ready',
      detail: 'Start here to keep the adventure moving.',
    };
  }

  const attemptedTopics = topicRows.filter(
    (topic) => topic.unlocked && topic.answered > 0
  );
  const weakestTopic = attemptedTopics.reduce(
    (weakest, topic) =>
      !weakest || topic.accuracy < weakest.accuracy ? topic : weakest,
    null
  );

  if (weakestTopic) {
    return {
      topic: weakestTopic,
      reason: 'Practice target',
      detail: 'A short retry here can lift your score quickly.',
    };
  }

  return {
    topic: topicRows[0],
    reason: 'First mission',
    detail: 'Begin with counting and unlock the next island.',
  };
};

const optionToSpeechText = (option) =>
  typeof option === 'number' ? String(option) : option;

const SOUND_FILES = {
  correct: require('./assets/sounds/correct.wav'),
  wrong: require('./assets/sounds/wrong.wav'),
  reward: require('./assets/sounds/reward.wav'),
};

export default function App() {
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [playMode, setPlayMode] = useState('topic');
  const [difficulty, setDifficulty] = useState('normal');
  const [question, setQuestion] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [sequence, setSequence] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTeacherSummary, setShowTeacherSummary] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [mistakes, setMistakes] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [round, setRound] = useState({
    answered: 0,
    correct: 0,
    hearts: HEARTS_PER_ROUND,
  });
  const [stats, setStats] = useState({});

  useEffect(() => {
    let isMounted = true;

    const loadSavedProgress = async () => {
      try {
        const savedValue = await AsyncStorage.getItem(STORAGE_KEY);

        if (!savedValue || !isMounted) {
          return;
        }

        const saved = JSON.parse(savedValue);

        if (saved.stats && typeof saved.stats === 'object') {
          setStats(saved.stats);
        }

        if (Array.isArray(saved.mistakes)) {
          setMistakes(saved.mistakes.slice(0, MAX_MISTAKES));
        }

        if (DIFFICULTY_LEVELS.some((level) => level.id === saved.difficulty)) {
          setDifficulty(saved.difficulty);
        }

        if (typeof saved.soundEnabled === 'boolean') {
          setSoundEnabled(saved.soundEnabled);
        }

        if (typeof saved.speechEnabled === 'boolean') {
          setSpeechEnabled(saved.speechEnabled);
        }
      } catch {
        // Saved data should never block a child from starting the activity.
      } finally {
        if (isMounted) {
          setStorageReady(true);
        }
      }
    };

    loadSavedProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const saveProgress = async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            difficulty,
            mistakes,
            soundEnabled,
            speechEnabled,
            stats,
          })
        );
      } catch {
        // Progress saving is helpful, but the quiz should remain playable.
      }
    };

    saveProgress();
  }, [difficulty, mistakes, soundEnabled, speechEnabled, stats, storageReady]);

  const activeTopic = useMemo(
    () => TOPICS.find((topic) => topic.id === activeTopicId),
    [activeTopicId]
  );

  const totals = useMemo(() => {
    return Object.values(stats).reduce(
      (sum, item) => ({
        answered: sum.answered + item.answered,
        correct: sum.correct + item.correct,
        xp: sum.xp + item.correct * XP_PER_CORRECT,
      }),
      { answered: 0, correct: 0, xp: 0 }
    );
  }, [stats]);

  const teacherSummary = useMemo(() => {
    const topicRows = TOPICS.map((topic) => {
      const topicStats = getTopicStats(stats, topic.id);
      return {
        ...topic,
        answered: topicStats.answered,
        correct: topicStats.correct,
        accuracy: getTopicAccuracy(topicStats),
        unlocked: topicStats.correct >= 3,
      };
    });
    const attemptedTopics = topicRows.filter((topic) => topic.answered > 0);
    const bestTopic = attemptedTopics.reduce(
      (best, topic) => (!best || topic.accuracy > best.accuracy ? topic : best),
      null
    );
    const needsPractice = attemptedTopics.reduce(
      (weakest, topic) =>
        !weakest || topic.accuracy < weakest.accuracy ? topic : weakest,
      null
    );

    return {
      accuracy:
        totals.answered === 0
          ? 0
          : Math.round((totals.correct / totals.answered) * 100),
      badgesUnlocked: topicRows.filter((topic) => topic.unlocked).length,
      bestTopic,
      needsPractice,
      topicRows,
    };
  }, [stats, totals.answered, totals.correct]);

  const recommendedQuest = useMemo(
    () => getRecommendedQuest(stats),
    [stats]
  );

  const startTopic = (topicId, selectedDifficulty = difficulty) => {
    Speech.stop();
    setDifficulty(selectedDifficulty);
    setActiveTopicId(topicId);
    setPlayMode('topic');
    setRound({ answered: 0, correct: 0, hearts: HEARTS_PER_ROUND });
    setQuestion(generateQuestion(topicId, selectedDifficulty));
    setSelectedChoice(null);
    setSequence([]);
    setFeedback(null);
    setShowHint(false);
  };

  const playSound = async (kind) => {
    if (!soundEnabled) {
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(SOUND_FILES[kind]);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      // Sound effects are decorative; gameplay should continue if audio fails.
    }
  };

  const resetProgress = () => {
    Speech.stop();
    setStats({});
    setMistakes([]);
    setRound({ answered: 0, correct: 0, hearts: HEARTS_PER_ROUND });
    setFeedback(null);
    setSelectedChoice(null);
    setSequence([]);
    setShowHint(false);
    setShowSettings(false);
  };

  const startMistakeReview = () => {
    if (mistakes.length === 0) {
      return;
    }

    Speech.stop();
    setActiveTopicId(mistakes[0].topicId);
    setPlayMode('review');
    setRound({ answered: 0, correct: 0, hearts: HEARTS_PER_ROUND });
    setQuestion(mistakes[0]);
    setSelectedChoice(null);
    setSequence([]);
    setFeedback(null);
    setShowHint(false);
  };

  const goHome = () => {
    Speech.stop();
    setActiveTopicId(null);
    setPlayMode('topic');
    setQuestion(null);
    setSelectedChoice(null);
    setSequence([]);
    setFeedback(null);
    setShowHint(false);
  };

  const recordAnswer = (isCorrect, correctText, wrongText) => {
    const nextRound = {
      answered: round.answered + 1,
      correct: round.correct + (isCorrect ? 1 : 0),
      hearts: isCorrect ? round.hearts : Math.max(0, round.hearts - 1),
    };

    setRound(nextRound);
    setStats((current) => {
      const topicStats = current[activeTopicId] || { answered: 0, correct: 0 };
      return {
        ...current,
        [activeTopicId]: {
          answered: topicStats.answered + 1,
          correct: topicStats.correct + (isCorrect ? 1 : 0),
        },
      };
    });

    if (isCorrect && playMode === 'review' && question) {
      const currentKey = getQuestionKey(question);
      setMistakes((current) =>
        current.filter((item) => getQuestionKey(item) !== currentKey)
      );
    }

    if (!isCorrect && question) {
      const savedQuestion = { ...question };
      const currentKey = getQuestionKey(savedQuestion);
      setMistakes((current) => {
        const withoutDuplicate = current.filter(
          (item) => getQuestionKey(item) !== currentKey
        );
        return [savedQuestion, ...withoutDuplicate].slice(0, MAX_MISTAKES);
      });
    }

    playSound(isCorrect ? 'correct' : 'wrong');

    setFeedback({
      isCorrect,
      title:
        isCorrect && playMode === 'review'
          ? 'Mistake cleared!'
          : isCorrect
            ? correctText
            : 'Good try!',
      detail: isCorrect
        ? `+${XP_PER_CORRECT} XP. Keep the streak glowing.`
        : wrongText,
      badge: isCorrect ? '★' : '↺',
    });
  };

  const submitChoice = (choice) => {
    if (feedback) {
      return;
    }

    setSelectedChoice(choice);
    recordAnswer(
      choice === question.answer,
      question.correctText,
      question.wrongText
    );
  };

  const tapSequenceNumber = (number) => {
    if (feedback || sequence.includes(number)) {
      return;
    }

    const nextSequence = [...sequence, number];
    setSequence(nextSequence);

    if (nextSequence.length === question.answer.length) {
      const isCorrect = nextSequence.every(
        (item, index) => item === question.answer[index]
      );
      recordAnswer(isCorrect, question.correctText, question.wrongText);
    }
  };

  const resetCurrentQuestion = () => {
    Speech.stop();
    if (feedback && !feedback.isCorrect) {
      setRound((current) => ({
        ...current,
        answered: Math.max(0, current.answered - 1),
        hearts: Math.min(HEARTS_PER_ROUND, current.hearts + 1),
      }));
      setStats((current) => {
        const topicStats = current[activeTopicId];
        if (!topicStats) {
          return current;
        }

        return {
          ...current,
          [activeTopicId]: {
            ...topicStats,
            answered: Math.max(0, topicStats.answered - 1),
          },
        };
      });
    }

    setSelectedChoice(null);
    setSequence([]);
    setFeedback(null);
    setShowHint(false);
  };

  const nextQuestion = () => {
    Speech.stop();
    if (round.answered >= ROUND_SIZE) {
      playSound('reward');
      setFeedback(null);
      return;
    }

    if (playMode === 'review') {
      const currentKey = question ? getQuestionKey(question) : null;
      const nextMistake =
        mistakes.find((item) => getQuestionKey(item) !== currentKey) ||
        mistakes[0];

      if (!nextMistake) {
        setRound((current) => ({ ...current, answered: ROUND_SIZE }));
        setSelectedChoice(null);
        setSequence([]);
        setFeedback(null);
        setShowHint(false);
        return;
      }

      setActiveTopicId(nextMistake.topicId);
      setQuestion(nextMistake);
    } else {
      setQuestion(generateQuestion(activeTopicId, difficulty));
    }

    setSelectedChoice(null);
    setSequence([]);
    setFeedback(null);
    setShowHint(false);
  };

  const speakQuestion = () => {
    if (!question || !speechEnabled) {
      return;
    }

    const optionText =
      question.type === 'choice'
        ? `Choices are: ${question.options.map(optionToSpeechText).join(', ')}.`
        : `Numbers are: ${question.options.join(', ')}.`;
    const speechText = `${question.prompt}. ${question.helper}. ${optionText}`;

    Speech.stop();
    Speech.speak(speechText, {
      language: 'en',
      pitch: 1.12,
      rate: 0.82,
    });
  };

  if (!activeTopicId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar backgroundColor="#13293D" style="light" translucent={false} />
        <ScrollView contentContainerStyle={styles.homeContainer}>
          <Hero
            mistakesCount={mistakes.length}
            onSettings={() => setShowSettings(true)}
            totals={totals}
          />
          <RecommendedQuestCard
            onPress={() => startTopic(recommendedQuest.topic.id)}
            quest={recommendedQuest}
          />
          <TeacherSummaryCard
            onPress={() => setShowTeacherSummary(true)}
            summary={teacherSummary}
            totals={totals}
          />
          <DifficultyPicker
            activeDifficulty={difficulty}
            onSelectDifficulty={setDifficulty}
          />
          <MistakeReviewCard
            mistakesCount={mistakes.length}
            onPress={startMistakeReview}
          />

          <Text style={styles.sectionLabel}>Quest Map</Text>
          <View style={styles.questMap}>
            {TOPICS.map((topic, index) => {
              const topicStats = getTopicStats(stats, topic.id);
              const unlocked = isTopicUnlocked(index, stats);
              const completed = topicStats.correct >= 3;
              const isRecommended = recommendedQuest.topic.id === topic.id;
              const progress =
                topicStats.answered === 0
                  ? 0
                  : Math.round((topicStats.correct / topicStats.answered) * 100);

              return (
                <QuestNode
                  key={topic.id}
                  index={index}
                  progress={progress}
                  topic={topic}
                  topicStats={topicStats}
                  unlocked={unlocked}
                  unlockText={getTopicUnlockText(index)}
                  completed={completed}
                  isRecommended={isRecommended}
                  onPress={unlocked ? () => startTopic(topic.id) : undefined}
                />
              );
            })}
          </View>
          <BadgeShelf stats={stats} />
        </ScrollView>
        <TeacherSummaryModal
          mistakesCount={mistakes.length}
          onClose={() => setShowTeacherSummary(false)}
          summary={teacherSummary}
          totals={totals}
          visible={showTeacherSummary}
        />
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onResetProgress={resetProgress}
          setSoundEnabled={setSoundEnabled}
          setSpeechEnabled={setSpeechEnabled}
          soundEnabled={soundEnabled}
          speechEnabled={speechEnabled}
          visible={showSettings}
        />
      </SafeAreaView>
    );
  }

  const roundComplete = round.answered >= ROUND_SIZE && !feedback;
  const activeDifficultyLevel =
    DIFFICULTY_LEVELS.find((level) => level.id === difficulty) ||
    DIFFICULTY_LEVELS[1];
  const activeTopicIndex = TOPICS.findIndex((topic) => topic.id === activeTopicId);
  const nextDifficulty = getNextDifficulty(difficulty);
  const nextTopic =
    activeTopicIndex >= 0 && activeTopicIndex < TOPICS.length - 1
      ? TOPICS[activeTopicIndex + 1]
      : null;
  const nextTopicUnlocked = nextTopic
    ? isTopicUnlocked(activeTopicIndex + 1, stats)
    : false;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#13293D" style="light" translucent={false} />
      <ScrollView contentContainerStyle={styles.practiceContainer}>
        <View style={styles.practiceTopBar}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={goHome}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowSettings(true)}
            style={styles.practiceSettingsButton}
          >
            <Text style={styles.practiceSettingsText}>⚙</Text>
          </TouchableOpacity>
          <View style={styles.heartsRow}>
            {Array.from({ length: HEARTS_PER_ROUND }).map((_, index) => (
              <Text
                key={index}
                style={[
                  styles.heart,
                  index >= round.hearts && styles.heartEmpty,
                ]}
              >
                ♥
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.progressShell}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, (round.answered / ROUND_SIZE) * 100)}%`,
                backgroundColor: activeTopic.color,
              },
            ]}
          />
        </View>

        <View
          style={[
            styles.missionCard,
            { backgroundColor: activeTopic.deepColor },
          ]}
        >
          <View style={styles.missionOrb}>
            <Text style={styles.missionIcon}>{activeTopic.icon}</Text>
          </View>
          <View style={styles.missionCopy}>
            <Text style={styles.missionEyebrow}>
              {playMode === 'review'
                ? 'Mistake review'
                : `${activeDifficultyLevel.label} - Stage ${round.answered + 1} of ${ROUND_SIZE}`}
            </Text>
            <Text style={styles.missionTitle}>{activeTopic.mapLabel}</Text>
            <Text style={styles.missionText}>{activeTopic.mission}</Text>
          </View>
        </View>

        {roundComplete ? (
          <RoundComplete
            activeTopic={activeTopic}
            currentDifficulty={difficulty}
            nextDifficulty={nextDifficulty}
            nextTopic={nextTopic}
            nextTopicUnlocked={nextTopicUnlocked}
            round={round}
            onHome={goHome}
            onNextDifficulty={() => startTopic(activeTopicId, nextDifficulty.id)}
            onNextTopic={() => startTopic(nextTopic.id, difficulty)}
            onReplay={() => startTopic(activeTopicId, difficulty)}
          />
        ) : (
          <>
            <QuestionDisplay question={question} topic={activeTopic} />

            <View style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <Text style={styles.challengeLabel}>Challenge</Text>
                <View style={styles.challengeTools}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={speakQuestion}
                    style={[
                      styles.speakButton,
                      !speechEnabled && styles.disabledToolButton,
                    ]}
                  >
                    <Text style={styles.speakButtonText}>Speak</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setShowHint(true)}
                    style={styles.hintButton}
                  >
                    <Text style={styles.hintButtonText}>Hint</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.questionPrompt}>{question.prompt}</Text>
              <Text style={styles.questionHelper}>{question.helper}</Text>

              {question.type === 'choice' ? (
                <View style={styles.optionsGrid}>
                  {question.options.map((option) => {
                    const isSelected = selectedChoice === option;
                    const isAnswer = option === question.answer;
                    const showCorrect = Boolean(feedback && isAnswer);
                    const showWrong = Boolean(feedback && isSelected && !feedback.isCorrect);

                    return (
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={Boolean(feedback)}
                        key={String(option)}
                        onPress={() => submitChoice(option)}
                        style={[
                          styles.optionButton,
                          isSelected && !feedback && {
                            borderColor: activeTopic.color,
                            backgroundColor: activeTopic.softColor,
                          },
                          showCorrect && styles.optionButtonCorrect,
                          showWrong && styles.optionButtonWrong,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            showCorrect && styles.optionTextCorrect,
                            showWrong && styles.optionTextWrong,
                          ]}
                        >
                          {option}
                        </Text>
                        {(showCorrect || showWrong) && (
                          <Text
                            style={[
                              styles.optionResultTag,
                              showWrong && styles.optionResultTagWrong,
                            ]}
                          >
                            {showCorrect ? 'Correct' : 'Try again'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <SequenceBuilder
                  question={question}
                  sequence={sequence}
                  onTapNumber={tapSequenceNumber}
                  topic={activeTopic}
                />
              )}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={resetCurrentQuestion}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={nextQuestion}
                style={[
                  styles.primaryButton,
                  { backgroundColor: activeTopic.color },
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {round.answered >= ROUND_SIZE ? 'See Reward' : 'Next Quest'}
                </Text>
              </TouchableOpacity>
            </View>
            <AnswerPopup
              feedback={feedback}
              onNext={nextQuestion}
              onRetry={resetCurrentQuestion}
              topic={activeTopic}
            />
            <HintPopup
              hint={question.hint}
              onClose={() => setShowHint(false)}
              topic={activeTopic}
              visible={showHint}
            />
          </>
        )}
      </ScrollView>
      <SettingsModal
        onClose={() => setShowSettings(false)}
        onResetProgress={resetProgress}
        setSoundEnabled={setSoundEnabled}
        setSpeechEnabled={setSpeechEnabled}
        soundEnabled={soundEnabled}
        speechEnabled={speechEnabled}
        visible={showSettings}
      />
    </SafeAreaView>
  );
}

function Hero({ mistakesCount, onSettings, totals }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroSky}>
        <View style={[styles.floatDot, styles.floatDotOne]} />
        <View style={[styles.floatDot, styles.floatDotTwo]} />
        <View style={[styles.floatDot, styles.floatDotThree]} />
        <View style={styles.heroTopRow}>
          <Text style={styles.heroBadge}>Number Quest</Text>
          <TouchableOpacity
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            onPress={onSettings}
            style={styles.heroSettingsButton}
          >
            <Text style={styles.heroSettingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heroTitle}>Play, solve, level up!</Text>
        <Text style={styles.heroText}>
          Pick a math island, finish mini challenges, and collect XP for every
          correct answer.
        </Text>
      </View>

      <View style={styles.hudRow}>
        <HudPill label="XP" value={totals.xp} color="#FFB020" />
        <HudPill label="Stars" value={totals.correct} color="#58CC02" />
        <HudPill label="Mistakes" value={mistakesCount} color="#FF6B6B" />
      </View>
    </View>
  );
}

function HudPill({ label, value, color }) {
  return (
    <View style={styles.hudPill}>
      <View style={[styles.hudGem, { backgroundColor: color }]} />
      <Text style={styles.hudValue}>{value}</Text>
      <Text style={styles.hudLabel}>{label}</Text>
    </View>
  );
}

function RecommendedQuestCard({ onPress, quest }) {
  const { topic } = quest;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.recommendedCard,
        { backgroundColor: topic.softColor, borderColor: topic.color },
      ]}
    >
      <View style={[styles.recommendedIconRing, { backgroundColor: topic.color }]}>
        <Text style={styles.recommendedIcon}>{topic.icon}</Text>
      </View>
      <View style={styles.recommendedCopy}>
        <Text style={[styles.recommendedKicker, { color: topic.deepColor }]}>
          Recommended Quest
        </Text>
        <Text style={styles.recommendedTitle}>{topic.mapLabel}</Text>
        <Text style={styles.recommendedText}>
          {quest.reason}: {quest.detail}
        </Text>
      </View>
      <View style={[styles.recommendedAction, { backgroundColor: topic.color }]}>
        <Text style={styles.recommendedActionText}>Start</Text>
      </View>
    </TouchableOpacity>
  );
}

function TeacherSummaryCard({ onPress, summary, totals }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={styles.teacherCard}
    >
      <View style={styles.teacherIconBubble}>
        <Text style={styles.teacherIcon}>📊</Text>
      </View>
      <View style={styles.teacherCopy}>
        <Text style={styles.teacherTitle}>Teacher Summary</Text>
        <Text style={styles.teacherText}>
          {totals.answered === 0
            ? 'Start playing to build a learning report.'
            : `${summary.accuracy}% accuracy, ${summary.badgesUnlocked} badges unlocked.`}
        </Text>
      </View>
      <Text style={styles.teacherChevron}>›</Text>
    </TouchableOpacity>
  );
}

function TeacherSummaryModal({
  mistakesCount,
  onClose,
  summary,
  totals,
  visible,
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.popupOverlay}>
        <View style={styles.summaryModalCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Learning Report</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onClose}
              style={styles.summaryCloseButton}
            >
              <Text style={styles.summaryCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryMetricRow}>
            <SummaryMetric label="Accuracy" value={`${summary.accuracy}%`} />
            <SummaryMetric label="Answered" value={totals.answered} />
            <SummaryMetric label="Mistakes" value={mistakesCount} />
          </View>

          <View style={styles.summaryInsightBox}>
            <Text style={styles.summaryInsightTitle}>Coach Notes</Text>
            <Text style={styles.summaryInsightText}>
              {totals.answered === 0
                ? 'No attempts yet. Complete one quest to generate advice.'
                : `Strongest: ${summary.bestTopic?.mapLabel || 'None yet'}. Needs practice: ${summary.needsPractice?.mapLabel || 'None yet'}.`}
            </Text>
          </View>

          <ScrollView style={styles.summaryTopicList}>
            {summary.topicRows.map((topic) => (
              <View key={topic.id} style={styles.summaryTopicRow}>
                <Text style={styles.summaryTopicIcon}>
                  {topic.unlocked ? topic.badgeIcon : topic.icon}
                </Text>
                <View style={styles.summaryTopicCopy}>
                  <Text style={styles.summaryTopicTitle}>{topic.title}</Text>
                  <Text style={styles.summaryTopicText}>
                    {topic.correct}/{topic.answered || 0} correct · {topic.accuracy}% accuracy
                  </Text>
                </View>
                <Text style={styles.summaryTopicBadge}>
                  {topic.unlocked ? 'Badge' : 'Locked'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}

function DifficultyPicker({ activeDifficulty, onSelectDifficulty }) {
  return (
    <View style={styles.difficultyCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.darkSectionTitle}>Difficulty</Text>
        <Text style={styles.sectionHint}>Adaptive practice</Text>
      </View>
      <View style={styles.difficultyRow}>
        {DIFFICULTY_LEVELS.map((level) => {
          const isActive = activeDifficulty === level.id;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              key={level.id}
              onPress={() => onSelectDifficulty(level.id)}
              style={[
                styles.difficultyButton,
                isActive && styles.difficultyButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.difficultyLabel,
                  isActive && styles.difficultyLabelActive,
                ]}
              >
                {level.label}
              </Text>
              <Text
                style={[
                  styles.difficultyHelper,
                  isActive && styles.difficultyHelperActive,
                ]}
              >
                {level.helper}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MistakeReviewCard({ mistakesCount, onPress }) {
  const hasMistakes = mistakesCount > 0;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={!hasMistakes}
      onPress={onPress}
      style={[
        styles.mistakeCard,
        !hasMistakes && styles.mistakeCardEmpty,
      ]}
    >
      <View style={styles.mistakeIconBubble}>
        <Text style={styles.mistakeIcon}>?</Text>
      </View>
      <View style={styles.mistakeCopy}>
        <Text style={styles.mistakeTitle}>
          {hasMistakes ? 'Practice Mistakes' : 'No Mistakes Yet'}
        </Text>
        <Text style={styles.mistakeText}>
          {hasMistakes
            ? `${mistakesCount} saved question${mistakesCount > 1 ? 's' : ''} ready for review.`
            : 'Wrong answers will appear here for focused practice.'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function BadgeShelf({ stats }) {
  return (
    <View style={styles.badgeShelf}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.darkSectionTitle}>Badge Shelf</Text>
        <Text style={styles.sectionHint}>Unlock with 3 stars</Text>
      </View>
      <View style={styles.badgeGrid}>
        {TOPICS.map((topic) => {
          const topicStats = stats[topic.id] || { answered: 0, correct: 0 };
          const unlocked = topicStats.correct >= 3;
          return (
            <View
              key={topic.id}
              style={[
                styles.badgeCard,
                unlocked && {
                  backgroundColor: topic.softColor,
                  borderColor: topic.color,
                },
              ]}
            >
              <Text style={[styles.badgeIcon, !unlocked && styles.badgeLocked]}>
                {unlocked ? topic.badgeIcon : '🔒'}
              </Text>
              <Text style={styles.badgeName}>{topic.badgeName}</Text>
              <Text style={styles.badgeStatus}>
                {unlocked ? 'Unlocked' : `${topicStats.correct}/3 stars`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HintPopup({ hint, onClose, topic, visible }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.popupOverlay}>
        <View style={[styles.hintCard, { borderColor: topic.color }]}>
          <View style={[styles.hintOrb, { backgroundColor: topic.color }]}>
            <Text style={styles.hintOrbText}>?</Text>
          </View>
          <Text style={styles.hintTitle}>Helpful Hint</Text>
          <Text style={styles.hintText}>{hint}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.popupPrimaryButton, { backgroundColor: topic.color }]}
          >
            <Text style={styles.primaryButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function QuestNode({
  topic,
  index,
  progress,
  topicStats,
  unlocked,
  unlockText,
  completed,
  isRecommended,
  onPress,
}) {
  const sideStyle = index % 2 === 0 ? styles.nodeLeft : styles.nodeRight;

  return (
    <View style={[styles.nodeRow, sideStyle]}>
      {index < TOPICS.length - 1 && (
        <View pointerEvents="none" style={styles.mapConnector} />
      )}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!unlocked}
        onPress={onPress}
        style={[
          styles.questNode,
          unlocked
            ? { backgroundColor: topic.softColor, borderColor: topic.color }
            : styles.questNodeLocked,
          isRecommended && styles.questNodeRecommended,
          completed && styles.questNodeCompleted,
        ]}
      >
        <View
          style={[
            styles.nodeStatusRibbon,
            completed
              ? styles.nodeStatusCleared
              : isRecommended
                ? { backgroundColor: topic.color }
                : styles.nodeStatusDefault,
          ]}
        >
          <Text style={styles.nodeStatusText}>
            {completed ? 'Cleared' : isRecommended ? 'Next' : unlocked ? 'Open' : 'Locked'}
          </Text>
        </View>
        <View
          style={[
            styles.nodeIconRing,
            { backgroundColor: unlocked ? topic.color : '#A9B8C8' },
          ]}
        >
          <Text style={[styles.nodeIcon, !unlocked && styles.nodeIconLocked]}>
            {unlocked ? topic.icon : 'LOCK'}
          </Text>
        </View>
        <View style={styles.nodeCopy}>
          <Text
            style={[
              styles.nodeLevel,
              { color: unlocked ? topic.deepColor : '#6B7D90' },
            ]}
          >
            {unlocked ? `Level ${index + 1}` : 'Locked Level'}
          </Text>
          <Text style={styles.nodeTitle}>{topic.mapLabel}</Text>
          <Text style={styles.nodeMission}>
            {unlocked ? topic.mission : unlockText}
          </Text>
          <View style={styles.nodeFooter}>
            <Text style={styles.nodeProgress}>
              {unlocked ? `${progress}% cleared` : 'Unlock goal'}
            </Text>
            <Text style={styles.nodeScore}>
              {topicStats.correct}/{topicStats.answered || 0} ★
            </Text>
          </View>
          <View style={styles.nodeStarsRow}>
            {Array.from({ length: 3 }).map((_, starIndex) => (
              <View
                key={starIndex}
                style={[
                  styles.nodeStarDot,
                  starIndex < Math.min(3, topicStats.correct) && {
                    backgroundColor: topic.color,
                    borderColor: topic.deepColor,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function RoundComplete({
  activeTopic,
  currentDifficulty,
  nextDifficulty,
  nextTopic,
  nextTopicUnlocked,
  round,
  onHome,
  onNextDifficulty,
  onNextTopic,
  onReplay,
}) {
  const badgeEarned = round.correct >= 3;
  const difficultyLabel =
    DIFFICULTY_LEVELS.find((level) => level.id === currentDifficulty)?.label ||
    currentDifficulty;

  return (
    <View style={styles.completeCard}>
      <Text style={styles.certificateEyebrow}>Math Hero Certificate</Text>
      <View style={[styles.certificatePanel, { borderColor: activeTopic.color }]}>
        <View style={[styles.confettiDot, styles.confettiDotOne, { backgroundColor: activeTopic.color }]} />
        <View style={[styles.confettiDot, styles.confettiDotTwo]} />
        <View style={[styles.confettiDot, styles.confettiDotThree, { backgroundColor: activeTopic.softColor }]} />
        <View style={[styles.rewardMedal, { backgroundColor: activeTopic.color }]}>
          <Text style={styles.rewardMedalText}>★</Text>
        </View>
        <Text style={styles.completeTitle}>Quest cleared!</Text>
        <Text style={styles.completeText}>
          Awarded for completing {activeTopic.mapLabel} with courage and focus.
        </Text>
        <View style={[styles.xpBanner, { backgroundColor: activeTopic.deepColor }]}>
          <Text style={styles.xpBannerText}>
            +{round.correct * XP_PER_CORRECT} XP earned
          </Text>
        </View>
      </View>
      <View style={styles.rewardRow}>
        <RewardBox label="Accuracy" value={`${round.correct}/${ROUND_SIZE}`} />
        <RewardBox label="Hearts" value={round.hearts} />
        <RewardBox label="XP" value={round.correct * XP_PER_CORRECT} />
      </View>
      <View
        style={[
          styles.certificateBadgeStrip,
          { backgroundColor: badgeEarned ? activeTopic.softColor : '#F6F9FC' },
        ]}
      >
        <Text style={styles.certificateBadgeIcon}>
          {badgeEarned ? activeTopic.badgeIcon : '🔒'}
        </Text>
        <Text style={styles.certificateBadgeText}>
          {badgeEarned
            ? `${activeTopic.badgeName} badge earned`
            : 'Earn 3 stars to unlock this badge'}
        </Text>
      </View>

      <View style={styles.nextStepPanel}>
        <View style={styles.nextStepHeader}>
          <Text style={styles.nextStepTitle}>Choose your next move</Text>
          <Text style={styles.nextStepHint}>{difficultyLabel} cleared</Text>
        </View>

        <View style={styles.nextStepGrid}>
          {nextDifficulty ? (
            <NextStepCard
              accentColor={activeTopic.color}
              helper={`Try ${activeTopic.mapLabel} with bigger challenge.`}
              label="Level Up"
              onPress={onNextDifficulty}
              title={`${nextDifficulty.label} ${activeTopic.mapLabel}`}
            />
          ) : (
            <NextStepCard
              accentColor={activeTopic.color}
              helper="You cleared the hardest level here."
              label="Mastered"
              onPress={onReplay}
              title={`Replay ${activeTopic.mapLabel}`}
            />
          )}

          <NextStepCard
            accentColor={nextTopic?.color || '#58CC02'}
            disabled={!nextTopic || !nextTopicUnlocked}
            helper={
              nextTopic
                ? nextTopicUnlocked
                  ? `Continue at ${difficultyLabel} level.`
                  : `Earn 3 stars in ${activeTopic.mapLabel} first.`
                : 'All islands are completed.'
            }
            label="Next Island"
            onPress={nextTopicUnlocked ? onNextTopic : undefined}
            title={nextTopic ? nextTopic.mapLabel : 'All Done'}
          />
        </View>

        <View style={styles.completeFooterRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onReplay}
            style={styles.replaySmallButton}
          >
            <Text style={styles.replaySmallText}>Replay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onHome}
            style={styles.mapSmallButton}
          >
            <Text style={styles.mapSmallText}>Map</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function NextStepCard({
  accentColor,
  disabled = false,
  helper,
  label,
  onPress,
  title,
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.nextStepCard,
        disabled && styles.nextStepCardDisabled,
        { borderColor: disabled ? '#CAD6E3' : accentColor },
      ]}
    >
      <View
        style={[
          styles.nextStepIcon,
          { backgroundColor: disabled ? '#CAD6E3' : accentColor },
        ]}
      >
        <Text style={styles.nextStepIconText}>{disabled ? '...' : '>'}</Text>
      </View>
      <Text style={styles.nextStepLabel}>{label}</Text>
      <Text style={styles.nextStepCardTitle}>{title}</Text>
      <Text style={styles.nextStepCardText}>{helper}</Text>
    </TouchableOpacity>
  );
}

function RewardBox({ label, value }) {
  return (
    <View style={styles.rewardBox}>
      <Text style={styles.rewardValue}>{value}</Text>
      <Text style={styles.rewardLabel}>{label}</Text>
    </View>
  );
}

function SettingsModal({
  onClose,
  onResetProgress,
  setSoundEnabled,
  setSpeechEnabled,
  soundEnabled,
  speechEnabled,
  visible,
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.popupOverlay}>
        <View style={styles.settingsModalCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Settings</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onClose}
              style={styles.summaryCloseButton}
            >
              <Text style={styles.summaryCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Sound Effects</Text>
              <Text style={styles.settingText}>Correct, wrong, and reward sounds.</Text>
            </View>
            <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Speak Aloud</Text>
              <Text style={styles.settingText}>Read questions and choices aloud.</Text>
            </View>
            <Switch value={speechEnabled} onValueChange={setSpeechEnabled} />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>App Version</Text>
              <Text style={styles.settingText}>Math Adventure {APP_VERSION}</Text>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onResetProgress}
            style={styles.resetProgressButton}
          >
            <Text style={styles.resetProgressText}>Reset Progress</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function QuestionDisplay({ question, topic }) {
  if (question.display.kind === 'objects') {
    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
        <Text style={styles.visualTitle}>Treasure Board</Text>
        <View style={styles.objectWrap}>
          {Array.from({ length: question.display.count }).map((_, index) => (
            <View key={index} style={styles.objectToken}>
              <Text style={styles.objectIcon}>{question.display.object}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (question.display.kind === 'placeValue') {
    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
        <Text style={[styles.bigNumber, { color: topic.deepColor }]}>
          {question.display.number}
        </Text>
        <View style={styles.placeValueWrap}>
          <PlaceGroup
            label="Tens towers"
            count={question.display.tens}
            style={styles.tenBlock}
            text="10"
          />
          <PlaceGroup
            label="Single gems"
            count={question.display.ones}
            style={styles.oneBlock}
          />
        </View>
      </View>
    );
  }

  if (question.display.kind === 'bigNumber') {
    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
        <Text style={styles.visualTitle}>Word Gate</Text>
        <View style={[styles.numberPortal, { borderColor: topic.color }]}>
          <Text style={[styles.bigNumber, { color: topic.deepColor }]}>
            {question.display.number}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
      <Text style={styles.visualTitle}>Tap the trail stones</Text>
      <View style={styles.trailPreview}>
        {question.answer.map((_, index) => (
          <View key={index} style={[styles.trailStone, { borderColor: topic.color }]}>
            <Text style={styles.trailStoneText}>?</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PlaceGroup({ label, count, style, text }) {
  return (
    <View style={styles.placeGroup}>
      <Text style={styles.placeLabel}>{label}</Text>
      <View style={styles.blocksWrap}>
        {Array.from({ length: count }).map((_, index) => (
          <View key={index} style={style}>
            {text && <Text style={styles.tenBlockText}>{text}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

function SequenceBuilder({ question, sequence, onTapNumber, topic }) {
  return (
    <View>
      <View style={styles.sequenceSlots}>
        {question.answer.map((_, index) => (
          <View key={index} style={styles.sequenceSlot}>
            <Text style={styles.sequenceSlotText}>{sequence[index] || ''}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sequenceOptions}>
        {question.options.map((number) => {
          const used = sequence.includes(number);
          return (
            <TouchableOpacity
              accessibilityRole="button"
              key={number}
              onPress={() => onTapNumber(number)}
              style={[
                styles.sequenceNumber,
                { borderColor: topic.color },
                used && styles.sequenceNumberUsed,
              ]}
            >
              <Text
                style={[
                  styles.sequenceNumberText,
                  used && styles.sequenceNumberTextUsed,
                ]}
              >
                {number}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function AnswerPopup({ feedback, onNext, onRetry, topic }) {
  const isVisible = Boolean(feedback);
  const popAnim = useRef(new Animated.Value(0)).current;
  const popupOpacity = popAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (!isVisible) {
      popAnim.setValue(0);
      return;
    }

    Animated.sequence([
      Animated.timing(popAnim, {
        duration: 120,
        easing: Easing.out(Easing.quad),
        toValue: 1.08,
        useNativeDriver: true,
      }),
      Animated.spring(popAnim, {
        friction: 5,
        tension: 85,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isVisible, popAnim]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={feedback?.isCorrect ? onNext : onRetry}
      transparent
      visible={isVisible}
    >
      <View style={styles.popupOverlay}>
        {feedback && (
          <Animated.View
            style={[
              styles.popupCard,
              feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
              {
                opacity: popupOpacity,
                transform: [{ scale: popAnim }],
              },
            ]}
          >
            <View style={[styles.popupBadge, { backgroundColor: topic.color }]}>
              <Text style={styles.popupBadgeText}>{feedback.badge}</Text>
            </View>
            <Text style={styles.popupTitle}>{feedback.title}</Text>
            <Text style={styles.popupDetail}>{feedback.detail}</Text>

            {feedback.isCorrect ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onNext}
                style={[styles.popupPrimaryButton, { backgroundColor: topic.color }]}
              >
                <Text style={styles.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.popupButtonRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={styles.popupSecondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={onNext}
                  style={[
                    styles.popupPrimaryButton,
                    { backgroundColor: topic.color },
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const shadow = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.16,
  shadowRadius: 10,
  elevation: 5,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#13293D',
    paddingTop: ANDROID_TOP_INSET,
  },
  homeContainer: {
    padding: 18,
    paddingBottom: 38,
  },
  hero: {
    marginBottom: 18,
  },
  heroSky: {
    ...shadow,
    backgroundColor: '#1CB0F6',
    borderRadius: 30,
    minHeight: 225,
    overflow: 'hidden',
    padding: 24,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  floatDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    borderRadius: 999,
    position: 'absolute',
  },
  floatDotOne: {
    height: 76,
    right: 24,
    top: 18,
    width: 76,
  },
  floatDotTwo: {
    bottom: -26,
    height: 118,
    left: -28,
    width: 118,
  },
  floatDotThree: {
    bottom: 45,
    height: 42,
    right: 64,
    width: 42,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    color: '#0B6FA4',
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  heroSettingsButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  heroSettingsIcon: {
    color: '#0B6FA4',
    fontSize: 24,
    fontWeight: '900',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
    maxWidth: 275,
  },
  heroText: {
    color: '#EAF8FF',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
    marginTop: 12,
    maxWidth: 300,
  },
  hudRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: -22,
    paddingHorizontal: 10,
  },
  hudPill: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flex: 1,
    minHeight: 78,
    padding: 10,
  },
  hudGem: {
    borderRadius: 999,
    height: 15,
    marginBottom: 5,
    width: 15,
  },
  hudValue: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
  },
  hudLabel: {
    color: '#61748A',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 1,
  },
  recommendedCard: {
    ...shadow,
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 14,
    padding: 16,
  },
  recommendedIconRing: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 25,
    borderWidth: 4,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  recommendedIcon: {
    fontSize: 31,
  },
  recommendedCopy: {
    flex: 1,
  },
  recommendedKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  recommendedTitle: {
    color: '#13293D',
    fontSize: 22,
    fontWeight: '900',
  },
  recommendedText: {
    color: '#42576C',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4,
  },
  recommendedAction: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  recommendedActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  settingsCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#E7FAD7',
    borderColor: '#58CC02',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 16,
    padding: 16,
  },
  settingsCardIcon: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    color: '#2F7D00',
    fontSize: 28,
    fontWeight: '900',
    height: 58,
    lineHeight: 58,
    textAlign: 'center',
    width: 58,
  },
  settingsCardCopy: {
    flex: 1,
  },
  settingsCardTitle: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
  },
  settingsCardText: {
    color: '#42576C',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 4,
  },
  teacherCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFF1D8',
    borderColor: '#FFB020',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 16,
    padding: 16,
  },
  teacherIconBubble: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  teacherIcon: {
    fontSize: 30,
  },
  teacherCopy: {
    flex: 1,
  },
  teacherTitle: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
  },
  teacherText: {
    color: '#42576C',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 4,
  },
  teacherChevron: {
    color: '#B75E00',
    fontSize: 34,
    fontWeight: '900',
  },
  difficultyCard: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    marginBottom: 16,
    padding: 16,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  darkSectionTitle: {
    color: '#13293D',
    fontSize: 20,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#6B7D90',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyButton: {
    alignItems: 'center',
    backgroundColor: '#F1F6FB',
    borderBottomWidth: 4,
    borderColor: '#CAD6E3',
    borderRadius: 18,
    borderWidth: 2,
    flex: 1,
    minHeight: 76,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  difficultyButtonActive: {
    backgroundColor: '#E7FAD7',
    borderColor: '#58CC02',
  },
  difficultyLabel: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  difficultyLabelActive: {
    color: '#2F7D00',
  },
  difficultyHelper: {
    color: '#60758A',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  difficultyHelperActive: {
    color: '#2F7D00',
  },
  mistakeCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFE2DD',
    borderColor: '#FF6B6B',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 18,
    padding: 16,
  },
  mistakeCardEmpty: {
    backgroundColor: '#F6F9FC',
    borderColor: '#C8D6E5',
    opacity: 0.86,
  },
  mistakeIconBubble: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  mistakeIcon: {
    color: '#13293D',
    fontSize: 30,
    fontWeight: '900',
  },
  mistakeCopy: {
    flex: 1,
  },
  mistakeTitle: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
  },
  mistakeText: {
    color: '#42576C',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 4,
  },
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
    marginTop: 6,
  },
  questMap: {
    gap: 18,
    paddingBottom: 12,
  },
  badgeShelf: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    marginTop: 8,
    padding: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderColor: '#CAD6E3',
    borderRadius: 18,
    borderWidth: 2,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 126,
    padding: 12,
  },
  badgeIcon: {
    fontSize: 31,
    marginBottom: 8,
  },
  badgeLocked: {
    opacity: 0.55,
  },
  badgeName: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  badgeStatus: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
  },
  nodeRow: {
    minHeight: 150,
    position: 'relative',
  },
  nodeLeft: {
    paddingRight: 24,
  },
  nodeRight: {
    paddingLeft: 24,
  },
  mapConnector: {
    backgroundColor: '#F7C948',
    borderRadius: 999,
    bottom: -28,
    height: 46,
    left: '50%',
    position: 'absolute',
    width: 8,
  },
  questNode: {
    ...shadow,
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 14,
    minHeight: 142,
    padding: 15,
    paddingTop: 24,
    position: 'relative',
  },
  questNodeRecommended: {
    borderWidth: 4,
    transform: [{ scale: 1.01 }],
  },
  questNodeCompleted: {
    borderBottomWidth: 6,
  },
  questNodeLocked: {
    backgroundColor: '#EEF3F8',
    borderColor: '#A9B8C8',
    opacity: 0.95,
  },
  nodeStatusRibbon: {
    borderBottomLeftRadius: 13,
    borderTopRightRadius: 23,
    paddingHorizontal: 13,
    paddingVertical: 6,
    position: 'absolute',
    right: -3,
    top: -3,
  },
  nodeStatusDefault: {
    backgroundColor: '#7A8CA0',
  },
  nodeStatusCleared: {
    backgroundColor: '#58CC02',
  },
  nodeStatusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nodeIconRing: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 4,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  nodeIcon: {
    fontSize: 34,
  },
  nodeIconLocked: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  nodeCopy: {
    flex: 1,
  },
  nodeLevel: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  nodeTitle: {
    color: '#13293D',
    fontSize: 23,
    fontWeight: '900',
  },
  nodeMission: {
    color: '#42576C',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 5,
  },
  nodeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  nodeProgress: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '900',
  },
  nodeScore: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '900',
  },
  nodeStarsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
  },
  nodeStarDot: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CAD6E3',
    borderRadius: 999,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  practiceContainer: {
    padding: 16,
    paddingBottom: 36,
  },
  practiceTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 13,
  },
  backButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    marginRight: 'auto',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#13293D',
    fontSize: 16,
    fontWeight: '900',
  },
  practiceSettingsButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    marginRight: 10,
    width: 42,
  },
  practiceSettingsText: {
    color: '#13293D',
    fontSize: 20,
    fontWeight: '900',
  },
  heartsRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  heart: {
    color: '#FF6B6B',
    fontSize: 18,
    fontWeight: '900',
  },
  heartEmpty: {
    color: 'rgba(255, 255, 255, 0.35)',
  },
  progressShell: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 999,
    height: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
  },
  missionCard: {
    ...shadow,
    alignItems: 'center',
    borderRadius: 28,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
    padding: 18,
  },
  missionOrb: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 27,
    height: 74,
    justifyContent: 'center',
    width: 74,
  },
  missionIcon: {
    fontSize: 34,
  },
  missionCopy: {
    flex: 1,
  },
  missionEyebrow: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  missionTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
  },
  missionText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 4,
  },
  visualCard: {
    ...shadow,
    borderRadius: 30,
    marginBottom: 14,
    minHeight: 190,
    overflow: 'hidden',
    padding: 18,
    justifyContent: 'center',
  },
  visualTitle: {
    color: '#13293D',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 13,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  objectWrap: {
    alignContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  objectToken: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  objectIcon: {
    fontSize: 33,
    textAlign: 'center',
  },
  bigNumber: {
    fontSize: 82,
    fontWeight: '900',
    textAlign: 'center',
  },
  placeValueWrap: {
    gap: 12,
    marginTop: 8,
  },
  placeGroup: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderRadius: 22,
    padding: 13,
  },
  placeLabel: {
    color: '#13293D',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 9,
  },
  blocksWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tenBlock: {
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    borderBottomWidth: 5,
    borderColor: '#0B6FA4',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  tenBlockText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  oneBlock: {
    backgroundColor: '#FFB020',
    borderBottomWidth: 4,
    borderColor: '#B75E00',
    borderRadius: 999,
    height: 22,
    width: 22,
  },
  numberPortal: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 34,
    borderWidth: 5,
    justifyContent: 'center',
    minHeight: 130,
  },
  trailPreview: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  trailStone: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderRadius: 20,
    borderWidth: 3,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  trailStoneText: {
    color: '#13293D',
    fontSize: 28,
    fontWeight: '900',
  },
  challengeCard: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 18,
  },
  challengeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  challengeTools: {
    flexDirection: 'row',
    gap: 8,
  },
  challengeLabel: {
    color: '#7A8CA0',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  hintButton: {
    backgroundColor: '#FFF1D8',
    borderColor: '#FFB020',
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  speakButton: {
    backgroundColor: '#E7FAD7',
    borderColor: '#58CC02',
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  disabledToolButton: {
    opacity: 0.45,
  },
  hintButtonText: {
    color: '#B75E00',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  speakButtonText: {
    color: '#2F7D00',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  questionPrompt: {
    color: '#13293D',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
  },
  questionHelper: {
    color: '#5A6B7C',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
    marginBottom: 16,
    marginTop: 8,
  },
  optionsGrid: {
    gap: 12,
  },
  optionButton: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderBottomWidth: 5,
    borderColor: '#C8D6E5',
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionButtonCorrect: {
    backgroundColor: '#E7FAD7',
    borderColor: '#58CC02',
    borderBottomColor: '#2F7D00',
  },
  optionButtonWrong: {
    backgroundColor: '#FFE2DD',
    borderColor: '#FF6B6B',
    borderBottomColor: '#B93434',
  },
  optionText: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  optionTextCorrect: {
    color: '#2F7D00',
  },
  optionTextWrong: {
    color: '#B93434',
  },
  optionResultTag: {
    backgroundColor: '#58CC02',
    borderRadius: 999,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 7,
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  optionResultTagWrong: {
    backgroundColor: '#FF6B6B',
  },
  sequenceSlots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sequenceSlot: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderColor: '#C8D6E5',
    borderRadius: 18,
    borderWidth: 2,
    flex: 1,
    height: 58,
    justifyContent: 'center',
  },
  sequenceSlotText: {
    color: '#13293D',
    fontSize: 23,
    fontWeight: '900',
  },
  sequenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  sequenceNumber: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 6,
    borderRadius: 22,
    borderWidth: 3,
    height: 68,
    justifyContent: 'center',
    width: 74,
  },
  sequenceNumberUsed: {
    backgroundColor: '#EAF0F6',
    borderColor: '#B8C8D8',
  },
  sequenceNumberText: {
    color: '#13293D',
    fontSize: 24,
    fontWeight: '900',
  },
  sequenceNumberTextUsed: {
    color: '#8EA0B1',
  },
  feedbackCard: {
    ...shadow,
    alignItems: 'center',
    borderRadius: 26,
    flexDirection: 'row',
    gap: 13,
    marginTop: 14,
    padding: 15,
  },
  feedbackCorrect: {
    backgroundColor: '#E7FAD7',
  },
  feedbackWrong: {
    backgroundColor: '#FFE2DD',
  },
  popupOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(19, 41, 61, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  summaryModalCard: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    maxHeight: '88%',
    maxWidth: 460,
    padding: 18,
    width: '100%',
  },
  settingsModalCard: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    maxWidth: 460,
    padding: 18,
    width: '100%',
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 14,
  },
  settingCopy: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    color: '#13293D',
    fontSize: 18,
    fontWeight: '900',
  },
  settingText: {
    color: '#60758A',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 3,
  },
  resetProgressButton: {
    alignItems: 'center',
    backgroundColor: '#FFE2DD',
    borderBottomWidth: 5,
    borderColor: '#FF6B6B',
    borderRadius: 22,
    borderWidth: 2,
    minHeight: 58,
    justifyContent: 'center',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  resetProgressText: {
    color: '#9C2B2E',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryTitle: {
    color: '#13293D',
    fontSize: 26,
    fontWeight: '900',
  },
  summaryCloseButton: {
    backgroundColor: '#F1F6FB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  summaryCloseText: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '900',
  },
  summaryMetricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  summaryMetric: {
    backgroundColor: '#F6F9FC',
    borderRadius: 18,
    flex: 1,
    padding: 12,
  },
  summaryMetricValue: {
    color: '#13293D',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  summaryMetricLabel: {
    color: '#60758A',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  summaryInsightBox: {
    backgroundColor: '#E7FAD7',
    borderColor: '#58CC02',
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 12,
    padding: 14,
  },
  summaryInsightTitle: {
    color: '#2F7D00',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
  summaryInsightText: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  summaryTopicList: {
    maxHeight: 275,
  },
  summaryTopicRow: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 11,
    marginBottom: 9,
    padding: 12,
  },
  summaryTopicIcon: {
    fontSize: 27,
    width: 36,
  },
  summaryTopicCopy: {
    flex: 1,
  },
  summaryTopicTitle: {
    color: '#13293D',
    fontSize: 16,
    fontWeight: '900',
  },
  summaryTopicText: {
    color: '#60758A',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  summaryTopicBadge: {
    color: '#13293D',
    fontSize: 12,
    fontWeight: '900',
  },
  hintCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    borderWidth: 4,
    maxWidth: 430,
    padding: 24,
    width: '100%',
  },
  hintOrb: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 37,
    borderWidth: 6,
    height: 84,
    justifyContent: 'center',
    marginBottom: 12,
    width: 84,
  },
  hintOrbText: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
  },
  hintTitle: {
    color: '#13293D',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  hintText: {
    color: '#42576C',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 25,
    marginBottom: 20,
    textAlign: 'center',
  },
  popupCard: {
    ...shadow,
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 34,
    borderWidth: 4,
    maxWidth: 430,
    padding: 24,
    width: '100%',
  },
  popupBadge: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 42,
    borderWidth: 6,
    height: 92,
    justifyContent: 'center',
    marginBottom: 14,
    width: 92,
  },
  popupBadgeText: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '900',
  },
  popupTitle: {
    color: '#13293D',
    fontSize: 29,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  popupDetail: {
    color: '#42576C',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 25,
    marginBottom: 20,
    textAlign: 'center',
  },
  popupButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  popupPrimaryButton: {
    ...shadow,
    alignItems: 'center',
    borderBottomWidth: 5,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 22,
    flex: 1,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: '100%',
  },
  popupSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderColor: '#CAD6E3',
    borderRadius: 22,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  feedbackBadge: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 4,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  feedbackBadgeText: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
  },
  feedbackCopy: {
    flex: 1,
  },
  feedbackTitle: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 3,
  },
  feedbackDetail: {
    color: '#42576C',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  primaryButton: {
    ...shadow,
    alignItems: 'center',
    borderBottomWidth: 5,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 22,
    flex: 1,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderColor: '#CAD6E3',
    borderRadius: 22,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  disabledButton: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: '#13293D',
    fontSize: 17,
    fontWeight: '900',
  },
  completeCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    gap: 13,
    padding: 24,
  },
  certificateEyebrow: {
    color: '#B75E00',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  certificatePanel: {
    alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderRadius: 28,
    borderWidth: 4,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    width: '100%',
  },
  confettiDot: {
    borderRadius: 999,
    position: 'absolute',
  },
  confettiDotOne: {
    height: 54,
    left: 18,
    top: 18,
    width: 54,
  },
  confettiDotTwo: {
    backgroundColor: '#FFB020',
    bottom: 28,
    height: 36,
    right: 28,
    width: 36,
  },
  confettiDotThree: {
    height: 84,
    right: -26,
    top: -26,
    width: 84,
  },
  rewardMedal: {
    alignItems: 'center',
    borderColor: '#FFE14D',
    borderRadius: 44,
    borderWidth: 6,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  rewardMedalText: {
    color: '#FFFFFF',
    fontSize: 50,
    fontWeight: '900',
  },
  completeTitle: {
    color: '#13293D',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  completeText: {
    color: '#4F6477',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
    textAlign: 'center',
  },
  xpBanner: {
    borderRadius: 999,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  xpBannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  certificateBadgeStrip: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 14,
    width: '100%',
  },
  certificateBadgeIcon: {
    fontSize: 28,
  },
  certificateBadgeText: {
    color: '#13293D',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  rewardRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  nextStepPanel: {
    backgroundColor: '#F6F9FC',
    borderRadius: 26,
    gap: 14,
    padding: 14,
    width: '100%',
  },
  nextStepHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nextStepTitle: {
    color: '#13293D',
    flex: 1,
    fontSize: 19,
    fontWeight: '900',
  },
  nextStepHint: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nextStepGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  nextStepCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderRadius: 22,
    borderWidth: 3,
    flex: 1,
    minHeight: 166,
    padding: 13,
  },
  nextStepCardDisabled: {
    opacity: 0.62,
  },
  nextStepIcon: {
    alignItems: 'center',
    borderRadius: 17,
    height: 42,
    justifyContent: 'center',
    marginBottom: 10,
    width: 42,
  },
  nextStepIconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  nextStepLabel: {
    color: '#60758A',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nextStepCardTitle: {
    color: '#13293D',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 4,
  },
  nextStepCardText: {
    color: '#4F6477',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 6,
  },
  completeFooterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  replaySmallButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CAD6E3',
    borderRadius: 18,
    borderWidth: 2,
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  replaySmallText: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '900',
  },
  mapSmallButton: {
    alignItems: 'center',
    backgroundColor: '#13293D',
    borderRadius: 18,
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  mapSmallText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  rewardBox: {
    backgroundColor: '#F6F9FC',
    borderRadius: 22,
    flex: 1,
    padding: 15,
  },
  rewardValue: {
    color: '#13293D',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  rewardLabel: {
    color: '#60758A',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
    textAlign: 'center',
  },
});
