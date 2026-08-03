import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageBackground,
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
const APP_VERSION = '2.0.1';
const STORAGE_KEY = '@math-adventure/progress-v1';
const DAILY_QUEST_SIZE = 3;
const ANDROID_TOP_INSET =
  Platform.OS === 'android' ? Math.max(NativeStatusBar.currentHeight || 0, 44) : 0;

const AVATARS = [
  { id: 'comet', label: 'Comet', mark: 'C', color: '#1CB0F6' },
  { id: 'aurora', label: 'Aurora', mark: 'A', color: '#8B5CF6' },
  { id: 'ember', label: 'Ember', mark: 'E', color: '#FF9600' },
];

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getDailyTopic = () => {
  const dayNumber = Math.floor(Date.now() / 86400000);
  return TOPICS[dayNumber % TOPICS.length];
};

const getMastery = (topicStats) => {
  const accuracy = getTopicAccuracy(topicStats);

  if (topicStats.answered === 0) {
    return { label: 'New explorer', progress: 0 };
  }

  if (topicStats.correct >= 8 && accuracy >= 85) {
    return { label: 'Mastered', progress: 100 };
  }

  if (topicStats.correct >= 3) {
    return {
      label: 'Growing',
      progress: Math.min(92, Math.max(35, accuracy)),
    };
  }

  return {
    label: 'Learning',
    progress: Math.min(30, Math.max(10, topicStats.correct * 10)),
  };
};

const getSmartCoach = (stats, dailyProgress) => {
  const topicRows = TOPICS.map((topic) => ({
    topic,
    stats: getTopicStats(stats, topic.id),
  }));
  const untouched = topicRows.find((item) => item.stats.answered === 0);

  if (untouched) {
    return {
      title: 'A new little world is waiting',
      detail: `Try ${untouched.topic.mapLabel} and discover a new math skill.`,
      topic: untouched.topic,
    };
  }

  const weakest = topicRows.reduce((current, item) =>
    !current || getTopicAccuracy(item.stats) < getTopicAccuracy(current.stats)
      ? item
      : current
  , null);
  const mastery = getMastery(weakest.stats);

  return {
    title:
      mastery.label === 'Mastered'
        ? 'You are ready for a brighter challenge'
        : `${weakest.topic.mapLabel} needs a little boost`,
    detail:
      mastery.label === 'Mastered'
        ? `Keep your ${dailyProgress.streak || 0}-day streak alive with a Daily Adventure.`
        : `A short practice can grow this skill from ${mastery.label.toLowerCase()} to mastered.`,
    topic: weakest.topic,
  };
};

const getQuestionKey = (question) =>
  `${question.topicId}-${question.prompt}-${JSON.stringify(question.answer)}-${JSON.stringify(question.display)}`;

const getTopicAccuracy = (stats) =>
  stats.answered === 0 ? 0 : Math.round((stats.correct / stats.answered) * 100);

const getTopicStats = (stats, topicId) =>
  stats[topicId] || { answered: 0, correct: 0 };

const isTopicUnlocked = () => true;

const getTopicUnlockText = () => 'Ready now';

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
    detail: 'Begin with counting and discover the next little world.',
  };
};

const getChoiceValue = (option) =>
  typeof option === 'object' && option !== null ? option.count : option;

const optionToSpeechText = (option) => {
  if (typeof option === 'object' && option !== null) {
    if (option.kind === 'placeMachine') {
      return `${option.tens} tens and ${option.ones} ones`;
    }

    if (option.kind === 'matchCard') {
      return option.label;
    }

    return `${option.count} objects`;
  }

  return String(option);
};

const getBadgePower = (topicId) => {
  const powers = {
    counting: {
      label: 'Treasure Compass',
      detail: 'Removes one wrong choice or fills the counting tray.',
    },
    placeValue: {
      label: 'Builder Blueprint',
      detail: 'Sets the correct tens and ones.',
    },
    numberWords: {
      label: 'Word Window',
      detail: 'Removes one wrong choice or blooms one matching pair.',
    },
    sequence: {
      label: 'Route Compass',
      detail: 'Places the first correct comet stop.',
    },
  };

  return powers[topicId];
};

const SOUND_FILES = {
  correct: require('./assets/sounds/correct.wav'),
  wrong: require('./assets/sounds/wrong.wav'),
  reward: require('./assets/sounds/reward.wav'),
};

const STORY_CHAPTERS = {
  counting: 'Nova begins by packing the orchard basket.',
  placeValue: 'Next, the workshop machine needs number parts.',
  numberWords: 'Then, word flowers need their labels to bloom.',
  sequence: 'Finally, Nova plots a safe comet route home.',
};

const WORLD_SCENES = {
  counting: require('./assets/map-orchard-v2.png'),
  placeValue: require('./assets/map-workshop-v2.png'),
  numberWords: require('./assets/map-garden-v2.png'),
  sequence: require('./assets/map-comet-v2.png'),
};

function BouncyTouchable({
  children,
  disabled,
  motionEnabled = true,
  onPressIn,
  onPressOut,
  style,
  wrapperStyle,
  ...props
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue) => {
    Animated.spring(scale, {
      friction: 5,
      tension: 170,
      toValue,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[wrapperStyle, { transform: [{ scale }] }]}>
      <TouchableOpacity
        {...props}
        disabled={disabled}
        onPressIn={(event) => {
          if (!disabled && motionEnabled) {
            animateTo(0.96);
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (motionEnabled) {
            animateTo(1);
          }
          onPressOut?.(event);
        }}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

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
  const [showAdventureBook, setShowAdventureBook] = useState(false);
  const [selectedWorldId, setSelectedWorldId] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [mistakes, setMistakes] = useState([]);
  const [avatarId, setAvatarId] = useState('comet');
  const [dailyProgress, setDailyProgress] = useState({
    completedDate: '',
    streak: 0,
  });
  const [countedObjects, setCountedObjects] = useState([]);
  const [placeBuild, setPlaceBuild] = useState({ tens: 0, ones: 0 });
  const [tenFrameCells, setTenFrameCells] = useState([]);
  const [selectedMatchCardIds, setSelectedMatchCardIds] = useState([]);
  const [matchedPairIds, setMatchedPairIds] = useState([]);
  const [powerUsed, setPowerUsed] = useState(false);
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
      let shouldShowOnboarding = true;

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

        if (typeof saved.motionEnabled === 'boolean') {
          setMotionEnabled(saved.motionEnabled);
        }

        if (AVATARS.some((avatar) => avatar.id === saved.avatarId)) {
          setAvatarId(saved.avatarId);
        }

        if (saved.dailyProgress && typeof saved.dailyProgress === 'object') {
          setDailyProgress({
            completedDate: saved.dailyProgress.completedDate || '',
            streak: Number(saved.dailyProgress.streak) || 0,
          });
        }

        shouldShowOnboarding = !saved.hasOnboarded;
      } catch {
        // Saved data should never block a child from starting the activity.
      } finally {
        if (isMounted) {
          setShowOnboarding(shouldShowOnboarding);
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
            motionEnabled,
            stats,
            avatarId,
            dailyProgress,
            hasOnboarded: !showOnboarding,
          })
        );
      } catch {
        // Progress saving is helpful, but the quiz should remain playable.
      }
    };

    saveProgress();
  }, [
    avatarId,
    dailyProgress,
    difficulty,
    mistakes,
    showOnboarding,
    soundEnabled,
    speechEnabled,
    motionEnabled,
    stats,
    storageReady,
  ]);

  const activeTopic = useMemo(
    () => TOPICS.find((topic) => topic.id === activeTopicId),
    [activeTopicId]
  );
  const selectedWorld = useMemo(
    () => TOPICS.find((topic) => topic.id === selectedWorldId),
    [selectedWorldId]
  );
  const earnedBadge = activeTopic && getTopicStats(stats, activeTopic.id).correct >= 3;
  const badgePower = activeTopic ? getBadgePower(activeTopic.id) : null;

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

  const avatar = AVATARS.find((item) => item.id === avatarId) || AVATARS[0];
  const dailyComplete = dailyProgress.completedDate === getTodayKey();
  const roundSize = playMode === 'daily' ? DAILY_QUEST_SIZE : ROUND_SIZE;

  const startTopic = (topicId, selectedDifficulty = difficulty) => {
    Speech.stop();
    setDifficulty(selectedDifficulty);
    setActiveTopicId(topicId);
    setPlayMode('topic');
    setRound({ answered: 0, correct: 0, hearts: HEARTS_PER_ROUND });
    setQuestion(generateQuestion(topicId, selectedDifficulty));
    setSelectedChoice(null);
    setSequence([]);
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds([]);
    setPowerUsed(false);
    setFeedback(null);
    setShowHint(false);
  };

  const startDailyAdventure = () => {
    const dailyTopic = getDailyTopic();

    Speech.stop();
    setActiveTopicId(dailyTopic.id);
    setPlayMode('daily');
    setRound({ answered: 0, correct: 0, hearts: HEARTS_PER_ROUND });
    setQuestion(generateQuestion(dailyTopic.id, difficulty));
    setSelectedChoice(null);
    setSequence([]);
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds([]);
    setPowerUsed(false);
    setFeedback(null);
    setShowHint(false);
  };

  const completeDailyAdventure = () => {
    const today = getTodayKey();

    setDailyProgress((current) => {
      if (current.completedDate === today) {
        return current;
      }

      const previous = current.completedDate
        ? new Date(`${current.completedDate}T00:00:00`).getTime()
        : 0;
      const currentDay = new Date(`${today}T00:00:00`).getTime();
      const isConsecutive = previous && currentDay - previous === 86400000;

      return {
        completedDate: today,
        streak: isConsecutive ? current.streak + 1 : 1,
      };
    });
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
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds([]);
    setShowHint(false);
    setShowSettings(false);
    setDailyProgress({ completedDate: '', streak: 0 });
    setShowAdventureBook(false);
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
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds([]);
    setPowerUsed(false);
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
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds([]);
    setPowerUsed(false);
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

    if (isCorrect && question) {
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
        ? `You earned ${XP_PER_CORRECT} XP. Keep the streak glowing.`
        : wrongText,
      badge: isCorrect ? '★' : '↺',
    });
  };

  const submitChoice = (choice) => {
    if (feedback) {
      return;
    }

    const choiceValue = getChoiceValue(choice);
    setSelectedChoice(choiceValue);
    recordAnswer(
      choiceValue === question.answer,
      question.correctText,
      question.wrongText
    );
  };

  const useBadgePower = () => {
    const earnedBadge =
      question && getTopicStats(stats, question.topicId).correct >= 3;

    if (!question || feedback || powerUsed || !earnedBadge) {
      return;
    }

    if (question.interaction === 'builder') {
      setPlaceBuild({
        tens: question.display.tens,
        ones: question.display.ones,
      });
    } else if (question.interaction === 'tenFrame') {
      setTenFrameCells(
        Array.from({ length: question.answer }).map((_, index) => index)
      );
    } else if (question.interaction === 'pairs') {
      const nextPair = question.display.pairs.find(
        (pair) => !matchedPairIds.includes(String(pair.number))
      );

      if (nextPair) {
        const nextMatchedPairIds = [
          ...matchedPairIds,
          String(nextPair.number),
        ];
        setMatchedPairIds(nextMatchedPairIds);
        setSelectedMatchCardIds([]);

        if (nextMatchedPairIds.length === question.display.pairCount) {
          setSelectedChoice('all pairs');
          setPowerUsed(true);
          recordAnswer(true, question.correctText, question.wrongText);
          return;
        }
      }
    } else if (question.type === 'sequence') {
      setSequence([question.answer[0]]);
    } else if (question.type === 'choice') {
      setQuestion((current) => {
        const wrongOption = current.options.find(
          (option) => getChoiceValue(option) !== current.answer
        );

        if (!wrongOption) {
          return current;
        }

        return {
          ...current,
          options: current.options.filter((option) => option !== wrongOption),
        };
      });
    }

    setPowerUsed(true);
    playSound('reward');
  };

  const tapSequenceNumber = (number) => {
    if (
      feedback ||
      sequence.includes(number) ||
      sequence.length >= question.answer.length
    ) {
      return;
    }

    setSequence((current) => [...current, number]);
  };

  const undoSequenceNumber = () => {
    if (feedback || sequence.length === 0) {
      return;
    }

    setSequence((current) => current.slice(0, -1));
  };

  const submitSequence = () => {
    if (feedback || sequence.length !== question.answer.length) {
      return;
    }

    const isCorrect = sequence.every(
      (item, index) => item === question.answer[index]
    );
    recordAnswer(isCorrect, question.correctText, question.wrongText);
  };

  const toggleCountedObject = (index) => {
    if (feedback) {
      return;
    }

    setCountedObjects((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index]
    );
  };

  const updatePlaceBuild = (part, change) => {
    if (feedback) {
      return;
    }

    setPlaceBuild((current) => ({
      ...current,
      [part]: Math.max(0, Math.min(9, current[part] + change)),
    }));
  };

  const submitPlaceBuild = () => {
    if (feedback) {
      return;
    }

    const choice = `${placeBuild.tens} tens and ${placeBuild.ones} ones`;
    setSelectedChoice(choice);
    recordAnswer(
      choice === question.answer,
      question.correctText,
      question.wrongText
    );
  };

  const toggleTenFrameCell = (index) => {
    if (feedback) {
      return;
    }

    setTenFrameCells((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index]
    );
  };

  const submitTenFrame = () => {
    if (feedback || tenFrameCells.length === 0) {
      return;
    }

    setSelectedChoice(tenFrameCells.length);
    recordAnswer(
      tenFrameCells.length === question.answer,
      question.correctText,
      question.wrongText
    );
  };

  const tapMatchCard = (card) => {
    if (feedback || matchedPairIds.includes(card.pairId)) {
      return;
    }

    if (selectedMatchCardIds.includes(card.id)) {
      setSelectedMatchCardIds([]);
      return;
    }

    if (selectedMatchCardIds.length === 0) {
      setSelectedMatchCardIds([card.id]);
      return;
    }

    const firstCard = question.options.find(
      (option) => option.id === selectedMatchCardIds[0]
    );

    if (!firstCard) {
      setSelectedMatchCardIds([card.id]);
      return;
    }

    if (firstCard.cardType === card.cardType) {
      setSelectedMatchCardIds([card.id]);
      return;
    }

    setSelectedMatchCardIds([firstCard.id, card.id]);

    if (firstCard.pairId !== card.pairId) {
      recordAnswer(false, question.correctText, question.wrongText);
      return;
    }

    const nextMatchedPairIds = [...matchedPairIds, card.pairId];
    setMatchedPairIds(nextMatchedPairIds);
    setSelectedMatchCardIds([]);

    if (nextMatchedPairIds.length === question.display.pairCount) {
      setSelectedChoice('all pairs');
      recordAnswer(true, question.correctText, question.wrongText);
    } else {
      playSound('reward');
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
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds((current) =>
      question?.interaction === 'pairs' ? current : []
    );
    setPowerUsed(false);
    setFeedback(null);
    setShowHint(false);
  };

  const nextQuestion = () => {
    Speech.stop();
    if (round.answered >= roundSize) {
      if (playMode === 'daily') {
        completeDailyAdventure();
      }
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
        setRound((current) => ({ ...current, answered: roundSize }));
        setSelectedChoice(null);
        setSequence([]);
        setCountedObjects([]);
        setPlaceBuild({ tens: 0, ones: 0 });
        setTenFrameCells([]);
        setSelectedMatchCardIds([]);
        setMatchedPairIds([]);
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
    setCountedObjects([]);
    setPlaceBuild({ tens: 0, ones: 0 });
    setTenFrameCells([]);
    setSelectedMatchCardIds([]);
    setMatchedPairIds([]);
    setPowerUsed(false);
    setFeedback(null);
    setShowHint(false);
  };

  const speakQuestion = () => {
    if (!question || !speechEnabled) {
      return;
    }

    const optionText =
      question.interaction === 'builder'
        ? 'Tap tens rods and one gems to build the target number.'
        : question.interaction === 'tenFrame'
          ? `Tap spaces to pack exactly ${question.answer} items, then check the tray.`
          : question.interaction === 'pairs'
            ? `Match these cards: ${question.options.map(optionToSpeechText).join(', ')}.`
        : question.type === 'choice'
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
      <SafeAreaView style={[styles.safeArea, styles.homeScreen]}>
        <StatusBar backgroundColor="#DDF3FF" style="dark" translucent={false} />
        <ScrollView
          contentContainerStyle={styles.homeContainer}
          style={styles.homeScroll}
        >
          <Hero
            avatar={avatar}
            dailyStreak={dailyProgress.streak}
            mistakesCount={mistakes.length}
            motionEnabled={motionEnabled}
            onSettings={() => setShowSettings(true)}
            totals={totals}
          />
          <NextAdventureCard
            complete={dailyComplete}
            onPress={
              dailyComplete
                ? () => setSelectedWorldId(recommendedQuest.topic.id)
                : startDailyAdventure
            }
            quest={recommendedQuest}
            streak={dailyProgress.streak}
            topic={getDailyTopic()}
            motionEnabled={motionEnabled}
          />

          <JourneyActions
            accuracy={teacherSummary.accuracy}
            collectedCount={teacherSummary.badgesUnlocked}
            mistakesCount={mistakes.length}
            onOpenJourney={() => setShowAdventureBook(true)}
            onOpenProgress={() => setShowTeacherSummary(true)}
            onReview={startMistakeReview}
            stars={totals.correct}
          />

          <StoryTrail
            motionEnabled={motionEnabled}
            onSelectWorld={setSelectedWorldId}
            recommendedTopicId={recommendedQuest.topic.id}
            stats={stats}
          />
        </ScrollView>
        <WorldLaunchModal
          activeDifficulty={difficulty}
          onClose={() => setSelectedWorldId(null)}
          onSelectDifficulty={setDifficulty}
          onStart={() => {
            const topicId = selectedWorld?.id;
            setSelectedWorldId(null);
            if (topicId) {
              startTopic(topicId, difficulty);
            }
          }}
          stats={stats}
          topic={selectedWorld}
          visible={Boolean(selectedWorld)}
        />
        <TeacherSummaryModal
          mistakesCount={mistakes.length}
          onClose={() => setShowTeacherSummary(false)}
          summary={teacherSummary}
          totals={totals}
          visible={showTeacherSummary}
        />
        <AdventureBookModal
          avatar={avatar}
          dailyProgress={dailyProgress}
          onClose={() => setShowAdventureBook(false)}
          stats={stats}
          totals={totals}
          visible={showAdventureBook}
        />
        <OnboardingModal
          avatarId={avatarId}
          onChooseAvatar={setAvatarId}
          onStart={() => setShowOnboarding(false)}
          visible={showOnboarding}
        />
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onResetProgress={resetProgress}
          motionEnabled={motionEnabled}
          setMotionEnabled={setMotionEnabled}
          setSoundEnabled={setSoundEnabled}
          setSpeechEnabled={setSpeechEnabled}
          soundEnabled={soundEnabled}
          speechEnabled={speechEnabled}
          visible={showSettings}
        />
      </SafeAreaView>
    );
  }

  const roundComplete = round.answered >= roundSize && !feedback;
  const hasMachineOptions = Boolean(
    question?.options?.some((option) => option?.kind === 'placeMachine')
  );
  const hasObjectGroupOptions = Boolean(
    question?.options?.some((option) => option?.kind === 'objectGroup')
  );
  const hasCompactNumberOptions = question?.display?.kind === 'workshopMissing';
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
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: activeTopic.softColor }]}
    >
      <StatusBar backgroundColor={activeTopic.deepColor} style="light" translucent={false} />
      <ScrollView
        contentContainerStyle={styles.practiceContainer}
        style={{ backgroundColor: activeTopic.softColor }}
      >
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
                width: `${Math.min(100, (round.answered / roundSize) * 100)}%`,
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
                : `${playMode === 'daily' ? 'Daily Adventure' : activeDifficultyLevel.label} - Stage ${Math.min(roundSize, round.answered + 1)} of ${roundSize}`}
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
            roundSize={roundSize}
            onHome={goHome}
            onNextDifficulty={() => startTopic(activeTopicId, nextDifficulty.id)}
            onNextTopic={() => startTopic(nextTopic.id, difficulty)}
            onReplay={() => startTopic(activeTopicId, difficulty)}
          />
        ) : (
          <>
            <QuestionDisplay
              countedObjects={countedObjects}
              motionEnabled={motionEnabled}
              onToggleObject={toggleCountedObject}
              question={question}
              topic={activeTopic}
            />

            <View style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <Text style={styles.challengeLabel}>{question.gameLabel || 'Mini Challenge'}</Text>
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
                  {earnedBadge && badgePower && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={powerUsed}
                      onPress={useBadgePower}
                      style={[styles.powerButton, powerUsed && styles.disabledToolButton]}
                    >
                      <Text style={styles.powerButtonText}>
                        {powerUsed ? 'Tool used' : 'Tool'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <Text style={styles.questionPrompt}>{question.prompt}</Text>
              <Text style={styles.questionHelper}>{question.helper}</Text>

              {question.interaction === 'tenFrame' ? (
                <TenFrameBuilder
                  feedback={feedback}
                  filledCells={tenFrameCells}
                  motionEnabled={motionEnabled}
                  onCheck={submitTenFrame}
                  onToggleCell={toggleTenFrameCell}
                  question={question}
                  topic={activeTopic}
                />
              ) : question.interaction === 'pairs' ? (
                <WordPairMatcher
                  feedback={feedback}
                  matchedPairIds={matchedPairIds}
                  motionEnabled={motionEnabled}
                  onTapCard={tapMatchCard}
                  question={question}
                  selectedCardIds={selectedMatchCardIds}
                  topic={activeTopic}
                />
              ) : question.interaction === 'builder' ? (
                <PlaceValueBuilder
                  feedback={feedback}
                  onAdjust={updatePlaceBuild}
                  onCheck={submitPlaceBuild}
                  placeBuild={placeBuild}
                  target={question.display.number}
                  topic={activeTopic}
                />
              ) : question.type === 'choice' ? (
                <View
                  style={[
                    styles.optionsGrid,
                    (hasMachineOptions || hasCompactNumberOptions || hasObjectGroupOptions) &&
                      styles.machineOptionsGrid,
                  ]}
                >
                  {question.options.map((option) => {
                    const optionValue = getChoiceValue(option);
                    const isSelected = selectedChoice === optionValue;
                    const isAnswer = optionValue === question.answer;
                    const showCorrect = Boolean(feedback && isAnswer);
                    const showWrong = Boolean(feedback && isSelected && !feedback.isCorrect);
                    const isVisualOption = option && option.kind === 'objectGroup';
                    const isMachineOption = option && option.kind === 'placeMachine';

                    return (
                      <BouncyTouchable
                        accessibilityRole="button"
                        disabled={Boolean(feedback)}
                        key={option.id || String(option)}
                        motionEnabled={motionEnabled}
                        onPress={() => submitChoice(option)}
                        wrapperStyle={
                          isMachineOption || isVisualOption || hasCompactNumberOptions
                            ? styles.machineOptionWrapper
                            : undefined
                        }
                        style={[
                          styles.optionButton,
                          question.topicId === 'numberWords' && styles.wordOptionButton,
                          (isVisualOption || isMachineOption) && styles.visualOptionButton,
                          isMachineOption && styles.machineOptionButton,
                          isVisualOption && styles.objectGroupOptionButton,
                          hasCompactNumberOptions && styles.compactNumberOptionButton,
                          isSelected && !feedback && {
                            borderColor: activeTopic.color,
                            backgroundColor: activeTopic.softColor,
                          },
                          showCorrect && styles.optionButtonCorrect,
                          showWrong && styles.optionButtonWrong,
                        ]}
                      >
                        {isMachineOption ? (
                          <MiniPlaceMachine ones={option.ones} tens={option.tens} />
                        ) : isVisualOption ? (
                          <View style={styles.visualOptionObjects}>
                            {Array.from({ length: option.count }).map((_, index) => (
                              <Text key={index} style={styles.visualOptionObject}>
                                {option.object}
                              </Text>
                            ))}
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.optionText,
                              showCorrect && styles.optionTextCorrect,
                              showWrong && styles.optionTextWrong,
                            ]}
                          >
                            {option}
                          </Text>
                        )}
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
                      </BouncyTouchable>
                    );
                  })}
                </View>
              ) : (
                <SequenceBuilder
                  feedback={feedback}
                  onCheck={submitSequence}
                  question={question}
                  sequence={sequence}
                  onTapNumber={tapSequenceNumber}
                  onUndo={undoSequenceNumber}
                  topic={activeTopic}
                />
              )}
            </View>

            <AnswerPopup
              feedback={feedback}
              motionEnabled={motionEnabled}
              onNext={nextQuestion}
              onRetry={resetCurrentQuestion}
              question={question}
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
        motionEnabled={motionEnabled}
        setMotionEnabled={setMotionEnabled}
        setSoundEnabled={setSoundEnabled}
        setSpeechEnabled={setSpeechEnabled}
        soundEnabled={soundEnabled}
        speechEnabled={speechEnabled}
        visible={showSettings}
      />
    </SafeAreaView>
  );
}

function Twinkle({ motionEnabled, style }) {
  const shimmer = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (!motionEnabled) {
      shimmer.setValue(0.72);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { duration: 1300, toValue: 1, useNativeDriver: true }),
        Animated.timing(shimmer, { duration: 1300, toValue: 0.38, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [motionEnabled, shimmer]);

  return <Animated.View pointerEvents="none" style={[style, { opacity: shimmer }]} />;
}

function NovaCompanion({ compact = false, hero = false, mood, motionEnabled }) {
  const bob = useRef(new Animated.Value(0)).current;
  const isCelebrating = mood === 'YAY' || mood === 'cheering';
  const novaSource =
    mood === 'THINK' || mood === 'thinking'
      ? require('./assets/nova-thinking-clean.png')
      : isCelebrating
        ? require('./assets/nova-celebrate-clean.png')
        : require('./assets/nova-mascot-clean.png');

  useEffect(() => {
    if (!motionEnabled) {
      bob.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          duration: isCelebrating ? 520 : 850,
          toValue: isCelebrating ? -9 : -6,
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          duration: isCelebrating ? 520 : 850,
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [bob, isCelebrating, motionEnabled]);

  return (
    <Animated.View
      accessibilityLabel="Nova, your maths adventure guide"
      style={[styles.novaCompanion, { transform: [{ translateY: bob }] }]}
    >
      <Image
        resizeMode="contain"
        source={novaSource}
        style={[
          styles.novaMascot,
          compact && styles.novaMascotCompact,
          hero && styles.novaMascotHero,
        ]}
      />
    </Animated.View>
  );
}

function Hero({ avatar, dailyStreak, mistakesCount, motionEnabled, onSettings, totals }) {
  const novaMessage = mistakesCount
    ? `${mistakesCount} puzzle${mistakesCount === 1 ? '' : 's'} are ready for a brave retry.`
    : dailyStreak
      ? `Your ${dailyStreak}-day spark is shining bright.`
      : 'Nova is ready to visit the first little world.';

  return (
    <View style={styles.hero}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroIdentity}>
          <View style={[styles.avatarMark, { backgroundColor: avatar.color }]}>
            <Text style={styles.avatarMarkText}>{avatar.mark}</Text>
          </View>
          <View>
            <Text style={styles.heroEyebrow}>{avatar.label}'s adventure</Text>
            <Text style={styles.heroBrand}>Nova's Little Worlds</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityLabel="Open settings"
          accessibilityRole="button"
          onPress={onSettings}
          style={styles.heroSettingsButton}
        >
          <Text style={styles.heroSettingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.heroWelcome}>
        <View style={styles.heroWelcomeCopy}>
          <Text style={styles.heroKicker}>WELCOME BACK, EXPLORER</Text>
          <Text style={styles.heroTitle}>Where will Nova go next?</Text>
          <Text style={styles.heroText}>{novaMessage}</Text>
          <View style={styles.heroMiniStats}>
            <Text style={styles.heroMiniStat}>{totals.xp} XP</Text>
            <View style={styles.heroMiniDivider} />
            <Text style={styles.heroMiniStat}>{dailyStreak}-day streak</Text>
          </View>
        </View>
        <NovaCompanion
          compact
          hero
          motionEnabled={motionEnabled}
          mood={mistakesCount ? 'thinking' : 'cheering'}
        />
      </View>
    </View>
  );
}

function StoryTrail({ motionEnabled, onSelectWorld, recommendedTopicId, stats }) {
  const collectedCount = TOPICS.filter(
    (topic) => getTopicStats(stats, topic.id).correct >= 3
  ).length;

  return (
    <View style={styles.storySection}>
      <View style={styles.storySectionHeader}>
        <View>
          <Text style={styles.sectionLabel}>Nova's Travel Journal</Text>
          <Text style={styles.storySectionHint}>
            Follow the winding trail through four little worlds.
          </Text>
        </View>
        <View style={styles.storyProgressBadge}>
          <Text style={styles.storyProgressBadgeText}>{collectedCount}/4</Text>
        </View>
      </View>

      <View style={styles.travelMap}>
        <View style={styles.travelMapCaption}>
          <Text style={styles.travelMapCaptionText}>
            {collectedCount === 4
              ? 'Every postcard is glowing. Replay any world to grow your score.'
              : `${collectedCount} postcard${collectedCount === 1 ? '' : 's'} collected. Nova is ready for the next stop.`}
          </Text>
        </View>

        {TOPICS.map((topic, index) => {
          const topicStats = getTopicStats(stats, topic.id);
          const unlocked = isTopicUnlocked(index, stats);
          const completed = topicStats.correct >= 3;
          const isNext = unlocked && !completed && topic.id === recommendedTopicId;

          return (
            <WorldMapZone
              completed={completed}
              index={index}
              isNext={isNext}
              key={topic.id}
              motionEnabled={motionEnabled}
              onPress={unlocked ? () => onSelectWorld(topic.id) : undefined}
              storyText={STORY_CHAPTERS[topic.id]}
              topic={topic}
              topicStats={topicStats}
              unlocked={unlocked}
              unlockText={getTopicUnlockText(index)}
            />
          );
        })}
      </View>
    </View>
  );
}

function WorldMapZone({
  completed,
  index,
  isNext,
  motionEnabled,
  onPress,
  storyText,
  topic,
  topicStats,
  unlocked,
  unlockText,
}) {
  const side = index % 2 === 0 ? 'left' : 'right';
  const mastery = getMastery(topicStats);
  const dotPositions =
    side === 'left'
      ? [
          { left: '28%', top: '66%' },
          { left: '40%', top: '72%' },
          { left: '53%', top: '75%' },
          { left: '66%', top: '72%' },
          { left: '78%', top: '64%' },
        ]
      : [
          { left: '72%', top: '66%' },
          { left: '60%', top: '72%' },
          { left: '47%', top: '75%' },
          { left: '34%', top: '72%' },
          { left: '22%', top: '64%' },
        ];

  return (
    <ImageBackground
      imageStyle={styles.worldMapZoneImage}
      resizeMode="cover"
      source={WORLD_SCENES[topic.id]}
      style={styles.worldMapZone}
    >
      <View style={styles.worldMapWash} />
      {index < TOPICS.length - 1 &&
        dotPositions.map((position, dotIndex) => (
          <View
            key={`${topic.id}-trail-${dotIndex}`}
            style={[styles.mapTrailDot, position]}
          />
        ))}

      <View
        pointerEvents="none"
        style={[
          styles.worldMapCopy,
          side === 'left' ? styles.worldMapCopyRight : styles.worldMapCopyLeft,
        ]}
      >
        <Text style={[styles.worldMapChapter, { color: topic.deepColor }]}>WORLD {index + 1}</Text>
        <Text style={styles.worldMapTitle}>{topic.mapLabel}</Text>
        <Text style={styles.worldMapStory}>{storyText}</Text>
        <Text style={[styles.worldMapMastery, { color: topic.deepColor }]}>
          {completed ? 'Postcard collected' : `${mastery.label} · ${Math.min(3, topicStats.correct)}/3 stars`}
        </Text>
      </View>

      <StoryStop
        completed={completed}
        isNext={isNext}
        motionEnabled={motionEnabled}
        onPress={onPress}
        side={side}
        topic={topic}
        unlocked={unlocked}
        unlockText={unlockText}
      />
    </ImageBackground>
  );
}

function StoryStop({
  completed,
  isNext,
  motionEnabled,
  onPress,
  side,
  topic,
  unlocked,
  unlockText,
}) {
  const visibleStoryText = completed
    ? `${topic.badgeName} earned`
    : isNext
      ? 'Tap to continue with Nova'
      : unlocked
        ? 'Choose a challenge'
      : unlockText;

  return (
    <View
      style={[
        styles.storyStopAnchor,
        side === 'left' ? styles.storyStopLeft : styles.storyStopRight,
      ]}
    >
      {isNext && (
        <>
          <Twinkle motionEnabled={motionEnabled} style={styles.storyStopPulse} />
          <Image
            resizeMode="contain"
            source={require('./assets/nova-mascot-clean.png')}
            style={styles.novaTrailMini}
          />
        </>
      )}
      <BouncyTouchable
        accessibilityLabel={`${topic.mapLabel}. ${visibleStoryText}`}
        accessibilityRole="button"
        disabled={!unlocked}
        motionEnabled={motionEnabled}
        onPress={onPress}
        style={[
          styles.storyStop,
          unlocked
            ? { backgroundColor: topic.color, borderColor: '#FFFFFF' }
            : styles.storyStopLocked,
          completed && styles.storyStopComplete,
          isNext && styles.storyStopNext,
        ]}
      >
        <Text style={styles.storyStopIconText}>
          {completed ? topic.badgeIcon : unlocked ? topic.icon : 'LOCK'}
        </Text>
      </BouncyTouchable>
      <View style={styles.storyStopCopy}>
        <Text style={[styles.storyStopStatus, { color: unlocked ? topic.deepColor : '#5A6B7C' }]}>
          {completed ? 'COMPLETE' : isNext ? 'NOVA IS HERE' : unlocked ? 'READY' : 'LOCKED'}
        </Text>
        <Text style={styles.storyStopText}>{visibleStoryText}</Text>
      </View>
    </View>
  );
}

function NextAdventureCard({ complete, motionEnabled, onPress, quest, streak, topic }) {
  const isDaily = !complete;
  const activeTopic = isDaily ? topic : quest.topic;

  return (
    <BouncyTouchable
      accessibilityRole="button"
      motionEnabled={motionEnabled}
      onPress={onPress}
      style={[styles.nextAdventureCard, { borderColor: activeTopic.color }]}
    >
      <View style={[styles.nextAdventureIcon, { backgroundColor: activeTopic.color }]}>
        <Text style={styles.nextAdventureIconText}>{isDaily ? 'DAY' : activeTopic.icon}</Text>
      </View>
      <View style={styles.nextAdventureCopy}>
        <Text style={[styles.nextAdventureKicker, { color: activeTopic.deepColor }]}>
          {isDaily ? 'TODAY\'S ADVENTURE' : 'NEXT ADVENTURE'}
        </Text>
        <Text style={styles.nextAdventureTitle}>
          {isDaily ? `${topic.mapLabel}: 3 quick stages` : quest.topic.mapLabel}
        </Text>
        <Text style={styles.nextAdventureText}>
          {isDaily
            ? `Keep your ${streak}-day streak with a short mixed mission.`
            : `${quest.reason}: ${quest.detail}`}
        </Text>
      </View>
      <Text style={[styles.nextAdventureAction, { color: activeTopic.deepColor }]}>
        {isDaily ? 'Play' : 'Start'}
      </Text>
    </BouncyTouchable>
  );
}

function JourneyActions({
  accuracy,
  collectedCount,
  mistakesCount,
  onOpenJourney,
  onOpenProgress,
  onReview,
  stars,
}) {
  return (
    <View style={styles.journeySnapshot}>
      <View style={styles.snapshotHeader}>
        <Text style={styles.snapshotTitle}>My Adventure</Text>
        <Text style={styles.snapshotHint}>LIVE STATUS</Text>
      </View>
      <View style={styles.journeyActions}>
        <StatusTile
          accent="#1CB0F6"
          detail="worlds"
          label="Journey"
          onPress={onOpenJourney}
          value={`${collectedCount}/4`}
        />
        <StatusTile
          accent="#FF6B6B"
          detail={mistakesCount ? 'to retry' : 'all clear'}
          disabled={mistakesCount === 0}
          label="Review"
          onPress={onReview}
          value={mistakesCount}
        />
        <StatusTile
          accent="#58CC02"
          detail={`${stars} stars`}
          label="Progress"
          onPress={onOpenProgress}
          value={`${accuracy}%`}
        />
      </View>
    </View>
  );
}

function StatusTile({ accent, detail, disabled = false, label, onPress, value }) {
  return (
    <TouchableOpacity
      accessibilityLabel={`${label}: ${value}, ${detail}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.journeyAction, disabled && styles.journeyActionDisabled]}
    >
      <View style={[styles.journeyActionDot, { backgroundColor: accent }]} />
      <Text style={styles.journeyActionValue}>{value}</Text>
      <Text style={styles.journeyActionText}>{label}</Text>
      <Text style={styles.journeyActionDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

function WorldLaunchModal({
  activeDifficulty,
  onClose,
  onSelectDifficulty,
  onStart,
  stats,
  topic,
  visible,
}) {
  if (!topic) {
    return null;
  }

  const topicStats = getTopicStats(stats, topic.id);
  const mastery = getMastery(topicStats);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.popupOverlay}>
        <View style={styles.worldLauncherCard}>
          <View style={styles.worldLauncherHeader}>
            <View style={[styles.worldLauncherIcon, { backgroundColor: topic.color }]}>
              <Text style={styles.worldLauncherIconText}>{topic.icon}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close world details"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.worldLauncherClose}
            >
              <Text style={styles.worldLauncherCloseText}>X</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.worldLauncherKicker, { color: topic.deepColor }]}>READY TO EXPLORE</Text>
          <Text style={styles.worldLauncherTitle}>{topic.mapLabel}</Text>
          <Text style={styles.worldLauncherText}>{topic.mission}</Text>

          <View style={styles.worldLauncherProgressRow}>
            <Text style={styles.worldLauncherProgressLabel}>{mastery.label}</Text>
            <Text style={[styles.worldLauncherProgressValue, { color: topic.deepColor }]}>
              {topicStats.correct}/{topicStats.answered || 0} correct
            </Text>
          </View>
          <View style={styles.worldLauncherTrack}>
            <View
              style={[
                styles.worldLauncherFill,
                { backgroundColor: topic.color, width: `${mastery.progress}%` },
              ]}
            />
          </View>

          <Text style={styles.worldLauncherDifficultyLabel}>SELECT A CHALLENGE</Text>
          <View style={styles.difficultyRow}>
            {DIFFICULTY_LEVELS.map((level) => {
              const isActive = activeDifficulty === level.id;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={level.id}
                  onPress={() => onSelectDifficulty(level.id)}
                  style={[
                    styles.worldDifficultyButton,
                    isActive && {
                      backgroundColor: topic.softColor,
                      borderColor: topic.color,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.worldDifficultyText,
                      isActive && { color: topic.deepColor },
                    ]}
                  >
                    {level.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onStart}
            style={[styles.worldLauncherStart, { backgroundColor: topic.color }]}
          >
            <Text style={styles.primaryButtonText}>Start Adventure</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function DailyAdventureCard({ complete, onPress, streak, topic }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.dailyCard, complete && styles.dailyCardComplete]}
    >
      <View style={styles.dailyIconBubble}>
        <Text style={styles.dailyIconText}>{complete ? 'OK' : 'DAY'}</Text>
      </View>
      <View style={styles.dailyCopy}>
        <Text style={styles.dailyKicker}>{complete ? 'Today completed' : 'Daily Adventure'}</Text>
        <Text style={styles.dailyTitle}>{complete ? 'Daily sticker collected!' : `${topic.mapLabel}: 3 quick stages`}</Text>
        <Text style={styles.dailyText}>
          {complete ? `Your streak is now ${streak} day${streak === 1 ? '' : 's'}.` : 'Complete a short adventure to grow your learning streak.'}
        </Text>
      </View>
      <Text style={styles.dailyArrow}>{complete ? 'Done' : 'Play'}</Text>
    </TouchableOpacity>
  );
}

function SmartCoachCard({ coach, onPress }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.coachCard, { borderColor: coach.topic.color }]}
    >
      <View style={[styles.coachOrb, { backgroundColor: coach.topic.color }]}>
        <Text style={styles.coachOrbText}>N</Text>
      </View>
      <View style={styles.coachCopy}>
        <Text style={[styles.coachKicker, { color: coach.topic.deepColor }]}>NOVA'S SMART COACH</Text>
        <Text style={styles.coachTitle}>{coach.title}</Text>
        <Text style={styles.coachText}>{coach.detail}</Text>
      </View>
    </TouchableOpacity>
  );
}

function AdventureBookCard({ avatar, onPress, stats }) {
  const mastered = TOPICS.filter(
    (topic) => getMastery(getTopicStats(stats, topic.id)).label === 'Mastered'
  ).length;

  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.adventureBookCard}>
      <View style={[styles.bookAvatar, { backgroundColor: avatar.color }]}>
        <Text style={styles.bookAvatarText}>{avatar.mark}</Text>
      </View>
      <View style={styles.adventureBookCopy}>
        <Text style={styles.adventureBookTitle}>My Adventure Book</Text>
        <Text style={styles.adventureBookText}>{mastered}/4 little worlds discovered</Text>
      </View>
      <Text style={styles.teacherChevron}>›</Text>
    </TouchableOpacity>
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

function AdventureBookModal({ avatar, dailyProgress, onClose, stats, totals, visible }) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.popupOverlay}>
        <View style={styles.summaryModalCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.bookTitleRow}>
              <View style={[styles.bookAvatarSmall, { backgroundColor: avatar.color }]}>
                <Text style={styles.bookAvatarText}>{avatar.mark}</Text>
              </View>
              <Text style={styles.summaryTitle}>Adventure Book</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.summaryCloseButton}>
              <Text style={styles.summaryCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bookHeaderPanel}>
            <Text style={styles.bookHeaderTitle}>{avatar.label}'s star journey</Text>
            <Text style={styles.bookHeaderText}>
              {dailyProgress.streak > 0
                ? `${dailyProgress.streak}-day learning streak. Keep exploring.`
                : 'Begin a Daily Adventure to start your learning streak.'}
            </Text>
          </View>

          <View style={styles.summaryMetricRow}>
            <SummaryMetric label="XP" value={totals.xp} />
            <SummaryMetric label="Solved" value={totals.correct} />
            <SummaryMetric label="Streak" value={dailyProgress.streak} />
          </View>

          <View style={styles.powerSection}>
            <Text style={styles.powerSectionTitle}>Adventure Tools</Text>
            <Text style={styles.powerSectionText}>
              Earn 3 correct answers in a world to use its tool once per question.
            </Text>
            {TOPICS.map((topic) => {
              const topicStats = getTopicStats(stats, topic.id);
              const unlocked = topicStats.correct >= 3;
              const power = getBadgePower(topic.id);

              return (
                <View
                  key={topic.id}
                  style={[
                    styles.islandPowerRow,
                    unlocked && { backgroundColor: topic.softColor, borderColor: topic.color },
                  ]}
                >
                  <Text style={styles.islandPowerIcon}>{unlocked ? topic.badgeIcon : 'LOCK'}</Text>
                  <View style={styles.islandPowerCopy}>
                    <Text style={styles.islandPowerTitle}>{power.label}</Text>
                    <Text style={styles.islandPowerText}>
                      {unlocked ? power.detail : `${topicStats.correct}/3 correct to unlock`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <ScrollView style={styles.summaryTopicList}>
            {TOPICS.map((topic) => {
              const topicStats = getTopicStats(stats, topic.id);
              const mastery = getMastery(topicStats);

              return (
                <View key={topic.id} style={styles.masteryRow}>
                  <View style={[styles.masteryIcon, { backgroundColor: topic.softColor }]}>
                    <Text style={styles.masteryIconText}>{topic.icon}</Text>
                  </View>
                  <View style={styles.masteryCopy}>
                    <View style={styles.masteryTitleRow}>
                      <Text style={styles.masteryTitle}>{topic.mapLabel}</Text>
                      <Text style={[styles.masteryLabel, { color: topic.deepColor }]}>{mastery.label}</Text>
                    </View>
                    <View style={styles.masteryTrack}>
                      <View style={[styles.masteryFill, { backgroundColor: topic.color, width: `${mastery.progress}%` }]} />
                    </View>
                    <Text style={styles.masteryText}>{topicStats.correct}/{topicStats.answered || 0} correct - {getTopicAccuracy(topicStats)}% accuracy</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OnboardingModal({ avatarId, onChooseAvatar, onStart, visible }) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.popupOverlay}>
        <View style={styles.onboardingCard}>
          <View style={styles.novaBubble}>
            <Text style={styles.novaBubbleText}>N</Text>
          </View>
          <Text style={styles.onboardingTitle}>Welcome, Star Explorer!</Text>
          <Text style={styles.onboardingText}>
            I am Nova. Choose your explorer mark, then we will discover Little Worlds together.
          </Text>
          <View style={styles.avatarChoices}>
            {AVATARS.map((avatar) => {
              const selected = avatar.id === avatarId;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={avatar.id}
                  onPress={() => onChooseAvatar(avatar.id)}
                  style={[
                    styles.avatarChoice,
                    selected && { backgroundColor: avatar.color, borderColor: avatar.color },
                  ]}
                >
                  <View style={[styles.avatarChoiceMark, { backgroundColor: selected ? '#FFFFFF' : avatar.color }]}>
                    <Text style={[styles.avatarChoiceMarkText, selected && { color: avatar.color }]}>{avatar.mark}</Text>
                  </View>
                  <Text style={[styles.avatarChoiceText, selected && styles.avatarChoiceTextSelected]}>{avatar.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={onStart} style={styles.onboardingButton}>
            <Text style={styles.primaryButtonText}>Start My Adventure</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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

function WorldSpark({ active, color, motionEnabled }) {
  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!active || !motionEnabled) {
      glow.setValue(active ? 0.58 : 0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { duration: 850, toValue: 1, useNativeDriver: true }),
        Animated.timing(glow, { duration: 850, toValue: 0.35, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [active, glow, motionEnabled]);

  if (!active) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.worldSpark,
        { backgroundColor: color, opacity: glow, transform: [{ scale: glow }] },
      ]}
    />
  );
}

function WorldCard({
  topic,
  progress,
  topicStats,
  unlocked,
  unlockText,
  completed,
  isRecommended,
  motionEnabled,
  onPress,
}) {
  return (
    <BouncyTouchable
        accessibilityRole="button"
        disabled={!unlocked}
        motionEnabled={motionEnabled}
        onPress={onPress}
        style={[
          styles.worldCard,
          unlocked
            ? { backgroundColor: topic.softColor, borderColor: topic.color }
            : styles.worldCardLocked,
          isRecommended && styles.worldCardRecommended,
          completed && styles.worldCardCompleted,
        ]}
      >
        <WorldSpark
          active={completed || isRecommended}
          color={topic.color}
          motionEnabled={motionEnabled}
        />
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
            {completed ? 'Sticker found' : isRecommended ? 'Try this' : unlocked ? 'Explore' : 'Locked'}
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
            {unlocked ? `${Math.min(3, topicStats.correct)}/3 stickers` : 'New world'}
          </Text>
          <Text style={styles.nodeTitle}>{topic.mapLabel}</Text>
          <Text style={styles.nodeMission}>
            {unlocked ? topic.mission : unlockText}
          </Text>
          <View style={styles.nodeFooter}>
            <Text style={styles.nodeProgress}>
              {unlocked ? `${progress}% ready` : 'Find first'}
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
    </BouncyTouchable>
  );
}

function RoundComplete({
  activeTopic,
  currentDifficulty,
  nextDifficulty,
  nextTopic,
  nextTopicUnlocked,
  round,
  roundSize,
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
        <Text style={styles.completeTitle}>World discovery complete!</Text>
        <Text style={styles.completeText}>
          Awarded for completing {activeTopic.mapLabel} with courage and focus.
        </Text>
        <View style={[styles.xpBanner, { backgroundColor: activeTopic.deepColor }]}>
          <Text style={styles.xpBannerText}>
            {round.correct * XP_PER_CORRECT} XP earned
          </Text>
        </View>
      </View>
      <View style={styles.rewardRow}>
        <RewardBox label="Accuracy" value={`${round.correct}/${roundSize}`} />
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
                  : `Find 3 stickers in ${activeTopic.mapLabel} first.`
                : 'All little worlds are discovered.'
            }
            label="Next World"
            onPress={nextTopicUnlocked ? onNextTopic : undefined}
            title={nextTopic ? nextTopic.mapLabel : 'All Discovered'}
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
  motionEnabled,
  onClose,
  onResetProgress,
  setMotionEnabled,
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
              <Text style={styles.settingTitle}>Playful Motion</Text>
              <Text style={styles.settingText}>Nova, stars, and gentle button animations.</Text>
            </View>
            <Switch value={motionEnabled} onValueChange={setMotionEnabled} />
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

function FloatingTreasure({ children, index, motionEnabled }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motionEnabled) {
      drift.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          delay: index * 95,
          duration: 700,
          toValue: -4,
          useNativeDriver: true,
        }),
        Animated.timing(drift, { duration: 700, toValue: 0, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [drift, index, motionEnabled]);

  return <Animated.View style={{ transform: [{ translateY: drift }] }}>{children}</Animated.View>;
}

function QuestionDisplay({ countedObjects, motionEnabled, onToggleObject, question, topic }) {
  if (question.display.kind === 'objects') {
    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
          <Text style={styles.visualTitle}>{question.gameLabel || 'Pack the orchard basket'}</Text>
          <View style={styles.objectWrap}>
            {Array.from({ length: question.display.count }).map((_, index) => (
              <FloatingTreasure index={index} key={index} motionEnabled={motionEnabled}>
                <BouncyTouchable
                  accessibilityRole="button"
                  motionEnabled={motionEnabled}
                  onPress={() => onToggleObject(index)}
                  style={[
                    styles.objectToken,
                    countedObjects.includes(index) && { backgroundColor: topic.color, borderColor: topic.deepColor },
                  ]}
                >
                  <Text style={styles.objectIcon}>{question.display.object}</Text>
                  {countedObjects.includes(index) && (
                    <Text style={styles.objectCountTag}>{countedObjects.indexOf(index) + 1}</Text>
                  )}
                </BouncyTouchable>
              </FloatingTreasure>
            ))}
        </View>
        <Text style={styles.countedText}>Basket count: {countedObjects.length}</Text>
      </View>
    );
  }

  if (question.display.kind === 'compareObjects') {
    const { goal, leftCount, object, rightCount } = question.display;

    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
        <Text style={styles.visualTitle}>{question.gameLabel || 'Compare the baskets'}</Text>
        <Text style={[styles.compareGoal, { color: topic.deepColor }]}>Find the {goal} group</Text>
        <View style={styles.compareGroups}>
          {[
            { label: 'Left basket', count: leftCount },
            { label: 'Right basket', count: rightCount },
          ].map((group) => (
            <View key={group.label} style={[styles.compareBasket, { borderColor: topic.color }]}>
              <Text style={styles.compareBasketLabel}>{group.label}</Text>
              <View style={styles.compareObjectWrap}>
                {Array.from({ length: group.count }).map((_, index) => (
                  <Text key={index} style={styles.compareObject}>{object}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (question.display.kind === 'tenFrameTarget') {
    return (
      <View
        style={[
          styles.visualCard,
          styles.compactVisualCard,
          { backgroundColor: topic.glowColor },
        ]}
      >
        <Text style={styles.visualTitle}>{question.gameLabel}</Text>
        <View style={[styles.tenFrameMission, { borderColor: topic.color }]}>
          <Text style={[styles.tenFrameMissionNumber, { color: topic.deepColor }]}>
            {question.display.number}
          </Text>
          <View style={styles.tenFrameMissionCopy}>
            <Text style={styles.tenFrameMissionLabel}>PICNIC ORDER</Text>
            <Text style={styles.tenFrameMissionText}>
              Tap spaces below to pack {question.display.plural}.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (question.display.kind === 'workshopTarget') {
    return (
      <View style={[styles.visualCard, styles.workshopVisualCard]}>
        <Text style={styles.visualTitle}>{question.gameLabel || 'Power the number machine'}</Text>
        <View style={[styles.workshopTargetScreen, { borderColor: topic.color }]}>
          <Text style={styles.workshopTargetLabel}>TARGET POWER</Text>
          <Text style={[styles.workshopTargetNumber, { color: topic.deepColor }]}>
            {question.display.number}
          </Text>
        </View>
        <View style={styles.workshopPartLegend}>
          <View style={styles.workshopLegendItem}>
            <View style={styles.workshopLegendRod} />
            <Text style={styles.workshopLegendText}>One rod means ten</Text>
          </View>
          <View style={styles.workshopLegendItem}>
            <View style={styles.workshopLegendGem} />
            <Text style={styles.workshopLegendText}>One gem means one</Text>
          </View>
        </View>
      </View>
    );
  }

  if (question.display.kind === 'workshopMissing') {
    const tensValue = question.display.missingPart === 'tens' ? '?' : question.display.tens;
    const onesValue = question.display.missingPart === 'ones' ? '?' : question.display.ones;

    return (
      <View style={[styles.visualCard, styles.workshopVisualCard]}>
        <Text style={styles.visualTitle}>{question.gameLabel || 'Find the missing part'}</Text>
        <View style={styles.workshopEquationVisual}>
          <View style={[styles.workshopEquationPart, styles.workshopEquationTens]}>
            <Text style={styles.workshopEquationValue}>{tensValue}</Text>
            <Text style={styles.workshopEquationLabel}>TENS</Text>
          </View>
          <Text style={styles.workshopEquationWord}>AND</Text>
          <View style={[styles.workshopEquationPart, styles.workshopEquationOnes]}>
            <Text style={styles.workshopEquationValue}>{onesValue}</Text>
            <Text style={styles.workshopEquationLabel}>ONES</Text>
          </View>
          <Text style={styles.workshopEquationWord}>MAKE</Text>
          <View style={[styles.workshopEquationTarget, { borderColor: topic.color }]}>
            <Text style={[styles.workshopEquationTargetText, { color: topic.deepColor }]}>
              {question.display.number}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (question.display.kind === 'placeValue') {
    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
        {question.display.showNumber !== false && (
          <Text style={[styles.bigNumber, { color: topic.deepColor }]}>
            {question.display.number}
          </Text>
        )}
        {question.display.showNumber === false && (
          <Text style={styles.visualTitle}>{question.gameLabel || 'Read the workshop machine'}</Text>
        )}
        <View style={styles.placeValueWrap}>
          <PlaceGroup
            label="Tens blocks"
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

  if (question.display.kind === 'wordPairs') {
    return (
      <View style={[styles.visualCard, styles.compactVisualCard, styles.gardenVisualCard]}>
        <Text style={styles.visualTitle}>{question.gameLabel}</Text>
        <View style={styles.matchMissionRow}>
          {question.display.pairs.map((pair) => (
            <View key={pair.number} style={styles.matchMissionPair}>
              <View style={[styles.matchMissionToken, { backgroundColor: '#FFF1D8' }]}>
                <Text style={styles.matchMissionTokenText}>123</Text>
              </View>
              <Text style={[styles.matchMissionLink, { color: topic.deepColor }]}>?</Text>
              <View style={[styles.matchMissionToken, { backgroundColor: '#E7FAD7' }]}>
                <Text style={styles.matchMissionTokenText}>ABC</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.matchMissionText}>
          Bloom {question.display.pairCount} matching {question.display.pairCount === 1 ? 'pair' : 'pairs'}.
        </Text>
      </View>
    );
  }

  if (question.display.kind === 'bigNumber') {
    return (
      <View style={[styles.visualCard, styles.gardenVisualCard]}>
        <Text style={styles.visualTitle}>{question.gameLabel || 'Grow a word flower'}</Text>
        <GardenFlower color={topic.color}>
          <Text style={[styles.gardenNumber, { color: topic.deepColor }]}>
            {question.display.number}
          </Text>
        </GardenFlower>
      </View>
    );
  }

  if (question.display.kind === 'targetNumber') {
    return (
      <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
        <Text style={styles.visualTitle}>{question.gameLabel || 'Pack the right basket'}</Text>
        <View style={[styles.numberPortal, { borderColor: topic.color }]}>
          <Text style={[styles.bigNumber, { color: topic.deepColor }]}>
            {question.display.number}
          </Text>
        </View>
      </View>
    );
  }

  if (question.display.kind === 'word') {
    return (
      <View style={[styles.visualCard, styles.gardenVisualCard]}>
        <Text style={styles.visualTitle}>{question.gameLabel || 'Read the garden label'}</Text>
        <GardenFlower color={topic.color}>
          <Text style={[styles.gardenWord, { color: topic.deepColor }]}>
            {question.display.word}
          </Text>
        </GardenFlower>
      </View>
    );
  }

  return (
    <View style={[styles.visualCard, { backgroundColor: topic.glowColor }]}>
      <Text style={styles.visualTitle}>{question.gameLabel || 'Set the comet route'}</Text>
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

function MiniPlaceMachine({ ones, tens }) {
  return (
    <View style={styles.miniMachine}>
      <View style={styles.miniMachineWindow}>
        <View style={styles.miniMachineRods}>
          {Array.from({ length: tens }).map((_, index) => (
            <View key={`rod-${index}`} style={styles.miniMachineRod} />
          ))}
        </View>
        <View style={styles.miniMachineGems}>
          {Array.from({ length: ones }).map((_, index) => (
            <View key={`gem-${index}`} style={styles.miniMachineGem} />
          ))}
        </View>
      </View>
      <View style={styles.miniMachineBase}>
        <View style={styles.miniMachineLight} />
        <View style={styles.miniMachineLight} />
        <View style={styles.miniMachineLight} />
      </View>
    </View>
  );
}

function GardenFlower({ children, color }) {
  const petals = [
    styles.gardenPetalTop,
    styles.gardenPetalUpperLeft,
    styles.gardenPetalUpperRight,
    styles.gardenPetalLowerLeft,
    styles.gardenPetalLowerRight,
    styles.gardenPetalBottom,
  ];

  return (
    <View style={styles.gardenFlower}>
      <View style={styles.gardenStem} />
      <View style={styles.gardenLeaf} />
      {petals.map((petalStyle, index) => (
        <View
          key={`petal-${index}`}
          style={[
            styles.gardenPetal,
            petalStyle,
            { backgroundColor: index % 2 === 0 ? color : '#F7C948' },
          ]}
        />
      ))}
      <View style={styles.gardenFlowerCenter}>{children}</View>
    </View>
  );
}

function TenFrameBuilder({
  feedback,
  filledCells,
  onCheck,
  onToggleCell,
  question,
  topic,
}) {
  const frameCount = Math.ceil(question.display.capacity / 10);
  const canCheck = filledCells.length > 0 && !feedback;

  return (
    <View style={[styles.tenFrameBuilder, { backgroundColor: topic.softColor }]}>
      <View style={styles.tenFrameHeader}>
        <View>
          <Text style={styles.tenFrameHeading}>Build the picnic order</Text>
          <Text style={styles.tenFrameInstruction}>Tap a filled space again to remove it.</Text>
        </View>
        <View style={[styles.tenFrameCounter, { borderColor: topic.color }]}>
          <Text style={[styles.tenFrameCounterValue, { color: topic.deepColor }]}>
            {filledCells.length}
          </Text>
          <Text style={styles.tenFrameCounterTarget}>of {question.answer}</Text>
        </View>
      </View>

      <View style={styles.tenFrameStack}>
        {Array.from({ length: frameCount }).map((_, frameIndex) => (
          <View key={frameIndex} style={[styles.tenFrameGrid, { borderColor: topic.deepColor }]}>
            {Array.from({ length: 10 }).map((__, localIndex) => {
              const index = frameIndex * 10 + localIndex;
              const isFilled = filledCells.includes(index);

              return (
                <TouchableOpacity
                  accessibilityLabel={`${isFilled ? 'Remove' : 'Add'} item in space ${index + 1}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: Boolean(feedback), selected: isFilled }}
                  disabled={Boolean(feedback)}
                  hitSlop={2}
                  key={index}
                  onPress={() => onToggleCell(index)}
                  style={[
                    styles.tenFrameCell,
                    { borderColor: topic.color },
                    isFilled && { backgroundColor: topic.glowColor },
                  ]}
                >
                  <Text style={styles.tenFrameCellObject}>
                    {isFilled ? question.display.object : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !canCheck }}
        disabled={!canCheck}
        onPress={onCheck}
        style={[
          styles.tenFrameCheckButton,
          { backgroundColor: topic.deepColor },
          !canCheck && styles.disabledButton,
        ]}
      >
        <Text style={styles.primaryButtonText}>Check My Tray</Text>
      </TouchableOpacity>
    </View>
  );
}

function WordPairMatcher({
  feedback,
  matchedPairIds,
  motionEnabled,
  onTapCard,
  question,
  selectedCardIds,
  topic,
}) {
  return (
    <View style={[styles.wordPairBuilder, { backgroundColor: topic.softColor }]}>
      <View style={styles.wordPairHeader}>
        <View>
          <Text style={styles.wordPairHeading}>Seed and word flower</Text>
          <Text style={styles.wordPairInstruction}>Tap the selected card again to cancel.</Text>
        </View>
        <View style={[styles.wordPairProgress, { borderColor: topic.color }]}>
          <Text style={[styles.wordPairProgressValue, { color: topic.deepColor }]}>
            {matchedPairIds.length}/{question.display.pairCount}
          </Text>
          <Text style={styles.wordPairProgressLabel}>BLOOMED</Text>
        </View>
      </View>

      <View style={styles.wordPairGrid}>
        {question.options.map((card) => {
          const isMatched = matchedPairIds.includes(card.pairId);
          const isSelected = selectedCardIds.includes(card.id);

          return (
            <BouncyTouchable
              accessibilityLabel={`${card.cardType === 'number' ? 'Number' : 'Word'} card ${card.label}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(feedback) || isMatched, selected: isSelected }}
              disabled={Boolean(feedback) || isMatched}
              key={card.id}
              motionEnabled={motionEnabled}
              onPress={() => onTapCard(card)}
              wrapperStyle={styles.wordPairCardWrapper}
              style={[
                styles.wordPairCard,
                card.cardType === 'number'
                  ? styles.wordPairNumberCard
                  : styles.wordPairWordCard,
                isSelected && { borderColor: topic.deepColor, backgroundColor: topic.glowColor },
                isMatched && styles.wordPairCardMatched,
              ]}
            >
              <Text style={styles.wordPairCardType}>
                {card.cardType === 'number' ? 'SEED' : 'FLOWER'}
              </Text>
              <Text
                style={[
                  styles.wordPairCardText,
                  card.cardType === 'number' && styles.wordPairNumberText,
                  isMatched && styles.wordPairMatchedText,
                ]}
              >
                {isMatched ? 'Bloomed' : card.label}
              </Text>
            </BouncyTouchable>
          );
        })}
      </View>
    </View>
  );
}

function PlaceValueBuilder({ feedback, onAdjust, onCheck, placeBuild, target, topic }) {
  const buildLabel = `${placeBuild.tens} tens and ${placeBuild.ones} ones`;
  const total = placeBuild.tens * 10 + placeBuild.ones;

  return (
    <View style={styles.placeBuilder}>
      <View style={styles.builderHeadingRow}>
        <View>
          <Text style={styles.builderPrompt}>Tap a part to load the machine.</Text>
          <Text style={styles.builderTargetText}>Target: {target}</Text>
        </View>
        <View style={[styles.builderPowerBadge, { borderColor: topic.color }]}>
          <Text style={[styles.builderPowerValue, { color: topic.deepColor }]}>{total}</Text>
          <Text style={styles.builderPowerLabel}>POWER</Text>
        </View>
      </View>

      <View style={styles.builderMachineTray}>
        {placeBuild.tens === 0 && placeBuild.ones === 0 ? (
          <Text style={styles.builderEmptyText}>The machine is waiting for parts.</Text>
        ) : (
          <>
            <View style={styles.builderLoadedRods}>
              {Array.from({ length: placeBuild.tens }).map((_, index) => (
                <View key={`loaded-rod-${index}`} style={styles.builderLoadedRod}>
                  <Text style={styles.builderLoadedRodText}>10</Text>
                </View>
              ))}
            </View>
            <View style={styles.builderLoadedGems}>
              {Array.from({ length: placeBuild.ones }).map((_, index) => (
                <View key={`loaded-gem-${index}`} style={styles.builderLoadedGem} />
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.builderEquation}>
        <Text style={styles.builderEquationText}>
          Machine makes {total}
        </Text>
        <Text style={styles.builderAnswerText}>{buildLabel}</Text>
      </View>

      <View style={styles.builderPartRow}>
        <WorkshopPartButton
          color="#1CB0F6"
          detail="Tens rod"
          kind="rod"
          label="ADD TEN"
          onPress={() => onAdjust('tens', 1)}
        />
        <WorkshopPartButton
          color="#FFB020"
          detail="Single gem"
          kind="gem"
          label="ADD ONE"
          onPress={() => onAdjust('ones', 1)}
        />
      </View>

      <View style={styles.builderRemoveRow}>
        <TouchableOpacity
          accessibilityLabel="Remove one tens rod"
          accessibilityRole="button"
          disabled={placeBuild.tens === 0}
          onPress={() => onAdjust('tens', -1)}
          style={[styles.builderRemoveButton, placeBuild.tens === 0 && styles.disabledToolButton]}
        >
          <Text style={styles.builderRemoveText}>Remove a ten</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Remove one single gem"
          accessibilityRole="button"
          disabled={placeBuild.ones === 0}
          onPress={() => onAdjust('ones', -1)}
          style={[styles.builderRemoveButton, placeBuild.ones === 0 && styles.disabledToolButton]}
        >
          <Text style={styles.builderRemoveText}>Remove one</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        disabled={Boolean(feedback)}
        onPress={onCheck}
        style={[styles.builderCheckButton, { backgroundColor: topic.color }, Boolean(feedback) && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>Check My Build</Text>
      </TouchableOpacity>
    </View>
  );
}

function WorkshopPartButton({ color, detail, kind, label, onPress }) {
  return (
    <TouchableOpacity
      accessibilityLabel={`Add one ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.workshopPartButton, { borderColor: color }]}
    >
      <View style={styles.workshopPartVisual}>
        {kind === 'rod' ? (
          <View style={[styles.workshopAddRod, { backgroundColor: color }]} />
        ) : (
          <View style={[styles.workshopAddGem, { backgroundColor: color }]} />
        )}
      </View>
      <View style={styles.workshopPartCopy}>
        <Text style={[styles.workshopPartValue, { color }]}>{label}</Text>
        <Text style={styles.workshopPartDetail}>{detail}</Text>
      </View>
    </TouchableOpacity>
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

function SequenceBuilder({
  feedback,
  onCheck,
  onTapNumber,
  onUndo,
  question,
  sequence,
  topic,
}) {
  const stopColors = ['#FFF1D8', '#DDF3FF', '#EFE7FF', '#FFE2DD', '#E7FAD7'];
  const canUndo = sequence.length > 0 && !feedback;
  const canCheck = sequence.length === question.answer.length && !feedback;

  return (
    <View
      style={[
        styles.sequenceBuilderCard,
        { backgroundColor: topic.softColor, borderColor: topic.color },
      ]}
    >
      <View style={styles.sequenceBuilderHeader}>
        <Text style={styles.sequenceProgressText}>
          Route {sequence.length}/{question.answer.length}
        </Text>
        <TouchableOpacity
          accessibilityLabel="Undo last number"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canUndo }}
          disabled={!canUndo}
          onPress={onUndo}
          style={[
            styles.sequenceUndoButton,
            { borderColor: topic.color },
            !canUndo && styles.disabledButton,
          ]}
        >
          <Text style={[styles.sequenceUndoIcon, { color: topic.deepColor }]}>↶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sequenceSlots}>
        {question.answer.map((_, index) => (
          <View
            key={index}
            style={[
              styles.sequenceSlot,
              {
                backgroundColor: stopColors[index % stopColors.length],
                borderColor: sequence[index] === undefined ? '#FFFFFF' : topic.color,
              },
            ]}
          >
            <Text style={styles.sequenceSlotText}>{sequence[index] ?? ''}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sequenceOptions}>
        {question.options.map((number, index) => {
          const used = sequence.includes(number);
          return (
            <TouchableOpacity
              accessibilityLabel={`Choose ${number}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: used }}
              disabled={used}
              key={number}
              onPress={() => onTapNumber(number)}
              style={[
                styles.sequenceNumber,
                {
                  backgroundColor: stopColors[index % stopColors.length],
                  borderColor: topic.color,
                },
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

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !canCheck }}
        disabled={!canCheck}
        onPress={onCheck}
        style={[
          styles.sequenceCheckButton,
          { backgroundColor: topic.deepColor },
          !canCheck && styles.disabledButton,
        ]}
      >
        <Text style={styles.sequenceCheckText}>Check Route</Text>
      </TouchableOpacity>
    </View>
  );
}

function CelebrationBurst({ color, motionEnabled, visible }) {
  const burst = useRef(new Animated.Value(0)).current;
  const sparks = [
    { x: -86, y: -62, size: 22 },
    { x: 82, y: -58, size: 18 },
    { x: -94, y: 20, size: 16 },
    { x: 92, y: 26, size: 22 },
    { x: -28, y: -94, size: 16 },
    { x: 32, y: -96, size: 20 },
  ];

  useEffect(() => {
    if (!visible || !motionEnabled) {
      burst.setValue(0);
      return undefined;
    }

    Animated.timing(burst, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [burst, motionEnabled, visible]);

  if (!visible || !motionEnabled) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.celebrationBurst}>
      {sparks.map((spark, index) => (
        <Animated.Text
          key={index}
          style={[
            styles.celebrationSpark,
            {
              color,
              fontSize: spark.size,
              opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, spark.x] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, spark.y] }) },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${index % 2 ? -45 : 45}deg`] }) },
              ],
            },
          ]}
        >
          *
        </Animated.Text>
      ))}
    </View>
  );
}

function ExplanationCountingFrames({ count, object, topic }) {
  const frameCount = Math.ceil(count / 10);

  return (
    <View style={styles.explanationFrameStack}>
      {Array.from({ length: frameCount }).map((_, frameIndex) => (
        <View key={frameIndex} style={[styles.explanationFrame, { borderColor: topic.color }]}>
          {Array.from({ length: 10 }).map((__, localIndex) => {
            const itemNumber = frameIndex * 10 + localIndex + 1;
            const isFilled = itemNumber <= count;

            return (
              <View
                key={itemNumber}
                style={[
                  styles.explanationFrameCell,
                  isFilled && { backgroundColor: topic.glowColor },
                ]}
              >
                <Text style={styles.explanationFrameObject}>{isFilled ? object : ''}</Text>
                {isFilled && <Text style={styles.explanationFrameNumber}>{itemNumber}</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function QuestionExplanation({ question, topic }) {
  const { display } = question;
  let detail = '';
  let title = '';
  let visual = null;

  if (['objects', 'targetNumber', 'tenFrameTarget'].includes(display.kind)) {
    const count = display.count ?? display.number ?? question.answer;
    const object = display.object || '●';
    title = 'Count one space at a time';
    detail = `The numbered spaces stop at ${count}, so the answer is ${count}.`;
    visual = <ExplanationCountingFrames count={count} object={object} topic={topic} />;
  } else if (display.kind === 'compareObjects') {
    const { goal, leftCount, rightCount } = display;
    const comparisonText = leftCount > rightCount ? 'is more than' : 'is fewer than';
    const comparisonBadge = leftCount > rightCount ? 'MORE THAN' : 'FEWER THAN';
    const answerLabel =
      goal === 'more'
        ? leftCount > rightCount ? 'Left basket' : 'Right basket'
        : leftCount < rightCount ? 'Left basket' : 'Right basket';
    title = 'Compare the two totals';
    detail = `${leftCount} ${comparisonText} ${rightCount}. The ${answerLabel.toLowerCase()} has ${goal} items.`;
    visual = (
      <View style={styles.explanationCompareRow}>
        <View style={[styles.explanationCompareValue, { borderColor: topic.color }]}>
          <Text style={[styles.explanationCompareNumber, { color: topic.deepColor }]}>{leftCount}</Text>
          <Text style={styles.explanationCompareLabel}>LEFT</Text>
        </View>
        <Text style={[styles.explanationCompareWord, { color: topic.deepColor }]}>
          {comparisonBadge}
        </Text>
        <View style={[styles.explanationCompareValue, { borderColor: topic.color }]}>
          <Text style={[styles.explanationCompareNumber, { color: topic.deepColor }]}>{rightCount}</Text>
          <Text style={styles.explanationCompareLabel}>RIGHT</Text>
        </View>
      </View>
    );
  } else if (['placeValue', 'workshopTarget', 'workshopMissing'].includes(display.kind)) {
    const number = display.number;
    const tens = display.tens ?? Math.floor(number / 10);
    const ones = display.ones ?? number % 10;
    title = 'Build tens first, then ones';
    detail = `${tens} tens make ${tens * 10}. Add ${ones} ones to make ${number}.`;
    visual = (
      <View style={styles.explanationPlaceValue}>
        <View style={styles.explanationPartsRow}>
          <View style={styles.explanationPartGroup}>
            <View style={styles.explanationRodRow}>
              {Array.from({ length: tens }).map((_, index) => (
                <View key={index} style={styles.explanationRod} />
              ))}
            </View>
            <Text style={styles.explanationPartLabel}>{tens} TENS</Text>
          </View>
          <Text style={styles.explanationPlus}>AND</Text>
          <View style={styles.explanationPartGroup}>
            <View style={styles.explanationGemRow}>
              {Array.from({ length: ones }).map((_, index) => (
                <View key={index} style={styles.explanationGem} />
              ))}
            </View>
            <Text style={styles.explanationPartLabel}>{ones} ONES</Text>
          </View>
        </View>
        <Text style={[styles.explanationEquation, { color: topic.deepColor }]}>
          {tens} tens and {ones} ones make {number}
        </Text>
      </View>
    );
  } else if (display.kind === 'wordPairs') {
    title = 'Each number has one word name';
    detail = 'Read each row aloud. The numeral and word in that row mean the same amount.';
    visual = (
      <View style={styles.explanationPairList}>
        {display.pairs.map((pair) => (
          <View key={pair.number} style={styles.explanationPairRow}>
            <Text style={[styles.explanationPairNumber, { color: topic.deepColor }]}>{pair.number}</Text>
            <Text style={styles.explanationPairEquals}>MATCHES</Text>
            <Text style={styles.explanationPairWord}>{pair.word}</Text>
          </View>
        ))}
      </View>
    );
  } else if (display.kind === 'word' || display.kind === 'bigNumber') {
    const number = display.kind === 'word' ? question.answer : display.number;
    const word = display.kind === 'word' ? display.word : question.answer;
    title = 'The numeral and word match';
    detail = `Say it together: ${number} is written as ${word}.`;
    visual = (
      <View style={styles.explanationWordRow}>
        <Text style={[styles.explanationWordNumber, { color: topic.deepColor }]}>{number}</Text>
        <Text style={styles.explanationWordEquals}>IS</Text>
        <Text style={styles.explanationWordText}>{word}</Text>
      </View>
    );
  } else if (display.kind === 'sequence') {
    title = display.direction === 'smallToBig' ? 'Start with the smallest' : 'Start with the biggest';
    detail = `Follow the route one step at a time: ${question.answer.join(', ')}.`;
    visual = (
      <View style={styles.explanationRoute}>
        {question.answer.map((number, index) => (
          <View key={number} style={styles.explanationRouteStepWrap}>
            <View style={[styles.explanationRouteStep, { borderColor: topic.color }]}>
              <Text style={[styles.explanationRouteNumber, { color: topic.deepColor }]}>{number}</Text>
            </View>
            {index < question.answer.length - 1 && (
              <Text style={[styles.explanationRouteArrow, { color: topic.deepColor }]}>›</Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.explanationPanel, { borderColor: topic.color }]}>
      <Text style={[styles.explanationEyebrow, { color: topic.deepColor }]}>NOVA'S VISUAL CLUE</Text>
      <Text style={styles.explanationTitle}>{title}</Text>
      {visual}
      <Text style={styles.explanationDetail}>{detail}</Text>
    </View>
  );
}

function AnswerPopup({ feedback, motionEnabled, onNext, onRetry, question, topic }) {
  const isVisible = Boolean(feedback);
  const [showExplanation, setShowExplanation] = useState(false);
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

    if (!motionEnabled) {
      popAnim.setValue(1);
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
  }, [isVisible, motionEnabled, popAnim]);

  useEffect(() => {
    setShowExplanation(false);
  }, [feedback, question]);

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
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.popupContent}
              showsVerticalScrollIndicator={false}
              style={styles.popupScroll}
            >
              <CelebrationBurst
                color={topic.color}
                motionEnabled={motionEnabled}
                visible={feedback.isCorrect}
              />
              <View style={[styles.popupBadge, { backgroundColor: topic.color }]}>
                <Text style={styles.popupBadgeText}>{feedback.badge}</Text>
              </View>
              <Text style={styles.popupTitle}>{feedback.title}</Text>
              <Text style={styles.popupDetail}>{feedback.detail}</Text>

              {!feedback.isCorrect && (
                <TouchableOpacity
                  accessibilityState={{ expanded: showExplanation }}
                  accessibilityRole="button"
                  onPress={() => setShowExplanation((current) => !current)}
                  style={[styles.explanationToggleButton, { borderColor: topic.color }]}
                >
                  <Text style={[styles.explanationToggleText, { color: topic.deepColor }]}>
                    {showExplanation ? 'Hide Visual Clue' : 'Show Me Why'}
                  </Text>
                </TouchableOpacity>
              )}

              {!feedback.isCorrect && showExplanation && (
                <QuestionExplanation question={question} topic={topic} />
              )}

              {(feedback.isCorrect || !showExplanation) && (
                <View style={styles.popupNovaRow}>
                  <NovaCompanion
                    compact
                    motionEnabled={motionEnabled}
                    mood={feedback.isCorrect ? 'YAY' : 'THINK'}
                  />
                  <Text style={styles.popupNovaText}>
                    {feedback.isCorrect
                      ? 'Nova is sparkling with pride!'
                      : 'Nova believes you can solve it.'}
                  </Text>
                </View>
              )}

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
            </ScrollView>
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
    backgroundColor: '#DDF3FF',
    paddingTop: ANDROID_TOP_INSET,
  },
  homeScreen: {
    backgroundColor: '#DDF3FF',
  },
  homeScroll: {
    backgroundColor: '#DDF3FF',
  },
  homeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
  },
  hero: {
    marginBottom: 14,
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
    marginBottom: 12,
  },
  heroIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  avatarMark: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 3,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarMarkText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  heroEyebrow: {
    color: '#60758A',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroBrand: {
    color: '#13293D',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 1,
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
    borderColor: '#D9E8F2',
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroSettingsIcon: {
    color: '#0B6FA4',
    fontSize: 21,
    fontWeight: '900',
  },
  heroWelcome: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFF1D8',
    borderColor: '#FFCC66',
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    minHeight: 142,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingLeft: 17,
    paddingRight: 8,
    paddingTop: 14,
  },
  heroWelcomeCopy: {
    flex: 1,
    paddingRight: 5,
  },
  heroKicker: {
    color: '#B75E00',
    fontSize: 10,
    fontWeight: '900',
  },
  heroTitle: {
    color: '#13293D',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
    marginTop: 4,
  },
  heroText: {
    color: '#52677D',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 5,
  },
  heroMiniStats: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  heroMiniStat: {
    color: '#8A4A00',
    fontSize: 11,
    fontWeight: '900',
  },
  heroMiniDivider: {
    backgroundColor: '#E5A83C',
    height: 13,
    width: 2,
  },
  novaCompanion: {
    alignItems: 'center',
    minWidth: 52,
  },
  novaMascot: {
    height: 94,
    marginBottom: -19,
    width: 72,
  },
  novaMascotCompact: {
    height: 68,
    marginBottom: -14,
    width: 54,
  },
  novaMascotHero: {
    height: 108,
    marginBottom: -24,
    width: 82,
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
  nextAdventureCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: 15,
  },
  nextAdventureIcon: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 4,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  nextAdventureIconText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  nextAdventureCopy: {
    flex: 1,
  },
  nextAdventureKicker: {
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  nextAdventureTitle: {
    color: '#13293D',
    fontSize: 19,
    fontWeight: '900',
  },
  nextAdventureText: {
    color: '#52677D',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  nextAdventureAction: {
    fontSize: 14,
    fontWeight: '900',
  },
  journeySnapshot: {
    marginBottom: 18,
  },
  snapshotHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  snapshotTitle: {
    color: '#13293D',
    fontSize: 20,
    fontWeight: '900',
  },
  snapshotHint: {
    color: '#6B7D90',
    fontSize: 10,
    fontWeight: '900',
  },
  journeyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  journeyAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9E5EF',
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 98,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 9,
  },
  journeyActionDot: {
    borderRadius: 999,
    height: 9,
    marginBottom: 4,
    width: 24,
  },
  journeyActionValue: {
    color: '#13293D',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  journeyActionDetail: {
    color: '#77899B',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  journeyActionDisabled: {
    backgroundColor: '#F1F5F8',
    opacity: 0.55,
  },
  journeyActionIcon: {
    color: '#62768A',
    fontSize: 10,
    fontWeight: '900',
  },
  journeyActionText: {
    color: '#13293D',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 1,
    textAlign: 'center',
  },
  worldLauncherCard: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    maxWidth: 430,
    padding: 18,
    width: '100%',
  },
  worldLauncherHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  worldLauncherIcon: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 3,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  worldLauncherIconText: {
    fontSize: 28,
  },
  worldLauncherClose: {
    alignItems: 'center',
    backgroundColor: '#EEF4F8',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  worldLauncherCloseText: {
    color: '#42576C',
    fontSize: 16,
    fontWeight: '900',
  },
  worldLauncherKicker: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 14,
  },
  worldLauncherTitle: {
    color: '#13293D',
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 3,
  },
  worldLauncherText: {
    color: '#52677D',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
  },
  worldLauncherProgressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  worldLauncherProgressLabel: {
    color: '#13293D',
    fontSize: 12,
    fontWeight: '900',
  },
  worldLauncherProgressValue: {
    fontSize: 11,
    fontWeight: '900',
  },
  worldLauncherTrack: {
    backgroundColor: '#E3ECF3',
    borderRadius: 999,
    height: 8,
    marginTop: 6,
    overflow: 'hidden',
  },
  worldLauncherFill: {
    borderRadius: 999,
    height: '100%',
  },
  worldLauncherDifficultyLabel: {
    color: '#60758A',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 17,
  },
  worldDifficultyButton: {
    alignItems: 'center',
    backgroundColor: '#F1F6FA',
    borderColor: '#D2DEE8',
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  worldDifficultyText: {
    color: '#52677D',
    fontSize: 12,
    fontWeight: '900',
  },
  worldLauncherStart: {
    alignItems: 'center',
    borderBottomColor: 'rgba(19, 41, 61, 0.18)',
    borderBottomWidth: 5,
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 16,
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
  dailyCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#13293D',
    borderColor: '#F7C948',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 14,
    padding: 16,
  },
  dailyCardComplete: {
    backgroundColor: '#245B45',
    borderColor: '#58CC02',
  },
  dailyIconBubble: {
    alignItems: 'center',
    backgroundColor: '#F7C948',
    borderRadius: 22,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  dailyIconText: {
    color: '#13293D',
    fontSize: 14,
    fontWeight: '900',
  },
  dailyCopy: {
    flex: 1,
  },
  dailyKicker: {
    color: '#F7C948',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dailyTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },
  dailyText: {
    color: '#D8E7F2',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  dailyArrow: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  coachCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 14,
    padding: 16,
  },
  coachOrb: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 4,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  coachOrbText: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
  },
  coachCopy: {
    flex: 1,
  },
  coachKicker: {
    fontSize: 11,
    fontWeight: '900',
  },
  coachTitle: {
    color: '#13293D',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 3,
  },
  coachText: {
    color: '#5A6B7C',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  adventureBookCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#EEE7FF',
    borderColor: '#8B5CF6',
    borderRadius: 26,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 16,
    padding: 16,
  },
  bookAvatar: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 4,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  bookAvatarText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
  },
  adventureBookCopy: {
    flex: 1,
  },
  adventureBookTitle: {
    color: '#13293D',
    fontSize: 21,
    fontWeight: '900',
  },
  adventureBookText: {
    color: '#5735B4',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
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
    color: '#13293D',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 3,
  },
  storySection: {
    marginTop: 2,
  },
  storySectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  storySectionHint: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    maxWidth: 255,
  },
  storyProgressBadge: {
    alignItems: 'center',
    backgroundColor: '#F7C948',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 48,
  },
  storyProgressBadgeText: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '900',
  },
  travelMap: {
    ...shadow,
    backgroundColor: '#FFFFFF',
    borderColor: '#D7E5EE',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  travelMapCaption: {
    backgroundColor: '#13293D',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  travelMapCaptionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  worldMapZone: {
    height: 190,
    overflow: 'hidden',
    position: 'relative',
  },
  worldMapZoneImage: {
    opacity: 0.96,
  },
  worldMapWash: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mapTrailDot: {
    backgroundColor: '#FFF8C7',
    borderColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 2,
    height: 13,
    position: 'absolute',
    width: 13,
  },
  worldMapCopy: {
    backgroundColor: 'rgba(255, 255, 255, 0.91)',
    borderColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'absolute',
    top: 34,
    width: '52%',
  },
  worldMapCopyLeft: {
    left: 13,
  },
  worldMapCopyRight: {
    right: 13,
  },
  worldMapChapter: {
    fontSize: 9,
    fontWeight: '900',
  },
  worldMapTitle: {
    color: '#13293D',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 2,
  },
  worldMapStory: {
    color: '#42576C',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 3,
  },
  worldMapMastery: {
    fontSize: 9,
    fontWeight: '900',
    marginTop: 5,
    textTransform: 'uppercase',
  },
  storyStop: {
    ...shadow,
    alignItems: 'center',
    borderBottomWidth: 6,
    borderRadius: 999,
    borderWidth: 4,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  storyStopAnchor: {
    alignItems: 'center',
    position: 'absolute',
    top: 43,
    width: 116,
  },
  storyStopLeft: {
    left: 10,
  },
  storyStopRight: {
    right: 10,
  },
  storyStopLocked: {
    backgroundColor: '#A9B8C8',
    borderColor: '#EAF0F5',
  },
  storyStopComplete: {
    borderBottomColor: '#F7C948',
  },
  storyStopNext: {
    borderColor: '#FFF8C7',
  },
  storyStopIconText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },
  storyStopCopy: {
    backgroundColor: 'rgba(255, 255, 255, 0.93)',
    borderRadius: 8,
    marginTop: 6,
    minHeight: 42,
    paddingHorizontal: 6,
    paddingVertical: 5,
    width: 116,
  },
  storyStopStatus: {
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  storyStopText: {
    color: '#42576C',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  storyStopPulse: {
    backgroundColor: 'rgba(255, 248, 199, 0.62)',
    borderRadius: 999,
    height: 92,
    left: 12,
    position: 'absolute',
    top: -10,
    width: 92,
  },
  novaTrailMini: {
    height: 58,
    position: 'absolute',
    right: -5,
    top: -38,
    width: 58,
  },
  worldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
  worldCard: {
    ...shadow,
    alignItems: 'flex-start',
    borderRadius: 22,
    borderWidth: 3,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 248,
    padding: 13,
    paddingTop: 25,
    position: 'relative',
  },
  worldCardRecommended: {
    borderBottomWidth: 6,
  },
  worldCardCompleted: {
    borderBottomWidth: 6,
  },
  worldCardLocked: {
    backgroundColor: '#EEF3F8',
    borderColor: '#A9B8C8',
    opacity: 0.95,
  },
  worldSpark: {
    borderRadius: 999,
    bottom: 14,
    height: 84,
    position: 'absolute',
    right: 8,
    width: 84,
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
    borderRadius: 23,
    borderWidth: 4,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  nodeIcon: {
    fontSize: 27,
  },
  nodeIconLocked: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  nodeCopy: {
    alignSelf: 'stretch',
    flex: 1,
  },
  nodeLevel: {
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  nodeTitle: {
    color: '#13293D',
    fontSize: 18,
    fontWeight: '900',
  },
  nodeMission: {
    color: '#42576C',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 5,
  },
  nodeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  nodeProgress: {
    color: '#13293D',
    fontSize: 11,
    fontWeight: '900',
  },
  nodeScore: {
    color: '#13293D',
    fontSize: 11,
    fontWeight: '900',
  },
  nodeStarsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
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
  compactVisualCard: {
    minHeight: 132,
    paddingVertical: 14,
  },
  visualTitle: {
    color: '#13293D',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 13,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  workshopVisualCard: {
    backgroundColor: '#F0E8FF',
  },
  workshopTargetScreen: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 4,
    minHeight: 104,
    justifyContent: 'center',
    width: '76%',
  },
  workshopTargetLabel: {
    color: '#6B7D90',
    fontSize: 10,
    fontWeight: '900',
  },
  workshopTargetNumber: {
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 58,
  },
  workshopPartLegend: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 12,
  },
  workshopLegendItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  workshopLegendRod: {
    backgroundColor: '#1CB0F6',
    borderRadius: 3,
    height: 25,
    width: 8,
  },
  workshopLegendGem: {
    backgroundColor: '#FFB020',
    borderRadius: 999,
    height: 14,
    width: 14,
  },
  workshopLegendText: {
    color: '#42576C',
    fontSize: 11,
    fontWeight: '900',
  },
  workshopEquationVisual: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  workshopEquationPart: {
    alignItems: 'center',
    borderRadius: 8,
    height: 70,
    justifyContent: 'center',
    width: 58,
  },
  workshopEquationTens: {
    backgroundColor: '#DDF3FF',
  },
  workshopEquationOnes: {
    backgroundColor: '#FFF1D8',
  },
  workshopEquationValue: {
    color: '#13293D',
    fontSize: 27,
    fontWeight: '900',
  },
  workshopEquationLabel: {
    color: '#60758A',
    fontSize: 8,
    fontWeight: '900',
  },
  workshopEquationSymbol: {
    color: '#5735B4',
    fontSize: 22,
    fontWeight: '900',
  },
  workshopEquationWord: {
    color: '#5735B4',
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  workshopEquationTarget: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 3,
    height: 70,
    justifyContent: 'center',
    width: 61,
  },
  workshopEquationTargetText: {
    fontSize: 25,
    fontWeight: '900',
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
  objectCountTag: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    color: '#13293D',
    fontSize: 11,
    fontWeight: '900',
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    right: -5,
    top: -7,
    textAlign: 'center',
  },
  countedText: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 15,
    textAlign: 'center',
  },
  compareGoal: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 11,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  compareGroups: {
    flexDirection: 'row',
    gap: 10,
  },
  compareBasket: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 16,
    borderWidth: 2,
    flex: 1,
    minHeight: 104,
    padding: 9,
  },
  compareBasketLabel: {
    color: '#13293D',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 7,
    textAlign: 'center',
  },
  compareObjectWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'center',
  },
  compareObject: {
    fontSize: 20,
  },
  tenFrameMission: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 12,
    maxWidth: 330,
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: '100%',
  },
  tenFrameMissionNumber: {
    fontSize: 46,
    fontWeight: '900',
    lineHeight: 50,
  },
  tenFrameMissionCopy: {
    flex: 1,
  },
  tenFrameMissionLabel: {
    color: '#60758A',
    fontSize: 10,
    fontWeight: '900',
  },
  tenFrameMissionText: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 2,
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
  wordDisplay: {
    fontSize: 32,
    fontWeight: '900',
    paddingHorizontal: 18,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  gardenVisualCard: {
    backgroundColor: '#E8F8D4',
  },
  matchMissionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  matchMissionPair: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  matchMissionToken: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 42,
  },
  matchMissionTokenText: {
    color: '#13293D',
    fontSize: 11,
    fontWeight: '900',
  },
  matchMissionLink: {
    fontSize: 19,
    fontWeight: '900',
  },
  matchMissionText: {
    color: '#42576C',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
    textAlign: 'center',
  },
  gardenFlower: {
    alignSelf: 'center',
    height: 166,
    position: 'relative',
    width: 240,
  },
  gardenStem: {
    backgroundColor: '#58A83D',
    borderRadius: 999,
    height: 72,
    left: 115,
    position: 'absolute',
    top: 91,
    width: 10,
  },
  gardenLeaf: {
    backgroundColor: '#7CCB55',
    borderBottomLeftRadius: 22,
    borderTopRightRadius: 22,
    height: 27,
    left: 121,
    position: 'absolute',
    top: 124,
    transform: [{ rotate: '-18deg' }],
    width: 43,
  },
  gardenPetal: {
    borderColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 3,
    height: 52,
    position: 'absolute',
    width: 82,
  },
  gardenPetalTop: {
    left: 79,
    top: 1,
    transform: [{ rotate: '90deg' }],
  },
  gardenPetalUpperLeft: {
    left: 25,
    top: 27,
    transform: [{ rotate: '28deg' }],
  },
  gardenPetalUpperRight: {
    right: 25,
    top: 27,
    transform: [{ rotate: '-28deg' }],
  },
  gardenPetalLowerLeft: {
    left: 29,
    top: 75,
    transform: [{ rotate: '-25deg' }],
  },
  gardenPetalLowerRight: {
    right: 29,
    top: 75,
    transform: [{ rotate: '25deg' }],
  },
  gardenPetalBottom: {
    left: 79,
    top: 94,
    transform: [{ rotate: '90deg' }],
  },
  gardenFlowerCenter: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FFF7DD',
    borderRadius: 999,
    borderWidth: 4,
    height: 78,
    justifyContent: 'center',
    left: 44,
    paddingHorizontal: 13,
    position: 'absolute',
    top: 43,
    width: 152,
  },
  gardenNumber: {
    fontSize: 45,
    fontWeight: '900',
  },
  gardenWord: {
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'capitalize',
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
    alignItems: 'stretch',
    gap: 7,
    marginBottom: 8,
  },
  challengeTools: {
    alignSelf: 'flex-end',
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
  powerButton: {
    backgroundColor: '#EEE7FF',
    borderColor: '#8B5CF6',
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
  powerButtonText: {
    color: '#5735B4',
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
  tenFrameBuilder: {
    borderRadius: 22,
    padding: 12,
  },
  tenFrameHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tenFrameHeading: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '900',
  },
  tenFrameInstruction: {
    color: '#60758A',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 2,
  },
  tenFrameCounter: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 3,
    height: 58,
    justifyContent: 'center',
    minWidth: 64,
  },
  tenFrameCounterValue: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  tenFrameCounterTarget: {
    color: '#60758A',
    fontSize: 10,
    fontWeight: '900',
  },
  tenFrameStack: {
    alignItems: 'center',
    gap: 8,
  },
  tenFrameGrid: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 5,
    width: 247,
  },
  tenFrameCell: {
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 9,
    borderWidth: 2,
    height: 43,
    justifyContent: 'center',
    width: 43,
  },
  tenFrameCellObject: {
    fontSize: 22,
    lineHeight: 27,
  },
  tenFrameCheckButton: {
    alignItems: 'center',
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomWidth: 5,
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  wordPairBuilder: {
    borderRadius: 22,
    padding: 12,
  },
  wordPairHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  wordPairHeading: {
    color: '#13293D',
    fontSize: 15,
    fontWeight: '900',
  },
  wordPairInstruction: {
    color: '#60758A',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 2,
  },
  wordPairProgress: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 3,
    height: 58,
    justifyContent: 'center',
    minWidth: 68,
  },
  wordPairProgressValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 23,
  },
  wordPairProgressLabel: {
    color: '#60758A',
    fontSize: 8,
    fontWeight: '900',
  },
  wordPairGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  wordPairCardWrapper: {
    width: '48%',
  },
  wordPairCard: {
    alignItems: 'center',
    borderBottomWidth: 5,
    borderRadius: 17,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 82,
    paddingHorizontal: 8,
    paddingVertical: 9,
    width: '100%',
  },
  wordPairNumberCard: {
    backgroundColor: '#FFF7E8',
    borderColor: '#F7C948',
  },
  wordPairWordCard: {
    backgroundColor: '#F1FBE9',
    borderColor: '#7CCB55',
  },
  wordPairCardMatched: {
    backgroundColor: '#DDF8C8',
    borderColor: '#58A83D',
  },
  wordPairCardType: {
    color: '#60758A',
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 3,
  },
  wordPairCardText: {
    color: '#13293D',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  wordPairNumberText: {
    fontSize: 27,
    lineHeight: 30,
  },
  wordPairMatchedText: {
    color: '#2F7D00',
    fontSize: 14,
  },
  machineOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  machineOptionWrapper: {
    width: '48%',
  },
  machineOptionButton: {
    minHeight: 118,
    paddingHorizontal: 8,
    paddingVertical: 9,
    width: '100%',
  },
  objectGroupOptionButton: {
    minHeight: 112,
    paddingHorizontal: 6,
    paddingVertical: 8,
    width: '100%',
  },
  compactNumberOptionButton: {
    minHeight: 66,
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: '100%',
  },
  wordOptionButton: {
    minHeight: 68,
  },
  visualOptionButton: {
    minHeight: 88,
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
  visualOptionObjects: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'center',
  },
  visualOptionObject: {
    fontSize: 19,
  },
  miniMachine: {
    alignItems: 'center',
    width: '100%',
  },
  miniMachineWindow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#8B5CF6',
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 62,
    padding: 6,
    width: '100%',
  },
  miniMachineRods: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: 31,
  },
  miniMachineRod: {
    backgroundColor: '#1CB0F6',
    borderRadius: 2,
    height: 29,
    width: 6,
  },
  miniMachineGems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 9,
  },
  miniMachineGem: {
    backgroundColor: '#FFB020',
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  miniMachineBase: {
    alignItems: 'center',
    backgroundColor: '#5735B4',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    flexDirection: 'row',
    gap: 5,
    height: 12,
    justifyContent: 'center',
    width: '72%',
  },
  miniMachineLight: {
    backgroundColor: '#F7C948',
    borderRadius: 999,
    height: 4,
    width: 4,
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
  sequenceBuilderCard: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 12,
  },
  sequenceBuilderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sequenceProgressText: {
    color: '#40566D',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sequenceUndoButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 4,
    borderRadius: 999,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sequenceUndoIcon: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 28,
  },
  sequenceSlot: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
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
  sequenceCheckButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomWidth: 5,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  sequenceCheckText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  placeBuilder: {
    gap: 11,
  },
  builderPrompt: {
    color: '#13293D',
    fontSize: 14,
    fontWeight: '900',
  },
  builderHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  builderTargetText: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  builderPowerBadge: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 3,
    height: 58,
    justifyContent: 'center',
    width: 66,
  },
  builderPowerValue: {
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 25,
  },
  builderPowerLabel: {
    color: '#6B7D90',
    fontSize: 7,
    fontWeight: '900',
  },
  builderMachineTray: {
    alignItems: 'center',
    backgroundColor: '#EEF4F8',
    borderColor: '#C8D6E5',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 2,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 88,
    padding: 10,
  },
  builderEmptyText: {
    color: '#7B8EA1',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  builderLoadedRods: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
    maxWidth: '58%',
  },
  builderLoadedRod: {
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    borderBottomColor: '#0B6FA4',
    borderBottomWidth: 4,
    borderRadius: 4,
    height: 50,
    justifyContent: 'center',
    width: 18,
  },
  builderLoadedRodText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    transform: [{ rotate: '-90deg' }],
  },
  builderLoadedGems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'center',
    maxWidth: '38%',
  },
  builderLoadedGem: {
    backgroundColor: '#FFB020',
    borderBottomColor: '#B75E00',
    borderBottomWidth: 3,
    borderRadius: 999,
    height: 18,
    width: 18,
  },
  builderEquation: {
    alignItems: 'center',
    backgroundColor: '#F5F0FF',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  builderEquationText: {
    color: '#5735B4',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  builderPartRow: {
    flexDirection: 'row',
    gap: 9,
  },
  workshopPartButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workshopPartVisual: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 28,
  },
  workshopAddRod: {
    borderRadius: 4,
    height: 40,
    width: 13,
  },
  workshopAddGem: {
    borderRadius: 999,
    height: 24,
    width: 24,
  },
  workshopPartCopy: {
    flex: 1,
  },
  workshopPartValue: {
    fontSize: 19,
    fontWeight: '900',
  },
  workshopPartDetail: {
    color: '#60758A',
    fontSize: 10,
    fontWeight: '800',
  },
  builderRemoveRow: {
    flexDirection: 'row',
    gap: 9,
  },
  builderRemoveButton: {
    alignItems: 'center',
    backgroundColor: '#EEF4F8',
    borderRadius: 8,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  builderRemoveText: {
    color: '#52677D',
    fontSize: 14,
    fontWeight: '900',
  },
  builderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  builderCounter: {
    backgroundColor: '#F6F9FC',
    borderRadius: 18,
    flex: 1,
    padding: 11,
  },
  builderLabel: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  builderControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  builderControlButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CAD6E3',
    borderRadius: 14,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  builderControlText: {
    color: '#13293D',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 25,
  },
  builderValue: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 3,
    height: 42,
    justifyContent: 'center',
    minWidth: 42,
  },
  builderValueText: {
    fontSize: 23,
    fontWeight: '900',
  },
  builderAnswer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 3,
    padding: 12,
  },
  builderAnswerText: {
    color: '#13293D',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  builderCheckButton: {
    ...shadow,
    alignItems: 'center',
    borderBottomWidth: 5,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 12,
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
  powerSection: {
    marginBottom: 12,
  },
  powerSectionTitle: {
    color: '#13293D',
    fontSize: 18,
    fontWeight: '900',
  },
  powerSectionText: {
    color: '#60758A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 9,
    marginTop: 3,
  },
  islandPowerRow: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderColor: '#D9E5EF',
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 7,
    padding: 10,
  },
  islandPowerIcon: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    width: 42,
  },
  islandPowerCopy: {
    flex: 1,
  },
  islandPowerTitle: {
    color: '#13293D',
    fontSize: 14,
    fontWeight: '900',
  },
  islandPowerText: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
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
    maxHeight: '92%',
    maxWidth: 430,
    padding: 18,
    width: '100%',
  },
  popupScroll: {
    width: '100%',
  },
  popupContent: {
    alignItems: 'center',
    padding: 6,
  },
  celebrationBurst: {
    alignItems: 'center',
    height: 1,
    justifyContent: 'center',
    left: '50%',
    position: 'absolute',
    top: 74,
    width: 1,
  },
  celebrationSpark: {
    fontWeight: '900',
    position: 'absolute',
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
  popupNovaRow: {
    alignItems: 'center',
    backgroundColor: '#F1F7FC',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  popupNovaText: {
    color: '#42576C',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  popupButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  explanationToggleButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 4,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    marginBottom: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    width: '100%',
  },
  explanationToggleText: {
    fontSize: 16,
    fontWeight: '900',
  },
  explanationPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 3,
    marginBottom: 14,
    padding: 12,
    width: '100%',
  },
  explanationEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textAlign: 'center',
  },
  explanationTitle: {
    color: '#13293D',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  explanationDetail: {
    color: '#42576C',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 10,
    textAlign: 'center',
  },
  explanationFrameStack: {
    alignItems: 'center',
    gap: 6,
  },
  explanationFrame: {
    backgroundColor: '#F6F9FC',
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    padding: 4,
    width: 179,
  },
  explanationFrameCell: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9E5EF',
    borderRadius: 6,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'relative',
    width: 30,
  },
  explanationFrameObject: {
    fontSize: 16,
  },
  explanationFrameNumber: {
    backgroundColor: '#13293D',
    borderRadius: 999,
    bottom: -3,
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
    minWidth: 12,
    position: 'absolute',
    right: -3,
    textAlign: 'center',
  },
  explanationCompareRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  explanationCompareValue: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 14,
    borderWidth: 3,
    height: 72,
    justifyContent: 'center',
    width: 78,
  },
  explanationCompareNumber: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 33,
  },
  explanationCompareLabel: {
    color: '#60758A',
    fontSize: 9,
    fontWeight: '900',
  },
  explanationCompareWord: {
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    width: 48,
  },
  explanationPlaceValue: {
    alignItems: 'center',
  },
  explanationPartsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  explanationPartGroup: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    maxWidth: 112,
    minHeight: 72,
    minWidth: 88,
    padding: 8,
  },
  explanationRodRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    minHeight: 38,
  },
  explanationRod: {
    backgroundColor: '#1CB0F6',
    borderRadius: 3,
    height: 36,
    width: 7,
  },
  explanationGemRow: {
    alignContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'center',
    minHeight: 38,
  },
  explanationGem: {
    backgroundColor: '#FFB020',
    borderRadius: 999,
    height: 13,
    width: 13,
  },
  explanationPartLabel: {
    color: '#60758A',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 5,
  },
  explanationPlus: {
    color: '#5735B4',
    fontSize: 9,
    fontWeight: '900',
  },
  explanationEquation: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 8,
    textAlign: 'center',
  },
  explanationPairList: {
    gap: 6,
  },
  explanationPairRow: {
    alignItems: 'center',
    backgroundColor: '#F1FBE9',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    minHeight: 45,
    paddingHorizontal: 10,
  },
  explanationPairNumber: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    width: 46,
  },
  explanationPairEquals: {
    color: '#60758A',
    fontSize: 8,
    fontWeight: '900',
  },
  explanationPairWord: {
    color: '#13293D',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  explanationWordRow: {
    alignItems: 'center',
    backgroundColor: '#F1FBE9',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 68,
    padding: 9,
  },
  explanationWordNumber: {
    fontSize: 28,
    fontWeight: '900',
  },
  explanationWordEquals: {
    color: '#60758A',
    fontSize: 11,
    fontWeight: '900',
  },
  explanationWordText: {
    color: '#13293D',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  explanationRoute: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'center',
  },
  explanationRouteStepWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  explanationRouteStep: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 12,
    borderWidth: 2,
    height: 43,
    justifyContent: 'center',
    minWidth: 43,
    paddingHorizontal: 6,
  },
  explanationRouteNumber: {
    fontSize: 17,
    fontWeight: '900',
  },
  explanationRouteArrow: {
    fontSize: 22,
    fontWeight: '900',
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
    alignItems: 'flex-start',
    gap: 3,
  },
  nextStepTitle: {
    color: '#13293D',
    fontSize: 19,
    fontWeight: '900',
    width: '100%',
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
  bookTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  bookAvatarSmall: {
    alignItems: 'center',
    borderRadius: 14,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  bookHeaderPanel: {
    backgroundColor: '#EEE7FF',
    borderColor: '#8B5CF6',
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 12,
    padding: 14,
  },
  bookHeaderTitle: {
    color: '#5735B4',
    fontSize: 18,
    fontWeight: '900',
  },
  bookHeaderText: {
    color: '#42576C',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4,
  },
  masteryRow: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 9,
    padding: 12,
  },
  masteryIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  masteryIconText: {
    fontSize: 24,
  },
  masteryCopy: {
    flex: 1,
  },
  masteryTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  masteryTitle: {
    color: '#13293D',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  masteryLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  masteryTrack: {
    backgroundColor: '#DDE7F0',
    borderRadius: 999,
    height: 9,
    marginTop: 7,
    overflow: 'hidden',
  },
  masteryFill: {
    borderRadius: 999,
    height: '100%',
  },
  masteryText: {
    color: '#60758A',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },
  onboardingCard: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#F7C948',
    borderRadius: 34,
    borderWidth: 4,
    maxWidth: 440,
    padding: 24,
    width: '100%',
  },
  novaBubble: {
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    borderColor: '#FFFFFF',
    borderRadius: 44,
    borderWidth: 6,
    height: 88,
    justifyContent: 'center',
    marginBottom: 13,
    width: 88,
  },
  novaBubbleText: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
  },
  onboardingTitle: {
    color: '#13293D',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  onboardingText: {
    color: '#42576C',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 23,
    marginBottom: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  avatarChoices: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    width: '100%',
  },
  avatarChoice: {
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderColor: '#CAD6E3',
    borderRadius: 18,
    borderWidth: 2,
    flex: 1,
    minHeight: 102,
    padding: 10,
  },
  avatarChoiceMark: {
    alignItems: 'center',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarChoiceMarkText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  avatarChoiceText: {
    color: '#13293D',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 7,
  },
  avatarChoiceTextSelected: {
    color: '#FFFFFF',
  },
  onboardingButton: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: '#13293D',
    borderBottomWidth: 5,
    borderColor: '#0B1B29',
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 16,
    width: '100%',
  },
});
