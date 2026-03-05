import {
  acceptFollowRequest,
  getFollowCounts,
  getRelationshipMap,
  getUserProfile,
  listIncomingFollowRequests,
  listPostsByAuthor,
  listSuggestedUsers,
  rejectFollowRequest,
  sendFollowRequest,
  unfollowUser,
  updateUserProfile
} from "../services/firebase.js";
import {
  getState,
  setProfile,
  setProfilePosts,
  setSuggestedUsers,
  setViewingProfile
} from "../state/store.js";
import { formatRelativeTime } from "../utils/time.js";
import { validateProfilePatch } from "../utils/validators.js";
import { showToast, setButtonBusy } from "./ui.js";

let relationshipMap = {};
let incomingRequests = [];
let searchKeyword = "";

export const profileService = {
  getProfile: (uid) => getUserProfile(uid),
  updateProfile: (uid, patch) => updateUserProfile(uid, patch)
};

function relationTemplate() {
  return {
    isSelf: false,
    isFollowing: false,
    outgoingPending: false,
    incomingPending: false
  };
}

function relationFor(uid) {
  return relationshipMap[uid] || relationTemplate();
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRelationshipButtons(userId) {
  const relation = relationFor(userId);

  if (relation.incomingPending) {
    return `
      <div class="flex gap-1">
        <button class="user-chip" data-action="relation-action" data-rel-action="accept" data-user-id="${userId}">Accept</button>
        <button class="user-chip" data-action="relation-action" data-rel-action="reject" data-user-id="${userId}">Reject</button>
      </div>
    `;
  }

  if (relation.isFollowing) {
    return `<button class="user-chip" data-action="relation-action" data-rel-action="unfollow" data-user-id="${userId}">Unfollow</button>`;
  }

  if (relation.outgoingPending) {
    return `<button class="user-chip" data-action="relation-action" data-rel-action="cancel" data-user-id="${userId}">Cancel Request</button>`;
  }

  return `<button class="user-chip" data-action="relation-action" data-rel-action="request" data-user-id="${userId}">Request</button>`;
}

function renderSuggestedUsers() {
  const container = document.getElementById("suggested-users");
  const { suggestedUsers } = getState();

  const filtered = suggestedUsers.filter((user) => {
    if (!searchKeyword) {
      return true;
    }

    const haystack = `${user.displayName} ${user.handle || ""}`.toLowerCase();
    return haystack.includes(searchKeyword);
  });

  if (!filtered.length) {
    container.innerHTML = "<p class='text-xs text-slate-500'>No matching users.</p>";
    return;
  }

  container.innerHTML = filtered
    .map(
      (user) => `
        <div class="user-row">
          <div>
            <p class="text-sm font-semibold text-slate-800">${escapeHtml(user.displayName)}</p>
            <p class="text-xs text-slate-500">${escapeHtml(user.handle || "@member")}</p>
          </div>
          <div class="flex items-center gap-1">
            <button class="user-chip" data-action="open-profile" data-user-id="${user.uid}">View</button>
            ${renderRelationshipButtons(user.uid)}
          </div>
        </div>
      `
    )
    .join("");
}

function renderIncomingRequests() {
  const container = document.getElementById("incoming-requests");

  if (!incomingRequests.length) {
    container.innerHTML = "<p class='text-xs text-slate-500'>No incoming requests.</p>";
    return;
  }

  container.innerHTML = incomingRequests
    .map(
      (item) => `
        <article class="rounded-lg border border-slate-200 bg-white p-2">
          <p class="text-sm font-semibold text-slate-800">${escapeHtml(item.profile.displayName)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(item.profile.handle || "@member")}</p>
          <div class="mt-2 flex gap-2">
            <button class="user-chip" data-action="incoming-accept" data-user-id="${item.fromUid}">Accept</button>
            <button class="user-chip" data-action="incoming-reject" data-user-id="${item.fromUid}">Reject</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderProfilePosts() {
  const { profilePosts } = getState();
  const container = document.getElementById("profile-posts");

  if (!profilePosts.length) {
    container.innerHTML = "<p class='text-xs text-slate-500'>No posts from this profile yet.</p>";
    return;
  }

  container.innerHTML = profilePosts
    .map(
      (post) => `
        <article class="rounded-lg border border-slate-200 bg-white p-3">
          <p class="text-xs text-slate-500">${formatRelativeTime(post.createdAt)}</p>
          <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${escapeHtml(post.content)}</p>
          <p class="mt-2 text-xs text-slate-500">♥ ${post.likeCount} · 💬 ${post.commentCount || 0}</p>
        </article>
      `
    )
    .join("");
}

function fillProfileForm(profile, isOwnProfile) {
  document.getElementById("profile-display-name").value = profile.displayName || "";
  document.getElementById("profile-handle").value = profile.handle || "";
  document.getElementById("profile-avatar").value = profile.avatarUrl || "";
  document.getElementById("profile-bio").value = profile.bio || "";

  document.getElementById("profile-display-name").disabled = !isOwnProfile;
  document.getElementById("profile-handle").disabled = !isOwnProfile;
  document.getElementById("profile-avatar").disabled = !isOwnProfile;
  document.getElementById("profile-bio").disabled = !isOwnProfile;

  const saveButton = document.getElementById("profile-save-btn");
  saveButton.classList.toggle("hidden", !isOwnProfile);
}

function applyProfileFollowAction(viewed, isOwnProfile) {
  const actionButton = document.getElementById("profile-follow-action");
  if (isOwnProfile) {
    actionButton.classList.add("hidden");
    actionButton.dataset.userId = "";
    actionButton.dataset.relAction = "";
    actionButton.textContent = "";
    return;
  }

  const relation = relationFor(viewed.uid);
  actionButton.classList.remove("hidden");
  actionButton.dataset.userId = viewed.uid;

  if (relation.incomingPending) {
    actionButton.dataset.relAction = "accept";
    actionButton.textContent = "Accept Request";
    return;
  }

  if (relation.isFollowing) {
    actionButton.dataset.relAction = "unfollow";
    actionButton.textContent = "Unfollow";
    return;
  }

  if (relation.outgoingPending) {
    actionButton.dataset.relAction = "cancel";
    actionButton.textContent = "Cancel Request";
    return;
  }

  actionButton.dataset.relAction = "request";
  actionButton.textContent = "Send Request";
}

async function refreshFollowCounts(uid) {
  if (!uid) {
    return;
  }

  const followersEl = document.getElementById("profile-followers-count");
  const followingEl = document.getElementById("profile-following-count");

  followersEl.textContent = "...";
  followingEl.textContent = "...";

  try {
    const counts = await getFollowCounts(uid);
    followersEl.textContent = String(counts.followers);
    followingEl.textContent = String(counts.following);
  } catch {
    followersEl.textContent = "0";
    followingEl.textContent = "0";
  }
}

function renderProfileView() {
  const state = getState();
  const session = state.session;
  const ownProfile = state.profile;
  const viewed = state.viewingProfile || ownProfile;

  if (!session || !viewed) {
    return;
  }

  const isOwnProfile = viewed.uid === session.uid;

  document.getElementById("profile-title").textContent = isOwnProfile
    ? "My Profile"
    : `${viewed.displayName || "Member"} Profile`;
  document.getElementById("profile-reset-view").classList.toggle("hidden", isOwnProfile);

  fillProfileForm(viewed, isOwnProfile);
  applyProfileFollowAction(viewed, isOwnProfile);
  renderProfilePosts();
  refreshFollowCounts(viewed.uid);
}

async function refreshProfilePosts(uid) {
  const state = getState();
  const posts = await listPostsByAuthor(uid, 12, state.session?.uid);
  setProfilePosts(posts);
  renderProfilePosts();
}

async function refreshNetworkData() {
  const state = getState();
  if (!state.session) {
    return;
  }

  const users = await listSuggestedUsers(state.session.uid, 25);
  setSuggestedUsers(users);

  const ids = users.map((item) => item.uid);
  const viewedUid = state.viewingProfile?.uid;

  if (viewedUid && viewedUid !== state.session.uid && !ids.includes(viewedUid)) {
    ids.push(viewedUid);
  }

  relationshipMap = await getRelationshipMap(state.session.uid, ids);
  incomingRequests = await listIncomingFollowRequests(state.session.uid, 15);

  renderSuggestedUsers();
  renderIncomingRequests();
  renderProfileView();
}

async function openProfile(uid) {
  try {
    const profile = await profileService.getProfile(uid);
    setViewingProfile(profile);
    await refreshProfilePosts(uid);
    await refreshNetworkData();
    renderProfileView();
  } catch (error) {
    showToast(error.message || "Could not open profile.", "error");
  }
}

async function runRelationAction(targetUid, action) {
  const state = getState();
  const sessionUid = state.session?.uid;

  if (!sessionUid) {
    showToast("Please log in first.", "error");
    return;
  }

  try {
    if (action === "request") {
      await sendFollowRequest(sessionUid, targetUid);
      showToast("Follow request sent.", "success");
    } else if (action === "unfollow") {
      await unfollowUser(sessionUid, targetUid);
      showToast("Unfollowed user.", "success");
    } else if (action === "cancel") {
      await unfollowUser(sessionUid, targetUid);
      showToast("Follow request cancelled.", "success");
    } else if (action === "accept") {
      await acceptFollowRequest(sessionUid, targetUid);
      showToast("Follow request accepted.", "success");
    } else if (action === "reject") {
      await rejectFollowRequest(sessionUid, targetUid);
      showToast("Follow request rejected.", "success");
    }

    await refreshNetworkData();
  } catch (error) {
    showToast(error.message || "Could not update follow relation.", "error");
  }
}

async function handleProfileSave(event) {
  event.preventDefault();

  const state = getState();
  const viewed = state.viewingProfile || state.profile;

  if (!state.session || !viewed || viewed.uid !== state.session.uid) {
    showToast("Only your own profile can be edited.", "error");
    return;
  }

  const patch = {
    displayName: document.getElementById("profile-display-name").value,
    handle: document.getElementById("profile-handle").value,
    avatarUrl: document.getElementById("profile-avatar").value,
    bio: document.getElementById("profile-bio").value
  };

  const validation = validateProfilePatch(patch);
  if (!validation.ok) {
    showToast(validation.error, "error");
    return;
  }

  const saveButton = document.getElementById("profile-save-btn");

  try {
    setButtonBusy(saveButton, "Saving...", true);
    const updated = await profileService.updateProfile(state.session.uid, validation.value);
    setProfile(updated);
    setViewingProfile(updated);
    document.getElementById("current-user-chip").textContent = updated.handle;
    showToast("Profile updated.", "success");
    await refreshProfilePosts(state.session.uid);
    await refreshNetworkData();
  } catch (error) {
    showToast(error.message || "Could not save profile.", "error");
  } finally {
    setButtonBusy(saveButton, "", false);
  }
}

function bindProfileEvents() {
  const profileForm = document.getElementById("profile-form");
  const resetButton = document.getElementById("profile-reset-view");
  const suggestedContainer = document.getElementById("suggested-users");
  const incomingContainer = document.getElementById("incoming-requests");
  const searchInput = document.getElementById("user-search-input");
  const profileActionButton = document.getElementById("profile-follow-action");

  profileForm.addEventListener("submit", handleProfileSave);

  resetButton.addEventListener("click", async () => {
    const state = getState();
    if (!state.profile) {
      return;
    }

    setViewingProfile(state.profile);
    await refreshProfilePosts(state.profile.uid);
    await refreshNetworkData();
    renderProfileView();
  });

  suggestedContainer.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    const action = actionEl.dataset.action;
    const userId = actionEl.dataset.userId;

    if (action === "open-profile") {
      await openProfile(userId);
      return;
    }

    if (action === "relation-action") {
      await runRelationAction(userId, actionEl.dataset.relAction);
    }
  });

  incomingContainer.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    const action = actionEl.dataset.action;
    const userId = actionEl.dataset.userId;

    if (action === "incoming-accept") {
      await runRelationAction(userId, "accept");
      return;
    }

    if (action === "incoming-reject") {
      await runRelationAction(userId, "reject");
    }
  });

  searchInput.addEventListener("input", () => {
    searchKeyword = searchInput.value.trim().toLowerCase();
    renderSuggestedUsers();
  });

  profileActionButton.addEventListener("click", async () => {
    const userId = profileActionButton.dataset.userId;
    const action = profileActionButton.dataset.relAction;
    if (!userId || !action) {
      return;
    }
    await runRelationAction(userId, action);
  });
}

export async function initializeProfileForSession() {
  const state = getState();
  if (!state.profile || !state.session) {
    return;
  }

  setViewingProfile(state.profile);
  await refreshProfilePosts(state.profile.uid);
  await refreshNetworkData();
  renderProfileView();
}

export function initProfileModule() {
  bindProfileEvents();
  renderSuggestedUsers();
  renderIncomingRequests();
  renderProfileView();

  return {
    openProfile,
    renderProfileView,
    loadSuggestions: refreshNetworkData,
    initializeProfileForSession
  };
}
