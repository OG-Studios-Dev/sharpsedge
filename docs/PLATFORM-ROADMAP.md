# Goosalytics Platform Roadmap

## Phase 1: Desktop Web (FREE — this week)
- Responsive layout: sidebar nav on lg+ screens, bottom tabs on mobile
- Multi-column grid: picks + trends side by side on wide screens
- Wider data tables for props (use horizontal space)
- Dashboard-style home with 2-3 column grid sections
- Keep mobile-first — desktop enhances, never breaks mobile

### Desktop Shell Components
- DesktopSidebar.tsx — vertical nav with logo, links, user avatar
- Responsive breakpoints: mobile (<768px), tablet (768-1024px), desktop (1024px+)
- AppShell.tsx update: show sidebar on lg+, bottom nav on mobile
- Wider max-w for content: max-w-6xl on desktop, max-w-2xl on mobile

## Phase 2: PWA Enhancements (FREE)
- manifest.json ✅ (done)
- Service worker for offline support
- Pull-to-refresh on picks page
- "Add to Home Screen" prompt banner for first-time visitors
- Splash screen with goose logo

## Phase 3: Capacitor Wrapper (App Store — $99/yr Apple Dev)
### Prep Work (do now, free)
- Install Capacitor: npm install @capacitor/core @capacitor/cli
- npx cap init "Goosalytics" "com.goosalytics.app"
- Configure capacitor.config.ts
- Add iOS + Android platforms
- Set app icon (already have logo assets)
- Configure splash screen

### App Store Submission Needs
- Apple Developer account ($99/yr)
- App icons: 1024x1024 for App Store
- Screenshots: 6.5" and 5.5" iPhone sizes
- App description, keywords, category (Sports)
- Privacy policy URL
- Support URL

### Native Features via Capacitor Plugins
- @capacitor/push-notifications — pick alerts
- @capacitor/haptics — tap feedback
- @capacitor/splash-screen — goose logo launch screen
- @capacitor/status-bar — dark status bar
- @capacitor/keyboard — auto-dismiss on scroll
- @capacitor/browser — external links (sportsbook deep links)

## Phase 4: UI Polish (ongoing)
- Framer Motion for page transitions (slide in/out)
- Skeleton loading states on every page
- Pull-to-refresh gesture
- Swipe to dismiss/navigate
- Haptic feedback on button taps (Capacitor)
- SF Pro-inspired typography
- Real team logos (SVG or high-quality PNG)
- Glass morphism cards (subtle blur + transparency)
- Micro-interactions (success checkmarks, error shakes)

## Cost Summary
| Item | Cost | When |
|---|---|---|
| Desktop responsive | $0 | Now |
| PWA enhancements | $0 | Now |
| Capacitor setup | $0 | Now (prep) |
| Apple Dev account | $99/yr | When ready to submit |
| Google Play account | $25 one-time | When ready |
| Real team logos | $0 (ESPN/NHL CDN) | When we add them |
