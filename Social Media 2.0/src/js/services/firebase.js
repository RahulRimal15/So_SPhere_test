import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { normalizeHandle, sanitizeText } from "../utils/validators.js";

const cfg = window.SOCIALSPHERE_CONFIG?.firebase || {};

const firebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.authDomain && cfg.appId);
const runtimeMode = firebaseConfigured ? "firebase" : "local";

let app = null;
let auth = null;
let db = null;

if (firebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
}

const LOCAL_KEYS = {
  currentUser: "socialsphere.local.currentUser",
  profiles: "socialsphere.local.profiles",
  posts: "socialsphere.local.posts",
  likes: "socialsphere.local.likes",
  comments: "socialsphere.local.comments",
  follows: "socialsphere.local.follows",
  followRequests: "socialsphere.local.followRequests"
};

const localAuthListeners = new Set();
const localFeedListeners = new Set();
const localCommentListeners = new Map();

function safeLocalStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
}

function splitIntoChunks(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function sortPostsDescending(a, b) {
  const delta = toMillis(b.createdAt) - toMillis(a.createdAt);
  if (delta !== 0) {
    return delta;
  }
  return String(b.id).localeCompare(String(a.id));
}

function followDocId(followerUid, followingUid) {
  return `${followerUid}_${followingUid}`;
}

function requestDocId(fromUid, toUid) {
  return `${fromUid}_${toUid}`;
}

function localReadCurrentUser() {
  return safeLocalStorageGet(LOCAL_KEYS.currentUser, null);
}

function localWriteCurrentUser(user) {
  safeLocalStorageSet(LOCAL_KEYS.currentUser, user);
}

function localReadProfiles() {
  return safeLocalStorageGet(LOCAL_KEYS.profiles, {});
}

function localWriteProfiles(profiles) {
  safeLocalStorageSet(LOCAL_KEYS.profiles, profiles);
}

function localReadPosts() {
  return safeLocalStorageGet(LOCAL_KEYS.posts, []);
}

function localWritePosts(posts) {
  safeLocalStorageSet(LOCAL_KEYS.posts, posts);
}

function localReadLikes() {
  return safeLocalStorageGet(LOCAL_KEYS.likes, {});
}

function localWriteLikes(likes) {
  safeLocalStorageSet(LOCAL_KEYS.likes, likes);
}

function localReadComments() {
  return safeLocalStorageGet(LOCAL_KEYS.comments, []);
}

function localWriteComments(comments) {
  safeLocalStorageSet(LOCAL_KEYS.comments, comments);
}

function localReadFollows() {
  return safeLocalStorageGet(LOCAL_KEYS.follows, {});
}

function localWriteFollows(follows) {
  safeLocalStorageSet(LOCAL_KEYS.follows, follows);
}

function localReadFollowRequests() {
  return safeLocalStorageGet(LOCAL_KEYS.followRequests, {});
}

function localWriteFollowRequests(requests) {
  safeLocalStorageSet(LOCAL_KEYS.followRequests, requests);
}

function notifyLocalAuth(user) {
  for (const listener of localAuthListeners) {
    listener(user);
  }
}

function buildDefaultProfile(uid, email) {
  const left = String(email || "member").split("@")[0] || "member";
  const displayName = left
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40) || "Social User";

  return {
    uid,
    displayName,
    handle: normalizeHandle(left) || "@social_user",
    bio: "Building in public with SocialSphere.",
    avatarUrl: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function normalizeProfile(uid, raw) {
  return {
    uid,
    displayName: raw.displayName || "Social User",
    handle: raw.handle || "@social_user",
    bio: raw.bio || "",
    avatarUrl: raw.avatarUrl || "",
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso()
  };
}

function makeSession(user, profile) {
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: profile?.displayName || user.displayName || user.email || "Member"
  };
}

function normalizePostDoc(snap, isLiked = false) {
  const data = snap.data();
  return {
    id: snap.id,
    authorId: data.authorId,
    authorName: data.authorName,
    authorHandle: data.authorHandle,
    content: data.content,
    likeCount: Number(data.likeCount || 0),
    commentCount: Number(data.commentCount || 0),
    visibility: data.visibility || "public",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    isLiked
  };
}

function normalizeCommentDoc(snap) {
  const data = snap.data();
  return {
    id: snap.id,
    postId: data.postId,
    authorId: data.authorId,
    authorName: data.authorName,
    authorHandle: data.authorHandle,
    content: data.content,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function localFeedAuthorSet(userId) {
  const follows = localReadFollows();
  const ids = new Set([userId]);

  for (const follow of Object.values(follows)) {
    if (follow.followerUid === userId) {
      ids.add(follow.followingUid);
    }
  }

  return ids;
}

function buildLocalFeedForUser(userId, pageSize = 30) {
  const allowedAuthors = localFeedAuthorSet(userId);
  const likes = localReadLikes();

  const posts = localReadPosts()
    .filter((post) => allowedAuthors.has(post.authorId))
    .sort(sortPostsDescending)
    .slice(0, pageSize)
    .map((post) => ({
      ...post,
      isLiked: Boolean(likes[`${post.id}_${userId}`])
    }));

  return posts;
}

function emitLocalFeedUpdates() {
  for (const item of localFeedListeners) {
    item.callback(buildLocalFeedForUser(item.userId, item.pageSize));
  }
}

function localCommentsForPost(postId) {
  return localReadComments()
    .filter((comment) => comment.postId === postId)
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

function emitLocalCommentsForPost(postId) {
  const listeners = localCommentListeners.get(postId);
  if (!listeners || !listeners.size) {
    return;
  }

  const comments = localCommentsForPost(postId);
  for (const callback of listeners) {
    callback(comments);
  }
}

async function getLikeStateForPostsFirebase(userId, postIds) {
  if (!userId || postIds.length === 0) {
    return new Set();
  }

  const liked = new Set();
  const chunks = splitIntoChunks(postIds, 10);

  for (const chunk of chunks) {
    const likesRef = collection(db, "postLikes");
    const likesQuery = query(likesRef, where("userId", "==", userId), where("postId", "in", chunk));
    const likesSnapshot = await getDocs(likesQuery);
    likesSnapshot.forEach((item) => liked.add(item.data().postId));
  }

  return liked;
}

function ensureOwnPost(post, userId) {
  if (!post || post.authorId !== userId) {
    throw new Error("You can only edit or delete your own posts.");
  }
}

function relationStateTemplate(targetUid, currentUid) {
  return {
    targetUid,
    isSelf: targetUid === currentUid,
    isFollowing: false,
    outgoingPending: false,
    incomingPending: false
  };
}

export function getRuntimeMode() {
  return runtimeMode;
}

export function isFirebaseConfigured() {
  return firebaseConfigured;
}

export function onSessionChanged(callback) {
  if (runtimeMode === "firebase") {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        callback(null);
        return;
      }

      const profile = await getOrCreateProfile(user.uid, user.email);
      callback(makeSession(user, profile));
    });
  }

  localAuthListeners.add(callback);
  callback(localReadCurrentUser());
  return () => localAuthListeners.delete(callback);
}

export async function signInUser(email, password) {
  const normalizedEmail = sanitizeText(email).toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  if (runtimeMode === "firebase") {
    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    const profile = await getOrCreateProfile(credential.user.uid, credential.user.email);
    return makeSession(credential.user, profile);
  }

  const uid = `local_${btoa(normalizedEmail).replace(/=+$/g, "").toLowerCase()}`;
  const profiles = localReadProfiles();
  const profile = profiles[uid] || buildDefaultProfile(uid, normalizedEmail);
  profiles[uid] = { ...profile, updatedAt: nowIso() };
  localWriteProfiles(profiles);

  const session = {
    uid,
    email: normalizedEmail,
    displayName: profile.displayName
  };

  localWriteCurrentUser(session);
  notifyLocalAuth(session);
  return session;
}

export async function signUpUser(email, password) {
  const normalizedEmail = sanitizeText(email).toLowerCase();

  if (!normalizedEmail || password.length < 6) {
    throw new Error("Email and password (6+ chars) are required.");
  }

  if (runtimeMode === "firebase") {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    const profile = await getOrCreateProfile(credential.user.uid, credential.user.email);
    return makeSession(credential.user, profile);
  }

  return signInUser(normalizedEmail, password);
}

export async function signOutUser() {
  if (runtimeMode === "firebase") {
    await signOut(auth);
    return;
  }

  localWriteCurrentUser(null);
  notifyLocalAuth(null);
}

export async function getOrCreateProfile(uid, email) {
  if (runtimeMode === "firebase") {
    const profileRef = doc(db, "users", uid);
    const profileSnapshot = await getDoc(profileRef);

    if (profileSnapshot.exists()) {
      return normalizeProfile(uid, profileSnapshot.data());
    }

    const profile = buildDefaultProfile(uid, email);
    await setDoc(profileRef, {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return profile;
  }

  const profiles = localReadProfiles();
  if (!profiles[uid]) {
    profiles[uid] = buildDefaultProfile(uid, email);
    localWriteProfiles(profiles);
  }
  return normalizeProfile(uid, profiles[uid]);
}

export async function getUserProfile(uid) {
  if (runtimeMode === "firebase") {
    const profileRef = doc(db, "users", uid);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      throw new Error("Profile not found.");
    }
    return normalizeProfile(uid, snap.data());
  }

  const profiles = localReadProfiles();
  const profile = profiles[uid];

  if (!profile) {
    throw new Error("Profile not found.");
  }

  return normalizeProfile(uid, profile);
}

export async function updateUserProfile(uid, patch) {
  const next = {
    displayName: sanitizeText(patch.displayName).slice(0, 40),
    handle: normalizeHandle(patch.handle),
    bio: sanitizeText(patch.bio).slice(0, 160),
    avatarUrl: sanitizeText(patch.avatarUrl).slice(0, 300)
  };

  if (runtimeMode === "firebase") {
    const profileRef = doc(db, "users", uid);
    await setDoc(
      profileRef,
      {
        ...next,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    const updated = await getDoc(profileRef);
    return normalizeProfile(uid, updated.data());
  }

  const profiles = localReadProfiles();
  const current = profiles[uid] || buildDefaultProfile(uid, "");
  const profile = {
    ...current,
    ...next,
    updatedAt: nowIso()
  };

  profiles[uid] = profile;
  localWriteProfiles(profiles);

  const currentSession = localReadCurrentUser();
  if (currentSession && currentSession.uid === uid) {
    const nextSession = {
      ...currentSession,
      displayName: profile.displayName
    };
    localWriteCurrentUser(nextSession);
    notifyLocalAuth(nextSession);
  }

  return normalizeProfile(uid, profile);
}

export async function listPostsPage(pageSize = 10, cursor = null, userId = null) {
  if (runtimeMode === "firebase") {
    const postsRef = collection(db, "posts");
    let postsQuery = query(postsRef, orderBy("createdAt", "desc"), limit(pageSize));

    if (cursor) {
      postsQuery = query(postsRef, orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize));
    }

    const snapshot = await getDocs(postsQuery);
    const docs = snapshot.docs;
    const ids = docs.map((item) => item.id);
    const likedPostIds = await getLikeStateForPostsFirebase(userId, ids);

    const posts = docs.map((item) => normalizePostDoc(item, likedPostIds.has(item.id)));

    return {
      posts,
      cursor: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore: docs.length === pageSize
    };
  }

  const all = localReadPosts().sort(sortPostsDescending);
  const offset = Number(cursor || 0);
  const segment = all.slice(offset, offset + pageSize);
  const likes = localReadLikes();

  return {
    posts: segment.map((post) => {
      const likeKey = `${post.id}_${userId || ""}`;
      return {
        ...post,
        isLiked: Boolean(likes[likeKey])
      };
    }),
    cursor: offset + segment.length,
    hasMore: offset + segment.length < all.length
  };
}

export function subscribeToFeed(userId, callback, pageSize = 30) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  if (runtimeMode === "firebase") {
    let stopped = false;
    let likedPostIds = new Set();
    let followsUnsub = () => {};
    let likesUnsub = () => {};
    const postUnsubs = [];
    const chunkPostMaps = new Map();

    const publish = () => {
      if (stopped) {
        return;
      }

      const merged = new Map();
      for (const map of chunkPostMaps.values()) {
        for (const post of map.values()) {
          merged.set(post.id, {
            ...post,
            isLiked: likedPostIds.has(post.id)
          });
        }
      }

      const posts = Array.from(merged.values()).sort(sortPostsDescending).slice(0, pageSize);
      callback(posts);
    };

    const clearPostSubscriptions = () => {
      while (postUnsubs.length) {
        const unsub = postUnsubs.pop();
        unsub();
      }
      chunkPostMaps.clear();
    };

    const subscribePostsByAuthors = (authorIds) => {
      clearPostSubscriptions();

      const uniqueAuthors = [...new Set(authorIds.filter(Boolean))];
      if (!uniqueAuthors.length) {
        publish();
        return;
      }

      const chunks = splitIntoChunks(uniqueAuthors, 10);

      for (const chunk of chunks) {
        const chunkKey = chunk.join(",");
        const postsRef = collection(db, "posts");
        const postsQuery = query(postsRef, where("authorId", "in", chunk), orderBy("createdAt", "desc"), limit(pageSize));

        const unsub = onSnapshot(postsQuery, (snapshot) => {
          const map = new Map();
          snapshot.forEach((item) => {
            map.set(item.id, normalizePostDoc(item, likedPostIds.has(item.id)));
          });
          chunkPostMaps.set(chunkKey, map);
          publish();
        });

        postUnsubs.push(unsub);
      }
    };

    const followsRef = collection(db, "follows");
    const followsQuery = query(followsRef, where("followerUid", "==", userId));

    followsUnsub = onSnapshot(followsQuery, (snapshot) => {
      const authorIds = [userId];
      snapshot.forEach((item) => {
        const data = item.data();
        authorIds.push(data.followingUid);
      });
      subscribePostsByAuthors(authorIds);
    });

    const likesRef = collection(db, "postLikes");
    const likesQuery = query(likesRef, where("userId", "==", userId));

    likesUnsub = onSnapshot(likesQuery, (snapshot) => {
      likedPostIds = new Set();
      snapshot.forEach((item) => likedPostIds.add(item.data().postId));
      publish();
    });

    return () => {
      stopped = true;
      followsUnsub();
      likesUnsub();
      clearPostSubscriptions();
    };
  }

  const localSubscription = {
    userId,
    callback,
    pageSize
  };

  localFeedListeners.add(localSubscription);
  callback(buildLocalFeedForUser(userId, pageSize));

  return () => {
    localFeedListeners.delete(localSubscription);
  };
}

export async function listPostsByAuthor(authorId, pageSize = 10, userId = null) {
  if (runtimeMode === "firebase") {
    const postsRef = collection(db, "posts");
    const postsQuery = query(
      postsRef,
      where("authorId", "==", authorId),
      orderBy("createdAt", "desc"),
      limit(pageSize)
    );

    const snapshot = await getDocs(postsQuery);
    const docs = snapshot.docs;
    const ids = docs.map((item) => item.id);
    const likedPostIds = await getLikeStateForPostsFirebase(userId, ids);
    return docs.map((item) => normalizePostDoc(item, likedPostIds.has(item.id)));
  }

  const likes = localReadLikes();
  return localReadPosts()
    .filter((post) => post.authorId === authorId)
    .sort(sortPostsDescending)
    .slice(0, pageSize)
    .map((post) => ({
      ...post,
      isLiked: Boolean(likes[`${post.id}_${userId || ""}`])
    }));
}

export async function createPostRecord({ authorId, authorName, authorHandle, content }) {
  const safeContent = sanitizeText(content);

  if (!safeContent) {
    throw new Error("Post content is required.");
  }

  if (runtimeMode === "firebase") {
    const ref = doc(collection(db, "posts"));
    await setDoc(ref, {
      authorId,
      authorName,
      authorHandle,
      content: safeContent,
      likeCount: 0,
      commentCount: 0,
      visibility: "public",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const snap = await getDoc(ref);
    return normalizePostDoc(snap, false);
  }

  const post = {
    id: `local_post_${Date.now()}_${Math.random().toString(16).slice(2, 9)}`,
    authorId,
    authorName,
    authorHandle,
    content: safeContent,
    likeCount: 0,
    commentCount: 0,
    visibility: "public",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isLiked: false
  };

  const posts = localReadPosts();
  posts.unshift(post);
  localWritePosts(posts);
  emitLocalFeedUpdates();
  return post;
}

export async function updatePostRecord(postId, content, userId) {
  const safeContent = sanitizeText(content);

  if (!safeContent) {
    throw new Error("Post content is required.");
  }

  if (runtimeMode === "firebase") {
    const postRef = doc(db, "posts", postId);
    const snapshot = await getDoc(postRef);

    if (!snapshot.exists()) {
      throw new Error("Post not found.");
    }

    if (snapshot.data().authorId !== userId) {
      throw new Error("You can only edit your own posts.");
    }

    await updateDoc(postRef, {
      content: safeContent,
      updatedAt: serverTimestamp()
    });

    const updated = await getDoc(postRef);
    return normalizePostDoc(updated, false);
  }

  const posts = localReadPosts();
  const index = posts.findIndex((post) => post.id === postId);
  if (index === -1) {
    throw new Error("Post not found.");
  }

  ensureOwnPost(posts[index], userId);
  posts[index] = {
    ...posts[index],
    content: safeContent,
    updatedAt: nowIso()
  };

  localWritePosts(posts);
  emitLocalFeedUpdates();
  return posts[index];
}

export async function deletePostRecord(postId, userId) {
  if (runtimeMode === "firebase") {
    const postRef = doc(db, "posts", postId);
    const snapshot = await getDoc(postRef);

    if (!snapshot.exists()) {
      throw new Error("Post not found.");
    }

    if (snapshot.data().authorId !== userId) {
      throw new Error("You can only delete your own posts.");
    }

    await deleteDoc(postRef);
    return;
  }

  const posts = localReadPosts();
  const target = posts.find((post) => post.id === postId);
  ensureOwnPost(target, userId);

  localWritePosts(posts.filter((post) => post.id !== postId));

  const likes = localReadLikes();
  for (const key of Object.keys(likes)) {
    if (key.startsWith(`${postId}_`)) {
      delete likes[key];
    }
  }
  localWriteLikes(likes);

  const comments = localReadComments().filter((comment) => comment.postId !== postId);
  localWriteComments(comments);

  emitLocalFeedUpdates();
  emitLocalCommentsForPost(postId);
}

export async function toggleLikeRecord(postId, userId) {
  if (!userId) {
    throw new Error("Authentication required.");
  }

  if (runtimeMode === "firebase") {
    const postRef = doc(db, "posts", postId);
    const likeRef = doc(db, "postLikes", `${postId}_${userId}`);

    return runTransaction(db, async (transaction) => {
      const postSnap = await transaction.get(postRef);
      if (!postSnap.exists()) {
        throw new Error("Post not found.");
      }

      const postData = postSnap.data();
      const likeSnap = await transaction.get(likeRef);
      const liked = likeSnap.exists();

      const current = Number(postData.likeCount || 0);
      const nextLikeCount = liked ? Math.max(0, current - 1) : current + 1;

      if (liked) {
        transaction.delete(likeRef);
      } else {
        transaction.set(likeRef, {
          postId,
          userId,
          createdAt: serverTimestamp()
        });
      }

      transaction.update(postRef, {
        likeCount: nextLikeCount,
        updatedAt: serverTimestamp()
      });

      return {
        liked: !liked,
        likeCount: nextLikeCount
      };
    });
  }

  const posts = localReadPosts();
  const post = posts.find((item) => item.id === postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  const likes = localReadLikes();
  const key = `${postId}_${userId}`;
  const liked = Boolean(likes[key]);

  if (liked) {
    delete likes[key];
    post.likeCount = Math.max(0, Number(post.likeCount || 0) - 1);
  } else {
    likes[key] = true;
    post.likeCount = Number(post.likeCount || 0) + 1;
  }

  post.updatedAt = nowIso();

  localWriteLikes(likes);
  localWritePosts(posts);
  emitLocalFeedUpdates();

  return {
    liked: !liked,
    likeCount: post.likeCount
  };
}

export function subscribeToComments(postId, callback, pageSize = 80) {
  if (!postId) {
    callback([]);
    return () => {};
  }

  if (runtimeMode === "firebase") {
    const commentsRef = collection(db, "comments");
    const commentsQuery = query(
      commentsRef,
      where("postId", "==", postId),
      orderBy("createdAt", "asc"),
      limit(pageSize)
    );

    return onSnapshot(commentsQuery, (snapshot) => {
      const comments = snapshot.docs.map(normalizeCommentDoc);
      callback(comments);
    });
  }

  const listeners = localCommentListeners.get(postId) || new Set();
  listeners.add(callback);
  localCommentListeners.set(postId, listeners);

  callback(localCommentsForPost(postId));

  return () => {
    const current = localCommentListeners.get(postId);
    if (!current) {
      return;
    }
    current.delete(callback);
    if (!current.size) {
      localCommentListeners.delete(postId);
    }
  };
}

export async function createCommentRecord({ postId, authorId, authorName, authorHandle, content }) {
  const safeContent = sanitizeText(content).slice(0, 220);

  if (!safeContent) {
    throw new Error("Comment cannot be empty.");
  }

  if (runtimeMode === "firebase") {
    const postRef = doc(db, "posts", postId);
    const commentRef = doc(collection(db, "comments"));

    await runTransaction(db, async (transaction) => {
      const postSnap = await transaction.get(postRef);
      if (!postSnap.exists()) {
        throw new Error("Post not found.");
      }

      const currentCount = Number(postSnap.data().commentCount || 0);

      transaction.set(commentRef, {
        postId,
        authorId,
        authorName,
        authorHandle,
        content: safeContent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.update(postRef, {
        commentCount: currentCount + 1,
        updatedAt: serverTimestamp()
      });
    });

    const snap = await getDoc(commentRef);
    return normalizeCommentDoc(snap);
  }

  const posts = localReadPosts();
  const post = posts.find((item) => item.id === postId);
  if (!post) {
    throw new Error("Post not found.");
  }

  const comment = {
    id: `local_comment_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    postId,
    authorId,
    authorName,
    authorHandle,
    content: safeContent,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const comments = localReadComments();
  comments.push(comment);
  localWriteComments(comments);

  post.commentCount = Number(post.commentCount || 0) + 1;
  post.updatedAt = nowIso();
  localWritePosts(posts);

  emitLocalFeedUpdates();
  emitLocalCommentsForPost(postId);

  return comment;
}

export async function listSuggestedUsers(userId, maxUsers = 10) {
  if (runtimeMode === "firebase") {
    const usersRef = collection(db, "users");
    const usersQuery = query(usersRef, orderBy("updatedAt", "desc"), limit(maxUsers + 10));
    const snapshot = await getDocs(usersQuery);

    const result = [];
    snapshot.forEach((item) => {
      if (item.id !== userId && result.length < maxUsers) {
        result.push(normalizeProfile(item.id, item.data()));
      }
    });

    return result;
  }

  const profiles = Object.values(localReadProfiles())
    .map((item) => normalizeProfile(item.uid, item))
    .filter((item) => item.uid !== userId)
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

  return profiles.slice(0, maxUsers);
}

export async function getRelationshipMap(currentUid, targetUids) {
  const unique = [...new Set(targetUids.filter(Boolean))];
  const map = {};

  for (const targetUid of unique) {
    map[targetUid] = relationStateTemplate(targetUid, currentUid);
  }

  if (!currentUid || !unique.length) {
    return map;
  }

  if (runtimeMode === "firebase") {
    await Promise.all(
      unique.map(async (targetUid) => {
        const state = relationStateTemplate(targetUid, currentUid);
        if (state.isSelf) {
          map[targetUid] = state;
          return;
        }

        const [followSnap, outgoingSnap, incomingSnap] = await Promise.all([
          getDoc(doc(db, "follows", followDocId(currentUid, targetUid))),
          getDoc(doc(db, "followRequests", requestDocId(currentUid, targetUid))),
          getDoc(doc(db, "followRequests", requestDocId(targetUid, currentUid)))
        ]);

        state.isFollowing = followSnap.exists();
        state.outgoingPending = outgoingSnap.exists() && outgoingSnap.data()?.status === "pending";
        state.incomingPending = incomingSnap.exists() && incomingSnap.data()?.status === "pending";
        map[targetUid] = state;
      })
    );

    return map;
  }

  const follows = localReadFollows();
  const requests = localReadFollowRequests();

  for (const targetUid of unique) {
    const state = relationStateTemplate(targetUid, currentUid);
    if (!state.isSelf) {
      state.isFollowing = Boolean(follows[followDocId(currentUid, targetUid)]);

      const outgoing = requests[requestDocId(currentUid, targetUid)];
      const incoming = requests[requestDocId(targetUid, currentUid)];

      state.outgoingPending = Boolean(outgoing && outgoing.status === "pending");
      state.incomingPending = Boolean(incoming && incoming.status === "pending");
    }

    map[targetUid] = state;
  }

  return map;
}

export async function sendFollowRequest(fromUid, toUid) {
  if (!fromUid || !toUid || fromUid === toUid) {
    throw new Error("Invalid follow request target.");
  }

  if (runtimeMode === "firebase") {
    const followRef = doc(db, "follows", followDocId(fromUid, toUid));
    const outgoingRef = doc(db, "followRequests", requestDocId(fromUid, toUid));
    const incomingRef = doc(db, "followRequests", requestDocId(toUid, fromUid));

    await runTransaction(db, async (transaction) => {
      const [followSnap, outgoingSnap, incomingSnap] = await Promise.all([
        transaction.get(followRef),
        transaction.get(outgoingRef),
        transaction.get(incomingRef)
      ]);

      if (followSnap.exists()) {
        throw new Error("You already follow this user.");
      }

      if (incomingSnap.exists() && incomingSnap.data()?.status === "pending") {
        throw new Error("This user already requested to follow you. Accept their request.");
      }

      if (outgoingSnap.exists() && outgoingSnap.data()?.status === "pending") {
        return;
      }

      transaction.set(
        outgoingRef,
        {
          fromUid,
          toUid,
          status: "pending",
          createdAt: outgoingSnap.exists() ? outgoingSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });

    return { status: "pending" };
  }

  const follows = localReadFollows();
  if (follows[followDocId(fromUid, toUid)]) {
    throw new Error("You already follow this user.");
  }

  const requests = localReadFollowRequests();
  const incoming = requests[requestDocId(toUid, fromUid)];
  if (incoming && incoming.status === "pending") {
    throw new Error("This user already requested to follow you. Accept their request.");
  }

  const outgoingKey = requestDocId(fromUid, toUid);
  const outgoing = requests[outgoingKey];

  requests[outgoingKey] = {
    fromUid,
    toUid,
    status: "pending",
    createdAt: outgoing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  localWriteFollowRequests(requests);
  return { status: "pending" };
}

export async function acceptFollowRequest(currentUid, fromUid) {
  if (!currentUid || !fromUid || currentUid === fromUid) {
    throw new Error("Invalid follow request.");
  }

  if (runtimeMode === "firebase") {
    const reqRef = doc(db, "followRequests", requestDocId(fromUid, currentUid));
    const followRef = doc(db, "follows", followDocId(fromUid, currentUid));

    await runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(reqRef);
      if (!requestSnap.exists() || requestSnap.data()?.status !== "pending") {
        throw new Error("Follow request not found.");
      }

      transaction.set(
        followRef,
        {
          followerUid: fromUid,
          followingUid: currentUid,
          createdAt: serverTimestamp()
        },
        { merge: true }
      );

      transaction.delete(reqRef);
    });

    return { status: "accepted" };
  }

  const requests = localReadFollowRequests();
  const requestKey = requestDocId(fromUid, currentUid);
  const request = requests[requestKey];

  if (!request || request.status !== "pending") {
    throw new Error("Follow request not found.");
  }

  const follows = localReadFollows();
  follows[followDocId(fromUid, currentUid)] = {
    followerUid: fromUid,
    followingUid: currentUid,
    createdAt: nowIso()
  };

  delete requests[requestKey];

  localWriteFollows(follows);
  localWriteFollowRequests(requests);
  emitLocalFeedUpdates();

  return { status: "accepted" };
}

export async function rejectFollowRequest(currentUid, fromUid) {
  if (!currentUid || !fromUid || currentUid === fromUid) {
    throw new Error("Invalid follow request.");
  }

  if (runtimeMode === "firebase") {
    const reqRef = doc(db, "followRequests", requestDocId(fromUid, currentUid));
    const requestSnap = await getDoc(reqRef);

    if (!requestSnap.exists()) {
      throw new Error("Follow request not found.");
    }

    await deleteDoc(reqRef);
    return { status: "rejected" };
  }

  const requests = localReadFollowRequests();
  const requestKey = requestDocId(fromUid, currentUid);

  if (!requests[requestKey]) {
    throw new Error("Follow request not found.");
  }

  delete requests[requestKey];
  localWriteFollowRequests(requests);
  return { status: "rejected" };
}

export async function unfollowUser(currentUid, targetUid) {
  if (!currentUid || !targetUid || currentUid === targetUid) {
    throw new Error("Invalid user relation.");
  }

  if (runtimeMode === "firebase") {
    const followRef = doc(db, "follows", followDocId(currentUid, targetUid));
    const reqRef = doc(db, "followRequests", requestDocId(currentUid, targetUid));

    await runTransaction(db, async (transaction) => {
      const [followSnap, reqSnap] = await Promise.all([
        transaction.get(followRef),
        transaction.get(reqRef)
      ]);

      let changed = false;

      if (followSnap.exists()) {
        transaction.delete(followRef);
        changed = true;
      }

      if (reqSnap.exists() && reqSnap.data()?.status === "pending") {
        transaction.delete(reqRef);
        changed = true;
      }

      if (!changed) {
        throw new Error("No active follow relation found.");
      }
    });

    return { status: "removed" };
  }

  const follows = localReadFollows();
  const requests = localReadFollowRequests();

  const followKey = followDocId(currentUid, targetUid);
  const requestKey = requestDocId(currentUid, targetUid);

  let changed = false;

  if (follows[followKey]) {
    delete follows[followKey];
    changed = true;
  }

  if (requests[requestKey] && requests[requestKey].status === "pending") {
    delete requests[requestKey];
    changed = true;
  }

  if (!changed) {
    throw new Error("No active follow relation found.");
  }

  localWriteFollows(follows);
  localWriteFollowRequests(requests);
  emitLocalFeedUpdates();

  return { status: "removed" };
}

export async function listIncomingFollowRequests(uid, maxRequests = 12) {
  if (!uid) {
    return [];
  }

  if (runtimeMode === "firebase") {
    const requestRef = collection(db, "followRequests");
    const requestQuery = query(
      requestRef,
      where("toUid", "==", uid),
      where("status", "==", "pending"),
      limit(maxRequests)
    );

    const snapshot = await getDocs(requestQuery);

    const requests = await Promise.all(
      snapshot.docs.map(async (item) => {
        const data = item.data();
        const profileSnap = await getDoc(doc(db, "users", data.fromUid));
        const profile = profileSnap.exists()
          ? normalizeProfile(data.fromUid, profileSnap.data())
          : buildDefaultProfile(data.fromUid, "member@example.com");

        return {
          fromUid: data.fromUid,
          toUid: data.toUid,
          createdAt: data.createdAt,
          profile
        };
      })
    );

    return requests;
  }

  const requests = localReadFollowRequests();
  const profiles = localReadProfiles();

  return Object.values(requests)
    .filter((item) => item.toUid === uid && item.status === "pending")
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, maxRequests)
    .map((item) => ({
      fromUid: item.fromUid,
      toUid: item.toUid,
      createdAt: item.createdAt,
      profile: normalizeProfile(item.fromUid, profiles[item.fromUid] || buildDefaultProfile(item.fromUid, "member@example.com"))
    }));
}

export async function getFollowCounts(uid) {
  if (!uid) {
    return { followers: 0, following: 0 };
  }

  if (runtimeMode === "firebase") {
    const followsRef = collection(db, "follows");

    const [followersSnapshot, followingSnapshot] = await Promise.all([
      getDocs(query(followsRef, where("followingUid", "==", uid))),
      getDocs(query(followsRef, where("followerUid", "==", uid)))
    ]);

    return {
      followers: followersSnapshot.size,
      following: followingSnapshot.size
    };
  }

  const follows = Object.values(localReadFollows());
  let followers = 0;
  let following = 0;

  for (const follow of follows) {
    if (follow.followingUid === uid) {
      followers += 1;
    }
    if (follow.followerUid === uid) {
      following += 1;
    }
  }

  return { followers, following };
}
