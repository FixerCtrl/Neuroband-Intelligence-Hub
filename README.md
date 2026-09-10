# Neuroband Intelligence Hub
## INL 380 Assignment 1: Data Collection & Intelligence Repository

A structured web application for collecting, organizing, and analyzing competitive intelligence data for the Neuroband case study.

---

## 🎯 What Is This?

This system supports all five phases of **INL 380 Assignment 1**:

1. **Phase 1:** Create a data collection plan
2. **Phase 2:** Collect real, credible sources
3. **Phase 3:** Design a structured repository to store your intelligence
4. **Phase 4:** Document your system
5. **Phase 5:** Present how your system works

The app provides:
- A centralized **Repository** to store all sources with full metadata
- **Analysis tools** to track what you've collected and identify gaps
- **Team collaboration** features to assign tasks and track progress
- **Automatic file naming** to ensure consistency
- **Activity logging** to show what work was done and when

---

## 📖 Getting Started

### 1. Read the Guides
- **[USER_INSTRUCTIONS.md](USER_INSTRUCTIONS.md)** — Complete guide for how to use every feature
- **[QUICK_START.md](QUICK_START.md)** — One-page printable reference

### 2. Initial Setup (Admin Only)
Edit `config.js` and add:
- Your Supabase project URL and API key
- Your group's Key Intelligence Topic (KIT)
- All Key Intelligence Needs (KINs) and Questions (KIQs) from Practical 1

### 3. Open the App
1. Save `config.js`
2. Open `index.html` in a web browser
3. Sign in with your group's email

---

## 🔑 Key Features

### Repository (Main Data Storage)
- Add sources with complete metadata
- Upload actual files (PDF, images, etc.)
- Auto-generated file naming follows convention
- Search & filter by KIN, KIQ, source type

### Analysis Dashboard
- **KIN Coverage:** See how many sources address each intelligence need
- **Source Mix:** Track diversity (academic, industry, news, etc.)
- **Question Coverage:** Identify which KIQs need more research
- **Task Progress:** Monitor team workload

### Team Collaboration
- Add team members and assign profiles
- Create tasks assigned to specific intelligence needs
- Comment on tasks for team discussion
- Track task status (To do → In progress → Done)

### Collection Plan
- Editable document to record your research strategy
- Outline sources, search keywords, inclusion/exclusion criteria
- Assign team responsibilities by KIN
- Part of your submission to the instructor

### Manual
- Auto-populated documentation for how to use the system
- Can be customized for your group's specific processes
- Part of your submission

### Activity Log
- Audit trail showing all entries, updates, and deletions
- Append-only (no edits or deletions of historical records)
- Proof of systematic work

---

## 📋 Metadata Required for Each Source

Every entry must include:

| Field | Description | Example |
|-------|-------------|---------|
| **KIN** | Intelligence need it addresses | KIN2 |
| **KIQ** | Specific intelligence question | KIQ1 |
| **Source** | Publication name | Business Insider Africa |
| **Author** | Author or organization | Whoop Inc. |
| **Date Published** | When published | 2024-03-12 |
| **Date Collected** | When your team found it | 2024-09-05 |
| **Type of Source** | Category | News article, Journal article, etc. |
| **Relevance to KIQ** | Why this source matters (1–2 sentences) | "Describes Neuroband's EEG capabilities vs. competitor offerings" |
| **File** | Actual document upload (PDF, image, etc.) | [PDF file] |

---

## 🚀 Workflow

### Week 1–2: Setup & Planning
1. Admin configures Supabase & adds KIT/KINs to config.js
2. Team writes Collection Plan (where to search, what to include/exclude)
3. Assign data collection tasks by KIN

### Week 2–4: Data Collection
1. Each team member searches assigned sources systematically
2. Add entries to Repository with full metadata
3. Upload actual source files
4. Check Analysis tab for coverage gaps

### Week 4–5: System Refinement & Documentation
1. Update Manual with your group's specific instructions
2. Verify all metadata is consistent and complete
3. Set system permissions for accessibility
4. Prepare for presentation

### Week 5: Presentation & Submission
1. Present how your system works (10 minutes, no notes)
2. Submit:
   - Link to live system (keep accessible for graders)
   - System Manual (PDF/Word)
   - Collection Plan (PDF/Word)

---

## 🛠️ Technology Stack

- **Frontend:** Vanilla JavaScript, HTML, CSS
- **Backend:** Supabase (PostgreSQL database + authentication)
- **File Storage:** Supabase Storage
- **Hosting:** Self-hosted or Supabase-hosted

---

## 📝 File Structure

```
Neuroband-Intelligence-Hub/
├── index.html              # Main app (open this in browser)
├── app.js                  # App logic (don't edit)
├── config.js               # Configuration (EDIT with your KIT/KINs)
├── style.css               # Styling
├── schema.sql              # Database setup (Supabase)
├── package.json            # Project metadata
├── README.md               # This file
├── USER_INSTRUCTIONS.md    # Complete user guide
├── QUICK_START.md          # One-page reference
└── config.example.js       # Example configuration
```

---

## ⚙️ Configuration

All configuration happens in **`config.js`**:

```javascript
// 1. Add your Supabase credentials
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";

// 2. Replace with your KIT and KINs
const KIT = "Your actual Key Intelligence Topic";
const KINS = [
  {
    id: "KIN1",
    label: "Your first intelligence need",
    kiqs: [
      { id: "KIQ1", label: "Your first intelligence question" },
      { id: "KIQ2", label: "Your second intelligence question" },
    ],
  },
  // Add more KINs as needed
];

// 3. Update admin emails
const ADMIN_EMAILS = ["admin1@email.com", "admin2@email.com"];
```

---

## 🔒 Security & Permissions

- **Authentication:** Via Supabase (email/password)
- **Authorization:** Admin-only access to sensitive operations
- **Activity Log:** All actions are logged and immutable
- **Sharing:** Set your Supabase project permissions before sharing link with graders

---

## 📞 Troubleshooting

### "Dropdowns are empty"
→ Admin must update `config.js` with KINs and refresh the page

### "I can't sign in"
→ Make sure Supabase credentials are correct in `config.js`

### "File upload failed"
→ Try PDF or image format, ensure file is under 10 MB

### "I can't edit the Collection Plan"
→ Click **Edit** first; only admins can save

See [USER_INSTRUCTIONS.md](USER_INSTRUCTIONS.md#troubleshooting) for more solutions.

---

## 📚 Assignment Rubric Summary

Your submission will be graded on:
- **Phase 1 (10 marks):** Data Collection Plan clarity and completeness
- **Phase 2 (30 marks):** Quality, relevance, and credibility of collected data
- **Phase 3 (25 marks):** Structured repository design and metadata completeness
- **Phase 4 (15 marks):** Clear, usable documentation of your system
- **Phase 5 (40 marks):** Presentation quality and understanding

---

## 📧 Submission

Email to: **smartintelci@gmail.com**

Include:
1. Link to your live system (ensure permissions allow grader access)
2. System Manual (PDF/Word)
3. Data Collection Plan (PDF/Word)
4. Subject line: "[Your Group Name] — INL 380 Assignment 1"

---

## 📖 For More Information

- **Full instructions:** See [USER_INSTRUCTIONS.md](USER_INSTRUCTIONS.md)
- **Quick reference:** See [QUICK_START.md](QUICK_START.md)
- **Assignment brief:** Refer to INL 380 course material
- **Supabase docs:** [supabase.com](https://supabase.com)

---

**Ready to get started?** 🚀

1. Read [QUICK_START.md](QUICK_START.md) (5 minutes)
2. Have an admin configure `config.js` and Supabase
3. Sign in and write your Collection Plan
4. Start collecting data!

Good luck with your assignment! 💡