// Single source of truth for API + Firebase settings.
// Edit only this file when connecting your real backend.
window.SOCIALSPHERE_CONFIG = {
  // Toggle AI features in UI.
  enableAI: true,

  // Firebase hosting rewrite path for Cloud Functions API.
  apiBasePath: "/api",

  // Firebase Web SDK config.
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  }
};
