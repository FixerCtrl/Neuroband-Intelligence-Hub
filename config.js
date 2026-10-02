// ============================================================
// NEUROBAND INTELLIGENCE HUB — CONFIGURATION
// ============================================================
// This is the only file most of your group needs to edit.
// 1. Paste your Supabase project URL + anon key below (Supabase
//    dashboard → Project Settings → API).
// 2. Replace the KIT / KINS structure with your actual Key
//    Intelligence Topic, Needs, and Questions from Practical 1.
//    Every dropdown and filter in the app is generated from
//    this list, so keep the "id" fields short and consistent —
//    they're used in the file naming convention too.
// ============================================================

const SUPABASE_URL = "https://pqrwxsuumxrteehtkrnt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e7p5QOSrfHaPDH75YBE8xw_KGAakeGw";

// Your group's Key Intelligence Topic
const KIT = "Evaluating the market entry requirements";

// Your group's Key Intelligence Needs, each broken into
// Key Intelligence Questions. Replace with your real Practical 1
// content. Keep "id" values short (e.g. KIN1, KIQ1) — they are
// used to build file names and tags throughout the system.
const KINS = [
  {
    id: "KIN1",
    label: "Understand the legal, medical, and technological classification to be compliant with market entry requirements",
    kiqs: [
      { id: "KIQ1", label: "Upon entering the market, can the product be classified as a medical or technological device?" },
      { id: "KIQ2", label: "What are the legal and regulatory requirements to enter the technological and/or the medical market?" },
      { id: "KIQ3", label: "In terms of POPIA, how does Neuroband ensure that clients' information stays confidential and does not face the risk of being used for malicious reasons?" },
    ],
  },
  {
    id: "KIN2",
    label: "Position Neuroband ahead of its competitors, by ensuring that it has a stronger market position, effective distribution strategies, and opportunities to compete advantageously",
    kiqs: [
      { id: "KIQ1", label: "What features, pricing, and technologies do competitors offer?" },
      { id: "KIQ2", label: "What marketing and distribution strategies do competitors use to reach customers?" },
      { id: "KIQ3", label: "What opportunities or gaps in the market can Neuroband exploit that competitors are not addressing?" },
    ],
  },
  {
    id: "KIN3",
    label: "Understand different population groups and which demographics are more likely to engage with the product across age, sex, and social class",
    kiqs: [
      { id: "KIQ1", label: "What is the target market demographic? Are we appealing to the middle class or upper demographic?" },
      { id: "KIQ2", label: "How will different demographics perceive the product, and will they be ready for the product to be launched?" },
      { id: "KIQ3", label: "What factors influence customer purchasing decisions?" },
    ],
  },
];

// Source type options shown in the "Type of source" dropdown.
const SOURCE_TYPES = [
  "Journal article",
  "Industry report",
  "News article",
  "Company website",
  "Press release",
  "Financial filing",
  "Social media / forum",
  "Patent filing",
  "Other",
];

// Used to build suggested file names, e.g. NEUROBAND
const PROJECT_TAG = "NEUROBAND";

// Only the admin account(s) have elevated permissions.
// Everyone else is treated as a regular user.
const ADMIN_EMAILS = [
  "fixerctrl@gmail.com",
  "mlungisimash27@gmail.com",
];