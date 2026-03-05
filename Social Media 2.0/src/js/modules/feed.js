import {
  createPostRecord,
  createCommentRecord,
  deletePostRecord,
  subscribeToComments,
  subscribeToFeed,
  toggleLikeRecord,
  updatePostRecord
} from "../services/firebase.js";
import {
  getState,
  replaceFeed,
  setState,
  upsertFeedPost,
  removeFeedPost
} from "../state/store.js";
import { toggleLikeSnapshot } from "../utils/likeMath.js";
import { formatRelativeTime } from "../utils/time.js";
import { validateCommentContent, validatePostContent } from "../utils/validators.js";
import { setButtonBusy, showToast } from "./ui.js";

let editingPostId = null;
let openProfileCallback = () => {};
let unsubscribeRealtimeFeed = null;

const openCommentPosts = new Set();
const commentSubscriptions = new Map();
const commentsByPost = new Map();

export const postService = {
  async createPost(content) {
    const state = getState();
    const session = state.session;
    const profile = state.profile;

    if (!session || !profile) {
      throw new Error("Please log in first.");
    }

    return createPostRecord({
      authorId: session.uid,
      authorName: profile.displayName,
      authorHandle: profile.handle,
      content
    });
  },

  async updatePost(postId, content) {
    const state = getState();
    if (!state.session) {
      throw new Error("Please log in first.");
    }
    return updatePostRecord(postId, content, state.session.uid);
  },

  async deletePost(postId) {
    const state = getState();
    if (!state.session) {
      throw new Error("Please log in first.");
    }
    return deletePostRecord(postId, state.session.uid);
  },

  async toggleLike(postId, userId) {
    return toggleLikeRecord(postId, userId);
  },

  async addComment(postId, content) {
    const state = getState();
    if (!state.session || !state.profile) {
      throw new Error("Please log in first.");
    }

    return createCommentRecord({
      postId,
      content,
      authorId: state.session.uid,
      authorName: state.profile.displayName,
      authorHandle: state.profile.handle
    });
  }
};

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unsubscribeComment(postId) {
  const unsub = commentSubscriptions.get(postId);
  if (unsub) {
    unsub();
    commentSubscriptions.delete(postId);
  }
}

function clearAllCommentSubscriptions() {
  for (const postId of commentSubscriptions.keys()) {
    unsubscribeComment(postId);
  }
  openCommentPosts.clear();
  commentsByPost.clear();
}

function pruneCommentSubscriptions(visiblePostIds) {
  for (const postId of [...commentSubscriptions.keys()]) {
    if (!visiblePostIds.has(postId)) {
      unsubscribeComment(postId);
      openCommentPosts.delete(postId);
      commentsByPost.delete(postId);
    }
  }
}

function postActionsHtml(post, isOwner) {
  if (!isOwner) {
    return "";
  }

  return `
    <button class="post-btn" data-action="edit" data-post-id="${post.id}">Edit</button>
    <button class="post-btn" data-action="delete" data-post-id="${post.id}">Delete</button>
  `;
}

function postContentHtml(post) {
  if (editingPostId !== post.id) {
    return `<p class="post-content">${escapeHtml(post.content)}</p>`;
  }

  return `
    <textarea class="w-full rounded-lg border border-slate-300 p-2 text-sm" rows="4" data-edit-input="${post.id}">${escapeHtml(post.content)}</textarea>
    <div class="mt-2 flex gap-2">
      <button class="post-btn" data-action="save-edit" data-post-id="${post.id}">Save</button>
      <button class="post-btn" data-action="cancel-edit" data-post-id="${post.id}">Cancel</button>
    </div>
  `;
}

function commentPanelHtml(post) {
  if (!openCommentPosts.has(post.id)) {
    return "";
  }

  const comments = commentsByPost.get(post.id) || [];

  return `
    <section class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div class="mb-2 max-h-56 overflow-y-auto space-y-2" id="comment-list-${post.id}">
        ${
          comments.length
            ? comments
                .map(
                  (comment) => `
              <article class="rounded-md border border-slate-200 bg-white p-2">
                <p class="text-xs font-semibold text-slate-700">${escapeHtml(comment.authorName)} <span class="font-normal text-slate-500">${escapeHtml(comment.authorHandle)}</span></p>
                <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${escapeHtml(comment.content)}</p>
                <p class="mt-1 text-[11px] text-slate-500">${formatRelativeTime(comment.createdAt)}</p>
              </article>
            `
                )
                .join("")
            : "<p class='text-xs text-slate-500'>No comments yet.</p>"
        }
      </div>

      <div class="flex gap-2">
        <input
          type="text"
          maxlength="220"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Write a comment"
          data-comment-input="${post.id}"
        />
        <button class="post-btn" data-action="comment-submit" data-post-id="${post.id}">Send</button>
      </div>
    </section>
  `;
}

function postCardHtml(post, currentUserId) {
  const isOwner = post.authorId === currentUserId;
  const likeButtonClass = post.isLiked ? "post-btn post-btn--liked" : "post-btn";
  const commentCount = Number(post.commentCount || 0);

  return `
    <article class="post-card" data-post-id="${post.id}">
      <header class="post-meta">
        <div>
          <button class="post-author hover:underline" data-action="open-profile" data-user-id="${post.authorId}">${escapeHtml(post.authorName)}</button>
          <p class="post-handle">${escapeHtml(post.authorHandle)} · ${formatRelativeTime(post.createdAt)}</p>
        </div>
      </header>

      ${postContentHtml(post)}

      <footer class="post-actions">
        <button class="${likeButtonClass}" data-action="toggle-like" data-post-id="${post.id}">♥ ${post.likeCount}</button>
        <button class="post-btn" data-action="comment-toggle" data-post-id="${post.id}">💬 ${commentCount}</button>
        ${postActionsHtml(post, isOwner)}
      </footer>

      ${commentPanelHtml(post)}
    </article>
  `;
}

export function renderFeed() {
  const state = getState();
  const list = document.getElementById("feed-list");
  const loadMoreBtn = document.getElementById("feed-load-more");

  const visiblePostIds = new Set(state.feed.map((post) => post.id));
  pruneCommentSubscriptions(visiblePostIds);

  if (!state.feed.length) {
    list.innerHTML = `
      <div class="glass-card p-5 text-sm text-slate-600">
        No posts yet. Publish the first update for your community.
      </div>
    `;
  } else {
    list.innerHTML = state.feed.map((post) => postCardHtml(post, state.session?.uid)).join("");
  }

  loadMoreBtn.classList.add("hidden");
}

async function handleCreatePost() {
  const input = document.getElementById("post-input");
  const createButton = document.getElementById("create-post-btn");

  const validation = validatePostContent(input.value);
  if (!validation.ok) {
    showToast(validation.error, "error");
    return;
  }

  setButtonBusy(createButton, "Publishing...", true);

  try {
    const post = await postService.createPost(validation.value);
    upsertFeedPost({
      ...post,
      createdAt: post.createdAt || new Date().toISOString(),
      isLiked: false
    });

    input.value = "";
    showToast("Post published.", "success");
    renderFeed();
  } catch (error) {
    showToast(error.message || "Could not publish post.", "error");
  } finally {
    setButtonBusy(createButton, "", false);
  }
}

function patchPostInStore(postId, patch) {
  const state = getState();
  const nextFeed = state.feed.map((post) => (post.id === postId ? { ...post, ...patch } : post));
  setState({ feed: nextFeed });
}

async function handleLike(postId) {
  const state = getState();
  if (!state.session) {
    showToast("Please log in first.", "error");
    return;
  }

  const target = state.feed.find((post) => post.id === postId);
  if (!target) {
    return;
  }

  const optimistic = toggleLikeSnapshot({ likes: target.likeCount, isLiked: target.isLiked });
  patchPostInStore(postId, { likeCount: optimistic.likes, isLiked: optimistic.isLiked });

  try {
    const response = await postService.toggleLike(postId, state.session.uid);
    patchPostInStore(postId, { likeCount: response.likeCount, isLiked: response.liked });
  } catch (error) {
    patchPostInStore(postId, { likeCount: target.likeCount, isLiked: target.isLiked });
    showToast(error.message || "Like update failed.", "error");
  }

  renderFeed();
}

async function handleDelete(postId) {
  try {
    await postService.deletePost(postId);
    removeFeedPost(postId);
    unsubscribeComment(postId);
    openCommentPosts.delete(postId);
    commentsByPost.delete(postId);
    showToast("Post deleted.", "success");
    renderFeed();
  } catch (error) {
    showToast(error.message || "Delete failed.", "error");
  }
}

async function handleSaveEdit(postId) {
  const input = document.querySelector(`[data-edit-input="${postId}"]`);
  const validation = validatePostContent(input?.value || "");

  if (!validation.ok) {
    showToast(validation.error, "error");
    return;
  }

  try {
    const updated = await postService.updatePost(postId, validation.value);
    editingPostId = null;
    upsertFeedPost({
      ...updated,
      isLiked: getState().feed.find((item) => item.id === postId)?.isLiked || false
    });
    showToast("Post updated.", "success");
  } catch (error) {
    showToast(error.message || "Update failed.", "error");
  }

  renderFeed();
}

function openComments(postId) {
  if (commentSubscriptions.has(postId)) {
    return;
  }

  const unsubscribe = subscribeToComments(postId, (comments) => {
    commentsByPost.set(postId, comments);
    renderFeed();
  });

  commentSubscriptions.set(postId, unsubscribe);
}

function toggleComments(postId) {
  if (openCommentPosts.has(postId)) {
    openCommentPosts.delete(postId);
    unsubscribeComment(postId);
    commentsByPost.delete(postId);
  } else {
    openCommentPosts.add(postId);
    openComments(postId);
  }
  renderFeed();
}

async function handleCommentSubmit(postId) {
  const input = document.querySelector(`[data-comment-input="${postId}"]`);
  const validation = validateCommentContent(input?.value || "");

  if (!validation.ok) {
    showToast(validation.error, "error");
    return;
  }

  try {
    await postService.addComment(postId, validation.value);
    input.value = "";
    showToast("Comment added.", "success");
  } catch (error) {
    showToast(error.message || "Could not add comment.", "error");
  }
}

async function handleFeedListClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const postId = actionTarget.dataset.postId;
  const userId = actionTarget.dataset.userId;

  if (action === "toggle-like") {
    await handleLike(postId);
    return;
  }

  if (action === "comment-toggle") {
    toggleComments(postId);
    return;
  }

  if (action === "comment-submit") {
    await handleCommentSubmit(postId);
    return;
  }

  if (action === "delete") {
    await handleDelete(postId);
    return;
  }

  if (action === "edit") {
    editingPostId = postId;
    renderFeed();
    return;
  }

  if (action === "cancel-edit") {
    editingPostId = null;
    renderFeed();
    return;
  }

  if (action === "save-edit") {
    await handleSaveEdit(postId);
    return;
  }

  if (action === "open-profile") {
    openProfileCallback(userId);
  }
}

export function stopFeedRealtime() {
  if (unsubscribeRealtimeFeed) {
    unsubscribeRealtimeFeed();
    unsubscribeRealtimeFeed = null;
  }
  clearAllCommentSubscriptions();
}

export async function loadFeed() {
  const state = getState();

  if (!state.session) {
    return;
  }

  stopFeedRealtime();

  unsubscribeRealtimeFeed = subscribeToFeed(state.session.uid, (posts) => {
    replaceFeed(posts, null, false);
    renderFeed();
  }, 40);
}

export function initFeedModule({ onOpenProfile }) {
  openProfileCallback = onOpenProfile;

  const createButton = document.getElementById("create-post-btn");
  const list = document.getElementById("feed-list");

  createButton.addEventListener("click", handleCreatePost);
  list.addEventListener("click", (event) => {
    handleFeedListClick(event);
  });
}
