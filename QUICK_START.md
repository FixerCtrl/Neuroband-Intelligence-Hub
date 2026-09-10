# Neuroband Intelligence Hub — Quick Start Guide
*Keep this handy while working on INL 380 Assignment 1*

---

## 🎯 Overview: What This System Does

You're using a **data collection and intelligence management system** to:
1. Plan your research systematically (Collection Plan)
2. Store all sources with full metadata (Repository)
3. Track team progress (Team & Activity tabs)
4. Analyze coverage and gaps (Analysis tab)
5. Document your system (Manual)

---

## 📋 First Time Setup (Admin Only)

### 1. Get Supabase Credentials
- Go to [supabase.com](https://supabase.com) → create a free project
- Copy **Project URL** and **Anon public key** from Settings → API
- Paste into `config.js`:
  ```javascript
  const SUPABASE_URL = "your-url";
  const SUPABASE_ANON_KEY = "your-key";
  ```

### 2. Add Your KIT, KINs, and KIQs
Replace example content in `config.js`:
```javascript
const KIT = "Your Key Intelligence Topic from Practical 1";
const KINS = [
  { id: "KIN1", label: "...", kiqs: [ ... ] },
  // Add all your KINs
];
```

### 3. Update Admin Emails
```javascript
const ADMIN_EMAILS = [ "your@email.com", "teammate@email.com" ];
```

---

## 🔑 Key Tabs & How to Use Them

| Tab | What to Do | When |
|-----|-----------|------|
| **Overview** | View your KIT & all KINs/KIQs | Anytime (read-only) |
| **Collection Plan** | Write/edit your research strategy | Phase 1 |
| **Repository** | Add & search sources | Phase 2–3 (main work) |
| **Analysis** | Check coverage & identify gaps | Throughout |
| **Team** | Assign tasks & track progress | Ongoing |
| **Activity** | View audit trail | Checking work done |
| **Manual** | Document your system | Phase 4 |

---

## 📚 Adding a Source (Repository Tab)

### Required Fields:
1. **KIN** — Which intelligence need? (dropdown)
2. **KIQ** — Which specific question? (dropdown)
3. **Source** — Publication name (e.g., "Business Insider")
4. **Author** — Who wrote it?
5. **Date Published** — When was it published?
6. **Type of Source** — Article? Report? News? (dropdown)
7. **Relevance to KIQ** — Why does this matter? (1–2 sentences)
8. **Upload File** — The actual source (PDF, image, etc.)

### ✅ Quality Check:
- [ ] Credible source?
- [ ] Relevant to a KIQ?
- [ ] File uploaded (NOT a link)?
- [ ] Relevance field clearly explains connection to KIQ?

---

## 🔍 Finding Existing Sources (Repository Tab)

### Search:
- Use the search bar to find by source name, author, or notes

### Filter:
- Select **KIN** to see only sources for that need
- Select **KIQ** to see sources for that question
- Select **Source Type** to see only (e.g.) journal articles
- **Combine filters** to narrow results (e.g., KIN2 + News article)

---

## 👥 Team Collaboration (Team Tab)

### Add a Team Member:
- Click **Add member** → Enter name → They claim their profile when they sign in

### Assign a Task:
- **New task** → Fill in title, KIN/KIQ, assign to member, set due date
- Team members update status: To do → In progress → Done

---

## 📊 Understanding Analysis Tab

| Chart | Meaning |
|-------|---------|
| **KIN Coverage** | How many sources per intelligence need? (Aim for balance) |
| **Source Mix** | Types of sources you've collected (should include academic + industry) |
| **Question Coverage** | How many sources address each KIQ? (Gaps show where to search more) |

---

## 📝 Collection Plan (Phase 1)

Your plan must include:
1. **Where you're collecting from** (academic databases, company websites, news, etc.)
2. **Search keywords & platforms** you're using
3. **Inclusion criteria** (what you WILL include)
4. **Exclusion criteria** (what you WON'T include and why)
5. **Team responsibilities** (who collects for which KIN)

**Key principle:** *Data collection must be systematic and guided by a plan.*

---

## 🗂️ File Naming Convention

System auto-generates names like:
```
NEUROBAND_KIN2_KIQ1_NewsArticle_20240312_BusinessInsiderAfrica.pdf
```

**Don't rename manually** — the system handles this.

---

## 🎬 Preparing Your Presentation

**Show (don't just describe):**
- Overview tab → Your KIT and all KINs/KIQs
- Collection Plan → Your systematic approach
- Analysis tab → Coverage statistics (prove you researched all KIQs)
- Repository → Search & filter demo (show how data is organized)
- Manual → Explain how someone new would use the system

**Important:** No notes or slides. Know your system cold.

---

## ❌ Common Mistakes to Avoid

- ❌ Random data collection (must follow your plan)
- ❌ Adding links instead of actual files
- ❌ Vague "Relevance" descriptions (be specific about which KIQ)
- ❌ Imbalanced sources (all news, no academic)
- ❌ Sources older than your inclusion criteria
- ❌ Team members not assigned tasks

---

## ✋ Need Help?

| Problem | Solution |
|---------|----------|
| Can't log in? | Use correct email; click **Sign up** if new. Check `config.js`. |
| Dropdowns empty? | Admin must update `config.js` with KINs. Refresh page. |
| File won't upload? | Use PDF, PNG, JPG, or Word. Under 10 MB. |
| Can't edit plan? | Click **Edit** button. Only admins can save. |

---

## 📦 Final Checklist

Before submission:
- [ ] Collection Plan finalized & in system
- [ ] At least one source per KIQ in Repository
- [ ] All metadata complete (Source, Author, Date, Type, Relevance)
- [ ] All files uploaded (not links)
- [ ] Analysis tab shows balanced coverage
- [ ] Both academic AND industry sources included
- [ ] Team all added & roles clear
- [ ] Manual filled out with your system's details
- [ ] System link shared & accessible

---

## 📧 What to Submit

Email to: **smartintelci@gmail.com**

1. Link to your live system (keep it accessible!)
2. System Manual (PDF/Word export)
3. Data Collection Plan (PDF/Word export)
4. Subject: "[Your Group Name] — INL 380 Assignment 1 Submission"

---

**Ready? Start by logging in and creating your Collection Plan.** ✨
