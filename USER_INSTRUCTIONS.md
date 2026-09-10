# Neuroband Intelligence Hub — User Instructions
## INL 380 Assignment 1: Data Collection & Intelligence Repository Design

---

## Table of Contents
1. [Getting Started](#getting-started)
2. [Phase 1: Setting Up Your System](#phase-1-setting-up-your-system)
3. [Phase 2: Collection Plan](#phase-2-collection-plan)
4. [Phase 3: Adding Data to the Repository](#phase-3-adding-data-to-the-repository)
5. [Phase 4: Team Collaboration](#phase-4-team-collaboration)
6. [My Work Dashboard](#my-work-dashboard)
7. [Phase 5: Retrieving & Analyzing Your Data](#phase-5-retrieving--analyzing-your-data)
8. [Preparing for Your Presentation](#preparing-for-your-presentation)
9. [Troubleshooting](#troubleshooting)

---

## Getting Started

### 1. **Access the App**
- The Neuroband Intelligence Hub is a web-based application. Open `index.html` in your web browser.
- Bookmark this page for easy access throughout the assignment.

### 2. **Sign In**
- Click **Sign in** in the bottom-left corner of the sidebar.
- Use your group's shared email address to create an account or log in.
- **Note:** Only users listed as "admins" in the system can modify the KIT/KINs and critical configurations. Other team members will have read and submit access.

### 3. **Understand the Navigation**
The app is organized into six main sections:

| Tab | Purpose |
|-----|---------|
| **Overview** | Displays your KIT and all KINs with their KIQs (from Practical 1) |
| **Analysis** | Live statistics on data collection progress (coverage by KIN, source mix, question coverage) |
| **Collection Plan** | Editable document where you outline your data collection strategy |
| **Repository** | Central database storing all collected sources with metadata |
| **Team** | Assign tasks, track team member workload, and collaborate |
| **Activity** | Audit trail showing all changes and submissions |
| **Manual** | System documentation (auto-populated with defaults) |

---

## Phase 1: Setting Up Your System

### Step 1: Configure Your Project (Admin Only)

An admin team member must:

1. Open the browser's **Developer Tools** (F12 or Ctrl+Shift+I).
2. Navigate to **Console**.
3. Find these lines in `config.js` and update them:

```javascript
const SUPABASE_URL = "your-supabase-url";
const SUPABASE_ANON_KEY = "your-anon-key";
```

**How to get these values:**
- Go to [supabase.com](https://supabase.com) and create a free project.
- In your Supabase project dashboard:
  - Click **Project Settings** → **API**.
  - Copy your **Project URL** and **Anon public key**.
  - Paste these into the app's `config.js` file.

### Step 2: Add Your KIT and KINs (Admin Only)

Still in `config.js`, replace the example content with your group's actual Key Intelligence Topic, Needs, and Questions from Practical 1 and 3:

```javascript
const KIT = "Your actual KIT statement here";

const KINS = [
  {
    id: "KIN1",
    label: "Your first intelligence need",
    kiqs: [
      { id: "KIQ1", label: "Your first intelligence question under KIN1" },
      { id: "KIQ2", label: "Your second intelligence question under KIN1" },
    ],
  },
  {
    id: "KIN2",
    label: "Your second intelligence need",
    kiqs: [
      { id: "KIQ1", label: "Your first intelligence question under KIN2" },
    ],
  },
  // Add more KINs as needed
];
```

**Important:** Keep the `id` fields short (e.g., KIN1, KIQ1) — they're used in file naming conventions throughout the system.

### Step 3: Customize Source Types (Optional)

In `config.js`, you can adjust the source type options shown in dropdowns:

```javascript
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
```

These reflect the assignment requirement to include **academic sources** and **industry/market sources**.

### Step 4: Add Admin Emails (Admin Only)

Update the `ADMIN_EMAILS` array with your group's admin account(s):

```javascript
const ADMIN_EMAILS = [
  "admin1@university.edu",
  "admin2@university.edu",
];
```

---

## Phase 2: Collection Plan

### Why This Matters
Your Collection Plan is the **roadmap** for systematic data collection. The assignment emphasizes: **"Data collection must be systematic and guided by a plan."** Random collection will be penalised.

### Creating Your Collection Plan

1. **Navigate to Collection Plan tab** (left sidebar).
2. Click **Edit** (if not already in edit mode).
3. Replace the default template with your group's actual plan. Include:

#### **Required Sections:**

**1. SOURCES**
- [ ] Academic databases (Google Scholar, university library databases, etc.) — *for what context?*
- [ ] Industry & market sources (analyst reports, company newsrooms, trade press) — *for what insights?*
- [ ] News & business media — *for what types of stories?*

**2. SEARCH STRATEGY**
```
Keywords / phrases your team will search:
- Example: "Neuroband", "wearable EEG", "competitor pricing", "neurotech regulations"

Databases / platforms:
- Google Scholar
- Statista
- Company websites (Neuroband, Apple, Meta, etc.)
- LinkedIn, Twitter/X, Reddit
- Industry newsletters (e.g., Wearable Today, MobiHealthNews)
- Your university's library databases
```

**3. INCLUSION CRITERIA**
- Published within the last [X] years
- Directly addresses one or more of your KIQs
- From credible, identifiable sources
- [Any other criteria specific to your KIT]

**4. EXCLUSION CRITERIA**
- Opinion pieces with no sourcing or data
- Content older than [X] years (unless historically relevant)
- Duplicate coverage of the same story
- Irrelevant or tangential content

**5. RESPONSIBILITIES (Recommended)**
Assign each team member ownership of one or more KINs:
```
Alice — KIN1 (Competitor product strategy) sources
Bob — KIN2 (Market sentiment) sources
Carol — KIN3 (Regulatory environment) sources
```

### Updating Your Plan
- If your plan evolves during collection, update this document to reflect how data was *actually* collected.
- You may submit the final version, not the original draft.

---

## Phase 3: Adding Data to the Repository

### Understanding the Repository
The **Repository tab** is your central database. Each entry represents one source (journal article, news piece, report, etc.). The system ensures all metadata is consistent and all data is retrievable.

### Adding a New Entry

1. **Go to Repository tab** → Click **Add entry**.
2. Fill in all required fields:

| Field | What to Record | Example |
|-------|----------------|---------|
| **KIN** | Which Key Intelligence Need does this source address? | KIN2 |
| **KIQ** | Which specific Key Intelligence Question? | KIQ1 |
| **Source** | Full name or title of the source | Business Insider Africa |
| **Author** | Author, publication, or organisation | Whoop Inc. / Bloomberg |
| **Date Published** | Original publication date | 2024-03-12 |
| **Date Collected** | When your team found this source | 2024-09-05 |
| **Type of Source** | Category from the dropdown | News article, Journal article, etc. |
| **Relevance to KIQ** | **Why** is this relevant to your KIQ? (1–2 sentences) | "Discusses Neuroband's new EEG algorithms vs. competitor offerings" |

### Uploading Source Files

**Assignment requirement: "Provide extracts, not links. Download the actual source (e.g. PDF, image)."**

- Locate the **File Upload** section.
- Upload the original document (PDF, screenshot, image, etc.).
- **Do NOT add a link.** The system only accepts actual file uploads.
- The system will automatically generate a file name following your group's naming convention:
  ```
  NEUROBAND_KIN2_KIQ1_NewsArticle_20240312_BusinessInsiderAfrica.pdf
  ```
- Review the generated file name and confirm before saving.

### Example Entry Workflow

**You find:** A Bloomberg article about Whoop Inc. launching a new wearable with EEG capability.

1. **KIN:** KIN1 (Competitor product strategy)
2. **KIQ:** KIQ1 (What features are competitors prioritising?)
3. **Source:** Bloomberg
4. **Author:** Whoop Inc. / Bloomberg Technology team
5. **Date Published:** 2024-08-15
6. **Date Collected:** 2024-09-01
7. **Type of Source:** News article
8. **Relevance:** "Whoop's new EEG wearable targets wellness market; positioning against Neuroband's health focus. Key feature: real-time sleep staging."
9. **Upload:** PDF of the article.
10. **Save** → Entry is now in your repository.

### Quality Checks Before Saving
- [ ] Is this source **credible** (identifiable author/publication)?
- [ ] Is it **current** (unless historically relevant)?
- [ ] Does it **directly** address one of your KIQs?
- [ ] Have you included the **actual file**, not a link?
- [ ] Is the **Relevance** field clear and specific to your KIQ?

---

## Phase 4: Team Collaboration

### Using the Team Tab

The **Team tab** helps divide work and track progress.

#### **Add Team Members**
1. Go to **Team** → **Members**.
2. Click **Add member**.
3. Enter their name and (optionally) a bio and avatar.
4. They can claim their profile by signing in with their email.

#### **Assign Tasks**

1. Click **New task**.
2. Fill in:
   - **Title:** e.g., "Collect KIN1 sources for product strategy"
   - **KIN / KIQ:** Which intelligence need does this task address?
   - **Assigned to:** Team member's name.
   - **Due date:** e.g., 2024-09-20.
3. Click **Save**.

#### **Tracking Progress**
- Each team member can see their **Tasks** and update the status (To do → In progress → Done).
- The **Task progress** section in the **Analysis** tab shows current workload.
- Add comments to tasks for team discussion (e.g., "Can't find sources on this topic — suggest we pivot to competitor reviews").

### Division of Labour Example
- **Alice:** "Collect all KIN1 sources (competitor product strategy)"
- **Bob:** "Collect all KIN2 sources (market and consumer sentiment)"
- **Carol:** "Collect all KIN3 sources (regulatory environment)"

---

## My Work Dashboard

### Why This Matters
The **My Work dashboard** is your personal task management center. It helps you track your assignments, manage deadlines, and stay on top of your team's workflow without needing to navigate through multiple sections.

### Accessing Your Dashboard

1. Click the **My Work** tab in the left sidebar (visible after you sign in and claim your team profile).
2. Once you've claimed your profile, you'll see:
   - **Summary cards** showing your task statistics
   - **Interactive calendar** for the current month with visual due date indicators
   - **Task list** with filtering and sorting options

### Summary Cards: At a Glance

Your dashboard displays four key metrics:

| Card | What It Shows | When It's Useful |
|------|---------------|------------------|
| **Open** | Number of tasks assigned to you that aren't complete | Daily check-in to see workload |
| **Due soon** | Tasks due within the next 7 days | Plan your week |
| **Completed** | Tasks you've marked as Done | Track your progress |
| **Overdue** | Tasks past their due date (shown in red alert) | Identify blocked work |
| **New** | Newly assigned tasks or tasks with new comments (shown in red alert) | Stay responsive to your team |

### Calendar View: Visualize Your Schedule

The interactive calendar shows:

- **Month navigation:** Click **←** and **→** to browse past and future months
- **Day indicators:** Numbers in the calendar show how many tasks are due on each day
- **Today highlighting:** Today's date is shown with a special highlight
- **Task highlighting:** Days with tasks are shown with a colored background
- **Clickable days:** Click any day to scroll to tasks due on that date

**How to use it:**
- Quickly see which days have task deadlines
- Identify your busiest weeks
- Plan ahead by looking at future months
- Click a day with tasks to jump directly to it in the task list

### Task List: Manage Your Work

The task list displays all your assigned tasks, with these features:

#### Filtering Options
Use the **filter dropdown** to focus on what matters most:

- **All tasks** — Show every task assigned to you
- **Open tasks** — Only tasks you haven't completed yet
- **Overdue** — Tasks past their due date (needs attention!)
- **Due soon** — Tasks due within 7 days
- **Completed** — Tasks you've finished

#### Task Cards: What You See

Each task card shows:

- **Task title** — The name of your assignment
- **Badges** — "New assignment" and "New message" badges for recent updates
- **Status** — Current status (To do, In progress, Done) with a color-coded label
- **Due date** — When the task is due (in red if overdue)
- **"Open task" link** — Click to see full details and comments

#### Updating Your Tasks

From the task list:
1. Click **Open task →** to open the full task card in the Team section
2. There you can:
   - Change your task status (To do → In progress → Done)
   - Add or read team channel comments
   - See who assigned it to you

### Team Visibility: For Managers/Assigners

If you're assigning tasks to your team:

1. Go to the **Team tab**
2. Use the **"All tasks"** view to see the complete picture:
   - Which team members have the most open work
   - Which tasks need attention (filters available)
   - Task progress at a glance

3. Click **"Edit assignment"** on any task to reassign or adjust deadlines
4. Use the **Analysis tab** to see overall task progress and team workload

### Best Practices for Task Management

**For task assignees:**
- Check your **My Work** dashboard daily
- Filter by **"Due soon"** to plan your week
- Mark tasks **In progress** as you start them (helps your team know you're on it)
- Add comments if you have questions or blockers
- Mark complete as soon as you're done

**For team leads:**
- Check the **Team tab** regularly to monitor progress
- Reassign tasks if someone is overloaded
- Use the **Analysis tab** to see if deadlines are realistic
- Communicate in task comments to keep decisions documented
- Celebrate task completions! 🎉

### Example: Your Daily Workflow

**Morning:**
1. Click **My Work** tab
2. Check summary cards — spot any overdue tasks
3. Filter by **"Due soon"** to see what's coming this week
4. Check calendar to see when deadlines cluster

**During the day:**
1. Update task status to **In progress** as you work
2. Add comments if you hit blockers or finish parts of a task
3. Click task card to see team comments and context

**End of day:**
1. Mark tasks **Done** as you complete them
2. Check for new assignments or team messages
3. Plan tomorrow based on the calendar and your task list

---

## Phase 5: Retrieving & Analyzing Your Data

### Using the Analysis Tab

The **Analysis** section shows live statistics:

| Metric | What It Shows | Why It Matters |
|--------|---------------|---|
| **KIN Coverage** | Number of sources per intelligence need | Ensures balanced research across all KINs |
| **Source Mix** | Breakdown by source type (articles, reports, etc.) | Demonstrates diversity: academic + industry sources |
| **Question Coverage** | How many sources address each KIQ | Identifies gaps where more research is needed |
| **Task Progress** | Team workload and task statuses | Keeps the team on track |

**Interpreting the Data:**
- **Green bar at 100%:** Your team has data addressing this intelligence need/question.
- **Partial bar:** You may need to collect more sources for complete coverage.
- **Uneven mix:** If most sources are "News article," try adding more academic or industry reports.

### Searching & Filtering the Repository

1. Go to **Repository** tab.
2. Use the **search bar** to find sources by:
   - Source name
   - Author
   - Notes / Relevance text
3. Use **filters** to narrow down:
   - Select a **KIN** to see only sources for that intelligence need.
   - Select a **KIQ** to see only sources addressing that question.
   - Select a **Source Type** to see only (e.g.) journal articles.
4. **Combine filters:** E.g., "KIN2 + News article" to see all news sources relevant to market sentiment.

### Downloading & Exporting Data

- Click any **entry card** to view full details and download the original file.
- To export all entries: *Contact your system admin* — the database can be exported to CSV for further analysis in your assignment report.

---

## Phase 6: Preparing for Your Presentation

The assignment requires a **10-minute presentation** explaining:
- How the system works
- How data is structured and organised
- How users can retrieve information
- How the system supports data collection in the CI cycle
- How each piece of data relates to your KIQs

### Use the System as Your Evidence

1. **Show the Overview tab:** Demonstrate your KIT and all KINs/KIQs.
2. **Show the Collection Plan tab:** Walk through your systematic approach to data collection.
3. **Show the Analysis tab:** Demonstrate coverage statistics (KIN balance, source diversity).
4. **Show the Repository tab:**
   - Search for a source by KIN.
   - Filter by source type.
   - Click an entry to show the metadata and original file.
5. **Show the Manual tab:** Explain how a new team member would use the system.

### Key Points to Emphasize
- **Systematic approach:** "Every source was collected according to our plan."
- **Traceability:** "Each entry shows which KIQ it addresses and why."
- **Auditability:** "The Activity log shows who added what and when."
- **Scalability:** "A new team member can understand and use this system immediately."

### Important: No Notes During Presentation
- You **must** speak without reading from prepared slides or notes.
- Practice navigating the system so you can demonstrate smoothly.
- Every group member should be able to answer questions about the system.

---

## Troubleshooting

### Common Issues & Solutions

#### **"I can't sign in"**
- Check that your email is spelled correctly.
- If you're a new user, click **Sign up** instead of **Sign in**.
- Check that Supabase credentials are correctly configured in `config.js`.

#### **"The dropdowns are empty (no KINs/KIQs showing)"**
- An admin must have updated `config.js` with your KIT and KINS.
- After editing `config.js`, refresh the browser (Ctrl+R or Cmd+R).
- Check that the JSON syntax in `config.js` is correct (no missing quotes or commas).

#### **"I can't upload a file"**
- Ensure the file is a common format: PDF, PNG, JPG, or Word document.
- File size should be under 10 MB.
- Try a different file type (e.g., convert image to PDF).

#### **"I can't edit the Collection Plan / Manual"**
- Click the **Edit** button in the document header.
- Only admins can save changes; other team members can view but not edit.

#### **"The system shows 0 entries"**
- Your team hasn't added any data yet. Start by clicking **Add entry** in the Repository tab.
- Check the **Activity** log to see if entries were created.

#### **"I need to change the KIT or KINs"**
- Only an admin can edit `config.js` directly.
- Changes take effect after a page refresh.
- **Warning:** Changing KIN/KIQ IDs may break links to existing entries. Plan carefully.

---

## Final Checklist: Before Submission

- [ ] **Collection Plan:** Written and finalized in the app.
- [ ] **Repository:** At least one entry per KIQ, with all metadata complete.
- [ ] **Files:** All sources are uploaded as actual files (not links).
- [ ] **Coverage:** Analysis tab shows balanced coverage across KINs.
- [ ] **Source Mix:** Both academic AND industry sources represented.
- [ ] **Team:** All members are listed and understand the system.
- [ ] **Manual:** Updated with any custom instructions your team added.
- [ ] **Permissions:** System is accessible to graders (check sharing settings).
- [ ] **Activity Log:** Shows your team's work history.

---

## Submitting to Your Instructor

Your group will submit:

1. **A link to the live system** (ensure it's accessible and permissions are set correctly).
2. **A system manual** (the **Manual** tab, exported as a PDF or Word document).
3. **A Data Collection Plan** (the **Collection Plan** tab, exported as a PDF or Word document).
4. **Group name:** Clearly marked in the email subject.

**Email to:** `smartintelci@gmail.com`

**Keep the system live** — it will form the foundation for your next assignment (moving from collection into analysis).

---

## Need Help?

- **System questions:** Check this guide or consult your group's admin.
- **Assignment questions:** Review the INL 380 assignment brief or contact your instructor.
- **Technical issues:** Contact your system administrator or check Supabase documentation at [supabase.com](https://supabase.com).

---

**Good luck with your data collection and presentation!**
