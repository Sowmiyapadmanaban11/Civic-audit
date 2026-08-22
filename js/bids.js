// ============================================================
// CivicAudit — bids.js
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await renderShell({ activePage: "bids.html", eyebrowText: "Bidding", titleText: "Bids" });
  if (!profile) return;

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project");

  if (profile.role === "owner") {
    if (projectId) {
      await loadBidComparison(projectId, profile);
    } else {
      await loadOwnerProjectPicker(profile);
    }
  } else {
    await loadMyBids(profile);
  }
});

// ---------------- OWNER: pick a project ----------------
async function loadOwnerProjectPicker(profile) {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: projects, error } = await sb
      .from("projects")
      .select("*, bids(count)")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!projects.length) {
      body.innerHTML = `<div class="empty-state"><div class="icon">⇄</div>You haven't posted any projects yet. <a href="post-project.html" style="color:var(--accent)">Post one</a> to start receiving bids.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="section-card">
        <div class="section-card-head"><h3>Select a project to review its bids</h3></div>
        <div class="section-card-body table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Status</th><th>Bids</th><th></th></tr></thead>
            <tbody>
              ${projects.map(p => `
                <tr>
                  <td><strong>${escapeHtml(p.title)}</strong></td>
                  <td>${statusBadge(p.status)}</td>
                  <td>${p.bids?.[0]?.count || 0}</td>
                  <td><a href="bids.html?project=${p.id}" class="btn btn-secondary btn-sm">View Bids</a></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}

// ---------------- OWNER: bid comparison for one project ----------------
async function loadBidComparison(projectId, profile) {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: project, error: pErr } = await sb.from("projects").select("*").eq("id", projectId).single();
    if (pErr) throw pErr;
    if (project.owner_id !== profile.id) {
      body.innerHTML = `<div class="empty-state">You don't have access to this project's bids.</div>`;
      return;
    }

    const { data: bids, error: bErr } = await sb
      .from("bids")
      .select("*, profiles:contractor_id(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (bErr) throw bErr;

    const ranked = bids.length ? window.CivicAuditAI.rankBids(bids, project) : [];

    body.innerHTML = `
      <div class="section-card">
        <div class="section-card-head">
          <h3>${escapeHtml(project.title)} — ${bids.length} bid${bids.length === 1 ? "" : "s"}</h3>
          <a href="project-details.html?id=${projectId}" class="btn btn-ghost btn-sm">View Project</a>
        </div>
        <div class="section-card-body table-wrap">
          ${!bids.length ? `<div class="empty-state"><div class="icon">⇄</div>No bids received yet.</div>` : `
          <table class="data-table">
            <thead><tr><th>Professional</th><th>Rating</th><th>Quote</th><th>Duration</th><th>Match</th><th>Status</th><th></th></tr></thead>
            <tbody id="bids-tbody">
              ${ranked.map(b => renderBidRow(b, project)).join("")}
            </tbody>
          </table>`}
        </div>
      </div>

      <div class="section-card" id="proposal-panel-host"></div>
    `;

    document.querySelectorAll("[data-bid-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleBidAction(btn.dataset.bidAction, btn.dataset.bidId, project));
    });
    document.querySelectorAll("[data-view-proposal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = ranked.find((b) => b.id === btn.dataset.viewProposal);
        showProposalPanel(bid);
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}

function renderBidRow(b, project) {
  const pro = b.profiles || {};
  const rowClass = b.status === "Accepted" ? "is-accepted" : b.status === "Shortlisted" ? "is-shortlisted" : b.status === "Rejected" ? "is-rejected" : "";
  return `
    <tr class="bid-row ${rowClass}">
      <td>
        <div class="pro-mini">
          <img src="assets/images/avatar-placeholder.svg" alt="" />
          <div><div class="name">${escapeHtml(pro.full_name || "—")} ${pro.verification_status === "Verified" ? "✓" : ""}</div><div class="sub">${escapeHtml(pro.company_name || pro.professional_type || "")}</div></div>
        </div>
      </td>
      <td class="stars">${starString(pro.average_rating)}</td>
      <td class="cell-mono">${formatCurrency(b.quotation_amount)}</td>
      <td>${escapeHtml(b.estimated_duration)}</td>
      <td><span class="match-pill">${b.match_score}% Match</span></td>
      <td>${statusBadge(b.status)}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" data-view-proposal="${b.id}">View</button>
        ${b.status === "Pending" || b.status === "Shortlisted" ? `
          <button class="btn btn-secondary btn-sm" data-bid-action="shortlist" data-bid-id="${b.id}">Shortlist</button>
          <button class="btn btn-primary btn-sm" data-bid-action="accept" data-bid-id="${b.id}">Accept</button>
          <button class="btn btn-danger btn-sm" data-bid-action="reject" data-bid-id="${b.id}">Reject</button>` : ""}
        <a href="messages.html?to=${b.contractor_id}&project=${project.id}" class="btn btn-ghost btn-sm">Message</a>
      </td>
    </tr>`;
}

function showProposalPanel(bid) {
  const host = document.getElementById("proposal-panel-host");
  const pro = bid.profiles || {};
  host.innerHTML = `
    <div class="section-card-head"><h3>Proposal — ${escapeHtml(pro.full_name || "")}</h3></div>
    <div class="section-card-body">
      <p>${escapeHtml(bid.proposal)}</p>
      ${bid.additional_notes ? `<p class="text-muted mt-16"><strong>Notes:</strong> ${escapeHtml(bid.additional_notes)}</p>` : ""}
      <a href="profile.html?id=${bid.contractor_id}" class="btn btn-secondary btn-sm mt-16">View Full Profile</a>
    </div>`;
  host.scrollIntoView({ behavior: "smooth" });
}

async function handleBidAction(action, bidId, project) {
  const statusMap = { shortlist: "Shortlisted", accept: "Accepted", reject: "Rejected" };
  const newStatus = statusMap[action];
  if (action === "accept" && !confirm("Accept this bid? This will reject all other bids on this project and assign the professional.")) return;

  try {
    const sb = getSupabase();
    const { error } = await sb.from("bids").update({ status: newStatus }).eq("id", bidId);
    if (error) throw error;
    toast(`Bid ${newStatus.toLowerCase()}.`, "success");
    await loadBidComparison(project.id, await getCurrentProfile());
  } catch (err) {
    toast(friendlyError(err, "Could not update bid."), "error");
  }
}

// ---------------- PROFESSIONAL: my bids ----------------
async function loadMyBids(profile) {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: bids, error } = await sb
      .from("bids")
      .select("*, projects:project_id(title, location, status)")
      .eq("contractor_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!bids.length) {
      body.innerHTML = `<div class="empty-state"><div class="icon">⇄</div>You haven't submitted any bids yet. <a href="projects.html" style="color:var(--accent)">Browse open projects</a>.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="section-card">
        <div class="section-card-head"><h3>My Bids</h3></div>
        <div class="section-card-body table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Location</th><th>Quote</th><th>Duration</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              ${bids.map(b => `
                <tr>
                  <td><strong>${escapeHtml(b.projects?.title || "—")}</strong></td>
                  <td>${escapeHtml(b.projects?.location || "—")}</td>
                  <td class="cell-mono">${formatCurrency(b.quotation_amount)}</td>
                  <td>${escapeHtml(b.estimated_duration)}</td>
                  <td>${statusBadge(b.status)}</td>
                  <td>${formatDate(b.created_at)}</td>
                  <td><a href="project-details.html?id=${b.project_id}" class="btn btn-ghost btn-sm">View</a></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}
