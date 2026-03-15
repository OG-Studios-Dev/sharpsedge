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

## Future Sports Expansion

### Tier 1 (Next up after MLB)
| Sport | Leagues | Data Source | Player Props? |
|---|---|---|---|
| NCAA Basketball | Men's (March Madness) | ESPN API (free) | Team analytics only |
| NCAA Football | FBS/Top 25 | ESPN API (free) | Team analytics only |

### Tier 2
| Sport | Leagues | Data Source | Player Props? |
|---|---|---|---|
| Soccer | EPL, La Liga, Serie A, Bundesliga | ESPN/football-data.org (free) | Team analytics + goal scorers |
| Golf | PGA Tour, LIV | ESPN/PGA API | Tournament props (winner, top 5, matchups) |

### Data Sources (all free)
- **NCAA**: ESPN API — same pattern as NBA (scoreboard, summary, standings)
- **Soccer**: football-data.org (free tier, 10 req/min) or ESPN soccer endpoints
- **Golf**: ESPN PGA leaderboard API or PGA Tour stats

### Implementation approach
- NCAA: clone NBA patterns, change sport key in ESPN URL
- Soccer: new sport type, match-based (not game-based), different stat categories
- Golf: tournament-based, leaderboard view, different prop structure (top 5, matchup vs field)

### NCAA specifics
- Team analytics only (no reliable player prop markets for college)
- Conference standings, rankings, RPI
- Key for March Madness — massive traffic opportunity
- Odds API supports: americanfootball_ncaaf, basketball_ncaab

### Soccer specifics
- Top 4 leagues: EPL, La Liga, Serie A, Bundesliga
- Team props: ML, spread (handicap), total goals
- Player: anytime goalscorer, shots on target
- Odds API supports: soccer_epl, soccer_spain_la_liga, soccer_italy_serie_a, soccer_germany_bundesliga

### Golf specifics
- Tournament winner, top 5, top 10, top 20
- Head-to-head matchups (2 golfers, who scores better)
- Round props (under 70, over/under birdies)
- Odds API supports: golf_pga_tour, golf_liv
