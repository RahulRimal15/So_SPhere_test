# Developer Setup

## 1. Install prerequisites
- Node.js 20+
- Firebase CLI (`npm i -g firebase-tools`)

## 2. Configure Firebase frontend
Edit `src/js/config.js`:
- Fill `window.SOCIALSPHERE_CONFIG.firebase` values from Firebase project settings.
- Update `apiBasePath` only if your API path is not `/api`.
- Set `enableAI` to `false` if AI features should be disabled.

## 3. Configure Firebase backend
- Update `.firebaserc` with your project id.
- Set Gemini key:
  - `firebase functions:secrets:set GEMINI_API_KEY`

## 4. Install functions deps
```bash
cd functions
npm install
cd ..
```

## 5. Run tests
```bash
npm install
npm test
```

## 6. Run locally
```bash
npm start
```
Then open `http://localhost:4173`.

## 7. Deploy
```bash
firebase deploy
```

## 8. Firestore Collections Used
- `users`
- `posts`
- `comments`
- `postLikes`
- `followRequests`
- `follows`
- `aiUsage` (written by Cloud Functions)

## 9. Notes
- The app can run in local fallback mode when Firebase config is empty (browser storage only).
- Real-time feed/comments/follow behavior requires Firebase mode with deployed rules/indexes.
