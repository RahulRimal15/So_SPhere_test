import { initAiModule } from "./modules/ai.js";
import { initAuthModule } from "./modules/auth.js";
import { initFeedModule, loadFeed, renderFeed, stopFeedRealtime } from "./modules/feed.js";
import { initProfileModule } from "./modules/profile.js";
import { showToast } from "./modules/ui.js";
import { getRuntimeMode } from "./services/firebase.js";
import { getState, setActiveView } from "./state/store.js";

function setNavState(activeView) {
  const feedButton = document.getElementById("nav-feed");
  const profileButton = document.getElementById("nav-profile");
  const feedView = document.getElementById("feed-view");

  const feedActive = activeView === "feed";
  feedButton.classList.toggle("nav-btn--active", feedActive);
  profileButton.classList.toggle("nav-btn--active", !feedActive);

  feedView.classList.toggle("hidden", !feedActive);
}

function bindNavigation(profileApi) {
  const feedButton = document.getElementById("nav-feed");
  const profileButton = document.getElementById("nav-profile");

  feedButton.addEventListener("click", () => {
    setActiveView("feed");
    setNavState("feed");
  });

  profileButton.addEventListener("click", async () => {
    setActiveView("profile");
    setNavState("profile");

    const state = getState();
    if (state.profile) {
      await profileApi.openProfile(state.profile.uid);
    }

    document.getElementById("profile-view").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function bootstrapAuthenticatedState(profileApi) {
  setActiveView("feed");
  setNavState("feed");
  await loadFeed();
  await profileApi.initializeProfileForSession();
  renderFeed();
}

function initModules() {
  const profileApi = initProfileModule();

  initFeedModule({
    onOpenProfile: async (uid) => {
      setActiveView("profile");
      setNavState("profile");
      await profileApi.openProfile(uid);
      document.getElementById("profile-view").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  initAiModule({
    getSession: () => getState().session,
    getFeed: () => getState().feed
  });

  bindNavigation(profileApi);

  initAuthModule(async (session) => {
    if (!session) {
      stopFeedRealtime();
      return;
    }
    await bootstrapAuthenticatedState(profileApi);
  });
}

function showRuntimeInfoToast() {
  const mode = getRuntimeMode();
  if (mode === "local") {
    showToast("Running in local mode. Add Firebase config for production data.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initModules();
  showRuntimeInfoToast();
});
