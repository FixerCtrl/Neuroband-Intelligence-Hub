let landingAuthMode = "signin";
let landingSupabase = null;

function setLandingStatus(message, isError = false){
  const status = document.getElementById("landing-status");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.toggle("is-success", !isError && !!message);
}

function updateLandingAuthMode(){
  const signingIn = landingAuthMode === "signin";
  document.getElementById("access-form-title").textContent = signingIn ? "Welcome back" : "Create your account";
  document.getElementById("landing-submit").textContent = signingIn ? "Sign in" : "Create account";
  document.getElementById("landing-mode-toggle").textContent = signingIn
    ? "Need an account? Sign up"
    : "Already have an account? Sign in";
  document.getElementById("landing-password").autocomplete = signingIn ? "current-password" : "new-password";
  setLandingStatus("");
}

async function startGoogleSignIn(){
  if (!landingSupabase) return setLandingStatus("Sign-in is not configured yet.", true);
  const button = document.getElementById("landing-google-sign-in");
  button.disabled = true;
  setLandingStatus("Connecting to Google…");
  const { error } = await landingSupabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) {
    button.disabled = false;
    setLandingStatus(error.message || "Could not start Google sign-in.", true);
  }
}

async function submitLandingAuth(event){
  event.preventDefault();
  if (!landingSupabase) return setLandingStatus("Sign-in is not configured yet.", true);
  const button = document.getElementById("landing-submit");
  const email = document.getElementById("landing-email").value.trim();
  const password = document.getElementById("landing-password").value;
  button.disabled = true;
  setLandingStatus(landingAuthMode === "signin" ? "Signing in…" : "Creating your account…");

  try {
    if (landingAuthMode === "signin") {
      const { error } = await landingSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setLandingStatus("Signed in. Opening your workspace…");
      window.location.replace("index.html");
      return;
    }

    const { data, error } = await landingSupabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) throw error;
    if (data.session) {
      window.location.replace("index.html");
      return;
    }
    setLandingStatus("Account created. Check your email to confirm, then return here to sign in.");
  } catch (error) {
    setLandingStatus(error.message || "Could not sign in. Please try again.", true);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("PASTE_YOUR")) {
    setLandingStatus("Sign-in is not configured yet. Ask an admin to complete the setup.", true);
    document.getElementById("landing-submit").disabled = true;
    document.getElementById("landing-google-sign-in").disabled = true;
    return;
  }

  landingSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  document.getElementById("landing-auth-form").addEventListener("submit", submitLandingAuth);
  document.getElementById("landing-google-sign-in").addEventListener("click", startGoogleSignIn);
  document.getElementById("landing-mode-toggle").addEventListener("click", () => {
    landingAuthMode = landingAuthMode === "signin" ? "signup" : "signin";
    updateLandingAuthMode();
  });

  const { data: { session }, error } = await landingSupabase.auth.getSession();
  if (error) {
    setLandingStatus("Could not check your sign-in session. Refresh and try again.", true);
    return;
  }
  if (session) window.location.replace("index.html");
});
