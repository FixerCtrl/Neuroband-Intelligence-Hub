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

const SUPABASE_URL = "https://pqrwxsuumxrteehtkrnt.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_e7p5QOSrfHaPDH75YBE8xw_KGAakeGw";

// Your group's Key Intelligence Topic
const KIT = "How should Neuroband position its next wearable device against established competitors over the next 18 months?";

// Your group's Key Intelligence Needs, each broken into
// Key Intelligence Questions. Replace with your real Practical 1
// content. Keep "id" values short (e.g. KIN1, KIQ1) — they are
// used to build file names and tags throughout the system.
const KINS = [
  {
    id: "KIN1",
    label: "Competitor product strategy",
    kiqs: [
      { id: "KIQ1", label: "What features are competitors prioritising in their next product cycle?" },
      { id: "KIQ2", label: "How are competitors pricing comparable devices?" },
    ],
  },
  {
    id: "KIN2",
    label: "Market and consumer sentiment",
    kiqs: [
      { id: "KIQ1", label: "How do consumers perceive Neuroband relative to competitors?" },
      { id: "KIQ2", label: "What unmet needs are consumers expressing in reviews and forums?" },
    ],
  },
  {
    id: "KIN3",
    label: "Regulatory and industry environment",
    kiqs: [
      { id: "KIQ1", label: "What regulatory changes could affect wearable neurotech in target markets?" },
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