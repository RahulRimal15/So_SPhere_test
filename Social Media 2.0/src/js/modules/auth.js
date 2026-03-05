import {
  getRuntimeMode,
  isFirebaseConfigured,
  onSessionChanged,
  signInUser,
  signOutUser,
  signUpUser,
  getOrCreateProfile
} from "../services/firebase.js";
import { setButtonBusy, showToast, hideSection, showSection } from "./ui.js";
import { resetForLogout, setProfile, setSession } from "../state/store.js";

let isSignUpMode = false;
let unsubscribeSession = null;
let sessionHandler = () => {};

const authService = {
  signIn: (email, password) => signInUser(email, password),
  signOut: () => signOutUser(),
  signUp: (email, password) => signUpUser(email, password)
};

function updateAuthUi() {
  const submit = document.getElementById("auth-submit");
  const toggle = document.getElementById("auth-toggle");

  submit.textContent = isSignUpMode ? "Create Account" : "Log In";
  toggle.textContent = isSignUpMode ? "Already have an account? Log in" : "Need an account? Sign up";
}

function renderModeBanner() {
  const banner = document.getElementById("auth-mode-banner");
  const mode = getRuntimeMode();

  if (mode === "firebase" && isFirebaseConfigured()) {
    banner.textContent = "Runtime: Firebase mode (production-backed data).";
    return;
  }

  banner.textContent = "Runtime: Local mode (Firebase config missing). Data is stored in your browser only.";
}

function setAuthenticatedView(isAuthenticated) {
  if (isAuthenticated) {
    hideSection("auth-view");
    showSection("app-view");
    return;
  }

  showSection("auth-view");
  hideSection("app-view");
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const submit = document.getElementById("auth-submit");
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;

  try {
    setButtonBusy(submit, isSignUpMode ? "Creating..." : "Signing in...", true);

    if (isSignUpMode) {
      await authService.signUp(email, password);
      showToast("Account created successfully.", "success");
    } else {
      await authService.signIn(email, password);
      showToast("Logged in successfully.", "success");
    }
  } catch (error) {
    showToast(error.message || "Authentication failed.", "error");
  } finally {
    setButtonBusy(submit, "", false);
  }
}

function bindAuthEvents() {
  const form = document.getElementById("auth-form");
  const toggle = document.getElementById("auth-toggle");
  const logoutButton = document.getElementById("logout-btn");

  form.addEventListener("submit", handleAuthSubmit);

  toggle.addEventListener("click", () => {
    isSignUpMode = !isSignUpMode;
    updateAuthUi();
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await authService.signOut();
      showToast("Logged out.", "success");
    } catch (error) {
      showToast(error.message || "Logout failed.", "error");
    }
  });
}

export function initAuthModule(onSessionResolved) {
  sessionHandler = onSessionResolved;

  renderModeBanner();
  updateAuthUi();
  bindAuthEvents();

  if (unsubscribeSession) {
    unsubscribeSession();
  }

  unsubscribeSession = onSessionChanged(async (session) => {
    if (!session) {
      resetForLogout();
      setAuthenticatedView(false);
      document.getElementById("current-user-chip").textContent = "Guest";
      sessionHandler(null);
      return;
    }

    const profile = await getOrCreateProfile(session.uid, session.email);
    setSession(session);
    setProfile(profile);

    const userChip = document.getElementById("current-user-chip");
    userChip.textContent = profile.handle || session.displayName;

    setAuthenticatedView(true);
    sessionHandler(session);
  });
}

export { authService };
