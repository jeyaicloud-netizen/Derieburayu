# Google Play Console Deployment Guide (`UssdCast Bridge` `.aab`)

ይህ `android-bridge/` ፎልደር **Android Studio** እና **Google Play Console (`.aab`)** ላይ በቀጥታ ለመጫን ዝግጁ የሆነ ሙሉ የGradle ፕሮጀክት ነው (`targetSdk 35`, `minSdk 26`, `com.ussdcast.bridge`)።

## 1. Signed `.aab` (App Bundle) መሥራት
1. **Android Studio** ይክፈቱ እና `android-bridge/` ፎልደርን እንደ Project ይክፈቱ።
2. ከላይ ሜኑ ውስጥ **Build > Generate Signed App Bundle / APK > Android App Bundle** ይምረጡ።
3. Keystore ፈጥረው **release** `.aab` ፋይል ያዘጋጁ።

## 2. Google Play Console (0% Play Protect Warning) መጫን
1. Google Play Console (`play.google.com/console`) ላይ **Create App** ይበሉ።
2. **Testing > Internal testing** (ለራስዎ እና ለሙከራ ተጠቃሚዎች ወዲያውኑ ያለ ግምገማ ለመጫን) ወይም **Closed testing** ውስጥ `.aab` ፋይሉን Upload ያድርጉ።
3. **App Content (Policy Declarations)**:
   - **AccessibilityService**: "Remote user-authorized assistive tap, scroll, Back, and Home control during active screen sharing" (ቀድሞ በ`MainActivity.java` ውስጥ Prominent Disclosure Dialog ተዘጋጅቷል)።
   - **Foreground Service (`mediaProjection`)**: "User-initiated live screen casting to the connected UssdCast Controller."
4. የInternal Testing ሊንኩን በስልኩ ከፍተው ከGoogle Play ሲጭኑ **Play Protect 0% ማስጠንቀቂያ** ሆኖ ሙሉ ስልኩን (Home, Dialer, `*804#`) ያሳያልም ይነካልም።
