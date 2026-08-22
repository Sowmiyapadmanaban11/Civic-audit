// ============================================================
// CivicAudit — project-details.js
// ============================================================

let currentProject = null;
let currentProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await renderShell({ activePage: "projects.html", eyebrowText: "Project", titleText: "Details" });
  if (!currentProfile) return;

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  if (!projectId) {
    document.getElementById("page-body").innerHTML = `<div class="empty-state">No project specified.</div>`;
    return;
  }

  await loadProject(projectId);
  wireModals();
});

async function loadProject(projectId) {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: project, error } = await sb
      .from("projects")
      .select("*, owner:owner_id(full_name, company_name, location, average_rating), assigned:assigned_professional_id(full_name, company_name)")
      .eq("id", projectId)
      .single();
    if (error) throw error;
    currentProject = project;

    const { count: bidCount } = await sb.from("bids").select("id", { count: "exact", head: true }).eq("project_id", projectId);

    const { data: docs } = await sb.from("project_documents").select("*").eq("project_id", projectId);

    const { data: updates } = await sb
      .from("project_updates")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    let myBid = null;
    if (currentProfile.role === "professional") {
      const { data } = await sb.from("bids").select("*").eq("project_id", projectId).eq("contractor_id", currentProfile.id).maybeSingle();
      myBid = data;
    }

    renderProjectDetails(project, bidCount || 0, docs || [], updates || [], myBid);
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err, "Could not load this project.")}</div>`;
  }
}

function renderProjectDetails(p, bidCount, docs, updates, myBid) {
  const isOwner = currentProfile.role === "owner" && p.owner_id === currentProfile.id;
  const isAssignedPro = currentProfile.role === "professional" && p.assigned_professional_id === currentProfile.id;
  const canBid = currentProfile.role === "professional" && p.status === "Open" && !myBid;

  const stageOrder = window.CIVICAUDIT_CONFIG.PROJECT_STAGES;
  const stageIndex = stageOrder.indexOf(p.current_stage);

  document.getElementById("page-body").innerHTML = `
    <div class="section-card">
      <div class="section-card-body">
        <div class="flex justify-between items-center">
          <div>
            <div class="pc-id">PRJ-${p.id.slice(0, 8).toUpperCase()}</div>
            <h1 style="font-size:24px; margin:8px 0;">${escapeHtml(p.title)}</h1>
            <div class="pc-loc">📍 ${escapeHtml(p.location)}</div>
          </div>
          ${statusBadge(p.status)}
        </div>

        <div class="pc-meta mt-16">
          <span>${escapeHtml(p.project_type)}</span>
          <span>${escapeHtml(p.expected_duration || "Duration TBD")}</span>
          <span>Posted ${timeAgo(p.created_at)}</span>
        </div>

        <p class="mt-16">${escapeHtml(p.description)}</p>

        ${p.requirements ? `<div class="mt-16"><strong>Requirements:</strong><p class="text-muted mt-8">${escapeHtml(p.requirements)}</p></div>` : ""}

        <div class="kpi-grid mt-24" style="grid-template-columns:repeat(4,1fr);">
          <div class="kpi-card"><div class="kpi-value cell-mono" style="font-size:18px;">${formatCurrency(p.budget_min)}</div><div class="kpi-label">Min Budget</div></div>
          <div class="kpi-card"><div class="kpi-value cell-mono" style="font-size:18px;">${formatCurrency(p.budget_max)}</div><div class="kpi-label">Max Budget</div></div>
          <div class="kpi-card"><div class="kpi-value">${bidCount}</div><div class="kpi-label">Bids Received</div></div>
          <div class="kpi-card"><div class="kpi-value">${formatDate(p.deadline)}</div><div class="kpi-label">Bid Deadline</div></div>
        </div>

        <div class="flex gap-12 mt-24" style="flex-wrap:wrap;">
          ${isOwner ? `<a href="bids.html?project=${p.id}" class="btn btn-primary btn-sm">View Bids (${bidCount})</a>` : ""}
          ${isOwner ? `<a href="schedule.html?project=${p.id}&pro=${p.assigned_professional_id || ""}" class="btn btn-secondary btn-sm">Schedule Site Visit</a>` : ""}
          ${canBid ? `<button class="btn btn-primary btn-sm" id="open-bid-modal">Submit a Bid</button>` : ""}
          ${myBid ? `<span class="badge badge-neutral">Your bid: ${myBid.status}</span>` : ""}
          ${isAssignedPro ? `<button class="btn btn-primary btn-sm" id="open-update-modal">Post Progress Update</button>` : ""}
          ${isAssignedPro ? `<a href="schedule.html?project=${p.id}&owner=${p.owner_id}" class="btn btn-secondary btn-sm">Schedule Site Visit</a>` : ""}
          ${!isOwner ? `<a href="messages.html?to=${isOwner ? p.assigned_professional_id || "" : p.owner_id}&project=${p.id}" class="btn btn-ghost btn-sm">Message Owner</a>` : ""}
        </div>
      </div>
    </div>

    ${p.status !== "Open" ? `
    <div class="section-card">
      <div class="section-card-head"><h3>Progress</h3></div>
      <div class="section-card-body">
        <div class="flex justify-between items-center mb-8"><strong>${p.progress_percentage || 0}% complete</strong><span class="text-muted">${escapeHtml(p.current_stage || "Planning")}</span></div>
        <div class="progress-track mt-8"><div class="progress-fill" style="width:${p.progress_percentage || 0}%"></div></div>
        <div class="flex gap-8 mt-16" style="flex-wrap:wrap;">
          ${stageOrder.map((s, i) => `<span class="badge ${i <= stageIndex ? "badge-verified" : "badge-neutral"}">${s}</span>`).join("")}
        </div>
        ${updates.length ? `
          <div class="mt-24">
            ${updates.map(u => `
              <div style="padding:12px 0; border-top:1px solid var(--border-soft);">
                <div class="flex justify-between"><strong>${escapeHtml(u.title)}</strong><span class="text-muted" style="font-size:12px;">${timeAgo(u.created_at)}</span></div>
                <p class="text-muted mt-8">${escapeHtml(u.description || "")}</p>
              </div>`).join("")}
          </div>` : `<p class="text-muted mt-16">No progress updates posted yet.</p>`}
      </div>
    </div>` : ""}

    <div class="section-card">
      <div class="section-card-head"><h3>Documents</h3></div>
      <div class="section-card-body">
        ${docs.length ? `<ul>${docs.map(d => `<li class="mt-8"><a href="#" class="doc-download" data-path="${escapeHtml(d.file_url)}">📎 ${escapeHtml(d.file_name)}</a></li>`).join("")}</ul>` : `<p class="text-muted">No documents uploaded.</p>`}
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-head"><h3>Posted by</h3></div>
      <div class="section-card-body pro-mini">
        <img src="assets/images/avatar-placeholder.svg" alt="" style="width:44px;height:44px;" />
        <div><div class="name">${escapeHtml(p.owner?.full_name || "—")}</div><div class="sub">${escapeHtml(p.owner?.location || "")}</div></div>
      </div>
    </div>
  `;

  document.getElementById("open-bid-modal")?.addEventListener("click", () => openModal("bid-modal"));
  document.getElementById("open-update-modal")?.addEventListener("click", () => openModal("update-modal"));

  document.querySelectorAll(".doc-download").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const sb = getSupabase();
      const { data, error } = await sb.storage.from("project-documents").createSignedUrl(a.dataset.path, 60);
      if (error) { toast(friendlyError(error, "Could not open document."), "error"); return; }
      window.open(data.signedUrl, "_blank");
    });
  });

  wireBidForm();
  wireUpdateForm();
}

function wireModals() {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".modal-overlay").classList.add("hidden"));
  });
  document.querySelectorAll(".modal-overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.add("hidden"); });
  });
}
function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

function wireBidForm() {
  const form = document.getElementById("bid-form");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "true";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number(form.quotation_amount.value);
    const duration = form.estimated_duration.value.trim();
    const proposal = form.proposal.value.trim();
    const notes = form.additional_notes.value.trim();

    if (!amount || !duration || proposal.length < 10) {
      toast("Fill in quotation, duration, and a proposal (10+ characters).", "warning");
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      const sb = getSupabase();
      const { error } = await sb.from("bids").insert({
        project_id: currentProject.id, contractor_id: currentProfile.id,
        quotation_amount: amount, estimated_duration: duration,
        proposal, additional_notes: notes || null,
      });
      if (error) throw error;
      toast("Bid submitted!", "success");
      closeModal("bid-modal");
      await loadProject(currentProject.id);
    } catch (err) {
      toast(friendlyError(err, "Could not submit bid."), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit Bid";
    }
  });
}

function wireUpdateForm() {
  const form = document.getElementById("update-form");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "true";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const description = form.description.value.trim();
    const stage = form.stage.value;
    const progress = Number(form.progress_percentage.value);

    if (!title || progress < 0 || progress > 100) {
      toast("Enter a title and a progress percentage between 0 and 100.", "warning");
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Posting…";
    try {
      const sb = getSupabase();
      const { error } = await sb.from("project_updates").insert({
        project_id: currentProject.id, professional_id: currentProfile.id,
        title, description: description || null, stage, progress_percentage: progress,
      });
      if (error) throw error;
      toast("Progress update posted.", "success");
      closeModal("update-modal");
      await loadProject(currentProject.id);
    } catch (err) {
      toast(friendlyError(err, "Could not post update."), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Post Update";
    }
  });
}
