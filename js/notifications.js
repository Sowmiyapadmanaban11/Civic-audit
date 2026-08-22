// ============================================================
// CivicAudit — notifications.js
// ============================================================

let notifProfile = null;

const NOTIF_ICONS = {
  new_bid: "⇄", bid_accepted: "✓", bid_rejected: "✕", bid_shortlisted: "★",
  new_message: "✉", site_visit_scheduled: "🗓", site_visit_updated: "🗓",
  project_update: "▤", new_review: "★", system: "◎",
};

document.addEventListener("DOMContentLoaded", async () => {
  notifProfile = await renderShell({ activePage: "notifications.html", eyebrowText: "Updates", titleText: "Notifications" });
  if (!notifProfile) return;

  await loadNotifications();

  document.getElementById("mark-all-read").addEventListener("click", async () => {
    try {
      const sb = getSupabase();
      const { error } = await sb.from("notifications").update({ is_read: true }).eq("user_id", notifProfile.id).eq("is_read", false);
      if (error) throw error;
      await loadNotifications();
      document.getElementById("notif-ping")?.classList.add("hidden");
    } catch (err) {
      toast(friendlyError(err), "error");
    }
  });
});

async function loadNotifications() {
  const sb = getSupabase();
  const host = document.getElementById("notifications-list");
  try {
    const { data: notifs, error } = await sb
      .from("notifications")
      .select("*")
      .eq("user_id", notifProfile.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    if (!notifs.length) {
      host.innerHTML = `<div class="empty-state"><div class="icon">🔔</div>You're all caught up.</div>`;
      return;
    }

    host.innerHTML = notifs
      .map(
        (n) => `
      <div class="flex gap-12" style="padding:14px 0; border-top:1px solid var(--border-soft); ${n.is_read ? "" : "background:var(--accent-soft); margin:0 -22px; padding-left:22px; padding-right:22px;"}">
        <div class="feature-icon" style="width:36px;height:36px;font-size:16px;flex-shrink:0;">${NOTIF_ICONS[n.type] || "◎"}</div>
        <div style="flex:1;">
          <div class="flex justify-between"><strong style="font-size:14px;">${escapeHtml(n.title)}</strong><span class="text-muted" style="font-size:12px;">${timeAgo(n.created_at)}</span></div>
          <p class="text-muted mt-8">${escapeHtml(n.message)}</p>
        </div>
      </div>`
      )
      .join("");

    // Mark visible unread as read
    const unreadIds = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length) {
      await sb.from("notifications").update({ is_read: true }).in("id", unreadIds);
    }
  } catch (err) {
    host.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}
