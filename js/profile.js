// ============================================================
// CivicAudit — profile.js
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const me = await renderShell({ activePage: "profile.html", eyebrowText: "Account", titleText: "Profile" });
  if (!me) return;

  const params = new URLSearchParams(window.location.search);
  const viewId = params.get("id") || me.id;
  const isOwnProfile = viewId === me.id;

  await loadProfilePage(viewId, isOwnProfile, me);
});

async function loadProfilePage(viewId, isOwnProfile, me) {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: profile, error } = await sb.from("profiles").select("*").eq("id", viewId).single();
    if (error) throw error;

    let portfolio = [];
    let reviews = [];
    if (profile.role === "professional") {
      const { data: p } = await sb.from("portfolios").select("*").eq("professional_id", viewId).order("created_at", { ascending: false });
      portfolio = p || [];
      const { data: r } = await sb.from("reviews").select("*, reviewer:reviewer_id(full_name)").eq("professional_id", viewId).order("created_at", { ascending: false });
      reviews = r || [];
    }

    renderProfile(profile, portfolio, reviews, isOwnProfile);
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err, "Could not load this profile.")}</div>`;
  }
}

function renderProfile(profile, portfolio, reviews, isOwnProfile) {
  document.getElementById("page-body").innerHTML = `
    <div class="section-card">
      <div class="section-card-body">
        <div class="flex gap-12 items-center">
          <img src="${profile.profile_image || "assets/images/avatar-placeholder.svg"}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;background:var(--surface-hover);" alt="" id="profile-avatar-img" />
          <div style="flex:1;">
            <h2 style="font-size:20px;">${escapeHtml(profile.full_name)} ${profile.verification_status === "Verified" ? '<span class="badge badge-verified" style="margin-left:6px;">Verified</span>' : ""}</h2>
            <p class="text-muted">${escapeHtml(profile.professional_type || (profile.role === "owner" ? "Property Owner" : ""))} ${profile.company_name ? "· " + escapeHtml(profile.company_name) : ""}</p>
            <p class="text-muted" style="font-size:13px;">📍 ${escapeHtml(profile.location || "Location not set")}</p>
          </div>
          ${profile.role === "professional" ? `<div class="stars" style="font-size:16px;">${starString(profile.average_rating)} <span class="text-muted" style="font-size:12px;">(${profile.average_rating || 0})</span></div>` : ""}
        </div>
        ${profile.bio ? `<p class="mt-16">${escapeHtml(profile.bio)}</p>` : ""}
        ${profile.role === "professional" ? `
          <div class="kpi-grid mt-24" style="grid-template-columns:repeat(3,1fr);">
            <div class="kpi-card"><div class="kpi-value">${profile.completed_projects || 0}</div><div class="kpi-label">Completed Projects</div></div>
            <div class="kpi-card"><div class="kpi-value">${profile.experience_years || 0}</div><div class="kpi-label">Years Experience</div></div>
            <div class="kpi-card"><div class="kpi-value">${(profile.average_rating || 0).toFixed(1)}</div><div class="kpi-label">Average Rating</div></div>
          </div>` : ""}
        ${isOwnProfile ? `<button class="btn btn-secondary btn-sm mt-24" id="edit-profile-btn">Edit Profile</button>` : `<a href="messages.html?to=${profile.id}" class="btn btn-primary btn-sm mt-24">Message</a>`}
      </div>
    </div>

    <div id="edit-form-host"></div>

    ${profile.role === "professional" ? `
    <div class="section-card">
      <div class="section-card-head">
        <h3>Portfolio</h3>
        ${isOwnProfile ? `<a href="portfolio.html" class="btn btn-secondary btn-sm">Manage Portfolio</a>` : ""}
      </div>
      <div class="section-card-body">
        ${portfolio.length ? `<div class="portfolio-grid">${portfolio.slice(0, 6).map(p => `
          <div class="portfolio-card">
            <div class="p-img">${p.image_url ? `<img src="${p.image_url}" alt="" />` : "🏗"}</div>
            <div class="p-body"><h5>${escapeHtml(p.title)}</h5><p>${escapeHtml(p.project_type || "")} · ${p.completion_year || ""}</p></div>
          </div>`).join("")}</div>` : `<p class="text-muted">No portfolio items yet.</p>`}
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-head"><h3>Reviews</h3></div>
      <div class="section-card-body">
        ${reviews.length ? reviews.map(r => `
          <div style="padding:12px 0; border-top:1px solid var(--border-soft);">
            <div class="flex justify-between"><span class="stars">${starString(r.rating)}</span><span class="text-muted" style="font-size:12px;">${timeAgo(r.created_at)}</span></div>
            <p class="mt-8">${escapeHtml(r.review_text || "")}</p>
            <p class="text-muted" style="font-size:12px;">— ${escapeHtml(r.reviewer?.full_name || "Anonymous")}</p>
          </div>`).join("") : `<p class="text-muted">No reviews yet.</p>`}
      </div>
    </div>` : ""}
  `;

  if (isOwnProfile) {
    document.getElementById("edit-profile-btn").addEventListener("click", () => renderEditForm(profile));
  }
}

function renderEditForm(profile) {
  const host = document.getElementById("edit-form-host");
  host.innerHTML = `
    <div class="section-card">
      <div class="section-card-head"><h3>Edit Profile</h3></div>
      <div class="section-card-body">
        <form id="edit-profile-form" novalidate>
          <div class="form-alert"></div>
          <div class="field"><label for="ep_avatar">Profile photo</label><input type="file" id="ep_avatar" accept="image/*" /></div>
          <div class="field"><label for="ep_name">Full name</label><input type="text" id="ep_name" value="${escapeHtml(profile.full_name)}" required /></div>
          <div class="field"><label for="ep_phone">Phone</label><input type="tel" id="ep_phone" value="${escapeHtml(profile.phone || "")}" /></div>
          <div class="field"><label for="ep_location">Location</label><input type="text" id="ep_location" value="${escapeHtml(profile.location || "")}" /></div>
          ${profile.role === "professional" ? `
          <div class="field"><label for="ep_company">Company name</label><input type="text" id="ep_company" value="${escapeHtml(profile.company_name || "")}" /></div>
          <div class="field"><label for="ep_exp">Years of experience</label><input type="number" id="ep_exp" min="0" value="${profile.experience_years || 0}" /></div>` : ""}
          <div class="field"><label for="ep_bio">Bio</label><textarea id="ep_bio" rows="3">${escapeHtml(profile.bio || "")}</textarea></div>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </form>
      </div>
    </div>`;

  document.getElementById("edit-profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const sb = getSupabase();
      let profileImage = profile.profile_image;

      const fileInput = document.getElementById("ep_avatar");
      if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const path = `${profile.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await sb.storage.from("profile-images").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from("profile-images").getPublicUrl(path);
        profileImage = pub.publicUrl;
      }

      const updates = {
        full_name: document.getElementById("ep_name").value.trim(),
        phone: document.getElementById("ep_phone").value.trim() || null,
        location: document.getElementById("ep_location").value.trim() || null,
        bio: document.getElementById("ep_bio").value.trim() || null,
        profile_image: profileImage,
      };
      if (profile.role === "professional") {
        updates.company_name = document.getElementById("ep_company").value.trim() || null;
        updates.experience_years = Number(document.getElementById("ep_exp").value) || 0;
      }

      const { error } = await sb.from("profiles").update(updates).eq("id", profile.id);
      if (error) throw error;
      toast("Profile updated.", "success");
      window.location.reload();
    } catch (err) {
      toast(friendlyError(err, "Could not save changes."), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });
}
