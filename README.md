# ⚡ Naukri Automated Job Application (Chrome & Brave Extension - Manifest V3)

An intelligent, production-grade autonomous job application assistant for **Naukri.com** built with Manifest V3. It filters recent job postings (Last 24 Hours), matches qualifications against your experience and salary requirements, extracts direct recruiter contact details (Phone / WhatsApp / Gmail), auto-applies to Direct Apply postings via intelligent multi-step form wizards, and saves external company listings with full recruiter contact details for direct outreach.

---

## 🚀 Key Features

### 1. 📞 Direct Recruiter Contact Extraction & Outreach Indicator
- **Phone & WhatsApp Detection**: Scans job descriptions and requirements for 10-digit Indian mobile numbers (`+91 9...`, `[6-9]...`, WhatsApp links/tags, and landlines).
- **Gmail & Recruiter Email Detection**: Identifies recruiter emails, specially tagging personal `@gmail.com` addresses.
- **Outreach Badge & Actions**: Listings with direct contact information receive a prominent `📞 Direct Contact` badge in the dashboard.
- **One-Click Call & Email**: Clickable `tel:` and `mailto:` action buttons directly on the saved card.
- **Dedicated Contact Filter & CSV Export**: Easily toggle `[📞 With Contact]` to view and export recruiter contact details directly to CSV.

### 2. 🔍 Autonomous Multi-Role Search Queue
- Provide multiple target job titles separated by commas (e.g. `Data Analyst, MIS Analyst, Business Intelligence`).
- The crawler searches and applies to listings for each role sequentially before completing the session.
- Automatically applies Naukri freshness (`jobAge` URL parameter) and experience filters.

### 3. 🛡️ Multi-Tier Heuristic Filters & Spam Shielding
- **Job Freshness / Post Age Filter**: Configurable in Rules & Filters tab (Last 1 day, Last 3 days, Last 7 days, Last 15 days, Last 30 days, or All/Any time). Applies Naukri's native `jobAge` query parameter and verifies card-level age timestamps to shield you from stale sponsored listings while preserving any posts with direct recruiter contact.
- **AI Gig & Micro-Task Spam Shield**: Instantly skips crowdsourcing and micro-task postings (`Remotasks`, `Outlier`, `DataAnnotation`, `Mindrift`, `RLHF`, hourly USD rate postings).
- **Strict Job Title Relevance**: Ensures jobs match your core target discipline (e.g. filters out irrelevant frontend/sales positions matching on the word "data").
- **Strict Location & Regional Aliases**: Bidirectional matching for Delhi NCR (Delhi, Gurgaon, Noida, Faridabad, Ghaziabad), Bengaluru/Bangalore, Mumbai/Navi Mumbai/Thane, and Hyderabad.
- **Negative Keywords Blacklist**: Word-boundary regex filtering (`intern`, `unpaid`, `bpo`, `telecaller`, `night shift`).
- **Blocked Companies**: Skips spam consultancies and predatory staffing agencies.

### 4. ⚡ Dual Apply Strategy & Opportunity Protection
- **Direct Apply on Naukri**: Opens the drawer / modal, fills React input fields, selects your preferred resume, resolves screening questions, and safely submits the application.
- **Opportunity Protection**: If an application wizard stalls on an unhandled question, it **never drops the job**. It auto-saves it to **Saved Jobs** with reason `⚠️ Incomplete: [Reason]` so you can complete it manually in 30 seconds.
- **Company External Site**: Saves the job and application URL directly to **Saved Jobs** without cluttering your log.

### 5. ❓ Screening Q&A Bank & Auto-Learning Engine
- Pre-save answers to common screening questions (Notice Period, Current CTC, Expected CTC, SQL, Excel, Python, Relocation, Work Authorization).
- **Interactive Auto-Learning**: Any time you manually fill or edit an answer during an application pause, the extension automatically captures and saves the rule to your Q&A bank for future runs!

### 6. ⚖️ Concurrency Mutex & Mathematical Invariant
- Implements a Promise Queue Mutex enforcing the universal accounting law:
  $$\mathbf{\text{Scanned} \equiv \text{Applied} + \text{Saved} + \text{Skipped}}$$
- Self-healing reconciliation algorithm automatically repairs any legacy or interrupted counts.

### 7. 📊 Live Dashboard, Terminal Logs & Audio Chimes
- Real-time monospace terminal log with live events.
- Floating in-page status pill with live counters and an instant `[⏹ Stop]` button.
- Synthesized two-tone Web Audio chimes (offline, zero external MP3 assets) for CAPTCHAs, manual reviews, and session completion.
- Scrollable filter drop-off analytics (`max-height: 145px; overflow-y: auto`).

---

## 🛠️ Installation Guide (Chrome & Brave)

Because Brave is built on Chromium, this extension works identically in both **Brave** and **Google Chrome**.

```
📁 Extension Path:
c:\Users\KIIT\OneDrive\Documents\Automate Jobs\Naukri\Naukri Automated Job Application
```

### 1️⃣ Installing in Brave Browser
1. Open **Brave** and navigate to `brave://extensions`.
2. Turn ON **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the folder: `c:\Users\KIIT\OneDrive\Documents\Automate Jobs\Naukri\Naukri Automated Job Application`.
5. Pin the **⚡ Naukri Auto-Applier** icon to your toolbar.

### 2️⃣ Installing in Google Chrome
1. Open **Chrome** and navigate to `chrome://extensions`.
2. Turn ON **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the folder: `c:\Users\KIIT\OneDrive\Documents\Automate Jobs\Naukri\Naukri Automated Job Application`.
5. Pin the **⚡ Naukri Auto-Applier** icon to your toolbar.

---

## 🎯 How to Use

1. Click the **Naukri Auto-Applier** icon on your browser toolbar.
2. In the **👤 Profile & QA** tab:
   - Fill in your contact info, current designation, experience, CTC, and notice period.
   - Review and customize pre-saved answers in your **Screening Q&A Bank**.
3. In the **⚙️ Rules & Filters** tab:
   - Set your target titles (e.g. `Data Analyst, MIS Analyst, BI Analyst`).
   - Set target location, experience cutoff, and minimum monthly salary floor.
   - Keep `📞 Auto-Save Jobs with Recruiter Phone / Gmail` checked.
4. In the **🚀 Auto-Apply** tab:
   - Click **▶ Start Auto-Apply**.
   - The extension opens a Naukri search tab, analyzes listings, auto-applies, extracts recruiter contacts, and tracks progress.
5. In the **📋 Saved** tab:
   - Click **📞 With Contact** to view listings with direct phone numbers or Gmail addresses.
   - Click **📞 Call** or **✉️ Email** to connect directly with the hiring manager!
   - Export all saved or applied jobs to CSV anytime.

---

## 📁 Project Architecture

```
Naukri/Naukri Automated Job Application/
├── manifest.json              # Extension Manifest V3 configuration
├── data/
│   └── default_profile.json   # Master candidate profile and screening Q&A bank
├── icons/
│   ├── icon16.png             # Toolbar icon (16x16)
│   ├── icon48.png             # Extension management icon (48x48)
│   └── icon128.png            # Web Store icon (128x128)
├── popup/
│   ├── popup.html             # Sleek 5-tab dashboard UI
│   ├── popup.css              # Dark glassmorphic theme styling
│   └── popup.js               # Dashboard controller, CSV exporter & analytics
├── scripts/
│   ├── background.js          # Service worker (Promise Queue Mutex, tab manager)
│   ├── matcher.js             # Recruiter contact extractor, fuzzy matcher, heuristics
│   ├── form-filler.js         # Autonomous apply drawer & chatbot form wizard
│   ├── applier.js             # Top-window crawler, tuple synchronization & pill
│   └── content.css            # In-page highlight styles and status pill
├── README.md                  # Comprehensive user manual and architecture documentation
└── CHANGELOG.md               # Version history and release notes
```
