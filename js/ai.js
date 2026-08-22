// ============================================================
// CivicAudit — ai.js
//
// IMPORTANT: These are transparent, rule-based algorithms — not
// a trained ML model or an external AI API call. They are built
// with a clear input → scoring → output structure so they can be
// swapped for a real model or API later without touching callers.
// Every score is labeled "algorithmic estimate" in the UI.
//
// To connect a real AI API: replace the body of estimateCost()
// with a fetch() to your provider (e.g. Anthropic's API) and keep
// the same return shape: { min, avg, max }.
// ============================================================

window.CivicAuditAI = (function () {
  // ---------- 1. Construction Cost Estimator ----------
  // Base cost per sqft (INR) by project type & material quality tier.
  // These are illustrative placeholder rates, not verified market data.
  const BASE_RATE_PER_SQFT = {
    Construction: { Economy: 1500, Standard: 2200, Premium: 3400 },
    Renovation: { Economy: 900, Standard: 1400, Premium: 2200 },
    Demolition: { Economy: 150, Standard: 220, Premium: 320 },
    "Land Development": { Economy: 500, Standard: 800, Premium: 1300 },
    "Interior Design": { Economy: 700, Standard: 1200, Premium: 2500 },
    "Property Sale": { Economy: 0, Standard: 0, Premium: 0 },
    Other: { Economy: 1000, Standard: 1600, Premium: 2600 },
  };

  const LOCATION_MULTIPLIER = {
    metro: 1.25,
    tier2: 1.0,
    tier3: 0.85,
  };

  function classifyLocation(locationStr) {
    const metros = ["mumbai", "delhi", "bengaluru", "bangalore", "chennai", "hyderabad", "kolkata", "pune"];
    const l = (locationStr || "").toLowerCase();
    if (metros.some((m) => l.includes(m))) return "metro";
    return "tier2";
  }

  /**
   * estimateCost({ projectType, areaSqft, location, materialQuality, expectedDurationMonths })
   * → { min, avg, max } in INR
   */
  function estimateCost({ projectType, areaSqft, location, materialQuality, expectedDurationMonths }) {
    const rateTable = BASE_RATE_PER_SQFT[projectType] || BASE_RATE_PER_SQFT.Other;
    const baseRate = rateTable[materialQuality] || rateTable.Standard;
    const locMultiplier = LOCATION_MULTIPLIER[classifyLocation(location)];
    const area = Number(areaSqft) || 0;

    let avg = baseRate * area * locMultiplier;

    // Duration pressure: unusually short timelines cost more (rush premium)
    const months = Number(expectedDurationMonths) || 0;
    if (months > 0 && months < 2) avg *= 1.15;

    const min = Math.round(avg * 0.82);
    const max = Math.round(avg * 1.22);
    avg = Math.round(avg);

    return { min, avg, max };
  }

  // ---------- 2. Contractor Recommendation ----------
  /**
   * Scores a list of professional profiles against a project's needs.
   * Returns [{ professional, score }] sorted descending, score 0-100.
   */
  function recommendProfessionalsForProject(project, professionals) {
    return professionals
      .map((pro) => {
        let score = 0;

        // Professional type relevance (30 pts) — best-effort keyword match
        if (project.project_type === "Construction" && ["Contractor", "Construction Company", "Civil Engineer"].includes(pro.professional_type)) score += 30;
        else if (project.project_type === "Renovation" && ["Contractor", "Interior Designer", "Architect"].includes(pro.professional_type)) score += 30;
        else if (project.project_type === "Interior Design" && pro.professional_type === "Interior Designer") score += 30;
        else if (project.project_type === "Land Development" && ["Civil Engineer", "Architect"].includes(pro.professional_type)) score += 30;
        else if (project.project_type === "Demolition" && ["Contractor", "Construction Company"].includes(pro.professional_type)) score += 30;
        else score += 12;

        // Location match (20 pts)
        if (pro.location && project.location && pro.location.toLowerCase().includes(project.location.toLowerCase().split(",")[0])) {
          score += 20;
        }

        // Rating (25 pts)
        score += 25 * ((pro.average_rating || 0) / 5);

        // Completed projects, capped (15 pts)
        score += 15 * Math.min(1, (pro.completed_projects || 0) / 10);

        // Verification (10 pts)
        if (pro.verification_status === "Verified") score += 10;

        return { professional: pro, score: Math.round(Math.min(100, score)) };
      })
      .sort((a, b) => b.score - a.score);
  }

  /** Inverse: rank open projects for a given professional's dashboard. */
  function recommendProjectsForProfessional(professional, projects) {
    return projects
      .map((project) => {
        let score = 0;
        if (project.project_type === "Construction" && ["Contractor", "Construction Company", "Civil Engineer"].includes(professional.professional_type)) score += 35;
        else if (project.project_type === "Renovation" && ["Contractor", "Interior Designer", "Architect"].includes(professional.professional_type)) score += 35;
        else if (project.project_type === "Interior Design" && professional.professional_type === "Interior Designer") score += 35;
        else if (project.project_type === "Land Development" && ["Civil Engineer", "Architect"].includes(professional.professional_type)) score += 35;
        else score += 12;

        if (professional.location && project.location && project.location.toLowerCase().includes(professional.location.toLowerCase().split(",")[0])) {
          score += 25;
        }

        // Budget compatibility: does professional's typical portfolio value fall in range? (best-effort, 20 pts default mid)
        score += 20;

        score += 20 * Math.min(1, (professional.completed_projects || 0) / 10);

        return { project, score: Math.round(Math.min(100, score)) };
      })
      .sort((a, b) => b.score - a.score);
  }

  // ---------- 3. Intelligent Bid Ranking ----------
  /**
   * Ranks bids for a project using price, contractor rating,
   * experience, and estimated duration. Mirrors the SQL function
   * rank_bids_for_project() in supabase/functions.sql so the score
   * shown is consistent whether computed client- or server-side.
   */
  function rankBids(bids, project) {
    const quotes = bids.map((b) => Number(b.quotation_amount));
    const minQ = Math.min(...quotes);
    const maxQ = Math.max(...quotes);

    return bids
      .map((b) => {
        const pro = b.profiles || {};
        const priceScore =
          maxQ === minQ ? 40 : 40 * (1 - (Number(b.quotation_amount) - minQ) / (maxQ - minQ));
        const ratingScore = 30 * ((pro.average_rating || 0) / 5);
        const experienceScore = 20 * Math.min(1, (pro.completed_projects || 0) / 10);
        const verifiedScore = pro.verification_status === "Verified" ? 10 : 0;
        const score = Math.round(Math.min(100, priceScore + ratingScore + experienceScore + verifiedScore));
        return { ...b, match_score: score };
      })
      .sort((a, b) => b.match_score - a.match_score);
  }

  return {
    estimateCost,
    recommendProfessionalsForProject,
    recommendProjectsForProfessional,
    rankBids,
  };
})();
