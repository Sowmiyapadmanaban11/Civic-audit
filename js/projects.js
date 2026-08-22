// ============================================================
// CivicAudit — projects.js
// Handles: post-project.html (create), projects.html (browse)
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  if (document.getElementById("post-project-form")) {
    const profile = await renderShell({ activePage: "projects.html", eyebrowText: "Property Owner", titleText: "Post a Project" });
    if (!profile) return;
    if (profile.role !== "owner") {
      toast("Only property owners can post projects.", "error");
      window.location.href = "dashboard.html";
      return;
    }
    wirePostProjectForm(profile);
    wireEstimator();
  }

  if (document.getElementById("projects-grid")) {
    const profile = await renderShell({ activePage: "projects.html", eyebrowText: "Marketplace", titleText: "Browse Projects", showSearch: true });
    if (!profile) return;
    initProjectBrowser(profile);
  }
});

// ---------------- POST PROJECT ----------------
function wirePostProjectForm(profile) {
  const form = document.getElementById("post-project-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const title = form.title.value.trim();
    const projectType = form.project_type.value;
    const description = form.description.value.trim();
    const location = form.location.value.trim();
    const budgetMin = Number(form.budget_min.value);
    const budgetMax = Number(form.budget_max.value);
    const expectedDuration = form.expected_duration.value.trim();
    const startDate = form.start_date.value || null;
    const deadline = form.deadline.value || null;
    const requirements = form.requirements.value.trim();
    const files = form.documents.files;

    let hasError = false;
    if (title.length < 5) { setError(form.title, "Give your project a descriptive title."); hasError = true; }
    if (!projectType) { setError(form.project_type, "Select a project type."); hasError = true; }
    if (description.length < 20) { setError(form.description, "Add a bit more detail (20+ characters)."); hasError = true; }
    if (!location) { setError(form.location, "Enter the property location."); hasError = true; }
    if (!budgetMin || !budgetMax) { setError(form.budget_max, "Enter both a minimum and maximum budget."); hasError = true; }
    if (budgetMin && budgetMax && budgetMin > budgetMax) { setError(form.budget_max, "Maximum must be greater than minimum."); hasError = true; }
    if (hasError) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Posting…";

    try {
      const sb = getSupabase();
      const { data: project, error } = await sb
        .from("projects")
        .insert({
          owner_id: profile.id,
          title, description, project_type: projectType, location,
          budget_min: budgetMin, budget_max: budgetMax,
          expected_duration: expectedDuration || null,
          start_date: startDate, deadline, requirements: requirements || null,
        })
        .select()
        .single();
      if (error) throw error;

      if (files && files.length) {
        for (const file of Array.from(files)) {
          const path = `${profile.id}/${project.id}/${Date.now()}-${file.name}`;
          const { error: upErr } = await sb.storage.from("project-documents").upload(path, file);
          if (upErr) { console.error(upErr); continue; }
          await sb.from("project_documents").insert({
            project_id: project.id, uploaded_by: profile.id,
            file_name: file.name, file_url: path, file_type: file.type,
          });
        }
      }

      toast("Project posted successfully!", "success");
      setTimeout(() => (window.location.href = `project-details.html?id=${project.id}`), 900);
    } catch (err) {
      showFormAlert(form, friendlyError(err, "Could not post project. Please try again."));
    } finally {
      btn.disabled = false;
      btn.textContent = "Post Project";
    }
  });
}

function wireEstimator() {
  document.getElementById("run-estimate-btn").addEventListener("click", () => {
    const projectType = document.getElementById("project_type").value || "Other";
    const location = document.getElementById("location").value || "";
    const areaSqft = document.getElementById("est_area").value || 0;
    const materialQuality = document.getElementById("est_quality").value;
    const expectedDuration = document.getElementById("expected_duration").value;
    const months = parseInt(expectedDuration) || 0;

    if (!areaSqft || Number(areaSqft) <= 0) {
      toast("Enter an area in sqft to estimate cost.", "warning");
      return;
    }

    const { min, avg, max } = window.CivicAuditAI.estimateCost({
      projectType, areaSqft, location, materialQuality, expectedDurationMonths: months,
    });

    document.getElementById("est-min").textContent = formatCurrency(min);
    document.getElementById("est-avg").textContent = formatCurrency(avg);
    document.getElementById("est-max").textContent = formatCurrency(max);
    document.getElementById("estimate-result").classList.remove("hidden");

    // Offer to prefill the budget fields
    if (confirm(`Estimated range: ${formatCurrency(min)} – ${formatCurrency(max)}. Use this to fill the budget fields?`)) {
      document.getElementById("budget_min").value = min;
      document.getElementById("budget_max").value = max;
    }
  });
}

// ---------------- BROWSE PROJECTS ----------------
let allProjects = [];

async function initProjectBrowser(profile) {
  const sb = getSupabase();
  const grid = document.getElementById("projects-grid");
  grid.innerHTML = `<div class="loading-row" style="grid-column:1/-1;"><div class="spinner"></div> Loading projects…</div>`;

  try {
    const { data, error } = await sb
      .from("projects")
      .select("*, bids(count)")
      .eq("status", "Open")
      .order("created_at", { ascending: false });
    if (error) throw error;
    allProjects = data || [];
    renderProjectGrid(allProjects, profile);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${friendlyError(err)}</div>`;
  }

  document.getElementById("global-search")?.addEventListener("input", debounce(applyFilters, 250));
  document.getElementById("filter-type")?.addEventListener("change", applyFilters);
  document.getElementById("filter-budget")?.addEventListener("change", applyFilters);
  document.getElementById("filter-location")?.addEventListener("input", debounce(applyFilters, 250));

  function applyFilters() {
    const q = (document.getElementById("global-search")?.value || "").toLowerCase();
    const type = document.getElementById("filter-type")?.value;
    const budget = document.getElementById("filter-budget")?.value;
    const loc = (document.getElementById("filter-location")?.value || "").toLowerCase();

    let filtered = allProjects.filter((p) => {
      const matchesQ = !q || p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q) || p.project_type.toLowerCase().includes(q);
      const matchesType = !type || p.project_type === type;
      const matchesLoc = !loc || p.location.toLowerCase().includes(loc);
      let matchesBudget = true;
      if (budget === "under-10L") matchesBudget = p.budget_max < 1000000;
      if (budget === "10L-50L") matchesBudget = p.budget_max >= 1000000 && p.budget_max <= 5000000;
      if (budget === "above-50L") matchesBudget = p.budget_max > 5000000;
      return matchesQ && matchesType && matchesLoc && matchesBudget;
    });

    renderProjectGrid(filtered, profile);
  }
}

function renderProjectGrid(projects, profile) {
  const grid = document.getElementById("projects-grid");
  if (!projects.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">▤</div>No projects match your filters.</div>`;
    return;
  }

  let scored = null;
  if (profile.role === "professional") {
    scored = new Map(
      window.CivicAuditAI.recommendProjectsForProfessional(profile, projects).map((r) => [r.project.id, r.score])
    );
  }

  grid.innerHTML = projects
    .map((p) => {
      const score = scored ? scored.get(p.id) : null;
      return `
      <div class="project-card">
        <div class="pc-top">
          <div>
            <div class="pc-id">PRJ-${p.id.slice(0, 8).toUpperCase()}</div>
            <h4>${escapeHtml(p.title)}</h4>
            <div class="pc-loc">📍 ${escapeHtml(p.location)}</div>
          </div>
          ${score !== null ? `<span class="match-pill">${score}% Match</span>` : statusBadge(p.status)}
        </div>
        <div class="pc-meta">
          <span>${escapeHtml(p.project_type)}</span>
          <span>${escapeHtml(p.expected_duration || "Duration TBD")}</span>
        </div>
        <div class="pc-budget">${formatCurrency(p.budget_min)} – ${formatCurrency(p.budget_max)}</div>
        <div class="pc-foot">
          <span class="pc-bids">${p.bids?.[0]?.count || 0} bids · posted ${timeAgo(p.created_at)}</span>
          <a href="project-details.html?id=${p.id}" class="btn btn-primary btn-sm">View</a>
        </div>
      </div>`;
    })
    .join("");
}

// ---------------- shared small utils ----------------
function setError(input, msg) {
  const f = input.closest(".field");
  if (!f) return;
  f.classList.add("has-error");
  const e = f.querySelector(".field-error");
  if (e) e.textContent = msg;
}
function clearFormErrors(form) {
  form.querySelectorAll(".field").forEach((f) => f.classList.remove("has-error"));
  const a = form.querySelector(".form-alert");
  if (a) a.classList.remove("show", "error", "success");
}
function showFormAlert(form, msg) {
  let a = form.querySelector(".form-alert");
  if (!a) { a = document.createElement("div"); a.className = "form-alert"; form.prepend(a); }
  a.textContent = msg;
  a.classList.add("show", "error");
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
