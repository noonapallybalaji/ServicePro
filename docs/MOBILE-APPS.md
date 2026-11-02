# Phone apps

| App | Approach | Where |
|---|---|---|
| **Pakka Fix Partner** (technicians) | Capacitor: the technician web app inside a native Android / iOS shell | `apps/tech` (`android/`, `ios/`) |
| **Pakka Fix** (customers) | Expo / React Native (SDK 58, Expo Router) | `apps/customer` |
| Admin | Stays on the web | `apps/admin` |

## Pakka Fix (customers, Expo)

A React Native app with the website's booking flow, built for phones:

- **First launch:** three welcome slides, then the service area (current location or PIN code).
- **Home:** greeting, area, appliance search, the ongoing repair, banner carousel, appliance grid,
  how it works, help; a bell with unread notifications.
- **Book a repair:** four steps with a progress bar (appliance → problem → address → confirm), current
  location, saved addresses, code to confirm the number, a success animation.
- **A booking:** status and timeline, live map with "About X min away" (OpenStreetMap in a web view,
  no Google key), completion code, estimate approval with a code, technician photos, bill with online
  payment and invoice, rating, warranty revisit, cancel with a reason, help on this booking.
- **Help:** conversations with the office as a chat (photos too), new requests, call / WhatsApp / FAQs.
- **Account:** details, saved addresses, notifications, policies, sign out, delete account.
- **Motion:** Reanimated entrances, press feedback, loading placeholders, haptics; Manrope font.
- **Updates:** test APKs check `/customer-app.json` on the site and offer a newer build.
- **Data:** the shared `@servicepro/api-client` (generated hooks, React Query) pointed at the API
  from `apps/customer/.env` (`EXPO_PUBLIC_*`, public values only).
- **Sign-in:** a code to the phone, or booking (a verified booking signs the customer in). The app
  sends `X-ServicePro-Client: native` and no browser origin, so the API returns the refresh token in
  the body; it's kept with `expo-secure-store` (Keychain / Keystore) and rotates on every refresh.
- **Native projects** are generated (`android/`, `ios/` are not in git): change native settings in
  `app.json`, then `pnpm prebuild`.

### Build

Needs Node 22+. From `apps/customer`:

```bash
pnpm start                          # Metro; open on a phone with a development build
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk (JavaScript included)
```

On Windows the native build needs long paths on (`LongPathsEnabled`), and pnpm's long install paths
still break it, so it is built from a flat copy (`D:\pf`, hoisted `node_modules`). Gradle needs a
Java 17 install (`org.gradle.java.installations.paths`) and CMake 3.31 (`cmake.dir` in
`android/local.properties`). For each test APK, raise `version` / `android.versionCode` in `app.json`
and the same numbers in `apps/web-public/public/customer-app.json`.

The local release build is signed with the template's debug key: fine for testing, not for Play.
For the stores, use EAS Build (`npx eas-cli build`) or a release key of your own, and raise
`version` / `android.versionCode` in `app.json` for every upload.

## Pakka Fix Partner (Capacitor)

The same React app as the browser version, built with `--mode native`:

- **API address:** the app loads from its own origin (`https://localhost` on Android, `capacitor://localhost` on iOS), so it calls the API by its full address from `apps/tech/.env.native`. The API allows these two origins (CORS) and nothing else extra (`NativeApps:AllowedOrigins` overrides them).
- **Sign-in:** native apps send `X-ServicePro-Client: native`. The API then returns the refresh token in the response body instead of the HttpOnly cookie, and the app keeps it in the Keychain / Keystore (`@aparajita/capacitor-secure-storage`). It rotates on every refresh, and a replayed token ends the session, as on the web. Browsers can't get the token this way: the API also checks the Origin header, which page scripts can't change.
- **Location:** `@capacitor-community/background-geolocation` keeps reporting while the technician uses other apps (Google Maps). Android shows a "Sharing your location" notification while it runs, as the system requires; iOS uses the background location mode. The browser version is unchanged.
- **No connection at start:** the app keeps its stored sign-in and shows "No connection · Try again" instead of the login page.
- **Android back button:** back through the screens; on the first screen the app goes to the background (location sharing continues).
- **Brand:** "PF" icon, Pakka Fix splash (generated from `apps/web-public/public/brand/logo-light.png`).

### Build

Needs **Node 22+** for the Capacitor CLI (the web apps still build with Node 20).

```bash
cd apps/tech
pnpm build:native        # type-check, build for the app, copy into android/ and ios/
pnpm android             # open in Android Studio: run on a phone or emulator, or Build > Generate Signed Bundle
pnpm ios                 # open in Xcode (on a Mac)
```

- **Android:** Android Studio (or JDK 21 + Android SDK 36). Debug APK: `cd android && ./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`. Play Store: a signed App Bundle (`bundleRelease`) with an upload key you keep safe.
- **iOS:** a Mac with Xcode, or a cloud Mac build (Codemagic, Ionic Appflow, GitHub Actions macOS runner). An Apple Developer account ($99/year) for TestFlight and the App Store.
- **Version:** `versionCode` / `versionName` in `android/app/build.gradle`; Version / Build in Xcode. Raise both for every store upload.

### Before the stores

- Google Play: the app uses background location through a foreground service; the Play Console asks for a short video and the reason ("show the technician's position to the office and the customer while on duty"). Fill the Data safety form (location, phone number).
- App Store: the location texts are in `ios/App/App/Info.plist`; explain the background use in review notes. Fill the privacy labels.
- Push notifications (new job offers): next step, with Firebase Cloud Messaging (also delivers to iOS through APNs).

## Publishing a new partner test APK

Test APKs are installed from the customer site (`/downloads/pakka-fix-partner.apk`), so the app checks
for updates itself: on start and when brought back to the front it reads `/partner-app.json` on the
site and offers "Download update" when that names a higher `versionCode` than the installed build.

1. Raise `versionCode` and `versionName` in `apps/tech/android/app/build.gradle`.
2. `pnpm build:native` in `apps/tech`, then `./gradlew assembleDebug` in `apps/tech/android`.
3. Copy `app/build/outputs/apk/debug/app-debug.apk` to `apps/web-public/public/downloads/pakka-fix-partner.apk`.
4. Set the same `versionCode` / `versionName` (and a one-line note) in `apps/web-public/public/partner-app.json`.

Test APKs are signed with `apps/tech/android/app/test-signing.keystore`, so every build installs over
the previous one. The file is not in git: keep a copy safe and put it in place on any machine that
builds APKs (without it the build uses that machine's debug key, and phones refuse it as an update).
Play Store builds need a separate, private upload key.
