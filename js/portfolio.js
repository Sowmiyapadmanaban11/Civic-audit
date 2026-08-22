// ============================================================
// CivicAudit — portfolio.js
// ============================================================

let portfolioProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
  portfolioProfile = await renderShell({ activePage: "portfolio.html", eyebrowText: "Showcase", titleText: "Portfolio" });
  if (!portfolioProfile) return;

  if (portfolioProfile.role !== "professional") {
    document.getElementById("add-portfolio-card").innerHTML = `<div class="section-card-body"><p class="text-muted">Portfolios are for construction professionals. Switch to a professional account to add one.</p></div>`;
    document.getElementById("portfolio-grid").innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Not applicable for property owners.</div>`;
    return;
  }

  wirePortfolioForm();
  await loadPortfolio();
});

function wirePortfolioForm() {
  const form = document.getElementById("portfolio-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("pf_title").value.trim();
    if (title.length < 3) { toast("Give the project a title.", "warning"); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      const sb = getSupabase();
      let imageUrl = null;
      const fileInput = document.getElementById("pf_image");
      if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const path = `${portfolioProfile.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await sb.storage.from("portfolio-images").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from("portfolio-images").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }

      const { error } = await sb.from("portfolios").insert({
        professional_id: portfolioProfile.id,
        title,
        description: document.getElementById("pf_description").value.trim() || null,
        project_type: document.getElementById("pf_type").value,
        project_value: Number(document.getElementById("pf_value").value) || null,
        completion_year: Number(document.getElementById("pf_year").value) || null,
        image_url: imageUrl,
      });
      if (error) throw error;

      toast("Added to portfolio.", "success");
      form.reset();
      await loadPortfolio();
    } catch (err) {
      toast(friendlyError(err, "Could not add portfolio item."), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Add to Portfolio";
    }
  });
}

async function loadPortfolio() {
  const sb = getSupabase();
  const grid = document.getElementById("portfolio-grid");
  try {
    const { data: items, error } = await sb
      .from("portfolios")
      .select("*")
      .eq("professional_id", portfolioProfile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!items.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">◆</div>No portfolio items yet — add your first above.</div>`;
      return;
    }

    grid.innerHTML = items
      .map(
        (p) => `
      <div class="portfolio-card">
        <div class="p-img">${p.image_url ? `<img src="${p.image_url}" alt="" />` : "🏗"}</div>
        <div class="p-body">
          <h5>${escapeHtml(p.title)}</h5>
          <p>${escapeHtml(p.project_type || "")} ${p.completion_year ? "· " + p.completion_year : ""}</p>
          ${p.project_value ? `<p class="cell-mono mt-8">${formatCurrency(p.project_value)}</p>` : ""}
          <button class="btn btn-danger btn-sm mt-8" data-delete-portfolio="${p.id}">Delete</button>
        </div>
      </div>`
      )
      .join("");

    grid.querySelectorAll("[data-delete-portfolio]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Remove this portfolio item?")) return;
        try {
          const sb2 = getSupabase();
          const { error } = await sb2.from("portfolios").delete().eq("id", btn.dataset.deletePortfolio);
          if (error) throw error;
          await loadPortfolio();
        } catch (err) {
          toast(friendlyError(err), "error");
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${friendlyError(err)}</div>`;
  }
}
