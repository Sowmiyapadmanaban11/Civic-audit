// ============================================================
// CivicAudit — admin.js
// Only accessible to profiles.role === 'admin'.
// To make a user an admin, run in Supabase SQL Editor:
//   update public.profiles set role = 'admin' where email = 'you@example.com';
// ============================================================

let adminProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
  adminProfile = await renderShell({ activePage: "admin.html", eyebrowText: "Admin", titleText: "Admin Dashboard" });
  if (!adminProfile) return;

  if (adminProfile.role !== "admin") {
    document.querySelector(".page-body").innerHTML = `<div class="empty-state"><div class="icon">⚙</div>This area is restricted to administrators.</div>`;
    return;
  }

  await loadAdminStats();
  await loadAdminTab("users");

  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-tab]").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      loadAdminTab(tab.dataset.adminTab);
    });
  });
});

async function loadAdminStats() {
  const sb = getSupabase();
  try {
    const [users, professionals, projects, bids] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "professional"),
      sb.from("projects").select("id", { count: "exact", head: true }),
      sb.from("bids").select("id", { count: "exact", head: true }),
    ]);

    document.getElementById("admin-kpis").innerHTML = `
      <div class="kpi-card"><div class="kpi-value">${users.count ?? "—"}</div><div class="kpi-label">Total Users</div></div>
      <div class="kpi-card"><div class="kpi-value">${professionals.count ?? "—"}</div><div class="kpi-label">Professionals</div></div>
      <div class="kpi-card"><div class="kpi-value">${projects.count ?? "—"}</div><div class="kpi-label">Total Projects</div></div>
      <div class="kpi-card"><div class="kpi-value">${bids.count ?? "—"}</div><div class="kpi-label">Total Bids</div></div>
    `;
  } catch (err) {
    console.error(err);
  }
}

async function loadAdminTab(tab) {
  const sb = getSupabase();
  const host = document.getElementById("admin-content");
  host.innerHTML = `<div class="loading-row"><div class="spinner"></div></div>`;

  try {
    if (tab === "users") {
      const { data, error } = await sb.from("profiles").select("*").eq("role", "owner").order("created_at", { ascending: false });
      if (error) throw error;
      host.innerHTML = table(
        ["Name", "Email", "Location", "Joined"],
        data.map((u) => [escapeHtml(u.full_name), escapeHtml(u.email), escapeHtml(u.location || "—"), formatDate(u.created_at)])
      );
    }

    if (tab === "professionals") {
      const { data, error } = await sb.from("profiles").select("*").eq("role", "professional").order("created_at", { ascending: false });
      if (error) throw error;
      host.innerHTML = table(
        ["Name", "Type", "Company", "Rating", "Verification", ""],
        data.map((p) => [
          escapeHtml(p.full_name), escapeHtml(p.professional_type || "—"), escapeHtml(p.company_name || "—"),
          (p.average_rating || 0).toFixed(1), statusBadge(p.verification_status),
          p.verification_status !== "Verified" ? `<button class="btn btn-secondary btn-sm" data-verify="${p.id}">Verify</button>` : "",
        ])
      );
      host.querySelectorAll("[data-verify]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const { error } = await sb.from("profiles").update({ verification_status: "Verified" }).eq("id", btn.dataset.verify);
            if (error) throw error;
            toast("Professional verified.", "success");
            loadAdminTab("professionals");
          } catch (err) { toast(friendlyError(err), "error"); }
        });
      });
    }

    if (tab === "projects") {
      const { data, error } = await sb.from("projects").select("*, owner:owner_id(full_name)").order("created_at", { ascending: false });
      if (error) throw error;
      host.innerHTML = table(
        ["Title", "Owner", "Type", "Status", "Posted"],
        data.map((p) => [escapeHtml(p.title), escapeHtml(p.owner?.full_name || "—"), escapeHtml(p.project_type), statusBadge(p.status), formatDate(p.created_at)])
      );
    }

    if (tab === "bids") {
      const { data, error } = await sb.from("bids").select("*, contractor:contractor_id(full_name), project:project_id(title)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      host.innerHTML = table(
        ["Project", "Contractor", "Amount", "Status", "Date"],
        data.map((b) => [escapeHtml(b.project?.title || "—"), escapeHtml(b.contractor?.full_name || "—"), formatCurrency(b.quotation_amount), statusBadge(b.status), formatDate(b.created_at)])
      );
    }

    if (tab === "reports") {
      const { data, error } = await sb.from("reported_content").select("*, reporter:reporter_id(full_name)").order("created_at", { ascending: false });
      if (error) throw error;
      if (!data.length) {
        host.innerHTML = `<div class="empty-state"><div class="icon">⚑</div>No reported content.</div>`;
        return;
      }
      host.innerHTML = table(
        ["Type", "Reporter", "Reason", "Status", "Date", ""],
        data.map((r) => [
          escapeHtml(r.content_type), escapeHtml(r.reporter?.full_name || "—"), escapeHtml(r.reason), statusBadge(r.status), formatDate(r.created_at),
          r.status === "Open" ? `<button class="btn btn-secondary btn-sm" data-dismiss-report="${r.id}">Dismiss</button>` : "",
        ])
      );
      host.querySelectorAll("[data-dismiss-report]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const { error } = await sb.from("reported_content").update({ status: "Dismissed" }).eq("id", btn.dataset.dismissReport);
            if (error) throw error;
            loadAdminTab("reports");
          } catch (err) { toast(friendlyError(err), "error"); }
        });
      });
    }
  } catch (err) {
    host.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty-state">No records.</div>`;
  return `<table class="data-table">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}
