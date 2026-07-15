# Math Adventure App

An Expo React Native mobile app for the Individual Practical Assignment.

Current app version: `1.1.0`

## Assignment Coverage

- Number to objects association: children count visual objects and choose the matching number.
- Place value: children identify tens and ones for two-digit numbers.
- Number recognition: children match digits to English number words.
- Numbers in sequence: children arrange numbers from smallest to biggest or biggest to smallest.

## Extra Interactive Features

- Direct navigation from the home screen to every topic.
- Random exercise generation for every topic.
- Five-question mini rounds with score tracking.
- Child-friendly feedback after every answer.
- Quest-map home screen, XP rewards, hearts, stars, and round rewards.
- Difficulty levels: Easy, Normal, and Challenge.
- Mistake Review mode saves wrong answers for focused practice.
- Badge shelf unlocks topic badges after successful practice.
- Hint button gives child-friendly guidance before answering.
- Speak button reads the question and answer choices aloud.
- Teacher Summary shows accuracy, mistakes, badges, strengths, and weak topics.
- Sound effects play for correct, wrong, and reward moments.
- Settings screen controls sound, speech, and progress reset.
- Round completion shows a Math Hero Certificate with XP, hearts, and badge status.
- Answer feedback pop-ups include a bounce/fade animation.
- Big touch targets, readable text, and colorful game-style topic cards.
- Retry, reset, next question, and home navigation controls.

## Run on Phone with Expo Go

Install dependencies first:

```bash
npm install
```

Start the development server:

```bash
npm start
```

Then scan the Expo QR code with the Expo Go app on your phone.

If PowerShell blocks `npm`, use:

```bash
npm.cmd start
```

For iPhone, install Expo Go from the App Store, keep the iPhone and laptop on
the same Wi-Fi, then scan the QR code or enter the Expo URL shown in the
terminal.

## Optional Laptop Preview

```bash
npm.cmd run web
```

Then open:

```text
http://localhost:8081
```

## Install the Android APK

The standalone Android APK is not committed to GitHub because APK files are
generated build artifacts. Use the release APK file provided separately:

```text
MathAdventure-v1.1.0-release.apk
```

Install it on an Android phone, then open the app and go to Settings. The app
should show:

```text
Math Adventure 1.1.0
```

If an older version is already installed, uninstall the old Math Adventure app
before installing the new APK.

Do not use the debug APK for demonstration. A debug APK needs Metro running on
the laptop and may show `Unable to load script` if Metro is not available. Use
the release APK for a standalone demo.

## Build APK Locally

Requirements:

- Node.js
- Android Studio
- Android SDK
- Java 11 or newer, preferably Android Studio's bundled JBR

Generate the Android project:

```bash
npx.cmd expo prebuild --platform android
```

If Gradle cannot find the Android SDK, create `android/local.properties`:

```text
sdk.dir=C:/Users/User/AppData/Local/Android/Sdk
```

Build a standalone release APK:

```bash
cd android
gradlew assembleRelease
```

The APK will be generated at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Troubleshooting

- If Expo Go times out, make sure the phone and laptop are on the same Wi-Fi
  and scan the latest QR code shown by the terminal.
- If PowerShell blocks `npx`, use `npx.cmd`.
- If the app shows `Unable to load script`, a debug APK was installed or Metro
  is not running. Install the release APK instead.
- If Android build fails inside OneDrive, copy the project to a short local path
  such as `C:/Users/User/AppData/Local/Temp/madapk110` and build there.
- If Gradle uses Java 8, set `JAVA_HOME` to Android Studio's bundled JBR before
  building.
