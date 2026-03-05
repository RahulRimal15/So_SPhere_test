# SocialSphere (Web RS3)

SocialSphere is a modular social platform built with:
- Frontend: `HTML + CSS + Vanilla JavaScript`
- Backend: Firebase (`Authentication`, `Cloud Firestore`, optional `Cloud Functions` for AI proxy)

## Current Feature Status

### Core Features
- User registration and login (email/password)
- User profiles (display name, handle, bio, avatar)
- Text post creation
- Like / unlike interactions
- Commenting system (view + add comments)
- Real-time feed updates
- News feed based on self + followed users
- Follow system with request flow:
  - Send request
  - Accept request
  - Reject request
  - Cancel request / unfollow
- Responsive layout for desktop/mobile
- Firestore persistence with security rules

### Optional Features Implemented
- User search (client-side filtering by name/handle in suggestion list)
- Profile editing

### Optional Features Pending
- Image upload with Firebase Storage
- Full notifications center

## Step-by-Step Workflow

### 1. Setup and Configuration
1. Open `src/js/config.js`.
2. Add Firebase project keys in the `firebase` object.
3. Set `enableAI` and `apiBasePath` if AI proxy is available.
4. Run:
```bash
npm install
npm test
npm start
```
5. Open `http://localhost:4173`.

### 2. Authentication Flow
1. User signs up or signs in with email/password.
2. Firebase Authentication creates/restores the session.
3. `src/js/app.js` listens to auth state and switches app views.

### 3. Profile Flow
1. On first login, a profile doc is created in `users/{uid}`.
2. User can update display name, bio, and avatar URL.
3. Profile changes are stored in Firestore and reflected in UI.

### 4. Feed and Post Flow
1. Feed loads newest-first posts from self + followed users.
2. Create post writes to `posts/{postId}` with author metadata.
3. Only owner can edit/delete own post.
4. Firestore realtime listeners update the feed instantly.

### 5. Like and Comment Flow
1. Like/unlike uses one record per user-post pair (`postId_userId`).
2. Like count stays consistent and idempotent.
3. Comments are written/read in the post comments subcollection.
4. New likes/comments appear live for connected users.

### 6. Follow Request Flow
1. User opens profile from suggestions/search.
2. User sends follow request (pending state).
3. Receiver accepts or rejects request.
4. Accepted request creates follow relationship and updates feed scope.
5. User can cancel pending requests or unfollow later.

### 7. AI Assist Flow (Optional)
1. UI actions call centralized API service (`src/js/services/api.js`).
2. Requests go to backend proxy endpoint (`apiBasePath`) when enabled.
3. If AI is disabled/errors/timeouts, fallback message is shown.
4. Core social features continue without interruption.

### 8. Realtime, Security, and Persistence
1. Firestore snapshot listeners keep app data synchronized.
2. Security rules enforce authentication and ownership constraints.
3. All social data persists in Firestore for multi-user usage.

## Single Config File (Edit Here)
All runtime config is centralized in:
- `src/js/config.js`

Set these values once and the whole app uses them:
- `enableAI`
- `apiBasePath`
- `firebase.apiKey`
- `firebase.authDomain`
- `firebase.projectId`
- `firebase.storageBucket`
- `firebase.messagingSenderId`
- `firebase.appId`

## Project Structure
- `index.html` - app shell and UI layout
- `src/css/styles.css` - app styling
- `src/js/app.js` - app bootstrap and navigation wiring
- `src/js/modules/` - feature modules (`auth`, `feed`, `profile`, `ai`, `ui`)
- `src/js/services/firebase.js` - data/auth/realtime/follow/comment services
- `src/js/services/api.js` - API helper for AI endpoints
- `firestore.rules` - Firestore authorization rules
- `firestore.indexes.json` - required composite indexes
- `functions/` - Firebase Cloud Functions (AI proxy)
- `tests/` - Node test suite for utility logic
- `docs/` - setup, user guide, test plan, release checklist

## Run Locally
```bash
npm install
npm test
npm start
```
Then open `http://localhost:4173`.

## Firebase Setup and Deploy
See:
- `docs/dev-setup.md`
- `docs/release-checklist.md`

## Notes
- If Firebase config is empty, the app runs in local fallback mode (browser storage), useful for UI testing.
- For production behavior and multi-user realtime sync, configure Firebase in `src/js/config.js` and deploy rules/indexes/functions.
