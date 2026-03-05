const listeners = new Set();

const state = {
  session: null,
  profile: null,
  activeView: "feed",
  feed: [],
  feedCursor: null,
  hasMoreFeed: true,
  suggestedUsers: [],
  profilePosts: [],
  viewingProfile: null,
  pending: {
    feed: false,
    profile: false,
    auth: false
  }
};

function emit() {
  for (const listener of listeners) {
    listener(getState());
  }
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  Object.assign(state, patch);
  emit();
}

export function setSession(session) {
  state.session = session;
  emit();
}

export function setProfile(profile) {
  state.profile = profile;
  emit();
}

export function setActiveView(activeView) {
  state.activeView = activeView;
  emit();
}

export function setPending(key, value) {
  state.pending[key] = value;
  emit();
}

export function replaceFeed(posts, cursor, hasMoreFeed) {
  state.feed = posts;
  state.feedCursor = cursor;
  state.hasMoreFeed = hasMoreFeed;
  emit();
}

export function appendFeed(posts, cursor, hasMoreFeed) {
  state.feed = [...state.feed, ...posts];
  state.feedCursor = cursor;
  state.hasMoreFeed = hasMoreFeed;
  emit();
}

export function upsertFeedPost(post) {
  const index = state.feed.findIndex((item) => item.id === post.id);
  if (index === -1) {
    state.feed = [post, ...state.feed];
  } else {
    const next = [...state.feed];
    next[index] = { ...next[index], ...post };
    state.feed = next;
  }
  emit();
}

export function removeFeedPost(postId) {
  state.feed = state.feed.filter((post) => post.id !== postId);
  state.profilePosts = state.profilePosts.filter((post) => post.id !== postId);
  emit();
}

export function setSuggestedUsers(users) {
  state.suggestedUsers = users;
  emit();
}

export function setProfilePosts(posts) {
  state.profilePosts = posts;
  emit();
}

export function setViewingProfile(profile) {
  state.viewingProfile = profile;
  emit();
}

export function resetForLogout() {
  state.session = null;
  state.profile = null;
  state.feed = [];
  state.feedCursor = null;
  state.hasMoreFeed = true;
  state.suggestedUsers = [];
  state.profilePosts = [];
  state.viewingProfile = null;
  state.activeView = "feed";
  state.pending = {
    feed: false,
    profile: false,
    auth: false
  };
  emit();
}
