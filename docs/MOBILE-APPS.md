# Phone apps

| App | Approach | Where |
|---|---|---|
| **Pakka Fix Partner** (technicians) | Capacitor: the technician web app inside a native Android / iOS shell | `apps/tech` (`android/`, `ios/`) |
| Pakka Fix (customers) | Expo / React Native (next phase) | not started |
| Admin | Stays on the web | `apps/admin` |

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
