// ============================================================
// CivicAudit — reviews.js
// ============================================================

let reviewsProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
  reviewsProfile = await renderShell({ activePage: "reviews.html", eyebrowText: "Feedback", titleText: "Reviews" });
  if (!reviewsProfile) return;

  if (reviewsProfile.role === "owner") {
    await loadOwnerReviewFlow();
  } else {
    await loadProfessionalReviews();
  }
});

// ---------------- OWNER: rate completed projects ----------------
async function loadOwnerReviewFlow() {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: projects, error } = await sb
      .from("projects")
      .select("*, assigned:assigned_professional_id(full_name, company_name), reviews(id)")
      .eq("owner_id", reviewsProfile.id)
      .eq("status", "Completed")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const pending = projects.filter((p) => p.assigned_professional_id && !p.reviews.length);
    const reviewed = projects.filter((p) => p.reviews.length);

    body.innerHTML = `
      <div class="section-card">
        <div class="section-card-head"><h3>Rate Completed Projects</h3></div>
        <div class="section-card-body">
          ${!pending.length ? `<p class="text-muted">No completed projects waiting for a review.</p>` :
            pending.map(p => `
              <div style="padding:16px 0; border-top:1px solid var(--border-soft);">
                <div class="flex justify-between items-center">
                  <div><strong>${escapeHtml(p.title)}</strong><div class="text-muted" style="font-size:13px;">${escapeHtml(p.assigned?.full_name || "")}</div></div>
                  <button class="btn btn-primary btn-sm" data-review-project="${p.id}" data-review-pro="${p.assigned_professional_id}">Leave Review</button>
                </div>
                <div class="review-form-host hidden" id="review-form-${p.id}"></div>
              </div>`).join("")}
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head"><h3>Reviews You've Left</h3></div>
        <div class="section-card-body">
          ${!reviewed.length ? `<p class="text-muted">No reviews submitted yet.</p>` : reviewed.map(p => `<div style="padding:10px 0; border-top:1px solid var(--border-soft);">${escapeHtml(p.title)} — reviewed</div>`).join("")}
        </div>
      </div>`;

    document.querySelectorAll("[data-review-project]").forEach((btn) => {
      btn.addEventListener("click", () => showReviewForm(btn.dataset.reviewProject, btn.dataset.reviewPro));
    });
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}

function showReviewForm(projectId, professionalId) {
  const host = document.getElementById(`review-form-${projectId}`);
  host.classList.remove("hidden");
  host.innerHTML = `
    <form class="mt-16" data-submit-review="${projectId}">
      <div class="field">
        <label>Rating</label>
        <select name="rating" required>
          <option value="5">★★★★★ Excellent</option>
          <option value="4">★★★★☆ Good</option>
          <option value="3">★★★☆☆ Average</option>
          <option value="2">★★☆☆☆ Below Average</option>
          <option value="1">★☆☆☆☆ Poor</option>
        </select>
      </div>
      <div class="field"><label>Review</label><textarea name="review_text" rows="3" placeholder="Share your experience working with this professional."></textarea></div>
      <button type="submit" class="btn btn-primary btn-sm">Submit Review</button>
    </form>`;

  host.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rating = Number(e.target.rating.value);
    const reviewText = e.target.review_text.value.trim();
    try {
      const sb = getSupabase();
      const { error } = await sb.from("reviews").insert({
        project_id: projectId, reviewer_id: reviewsProfile.id,
        professional_id: professionalId, rating, review_text: reviewText || null,
      });
      if (error) throw error;
      toast("Review submitted. Thank you!", "success");
      await loadOwnerReviewFlow();
    } catch (err) {
      toast(friendlyError(err, "Could not submit review."), "error");
    }
  });
}

// ---------------- PROFESSIONAL: view received reviews ----------------
async function loadProfessionalReviews() {
  const sb = getSupabase();
  const body = document.getElementById("page-body");
  try {
    const { data: reviews, error } = await sb
      .from("reviews")
      .select("*, reviewer:reviewer_id(full_name), project:project_id(title)")
      .eq("professional_id", reviewsProfile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    body.innerHTML = `
      <div class="section-card">
        <div class="section-card-head">
          <h3>Reviews Received</h3>
          <div class="stars">${starString(reviewsProfile.average_rating)} <span class="text-muted" style="font-size:12px;">(${(reviewsProfile.average_rating || 0).toFixed(1)} average)</span></div>
        </div>
        <div class="section-card-body">
          ${!reviews.length ? `<div class="empty-state"><div class="icon">★</div>No reviews yet. Complete a project to receive your first review.</div>` :
            reviews.map(r => `
              <div style="padding:14px 0; border-top:1px solid var(--border-soft);">
                <div class="flex justify-between"><span class="stars">${starString(r.rating)}</span><span class="text-muted" style="font-size:12px;">${timeAgo(r.created_at)}</span></div>
                <p class="mt-8">${escapeHtml(r.review_text || "")}</p>
                <p class="text-muted" style="font-size:12px;">${escapeHtml(r.project?.title || "")} — ${escapeHtml(r.reviewer?.full_name || "Anonymous")}</p>
              </div>`).join("")}
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}
