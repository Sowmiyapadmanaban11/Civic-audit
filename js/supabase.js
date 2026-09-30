// ============================================================
// CivicAudit — Supabase Client + Shared Helpers
// Loaded via the Supabase CDN (see <script> tags in each HTML file).
// Must load AFTER config.js and the Supabase CDN script.
// ============================================================

const { SUPABASE_URL: SB_URL, SUPABASE_ANON_KEY: SB_KEY } = window.CIVICAUDIT_CONFIG;

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  if (
    !SB_URL ||
    SB_URL === "YOUR_SUPABASE_URL" ||
    !SB_KEY ||
    SB_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    showConfigWarning();
    throw new Error("Supabase is not configured. Edit js/config.js");
  }

  supabaseClient = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabaseClient;
}

// Shows a fixed banner telling the developer to configure Supabase.
function showConfigWarning() {
  if (document.getElementById("ca-config-warning")) return;
  const bar = document.createElement("div");
  bar.id = "ca-config-warning";
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#F59E0B;color:#1A1400;font-family:sans-serif;font-size:14px;padding:10px 16px;text-align:center;";
  bar.innerHTML =
    "⚠️ CivicAudit is not connected to Supabase yet. Add your project URL and anon key in <code>js/config.js</code>. See README.md.";
  document.body.prepend(bar);
}

// ---------- Generic helpers used across pages ----------

/** Returns the logged-in user's session, or null. */
async function getSession() {
  const sb = getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error(error);
    return null;
  }
  return data.session;
}

/** Redirects to login.html if there is no active session. Returns the session. */
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

/** Fetches the current user's profile row. */
async function getCurrentProfile() {
  const sb = getSupabase();
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

/** Small toast notification, top-right. */
function toast(message, type = "info") {
  let host = document.getElementById("ca-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "ca-toast-host";
    host.style.cssText =
      "position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;";
    document.body.appendChild(host);
  }
  const colors = {
    info: "#2E3440",
    success: "#16A34A",
    error: "#DC2626",
    warning: "#D97706",
  };
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:12px 18px;border-radius:10px;font-family:Inter,sans-serif;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:320px;`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

/** Friendly wrapper so raw Postgres/Supabase errors are never shown directly. */
function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("duplicate key")) return "That record already exists.";
  if (msg.includes("invalid login credentials")) return "Incorrect email or password.";
  if (msg.includes("email not confirmed")) return "Please confirm your email before logging in.";
  if (msg.includes("row-level security") || msg.includes("permission denied"))
    return "You don't have permission to do that.";
  if (msg.includes("network")) return "Network error. Check your connection and try again.";
  console.error("Supabase error:", error);
  return fallback;
}

/** Formats a currency amount in INR (₹). */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return "—";
  return "₹" + Number(amount).toLocaleString("en-IN");
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

/** Renders a colored status badge for project/bid statuses. Shared across all pages. */
function statusBadge(status) {
  const map = {
    Open: "badge-info",
    "In Progress": "badge-warning",
    Completed: "badge-verified",
    Cancelled: "badge-danger",
    Pending: "badge-neutral",
    Shortlisted: "badge-warning",
    Accepted: "badge-verified",
    Rejected: "badge-danger",
    Verified: "badge-verified",
  };
  return `<span class="badge ${map[status] || "badge-neutral"}">${escapeHtml(status)}</span>`;
}

/** Renders a filled/empty star string for a 0-5 rating. Shared across all pages. */
function starString(rating) {
  const r = Math.round(Number(rating) || 0);
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------- App shell (sidebar + topbar), shared across all authenticated pages ----------

// Display names for the three account types (database values stay owner / professional / admin)
const ROLE_LABELS = { owner: "User", professional: "Builder", admin: "Admin" };

// Each account type only sees the pages that are relevant to it.
const NAV_BY_ROLE = {
  owner: [
    { page: "dashboard.html", icon: "▦", label: "Dashboard" },
    { page: "projects.html", icon: "▤", label: "Post Project" },
    { page: "bids.html", icon: "⇄", label: "Received Bids" },
    { page: "messages.html", icon: "✉", label: "Messages" },
    { page: "schedule.html", icon: "🗓", label: "Site Visits" },
    { page: "notifications.html", icon: "🔔", label: "Notifications" },
    { page: "reviews.html", icon: "★", label: "Reviews" },
    { page: "profile.html", icon: "◎", label: "My Profile" },
  ],
  professional: [
    { page: "dashboard.html", icon: "▦", label: "Dashboard" },
    { page: "projects.html", icon: "▤", label: "Browse Projects" },
    { page: "bids.html", icon: "⇄", label: "My Bids" },
    { page: "messages.html", icon: "✉", label: "Messages" },
    { page: "schedule.html", icon: "🗓", label: "Site Visits" },
    { page: "portfolio.html", icon: "◆", label: "Portfolio" },
    { page: "notifications.html", icon: "🔔", label: "Notifications" },
    { page: "reviews.html", icon: "★", label: "Reviews" },
    { page: "profile.html", icon: "◎", label: "My Profile" },
  ],
  admin: [
    { page: "admin.html", icon: "⚙", label: "Admin Panel" },
    { page: "notifications.html", icon: "🔔", label: "Notifications" },
    { page: "profile.html", icon: "◎", label: "My Profile" },
  ],
};

function roleHome(role) {
  return role === "admin" ? "admin.html" : "dashboard.html";
}

/**
 * Renders the sidebar + topbar shell into #sidebar-mount / #topbar-mount,
 * and returns the current user's profile. Shows only the menu items and
 * pages that belong to the logged-in account type (User / Builder / Admin).
 */
async function renderShell({ activePage, eyebrowText, titleText, showSearch = false }) {
  const session = await requireAuth();
  if (!session) return null;

  const profile = await getCurrentProfile();
  if (!profile) {
    const body = document.querySelector(".page-body");
    if (body) body.innerHTML = '<div class="empty-state">Could not load your profile. Please <a href="login.html" style="color:var(--accent)">log in again</a>.</div>';
    return null;
  }

  const role = profile.role;
  const items = NAV_BY_ROLE[role] || NAV_BY_ROLE.owner;

  // Page protection: send people away from pages that are not for their account type
  const allowed = items.map((i) => i.page);
  if (!allowed.includes(activePage) || (role === "admin" && activePage === "dashboard.html")) {
    window.location.href = roleHome(role);
    return null;
  }

  const sideMount = document.getElementById("sidebar-mount");
  if (sideMount) {
    sideMount.innerHTML = `
      <aside class="sidebar">
        <a href="${roleHome(role)}" class="brand side-brand">
          <span class="brand-mark">CA</span>
          <span class="brand-text">CivicAudit<small>${ROLE_LABELS[role] || ""} Portal</small></span>
        </a>
        <nav class="side-nav">
          ${items
            .map(
              (item) => `
            <a href="${item.page}" class="side-link ${activePage === item.page ? "active" : ""}" title="${item.label}">
              <span class="side-icon">${item.icon}</span>
              <span class="side-label">${item.label}</span>
            </a>`
            )
            .join("")}
        </nav>
        <div class="side-bottom">
          <div class="side-user">
            <img class="side-avatar" data-user-avatar src="assets/images/avatar-placeholder.svg" alt="Avatar" />
            <div class="side-user-info">
              <div class="side-user-name" data-user-name></div>
              <div class="side-user-role" data-user-role></div>
            </div>
          </div>
          <a href="#" data-logout class="side-link" title="Log out"><span class="side-icon">⏻</span><span class="side-label">Log out</span></a>
        </div>
      </aside>`;
  }

  const topMount = document.getElementById("topbar-mount");
  if (topMount) {
    topMount.innerHTML = `
      <header class="topbar">
        <div class="topbar-title">
          <div class="eyebrow-sm">${escapeHtml(eyebrowText || "")}</div>
          <h1>${escapeHtml(titleText || "")}</h1>
        </div>
        <div class="topbar-actions">
          ${showSearch ? `<div class="search-box"><span>🔍</span><input type="text" id="global-search" placeholder="Search…" /></div>` : ""}
          <a href="notifications.html" class="icon-btn" id="notif-icon-btn">🔔<span class="ping hidden" id="notif-ping"></span></a>
          <img class="side-avatar" data-user-avatar src="assets/images/avatar-placeholder.svg" alt="Avatar" style="width:34px;height:34px;" />
        </div>
      </header>`;
  }

  await initShell(profile);
  markUnreadNotifBadge();
  return profile;
}

/** Lights up the notification bell if there are unread notifications. */
async function markUnreadNotifBadge() {
  try {
    const sb = getSupabase();
    const session = await getSession();
    if (!session) return;
    const { count } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .eq("is_read", false);
    const ping = document.getElementById("notif-ping");
    if (ping && count > 0) ping.classList.remove("hidden");
  } catch (e) {
    console.error(e);
  }
}

/** Populates the sidebar/topbar with the logged in user's name + role, and wires logout buttons. */
async function initShell(prefetched) {
  const profile = prefetched || (await getCurrentProfile());
  document.querySelectorAll("[data-user-name]").forEach((el) => {
    if (profile) el.textContent = profile.full_name || profile.email;
  });
  document.querySelectorAll("[data-user-role]").forEach((el) => {
    if (profile) el.textContent = ROLE_LABELS[profile.role] || "User";
  });
  document.querySelectorAll("[data-user-avatar]").forEach((el) => {
    if (profile?.profile_image) el.src = profile.profile_image;
  });
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const sb = getSupabase();
      await sb.auth.signOut();
      window.location.href = "index.html";
    });
  });
  return profile;
}
