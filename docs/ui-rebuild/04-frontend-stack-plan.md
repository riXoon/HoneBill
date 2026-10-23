# Frontend stack plan (mascot, micro-animations, UI motion)

Status: draft for review. Baseline: Expo SDK 57, RN 0.86.3, React 19.2, React Compiler on, New Architecture only, Hermes V1, `@react-navigation/native-stack` 7, `expo-image`, `react-native-svg`, `react-native-worklets` 0.10.1 already installed (unused).

Decisions from the kickoff questions:
- Mascot **reacts to app state** (idle / happy / thinking / sad, input-driven).
- Designer works **only in Figma**. MCP is now connected (file `QvLzQR9hWs96dBf84A2z5C`, "DRAFTS-HONEBILL"); see section 6 for what the designs, brand guide and logos contain.
- Device floor: **~2 GB RAM Android 8-10**.
- Scope: **full frontend stack**, against **mock data** (`_legacy` stays untouched, see CLAUDE.md).

---

## 1. Decisions

### 1.1 Mascot + micro-animations: **Lottie first** (works in Expo Go), Rive deferred

**Decision (2026-10-23, supersedes the earlier Rive-first recommendation):** the owner chose Lottie first, because it runs in Expo Go (no dev build) and the designer works only in Figma. Rive stays documented below as a later upgrade if the mascot needs true state machines.

What the designer's Figma Motion gives us (checked with the Figma MCP, 2026-10-23):
- Figma Motion exports **keyframe data** (CSS / motion.dev snippets, readable via `get_motion_context`) and **MP4** (`export_video`). It does **not** export Lottie JSON.
- The designs page (`902:6640`) currently contains only two near-empty vector tracks (width/height held constant, on a Home icon); there is no real mascot or UI animation authored in it yet. Ask the designer where the Motion work lives (another page or file).
- Consequences: simple UI motion (fades, slides, presses) is rebuilt in Reanimated from the keyframe data. Mascot and micro-animations still need Lottie JSON produced from the Figma art, for example with the LottieFiles Figma plugin / Lottie Creator or an After Effects pass. MP4/GIF are reference only, too heavy for 2 GB devices.
- Cheaper option for Honi: the component is already layered (body plus separate `face` with eyes and mouth). An idle float/blink can be done with static layers plus Reanimated (transform/opacity only), with face swaps per mood and no animation file at all. Use Lottie only for richer clips (success, loader, confetti).

(Original comparison kept below for reference.)

| | Rive (`@rive-app/react-native`, Nitro runtime) | Lottie (`lottie-react-native` ~7.3.8, Expo-bundled) |
|---|---|---|
| Reacts to app state | **State machines + inputs**: set `isHappy`, `amount`, `trigger(success)`; transitions blend | Play/pause/segment only; state logic lives in JS and clips hard-cut |
| File size | Small binary `.riv` (typically a few KB to tens of KB per character) | JSON/dotLottie, grows quickly with many layers |
| Runtime cost | Vector rendered natively, no per-frame JS | Native, but heavier on complex shapes/masks/mattes |
| Design source | Rive editor. Figma art can be pasted/imported, but **animation + state machine must be authored in Rive** | After Effects (Bodymovin). **Figma cannot export Lottie animations natively** (needs a plugin plus keyframing in AE or a plugin) |
| Expo support | Dev build required (no Expo Go: custom native module not bundled in Expo Go), New Arch, RN >= 0.78 | **Works in Expo Go** (bundled in Expo's native module set) |
| Risk | New runtime is younger; API may still move. Pin the version | Mature, stable |

Original recommendation (now deferred, see decision above): **Rive for the mascot and the reactive micro-animations** (success check, loaders, button feedback). Rationale: the mascot is state-driven, which is exactly what state machines are for, and small `.riv` files suit 2 GB devices. The Figma-only designer is not a blocker: Figma art is imported into Rive and animated there, but **someone must own Rive authoring** (see Open items).

Now: `lottie-react-native` (Expo-bundled ~7.3.8) is the primary runtime. Revisit Rive only if mood transitions become too awkward with Lottie clips. Do not ship both by default (two native runtimes = more APK size and memory).

### 1.2 UI interactions / layout / gesture motion: **Reanimated 4 + Gesture Handler**

- Expo 57 pins `react-native-reanimated` **4.5.1** with `react-native-worklets` **0.10.1** (matches what is installed). Install via `npx expo install`, never a hand-picked version.
- Is it lightweight on low-end devices? Mostly yes, with a budget. Worklets run on the UI thread, so animations do not depend on the JS thread. Reanimated's own guidance is to keep **at most ~100 simultaneously animated components on low-end Android** (vs ~500 on iOS). Our screens are well under that if we follow the rules below. CSS-style animations in Reanimated 4 are cheaper than shared-value ones for fire-and-forget cases, but cannot react to live input; use worklets for gestures/keyboard/scroll-linked motion.
- Cost: adds a native module + worklets runtime (APK size and a little startup/RAM). Acceptable, and unavoidable for gestures and layout transitions.
- Layout animations (entering/exiting/layout): use sparingly on lists; they are the most expensive feature on low-end Android.

### 1.3 Rest of the stack

| Concern | Choice | Notes |
|---|---|---|
| Navigation | Keep `@react-navigation/native` + native-stack; add `bottom-tabs` only if the design needs tabs | Native stack transitions are free (platform-driven) |
| Gestures | `react-native-gesture-handler` ~2.32 | Required by Reanimated gestures and bottom sheet |
| Lists | `@shopify/flash-list` 2.0.2 (Expo-bundled, New Arch OK) | Transactions, contacts |
| Bottom sheet | `@gorhom/bottom-sheet` (verify Reanimated 4 compat before install) or a small custom sheet | Decide in task 3.4 |
| Keyboard | `react-native-keyboard-controller` 1.21.9 | PIN/amount screens; app uses `softwareKeyboardLayoutMode: pan` |
| Haptics | `expo-haptics` | Respect reduced-motion/haptic settings |
| Images | `expo-image` (already) | Fixed sizes, small sources |
| SVG | `react-native-svg` (already) | Static icons only; no per-frame SVG animation |
| Gradients / blur | `expo-linear-gradient` (already); **avoid `expo-blur`** on low-end | Blur is costly on Android 8-10. The brand cards use inner shadows (not supported by RN): approximate with gradient overlays, or export the card art as a small image. The "Glass darkmode" effect is out of scope (no dark mode) |
| Skia | **Not adopted** | Heavy; revisit only if a custom effect cannot be done with Rive |
| Styling | `StyleSheet.create` + a `theme/` tokens module (colors, spacing, radius, typography) | Matches existing code; no new styling lib |
| State | Local state + React context for session; **Zustand** for cross-screen UI state if needed | Keep it tiny; no Redux |
| Forms | Plain controlled inputs + small validators | No form lib until proven necessary |
| Fonts | `expo-font` (already) + Lexend (Bold for headings, Regular, Light) | Ship only those 3 weights. The "cubic" Honebill wordmark is a logo vector, not a font, so no extra font file |
| Logos / icons | `react-native-svg` (already) | 4 logo variants and 4 tab icons exported from Figma as SVG components; static only |
| Mock data | `src/mocks/` typed fixtures + `src/hooks/` returning mock data behind the same shape the real API will use | Never import `_legacy` |

---

## 2. Low-end (2 GB, Android 8-10) performance budget

Applies to every task below.

1. **One live Lottie instance on screen** (the mascot). Micro-animations are short, play-once, and unmount or pause when finished.
2. **Pause when not visible**: pause Lottie on blur/background (`useIsFocused`, `AppState`); never animate behind a covered screen.
3. Animate **only `transform` and `opacity`** (Reanimated); no width/height/top/left, no `setState` per frame.
4. **No Reanimated layout animations inside long lists**; use them for small, bounded containers (modals, steps, toasts).
5. **Reduced-motion fallback**: if OS "remove animations" is on or device is flagged low-end, show a static mascot frame / skip micro-animations (`AccessibilityInfo.isReduceMotionEnabled`, Reanimated `ReduceMotion`).
6. Asset budget: each animation file (Lottie JSON, or `.riv` if reopened) target **<= 150 KB**, mascot **<= 300 KB**; total animation assets **<= 1 MB**. Lottie JSON grows fast with layers, masks and glows, so check Honi's glow/ring early.
7. Load animation files lazily (per screen), not at app start; keep splash short.
8. Test on a **release build**, on a real 2 GB Android 8/9/10 phone (or emulator with 2 GB RAM + throttled CPU). Dev mode misleads.
9. Targets: no sustained frame drops (>= 55 fps) on mascot screens, cold start not regressed by > 300 ms vs. the baseline measured in task 0.2, no memory growth after 10 visits to the mascot screen.

---

## 3. Tasks

Legend: [ ] todo, [x] done. Native dependency additions require a **new dev client / EAS build**.

### Phase 0 - Baseline and decisions
- [ ] 0.1 Confirm open items (section 5) with the designer/owner.
  - Dark mode: **out of scope** (confirmed). Light only.
  - Platforms: **iOS and Android together** in code (single Expo codebase); Android 2 GB device is the performance gate; iOS verified through EAS builds (no Mac on this machine).
  - Mascot in Figma (checked 2026-10-23): Honi is a Figma **component** (`Emotes` instance containing a layered body, `honi idle`, plus a separate `face` frame with `eyes` and a mouth vector). That is static, layered vector art, which is the form Rive imports well, with the face layer as the natural thing to swap per mood. Only the **idle** variant was seen on the screens inspected; no other moods, and no Lottie/GIF/MP4 assets, were found. The Figma MCP cannot report prototype (Smart Animate) settings, so ask the owner whether any animation exists beyond the static component. Open items 1 and 2 stay open until they answer.
  - Figma MCP: **connected** (2026-10-23). Brand tokens, mascot name (Honi), logos and the 24-screen inventory are captured in section 6. Still unknown: the mascot's moods/states and the animation format (open items 1 and 2).
  - Animation source: the owner says the animations already exist in Figma. Figma prototype animations (Smart Animate) are not exportable to the app, so when the MCP is connected, check the format of the mascot and micro-animation files (see section 5, item 1). Tasks 3.2-3.3 depend on it.
- [ ] 0.2 Record baseline on a 2 GB Android device: cold start time, idle RAM, APK size (release build of the current placeholder app).
  - [x] Bundle baseline (2026-10-23, `expo export --platform android`): 828 modules, Hermes bytecode **1.9 MB**, 17 asset files (all from `@react-navigation/elements`). Bundles in ~8.7 s.
  - Decision (2026-10-23): the owner will run the app on their phone with **Expo Go, no adb**. Consequences: (a) Expo Go is a dev-mode runtime, so numbers from it are **indicative only**, not the Phase 0 baseline; the targets in section 2 item 9 are judged on a release build later. (b) Expo Go cannot load Rive (task 3.1), so the go/no-go spike still needs a dev client / EAS build. (c) Start with `npx expo start --go`, because `expo-dev-client` is installed and otherwise makes `expo start` target a dev client. (d) Screens, theme, fonts and Reanimated (Phases 1, 2, 4) can be previewed in Expo Go; check each new native package is bundled in Expo Go before installing.
  - [ ] Device baseline (cold start, idle RAM, release APK size): **pending**. Re-checked 2026-10-23: no Android SDK or `adb` anywhere on this machine (not on PATH, none under `%LOCALAPPDATA%\Android`, `C:\Android`, `D:\Android`), and no `android/` folder in `apps/mobile`. JDK 21 is installed. Unblock by installing Android platform-tools (adb only, no full Android Studio needed) and attaching the 2 GB phone with USB debugging, or by building the APK with EAS and measuring on the phone. Needs a release build (`eas build` or `expo run:android --variant release`) on the 2 GB phone. Measure with `adb shell am start -W` (TotalTime) and `adb shell dumpsys meminfo live.honebill.app`.
- [x] 0.3 CI Node version: `mobile-ci.yml` already pins Node `22` (done in commit 6f88868). Nothing to change.
- [x] 0.4 Decision: **keep `react-native-worklets` as a direct dependency**, pinned to Expo's 0.10.1. Reanimated 4 does not bundle it; it is a required peer dependency, so removing it would break task 1.1. (Corrects the earlier "Reanimated pulls it in" assumption.)

### Phase 1 - Foundations (no animation yet)
- [ ] 1.1 `npx expo install react-native-reanimated react-native-gesture-handler react-native-keyboard-controller expo-haptics @shopify/flash-list`; add the Reanimated/worklets Babel handling (babel-preset-expo does it automatically; verify `babel.config.js` still works with the NODE_PATH shim).
- [ ] 1.2 Wrap the app in `GestureHandlerRootView`; add `KeyboardProvider`.
- [ ] 1.3 Create `src/theme/` (colors, spacing, radius, typography, motion tokens: durations, easings, springs). Seed from section 6.1; spacing and radius are not in the brand guide, so read them off the screens with `get_design_context` and record them here.
- [x] 1.3a Fonts: Lexend Light/Regular/Medium/Bold via `@expo-google-fonts/lexend` (per-weight imports, 4 TTFs, ~315 KB) and `expo-font`; splash held until loaded (`App.tsx`). Medium was added because the buttons use it. Tokens started in `src/theme/index.ts` (colors, fonts, radius; spacing still to add as pages need it).
- Finding (2026-10-23): Figma exports of Honi, the honeycomb art and the card art are **SVGs full of filters (drop/inner shadow, blur) and masks**, which React Native does not render. Decorative/mascot art is therefore exported as **PNG** (`assets/mascot`, `assets/landing`); only plain-path icons are drawn with `react-native-svg`. Budget note: `honi-wave.png` is 569 KB @3x (over the 300 KB mascot budget), `landing/background.png` 440 KB; revisit with WebP or a lower scale when measuring on the 2 GB device.
- [ ] 1.3b Brand assets: export the 4 logo variants (icon, wordmark, stacked, horizontal) and the 4 tab icons from Figma as SVG, wrap as components in `src/components/brand/`; add the app icon / splash from the logo (check the existing `assets/`).
- [ ] 1.4 Create `src/mocks/` and mock hooks for the data the screens show: balance (online and offline), transactions, contacts/recipients, inbox messages, profile, QR payload, OTP/PIN flow stubs (typed).
- [ ] 1.5 Create `src/components/ui/` primitives (Button, Text, Card, Screen with safe area, Input) using tokens. Add the ones the designs repeat: PhoneInputRow, OTP/PIN boxes, numeric keypad, `BalanceCard` (online/offline gradient card with status chip), transaction row, tab bar.
- [ ] 1.5a Honeycomb background pattern as a static SVG/image (brand motif on Landing and card art); no per-frame animation.
- [ ] 1.6 Dev build on device; verify nothing regressed (Hermes V1, release export via `npx expo export --platform android`).

### Phase 2 - Motion layer (Reanimated)
- [ ] 2.1 `src/motion/` helpers: `usePressScale`, `useFadeIn`, shared spring/timing presets from the tokens, `useReducedMotion` wrapper.
- [ ] 2.2 `AnimatedPressable` (scale + haptic) used by Button and list rows.
- [ ] 2.3 Screen/section entrance helpers (fade + translateY), bounded to small containers.
- [ ] 2.4 Toast / snackbar and inline success/error banner with enter/exit.
- [ ] 2.5 Amount keypad press feedback + number change transition (transform/opacity only).
- [ ] 2.6 Bottom sheet decision and implementation (3.1 stack table); verify on Android 8-10.
- [ ] 2.7 Perf pass: React DevTools "highlight updates" and Perf Monitor on the 2 GB device; fix findings before Phase 3.

### Phase 3 - Rive mascot and micro-animations
- [ ] 3.1 Lottie setup: `npx expo install lottie-react-native` (bundled in Expo Go, so no dev build), render one sample Lottie JSON in Expo Go, then on the 2 GB device in a release build later. Gate: smooth on the 2 GB device. (Rive spike is deferred; if reopened: `@rive-app/react-native` + `react-native-nitro-modules`, dev client required.)
- [ ] 3.2 Mascot spec with the designer. Figma `Emotes` component set (node `653:706`, 323x196 each) has **9 variants**: `honi idle`, `honi wave`, `bill`, `Phone`, `Secure`, `success`, `fail`, `alert`, `question`. Each is a body instance plus a `face` frame (eyes + mouth). The MCP reports **no keyframe data** for the set or its variants, so any motion between them is probably a prototype/Smart Animate flow; timing cannot be read from here (see section 7). Map moods to screens (e.g. success/fail to Receipt, Phone to Input Number, Secure to MPIN, question to help/empty). The mascot is **Honi** (glossy orange planet-bee with a ring, glow and sparkles; see brand guide). Still needed: states, inputs (e.g. `mood`, `isTyping`, `onSuccess`, `onError`), transitions, size/budgets (section 2). Screens with a mascot slot: Account Confirmation (MascotBgArea, 322x400), MPIN Creation (MascotArea, 322x300), Input Number (MascotArea, 320x292), User Details (Frame 39, 302x300). Honi's glow and ring may be costly to render; check it fits the 300 KB budget.
- [ ] 3.3 Produce Honi assets from the Figma component: first the layered static art (body, face variants) as SVG/PNG; then Lottie JSON clips if needed (see 1.1 for tooling; needs an owner). Export into `assets/lottie/`.
- [ ] 3.4 `src/components/mascot/Mascot.tsx`: typed props (`mood`, `size`), layered static art with a Reanimated idle float/blink, optional lazy-loaded Lottie clip per mood, pause on blur/background, static-frame fallback for reduced motion / load error.
- [ ] 3.5 `src/components/mascot/useMascot.ts`: maps app events (typing, success, error, idle timeout) to a mood plus the clip to play (JS state, not a state machine).
- [ ] 3.6 Micro-animation set as Lottie (success check, loader, empty state, QR scanning pulse, confetti-lite); a `LottieIcon` wrapper that plays once and unmounts/pauses.
- [ ] 3.7 Wire the mascot into the first real screens (onboarding, success, empty states) against mock data.
- [ ] 3.8 Memory test: navigate to/from mascot screens 20 times; confirm no growth, instance disposed on unmount.

### Phase 4 - Screens and integration
- [ ] 4.1 Build screens from Figma using ui primitives, motion helpers, and mock hooks. For each, run `get_design_context` on the node, then adapt it (do not paste it). Design frame is 402x874. Grouped by flow (node ids in section 6.3):
  - [ ] 4.1a Onboarding: Landing (**built**, `src/screens/LandingScreen.tsx`; buttons not wired yet; Honi motion is a placeholder idle float), Login (**built**, `src/screens/LoginScreen.tsx` with `Keypad` and `PinDots`; MPIN is not verified, filled-dot style and the gradient phone-pill border are assumptions; "Sign In" on Landing navigates to it), Input Number, OTP, User Details, MPIN Creation, Account Confirmation (**all built**, 2026-10-23; flow Landing > Input Number > OTP > User Details > MPIN > Account Confirmation, all mock: any complete OTP/PIN is accepted, nothing is saved, and the swipe returns to Login until Home exists). Approximations to review with the designer: gradient headings (single diagonal gradient instead of the layered radial ones), step-diamond overlay order for steps 2-3, no `backdrop-blur` on idle inputs. New native packages (all bundled in Expo Go): `react-native-gesture-handler`, `@react-native-masked-view/masked-view`.
  - [ ] 4.1b Main tabs: bottom tab bar (**built**: `BottomNavBar` + `MainTabs`, slide transition between tabs, spinning scan ring), Home Online and Offline (**built**, `src/screens/HomeScreen.tsx`, one screen switched by tapping the cards; mode is mock state, not real connectivity; Honi uses the static pose, the Send quick action is the Receive icon rotated 180 degrees as in Figma), Inbox, Transactions (History), Profile (still "coming soon" placeholders). Card fills are SVG gradients from Figma; not reproduced: backdrop blur and the offline card's color-burn overlay. The card honeycomb overlay position is approximate.
  - [ ] 4.1c Send flow: Send 1 To, Send 2 Amount, Send 3 Verification, Send 4 Method, Transfer to Online, Transfer to Offline, Receipt.
  - [ ] 4.1d Receive and QR: Receive 1, Receive 2 My QR, QR Scan (`expo-camera`, `react-native-qrcode-svg` already installed).
  - [ ] 4.1e Navigation graph wiring all of the above against mock data; no real auth or Stellar calls.
- [ ] 4.2 Transaction list on FlashList with fixed size estimates and memoized rows; no layout animations in rows.
- [ ] 4.3 Accessibility: labels, reduced motion respected everywhere, touch targets >= 44 dp.
- [ ] 4.4 Android specifics: back button, keyboard pan, edge-to-edge/safe areas, font scaling.

### Phase 5 - Verification and release readiness
- [ ] 5.1 Release build on 2 GB Android 8/9/10 and one modern iOS: FPS, cold start, RAM vs. Phase 0 baseline.
- [ ] 5.2 APK/AAB size delta report (Reanimated + Rive + assets).
- [ ] 5.3 Bundle check: `npx expo export --platform android` size and module count vs. baseline.
- [ ] 5.4 Update `docs/ui-rebuild/` with the final stack and any budget deviations.

---

## 4. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Figma Motion does not export Lottie | No animation files to ship | Rebuild simple motion in Reanimated from `get_motion_context` keyframes; assign Lottie authoring for the mascot clips (open item 1) |
| Lottie file size grows with glow/ring/layers | Over budget on 2 GB devices | Simplify Honi for animation, flatten effects, check budget at 3.3 |
| (Deferred) Rive RN runtime (Nitro) is young; API may change | Rework in mascot wrapper | Only if Rive is reopened: pin version, isolate behind wrappers, dev-client spike |
| Rive Android needs newer compileSdk/AGP than Expo default | Build failure | Use `expo-build-properties` per Rive's Expo docs; confirm in spike |
| Rive RN runtime not validated with RN 0.86 / Hermes V1 | Crash on device | Spike on real device first; Lottie fallback |
| Figma-only designer cannot produce animation | Mascot blocked | Assign Rive authoring (open item 1) |
| 2 GB devices kill app in background / OOM | Crashes | Single Rive instance, lazy load, dispose on unmount, asset budget |
| Reanimated layout animations janky on old Android | Dropped frames | Restrict to small bounded containers; measure in 2.7 |
| New native modules need rebuilt dev client | Slower iteration | Batch native installs in Phase 1 and 3.1 |
| SDK 58 released 2026-10-15 | Pins would move | Stay on 57 for this work; upgrade separately |

## 5. Open items

1. **Where is the designer's Figma Motion work, and who produces Lottie JSON?** (checked 2026-10-23: the designer used Figma Motion only; the designs page has no real animations, and Figma Motion exports keyframes/MP4, not Lottie. Ask the designer which page/file holds the animations, and agree who converts them to Lottie or whether we rebuild them in Reanimated.)
   - Figma prototype (Smart Animate / "after delay" flows): a design reference only. Simple UI motion (fades, slides, presses) gets rebuilt in Reanimated from the specs. The mascot would need to be re-animated in Rive by someone.
   - Exported Lottie JSON, GIF/MP4 or sprite frames: Lottie JSON can be used as-is with `lottie-react-native` (this changes the 1.1 decision for those assets); GIF/MP4 are too heavy for 2 GB devices and should be redone.
2. Mascot is named **Honi**. Moods found: 9 `Emotes` variants (idle, wave, bill, Phone, Secure, success, fail, alert, question). Still open: which of them animate (and how long/looping), and which screen uses which mood.
3. ~~Brand tokens~~ Colors, type and effects captured in section 6.1. Still open: spacing and radius scale (read from screens during task 1.3), and the exact Figma variable names for gradients.
4. ~~Dark mode~~ Out of scope (confirmed).
5. ~~iOS now or Android-first~~ Both in code from the start; Android 2 GB is the performance gate (confirmed).

## 6. Design inventory (from Figma, 2026-10-23)

File `QvLzQR9hWs96dBf84A2z5C` (DRAFTS-HONEBILL). Nodes: all designs `902:6640`, brand guide `942:3753`, logos `902:6641`.

### 6.1 Brand tokens (seed for `src/theme/`)

| Token | Value | Use |
|---|---|---|
| bg / "bg White" | `#ECF0F3` | App background |
| white | `#F7F7FB` | Surfaces, text on dark |
| black | `#222021` | Text, dark surfaces |
| orange (primary) | `#F08F31` | Brand, primary actions |
| coral | `#E6795E` | Brand accent |
| red ("D red") | `#E6795E` | Same value as coral in the variables; confirm whether they are one token |
| yellow | `#FFF0D8` | Soft highlight |
| card gradient stops | `#FFCC00`, `#FF8800`, `#EB7124` | Online / offline balance cards (light and dark card variants) |
| low-opacity fills | `#F7F7FB` (L20), `#222021` (D50) | Overlays |
| shadow (light) | drop `#D3D3D3`, y 6, blur 20 | Cards |
| card effect ("comb") | 3 inner shadows (`#FF686840`, `#FF880040`, `#FFFFFF40`) + white drop glow | Balance card sheen; approximate with gradient overlays (see section 1.3) |
| Font | Lexend Bold (headings), Regular, Light | Typography |

Out of scope: "Glass darkmode" effect (no dark mode).

### 6.2 Brand and logos

- Logo: bee-planet icon plus "Honebill" cubic wordmark. 4 variants in Figma: icon only, wordmark only, stacked, horizontal. All vectors, export as SVG.
- Tab icons: 4 line icons in the brand guide (likely Home, Inbox, Transactions, Profile; confirm against the tab bar in the screens).
- Motifs: honeycomb hexagon pattern, orange to red gradient backgrounds, glossy glow on Honi.
- Product line in the guide: "Offline E-Wallet" with "Online Balance" and "Offline Balance" cards (shown with a "Syncing" chip).

### 6.3 Screens (402x874 frames)

| Flow | Screen | Node |
|---|---|---|
| Onboarding | Landing | 870:3041 |
| | Login Page | 870:3055 |
| | Input Number | 870:3025 |
| | OTP | 870:2988 |
| | User Details | 870:3010 |
| | MPIN Creation | 870:2965 |
| | Account Confirmation | 870:2950 |
| Tabs | Home Page - Online | 870:3102 |
| | Home Page - Offline | 870:3140 |
| | Inbox | 870:3123 |
| | Transactions | 870:3169 |
| | Profile | 942:5362 |
| Send | Send 1 - To | 870:3195 |
| | Send 2 - Amount | 870:3271 |
| | Send 3 - Verification | 870:2796 |
| | Send 4 - Method | 870:3236 |
| | Transfer to Online | 870:3328 |
| | Transfer to Offline | 870:3307 |
| | Receipt | 870:2835 |
| Receive / QR | Receive 1 | 870:2888 |
| | Receive 2 - My QR | 870:2925 |
| | QR Scan | 870:3349 |

Note: Send 3 comes after Send 4 in the layer order, so confirm the real send sequence (To, Amount, Method, Verification?) with the designer before wiring navigation (task 4.1e).

## 7. Lottie setup guide (first-time)

A Lottie is a small `.json` file exported from a design/animation tool; the app only plays it. Two separate jobs:

**A. Code side (we do this, works in Expo Go).**
1. `cd apps/mobile && npx expo install lottie-react-native` (Expo picks the matching version; no dev build).
2. Put files in `assets/lottie/`, play with `<LottieView source={require('../../assets/lottie/success.json')} autoPlay loop={false} style={{ width, height }} />`.
3. Wrap it in `Mascot` / `LottieIcon` (tasks 3.4, 3.6): lazy-load, pause on blur, static fallback.

**B. Authoring side (the designer, or a helper).** Figma Motion cannot export Lottie, so one of:
1. **LottieFiles route** (no coding): LottieFiles has a Figma plugin and the Lottie Creator web editor that can turn animated Figma frames into Lottie. Verify it handles the Honi art, then export `.json`. This is the one to try first.
2. **After Effects + Bodymovin**: the traditional route, needs AE skills.
3. **No file at all**: build the idle/blink/wave in Reanimated from the layered Figma art, which needs nothing from the designer.

Honi-specific cautions: Lottie handles blur, glow and glass effects poorly or not at all, and file size grows with layers. Ask the designer for a **simplified Honi** (flat gradients, few layers) for animation, and keep each file <= 150 KB.

**Checked 2026-10-23 (no keyframes):** `get_motion_context` returns nothing for `Wave` (`644:1861`), `Idle` (`644:1454`) and `halo` (`644:982`). They are component sets whose variants look like animation poses: Idle = Default, Variant2, Variant3; Wave = 3 variants (two are both named Variant3); halo = Default, Variant2, Variant3, Variant4. So the animation is most likely a prototype that swaps variants (Smart Animate), which means the poses exist but **duration, delay, easing and loop are not readable via the MCP**. Ask the designer for those, or have her export the Figma Motion/prototype as video for reference.

**Suggested first step:** pick one emote (`success`), have it exported as Lottie via route 1, drop it in `assets/lottie/`, and render it in Expo Go. If that works end to end, repeat for the rest.

## Sources
- [Rive React Native docs](https://rive.app/docs/runtimes/react-native/react-native), [Rive in Expo](https://rive.app/docs/runtimes/react-native/adding-rive-to-expo.md)
- [Reanimated performance guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance)
- Versions from `node_modules/expo/bundledNativeModules.json` (Expo 57): reanimated 4.5.1, worklets 0.10.1, gesture-handler ~2.32.0, flash-list 2.0.2, lottie-react-native ~7.3.8, keyboard-controller 1.21.9, expo-haptics ~57.0.3.
