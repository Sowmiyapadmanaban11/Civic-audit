// ============================================================
// CivicAudit — dashboard.js
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await renderShell({
    activePage: "dashboard.html",
    eyebrowText: "Overview",
    titleText: "Dashboard",
  });
  if (!profile) return;

  if (profile.role === "owner") {
    document.getElementById("owner-view").classList.remove("hidden");
    await loadOwnerDashboard(profile);
  } else {
    document.getElementById("pro-view").classList.remove("hidden");
    await loadProDashboard(profile);
  }
});

// ---------------- OWNER ----------------
async function loadOwnerDashboard(profile) {
  const sb = getSupabase();
  try {
    const { data: projects, error } = await sb
      .from("projects")
      .select("*, bids(count)")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const total = projects.length;
    const active = projects.filter((p) => p.status === "Open" || p.status === "In Progress").length;
    const completed = projects.filter((p) => p.status === "Completed").length;
    const bidsReceived = projects.reduce((sum, p) => sum + (p.bids?.[0]?.count || 0), 0);

    renderKpis([
      { icon: "▤", color: "info", value: total, label: "Total Projects" },
      { icon: "⚡", color: "warning", value: active, label: "Active Projects" },
      { icon: "⇄", color: "accent", value: bidsReceived, label: "Bids Received" },
      { icon: "✓", color: "verified", value: completed, label: "Projects Completed" },
    ]);

    const tbody = document.getElementById("owner-projects-body");
    if (!projects.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">▤</div>No projects yet. <a href="post-project.html" style="color:var(--accent)">Post your first project</a>.</div></td></tr>`;
    } else {
      tbody.innerHTML = projects
        .map(
          (p) => `
        <tr>
          <td><strong>${escapeHtml(p.title)}</strong></td>
          <td>${escapeHtml(p.project_type)}</td>
          <td>${escapeHtml(p.location)}</td>
          <td class="cell-mono">${formatCurrency(p.budget_min)} – ${formatCurrency(p.budget_max)}</td>
          <td>${p.bids?.[0]?.count || 0}</td>
          <td>${statusBadge(p.status)}</td>
          <td>${formatDate(p.created_at)}</td>
          <td class="row-actions">
            <a href="project-details.html?id=${p.id}" class="btn btn-ghost btn-sm">View</a>
            <a href="bids.html?project=${p.id}" class="btn btn-secondary btn-sm">Bids</a>
          </td>
        </tr>`
        )
        .join("");
    }

    // Recent bids across all of this owner's projects
    const { data: bids, error: bidErr } = await sb
      .from("bids")
      .select("*, profiles:contractor_id(full_name, company_name, average_rating), projects:project_id(title, owner_id)")
      .in("project_id", projects.map((p) => p.id))
      .order("created_at", { ascending: false })
      .limit(6);
    if (bidErr) throw bidErr;
    renderRecentBids(bids);
  } catch (err) {
    toast(friendlyError(err), "error");
  }
}

function renderRecentBids(bids) {
  const host = document.getElementById("owner-recent-bids");
  if (!bids?.length) {
    host.innerHTML = `<div class="empty-state"><div class="icon">⇄</div>No bids yet.</div>`;
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Professional</th><th>Project</th><th>Rating</th><th>Amount</th><th>Duration</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${bids
        .map(
          (b) => `
        <tr>
          <td>
            <div class="pro-mini">
              <img src="assets/images/avatar-placeholder.svg" alt="" />
              <div><div class="name">${escapeHtml(b.profiles?.full_name || "—")}</div><div class="sub">${escapeHtml(b.profiles?.company_name || "")}</div></div>
            </div>
          </td>
          <td>${escapeHtml(b.projects?.title || "—")}</td>
          <td class="stars">${starString(b.profiles?.average_rating)}</td>
          <td class="cell-mono">${formatCurrency(b.quotation_amount)}</td>
          <td>${escapeHtml(b.estimated_duration)}</td>
          <td>${statusBadge(b.status)}</td>
          <td><a href="bids.html?project=${b.project_id}" class="btn btn-ghost btn-sm">Review</a></td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table></div>`;
}

// ---------------- PROFESSIONAL ----------------
async function loadProDashboard(profile) {
  const sb = getSupabase();
  try {
    const { data: myBids, error } = await sb
      .from("bids")
      .select("*, projects:project_id(title, status)")
      .eq("contractor_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const submitted = myBids.length;
    const accepted = myBids.filter((b) => b.status === "Accepted").length;
    const completed = myBids.filter((b) => b.projects?.status === "Completed").length;
    const totalValue = myBids
      .filter((b) => b.status === "Accepted")
      .reduce((sum, b) => sum + Number(b.quotation_amount || 0), 0);

    const { count: availableCount } = await sb
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("status", "Open");

    renderKpis([
      { icon: "▤", color: "info", value: availableCount || 0, label: "Available Projects" },
      { icon: "⇄", color: "accent", value: submitted, label: "Submitted Bids" },
      { icon: "✓", color: "verified", value: accepted, label: "Accepted Projects" },
      { icon: "★", color: "warning", value: (profile.average_rating || 0).toFixed(1), label: "Average Rating" },
    ]);

    const tbody = document.getElementById("pro-bids-body");
    if (!myBids.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">⇄</div>You haven't submitted any bids yet. <a href="projects.html" style="color:var(--accent)">Browse open projects</a>.</div></td></tr>`;
    } else {
      tbody.innerHTML = myBids
        .map(
          (b) => `
        <tr>
          <td><strong>${escapeHtml(b.projects?.title || "—")}</strong></td>
          <td class="cell-mono">${formatCurrency(b.quotation_amount)}</td>
          <td>${escapeHtml(b.estimated_duration)}</td>
          <td>${statusBadge(b.status)}</td>
          <td>${formatDate(b.created_at)}</td>
        </tr>`
        )
        .join("");
    }

    // Recommended projects, using ai.js recommendation scoring
    const { data: openProjects, error: opErr } = await sb
      .from("projects")
      .select("*, bids(count)")
      .eq("status", "Open")
      .limit(20);
    if (opErr) throw opErr;

    const ranked = window.CivicAuditAI.recommendProjectsForProfessional(profile, openProjects).slice(0, 6);
    renderRecommendedProjects(ranked);
  } catch (err) {
    toast(friendlyError(err), "error");
  }
}

function renderRecommendedProjects(ranked) {
  const host = document.getElementById("recommended-projects");
  if (!ranked.length) {
    host.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">▤</div>No open projects match your profile right now.</div>`;
    return;
  }
  host.innerHTML = ranked
    .map(
      ({ project: p, score }) => `
    <div class="project-card">
      <div class="pc-top">
        <div>
          <div class="pc-id">PRJ-${p.id.slice(0, 8).toUpperCase()}</div>
          <h4>${escapeHtml(p.title)}</h4>
          <div class="pc-loc">📍 ${escapeHtml(p.location)}</div>
        </div>
        <span class="match-pill">${score}% Match</span>
      </div>
      <div class="pc-meta">
        <span>${escapeHtml(p.project_type)}</span>
        <span>${escapeHtml(p.expected_duration || "—")}</span>
      </div>
      <div class="pc-budget">${formatCurrency(p.budget_min)} – ${formatCurrency(p.budget_max)}</div>
      <div class="pc-foot">
        <span class="pc-bids">${p.bids?.[0]?.count || 0} bids so far</span>
        <a href="project-details.html?id=${p.id}" class="btn btn-primary btn-sm">View Project</a>
      </div>
    </div>`
    )
    .join("");
}

// ---------------- shared render helpers ----------------
function renderKpis(items) {
  const host = document.getElementById("kpi-grid");
  const colorVars = { info: "var(--info)", warning: "var(--warning)", accent: "var(--accent)", verified: "var(--verified)" };
  const bgVars = { info: "var(--info-soft)", warning: "var(--warning-soft)", accent: "var(--accent-soft)", verified: "var(--verified-soft)" };
  host.innerHTML = items
    .map(
      (k) => `
    <div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon" style="background:${bgVars[k.color]};color:${colorVars[k.color]}">${k.icon}</div>
      </div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
    </div>`
    )
    .join("");
}


