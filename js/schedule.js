// ============================================================
// CivicAudit — schedule.js
// ============================================================

let scheduleProfile = null;
let scheduleProjectId = null;
let scheduleOtherPartyId = null;

document.addEventListener("DOMContentLoaded", async () => {
  scheduleProfile = await renderShell({ activePage: "schedule.html", eyebrowText: "Coordination", titleText: "Site Visits" });
  if (!scheduleProfile) return;

  const params = new URLSearchParams(window.location.search);
  scheduleProjectId = params.get("project");
  scheduleOtherPartyId = params.get("owner") || params.get("pro");

  if (!scheduleProjectId || !scheduleOtherPartyId) {
    document.getElementById("new-visit-card").innerHTML = `
      <div class="section-card-body"><p class="text-muted">Open a project's page and use "Schedule Site Visit" to book a new visit. Below are all your existing visits.</p></div>`;
  }

  wireVisitForm();
  await loadVisits();
});

function wireVisitForm() {
  const form = document.getElementById("visit-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!scheduleProjectId || !scheduleOtherPartyId) {
      toast("Open this from a specific project to schedule a visit.", "warning");
      return;
    }
    const date = form.scheduled_date.value;
    const time = form.scheduled_time.value;
    const location = form.location.value.trim();
    const notes = form.notes.value.trim();
    if (!date || !time || !location) {
      toast("Fill in date, time and location.", "warning");
      return;
    }

    const isOwner = scheduleProfile.role === "owner";
    const payload = {
      project_id: scheduleProjectId,
      owner_id: isOwner ? scheduleProfile.id : scheduleOtherPartyId,
      professional_id: isOwner ? scheduleOtherPartyId : scheduleProfile.id,
      scheduled_date: date, scheduled_time: time, location, notes: notes || null,
    };

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Scheduling…";
    try {
      const sb = getSupabase();
      const { error } = await sb.from("site_visits").insert(payload);
      if (error) throw error;
      toast("Site visit scheduled.", "success");
      form.reset();
      await loadVisits();
    } catch (err) {
      toast(friendlyError(err, "Could not schedule visit."), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Schedule Visit";
    }
  });
}

async function loadVisits() {
  const sb = getSupabase();
  const tbody = document.getElementById("visits-body");
  try {
    const { data: visits, error } = await sb
      .from("site_visits")
      .select("*, owner:owner_id(full_name), professional:professional_id(full_name)")
      .or(`owner_id.eq.${scheduleProfile.id},professional_id.eq.${scheduleProfile.id}`)
      .order("scheduled_date", { ascending: true });
    if (error) throw error;

    if (!visits.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🗓</div>No site visits scheduled yet.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = visits
      .map((v) => {
        const isOwnerRow = scheduleProfile.role === "owner";
        const withName = isOwnerRow ? v.professional?.full_name : v.owner?.full_name;
        return `
        <tr>
          <td>${formatDate(v.scheduled_date)}</td>
          <td>${escapeHtml(v.scheduled_time)}</td>
          <td>${escapeHtml(v.location)}</td>
          <td>${escapeHtml(withName || "—")}</td>
          <td>${statusBadge(v.status)}</td>
          <td class="row-actions">
            ${v.status === "Pending" ? `
              <button class="btn btn-secondary btn-sm" data-visit-action="Accepted" data-visit-id="${v.id}">Accept</button>
              <button class="btn btn-danger btn-sm" data-visit-action="Rejected" data-visit-id="${v.id}">Reject</button>` : ""}
          </td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("[data-visit-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const sb = getSupabase();
          const { error } = await sb.from("site_visits").update({ status: btn.dataset.visitAction }).eq("id", btn.dataset.visitId);
          if (error) throw error;
          toast(`Visit ${btn.dataset.visitAction.toLowerCase()}.`, "success");
          await loadVisits();
        } catch (err) {
          toast(friendlyError(err), "error");
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">${friendlyError(err)}</div></td></tr>`;
  }
}
