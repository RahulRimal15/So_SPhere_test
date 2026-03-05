# Test Plan

## Unit
- `tests/validators.test.js`
- `tests/like-state.test.js`

## Integration (manual)
1. Auth: sign up, log in, log out, refresh session.
2. Feed: create post, edit own post, delete own post.
3. Likes: toggle like, refresh, confirm count and like state.
4. Comments: open comments, add a comment, verify post comment count updates.
5. Follow flow: send request, accept request, reject request, unfollow, cancel request.
6. Profile: update own profile and verify handle/name reflected in header.
7. Feed scope: verify feed includes self + followed users only.
8. Search: filter suggested users by name/handle.
9. AI: run polish/idea/summary and verify graceful fallback on API outage.
10. Realtime: verify second browser session receives post/like/comment updates without refresh.

## Security (manual with Firestore rules emulator)
1. Unauthenticated create post is denied.
2. Non-owner update/delete of post is denied.
3. Invalid profile payload is denied.
4. Invalid postLikes document id and mismatched `userId` are denied.
5. Invalid comments payload is denied.
6. Non-owner comment edit/delete is denied.
7. Invalid followRequests payload is denied.
8. Unauthorized follows creation without pending request is denied.
