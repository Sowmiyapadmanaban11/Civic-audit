// ============================================================
// CivicAudit — Central Configuration
// ============================================================
// Paste your Supabase project credentials below.
// Find them in: Supabase Dashboard → Project Settings → API
// ============================================================

const SUPABASE_URL = "https://wgwderoovtdpgejqwios.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_syhjPWmQB8Z7cD7Mctw0ZQ_Pv9jCtTt";

// Storage bucket names (must match supabase/schema.sql)
const BUCKETS = {
  PROFILE_IMAGES: "profile-images",
  PROJECT_DOCUMENTS: "project-documents",
  PORTFOLIO_IMAGES: "portfolio-images",
};

// Project type options (must match CHECK constraints in schema.sql)
const PROJECT_TYPES = [
  "Construction",
  "Renovation",
  "Demolition",
  "Land Development",
  "Interior Design",
  "Property Sale",
  "Other",
];

// Professional type options
const PROFESSIONAL_TYPES = [
  "Architect",
  "Civil Engineer",
  "Contractor",
  "Construction Company",
  "Interior Designer",
  "Other",
];

// Project status values
const PROJECT_STATUS = ["Open", "In Progress", "Completed", "Cancelled"];

// Bid status values
const BID_STATUS = ["Pending", "Shortlisted", "Accepted", "Rejected"];

// Project stages for progress tracking
const PROJECT_STAGES = [
  "Planning",
  "Site Preparation",
  "Foundation",
  "Construction",
  "Finishing",
  "Completed",
];

// Exposed globally since this app uses plain <script> tags (no bundler)
window.CIVICAUDIT_CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  BUCKETS,
  PROJECT_TYPES,
  PROFESSIONAL_TYPES,
  PROJECT_STATUS,
  BID_STATUS,
  PROJECT_STAGES,
};
