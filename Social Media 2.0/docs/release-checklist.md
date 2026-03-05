# Release Checklist

- [ ] Firebase project id configured in `.firebaserc`
- [ ] `window.SOCIALSPHERE_CONFIG.firebase` populated in `src/js/config.js`
- [ ] `GEMINI_API_KEY` secret set in Firebase Functions
- [ ] `npm test` passing in `Social Media 2.0`
- [ ] Firestore rules deployed
- [ ] Firestore indexes deployed
- [ ] Functions deployed (`api`)
- [ ] Hosting deploy successful
- [ ] Smoke test: auth, feed CRUD, likes, comments, profile update
- [ ] Smoke test: follow request send/accept/reject + unfollow/cancel
- [ ] Smoke test: feed shows posts from self + followed users
- [ ] Smoke test: realtime post/like/comment update in second session
- [ ] Smoke test: AI polish/idea/summary + fallback behavior
