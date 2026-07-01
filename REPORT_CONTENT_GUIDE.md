# Report Content Guide

Use the assignment cover page provided by the lecturer, then include the sections below.

## 1. Introduction

- App name: Math Adventure.
- Target users: school-going children learning basic number concepts.
- Main objective: help children practise counting, place value, number words, and number sequence through interactive exercises.
- Development tool: Expo React Native.
- Language: JavaScript.

## 2. Assignment Requirement Coverage

Explain how the app covers the four required topics:

- Number to objects association: children count objects and choose the matching number.
- Place value: children identify tens and ones in two-digit numbers.
- Number recognition: children match numbers to English words.
- Numbers in sequence: children arrange numbers from smallest to biggest or biggest to smallest.

Also mention:

- Users can directly navigate to any topic from the quest map.
- Exercises are randomly generated.
- Numbers are limited to whole numbers up to two digits.
- The app avoids relying on advanced mathematical symbols.

## 3. Application Flow

Include screenshots and short explanations for:

- Home / quest map screen.
- Difficulty selector.
- Each of the four topic screens.
- Question screen with answer options.
- Correct answer pop-up.
- Wrong answer pop-up with Retry.
- Hint pop-up.
- Speak button.
- Round completion / Math Hero Certificate.
- Badge shelf.
- Teacher Summary screen.
- Settings screen.

## 4. User Interface Design

Describe the design choices:

- Child-friendly gamified interface.
- Quest map structure.
- Large buttons and readable text.
- Bright topic colors.
- XP, hearts, stars, badges, and certificate rewards.
- Pop-up feedback to avoid scrolling.
- Settings for sound and speech.

## 5. Extra Features Added

Highlight these as value-added features:

- Difficulty levels: Easy, Normal, Challenge.
- Mistake Review mode.
- Badge reward system.
- Hint system.
- Speak-aloud function.
- Sound effects.
- Teacher Summary report.
- Math Hero Certificate.
- Settings screen.
- Animated correct/wrong feedback pop-ups.

## 6. Program Documentation

Include screenshots or snippets from:

- `App.js`: main app flow, screens, state, feedback, settings, and pop-ups.
- `src/data/topics.js`: topic data, badges, colors, difficulty options.
- `src/utils/questionGenerators.js`: random question generation and difficulty logic.
- `assets/sounds/`: local sound files used for feedback.

Explain:

- How questions are generated randomly.
- How correct/wrong answers are checked.
- How mistakes are saved for review.
- How badges are unlocked.
- How speech and sound features work.

## 7. Testing

Mention that the app was tested using:

- Expo Go on mobile.
- Expo Doctor.
- iOS bundle export.

Suggested test cases:

- Navigate to each topic.
- Answer correctly and check pop-up feedback.
- Answer wrongly and use Retry.
- Change difficulty level.
- Use Mistake Review.
- Unlock a badge after correct answers.
- Use Speak and Hint buttons.
- Toggle sound/speech in Settings.
- View Teacher Summary.

## 8. Conclusion

- Summarize that the app fulfills all assignment requirements.
- State that extra features improve user friendliness, learning support, and motivation.
- Mention that the app is designed for children and supports repeated practice.

## 9. Appendix

Include:

- Important source code snippets.
- Additional screenshots if needed.
- GitHub repository link after upload.
