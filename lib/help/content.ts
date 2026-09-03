// In-app Help & FAQ content. Pure static data — no backend, no AI.
// The /help page (app/(coach)/help/page.tsx) renders + searches this array.
//
// This is also the knowledge base a support bot can be trained on, so each
// article is written as a self-contained answer to one question.
//
// Style rules for article bodies:
//  - Short. Anchored to real UI labels (button text, nav names).
//  - **bold** marks a UI label / button name only (rendered as <strong>).
//  - "steps" blocks are the numbered, click-path how-tos.
//  - "note" blocks flag gating / caveats (owner-only, plan tier, a toggle).
//  - Every id is a stable slug and doubles as the deep-link anchor (/help#id).

export type HelpCategoryId =
  | "getting-started"
  | "account"
  | "athletes"
  | "sessions"
  | "programmes"
  | "live"
  | "testing"
  | "reporting"
  | "community"
  | "documents-challenges"
  | "settings"
  | "billing"
  | "athlete-app"
  | "data-privacy"
  | "faq"
  | "troubleshooting";

export const HELP_CATEGORIES: { id: HelpCategoryId; label: string; icon: string }[] = [
  { id: "getting-started", label: "Getting started", icon: "🚀" },
  { id: "account", label: "Account & login", icon: "🔑" },
  { id: "athletes", label: "Athletes", icon: "👤" },
  { id: "sessions", label: "Sessions", icon: "🏋️" },
  { id: "programmes", label: "Programmes & templates", icon: "📆" },
  { id: "live", label: "Live coaching", icon: "⭐" },
  { id: "testing", label: "Testing", icon: "🧪" },
  { id: "reporting", label: "Reporting", icon: "📊" },
  { id: "community", label: "Community & messaging", icon: "💬" },
  { id: "documents-challenges", label: "Documents & challenges", icon: "📁" },
  { id: "settings", label: "Settings & admin", icon: "⚙️" },
  { id: "billing", label: "Billing & plans", icon: "💳" },
  { id: "athlete-app", label: "Your athletes' app", icon: "📱" },
  { id: "data-privacy", label: "Data & privacy", icon: "🔒" },
  { id: "faq", label: "Common questions", icon: "❓" },
  { id: "troubleshooting", label: "Troubleshooting", icon: "🛠️" },
];

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "subhead"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "note"; text: string };

export type HelpArticle = {
  id: string;
  category: HelpCategoryId;
  title: string;
  summary: string;
  keywords: string[];
  body: HelpBlock[];
};

// Flatten an article's text for the search index.
export function articleText(a: HelpArticle): string {
  const parts: string[] = [a.title, a.summary, a.keywords.join(" ")];
  for (const b of a.body) {
    if (b.type === "steps") parts.push(b.items.join(" "));
    else parts.push(b.text);
  }
  return parts.join(" ").replace(/\*\*/g, "").toLowerCase();
}

const SUPPORT = "support@visbuild.co.uk";

export const HELP_ARTICLES: HelpArticle[] = [
  // ═══════════════════════ Getting started ═══════════════════════
  {
    id: "welcome",
    category: "getting-started",
    title: "Welcome — how VIS BUILD is put together",
    summary: "The two halves of the platform: your coach dashboard and the athlete link.",
    keywords: ["overview", "intro", "start here", "how it works", "surfaces"],
    body: [
      { type: "p", text: "There are two separate apps that share the same data:" },
      {
        type: "steps",
        items: [
          "**Your dashboard** — everything in the left sidebar. You log in with a magic link sent to your email. This is where you build sessions, run testing, generate reports and manage your roster.",
          "**The athlete app** — each athlete opens their own private link (no login, no password). They see their calendar, log their sessions, do check-ins, chat with you and see their PBs.",
        ],
      },
      { type: "p", text: "Anything you programme shows up on the athlete's calendar. Anything they log flows straight back into your reports, dashboard alerts and the Live group screen." },
      { type: "tip", text: "Sidebar, top to bottom: Athletes, Live group, Community, Challenges, Documents, Testing, Templates, Programmes, Library, Reporting, Dashboard, Settings, Coach Forum, Help & FAQ." },
    ],
  },
  {
    id: "first-week",
    category: "getting-started",
    title: "Your first week — a setup checklist",
    summary: "Add athletes, build the Library, send links, then programme.",
    keywords: ["setup", "checklist", "onboarding", "get started", "new coach", "first steps"],
    body: [
      {
        type: "steps",
        items: [
          "**Add your athletes** — Athletes → **+ Add athlete** (name, group, bodyweight).",
          "**Fill the profiles** that matter — date of birth and sex if you'll use testing; a starting 1RM per key lift if you'll prescribe %1RM.",
          "**Build your Exercise Library** — add your common exercises with videos and default sets/reps, or **Import CSV** / **Import from YouTube**.",
          "**Send each athlete their link** — athlete page → **Manage** → **Copy share link**.",
          "**Programme** — build sessions on the calendar, or save a template / programme and load it.",
          "**Check Settings** — 1RM formula, units, and which features (check-in, Hybrid, PBs, challenges) you want on.",
        ],
      },
    ],
  },
  {
    id: "add-first-athlete",
    category: "getting-started",
    title: "Add your first athlete",
    summary: "Athletes → + Add athlete. Name is the only required field.",
    keywords: ["new athlete", "create athlete", "roster", "client"],
    body: [
      {
        type: "steps",
        items: [
          "Click **Athletes** in the left sidebar.",
          "Click **+ Add athlete** (top right).",
          "Fill in **Name**. Optionally add a **Group** (e.g. \"U15 Squad\") and a **Bodyweight (kg)**.",
          "Click **Add athlete**.",
        ],
      },
      { type: "p", text: "The athlete appears as a card. Click the card to open their page, where you build sessions and get their share link." },
      { type: "tip", text: "The Group field is free text. Type the same group name on several athletes and they'll show together in Live group and squad reports." },
    ],
  },
  {
    id: "share-link",
    category: "getting-started",
    title: "Get an athlete into their app (the share link)",
    summary: "Open the athlete → Manage → Copy share link → send it to them however you like.",
    keywords: ["share link", "athlete link", "invite athlete", "login", "token", "access", "url"],
    body: [
      {
        type: "steps",
        items: [
          "Click **Athletes**, then click the athlete.",
          "Click the **Manage** button (top right of their page).",
          "Click **Copy share link**. The button changes to **Copied!**.",
          "Paste that link into a text, WhatsApp or email and send it to the athlete.",
        ],
      },
      { type: "p", text: "The link is unique to that athlete and needs no login — opening it *is* how they sign in. Tell them to bookmark it or add it to their home screen." },
      { type: "note", text: "The link is the credential. Anyone who has it can see that athlete's programme. There's no separate password. VIS BUILD does not email the link for you — you send it." },
      { type: "tip", text: "On iPhone, ask the athlete to open the link in Safari and choose Share → Add to Home Screen. That's also what enables their push notifications." },
    ],
  },
  {
    id: "daily-workflow",
    category: "getting-started",
    title: "A simple weekly rhythm",
    summary: "Dashboard for what needs attention, Live group in the room, reports at review points.",
    keywords: ["workflow", "routine", "how to use", "best practice"],
    body: [
      {
        type: "steps",
        items: [
          "**Start on the Dashboard** — it surfaces who hasn't trained, low check-ins, PBs, athlete messages and reports that are due.",
          "**In a session, open Live group** — star the athletes training with you (or pick a group) and tick sets off as they go.",
          "**Adjust as needed** — use **Modify** on an athlete to change upcoming sessions in plain language, or edit a session directly.",
          "**At review points, run reports** — a Training Load report per athlete, or a Squad report for a group.",
        ],
      },
    ],
  },
  {
    id: "devices-and-browsers",
    category: "getting-started",
    title: "Devices & browsers",
    summary: "Works in any modern browser on desktop, tablet or phone. The athlete app installs to the home screen.",
    keywords: ["browser", "chrome", "safari", "firefox", "edge", "ipad", "android", "pwa", "install", "app store"],
    body: [
      { type: "p", text: "VIS BUILD is a web app — there's no App Store / Play Store download. Use a recent version of Chrome, Safari, Edge or Firefox." },
      { type: "p", text: "Your dashboard works on any screen; on a phone the sidebar becomes a **☰** menu. Live group and the testing grid are most comfortable on a tablet or laptop." },
      { type: "p", text: "The athlete app can be added to a phone's home screen so it opens like an app (and, on iPhone, so push notifications work)." },
    ],
  },
  {
    id: "coach-vs-athlete-visibility",
    category: "getting-started",
    title: "What athletes can and can't see",
    summary: "Athletes see their own data only. They never see other athletes' programmes, your notes to colleagues, or the dashboard.",
    keywords: ["visibility", "privacy", "what athletes see", "permissions"],
    body: [
      { type: "p", text: "Through their link an athlete sees: their calendar and sessions, their PBs and goals, documents you've shared with them, announcements aimed at them or their group, group chat for their groups, their 1:1 thread with you, and any challenges/competitions they're in." },
      { type: "p", text: "They do **not** see: other athletes' programmes or results, your Dashboard, Reporting, Templates/Programmes library, the Exercise Library editor, or coach-to-coach messages." },
      { type: "p", text: "In the Community feed, other athletes see them according to their own privacy settings (they can hide PBs and show first-name-only). You as coach always see everything about your athletes." },
    ],
  },
  {
    id: "getting-help",
    category: "getting-started",
    title: "Getting help & contacting support",
    summary: "Search this help centre first; email support@visbuild.co.uk for anything else.",
    keywords: ["help", "support", "contact", "email", "stuck"],
    body: [
      { type: "p", text: "This Help & FAQ covers every feature — use the search box at the top, or browse the sections on the left." },
      { type: "steps", items: [
        `For a problem or question not answered here, email **${SUPPORT}**. Include: your organisation name, the athlete involved (if any), what you expected to happen, what happened instead, and a screenshot if you can.`,
        "For a feature idea or a vote on the roadmap, use the **Feature Requests** room in the **Coach Forum**.",
      ] },
    ],
  },

  // ═══════════════════════ Account & login ═══════════════════════
  {
    id: "sign-up",
    category: "account",
    title: "Creating your account",
    summary: "A magic link to your email; your business name becomes your organisation.",
    keywords: ["sign up", "register", "create account", "magic link", "new organisation"],
    body: [
      {
        type: "steps",
        items: [
          "Go to the login page and choose **First time? Set up your account**.",
          "Enter **Your name**, your **Business name** and your **Email**. Click **Send sign-in link**.",
          "Open the email on the same device and tap the link.",
        ],
      },
      { type: "p", text: "That creates your organisation (named from your business name) with you as the **owner**, on the **Trial** plan — full features, no card, no athlete cap." },
      { type: "tip", text: "There's no password. Every login is a fresh magic link to your email." },
    ],
  },
  {
    id: "login-magic-link",
    category: "account",
    title: "How logging in works",
    summary: "Enter your email, get a one-time link, tap it on the same device.",
    keywords: ["login", "sign in", "magic link", "password", "otp"],
    body: [
      { type: "p", text: "VIS BUILD has no passwords. To sign in, enter your email and click **Send sign-in link**. You'll get an email — open it on the device you want to be signed in on and tap the link." },
      { type: "p", text: "Your session then stays signed in on that device/browser until you sign out or clear site data." },
      { type: "tip", text: "Tap the link on your phone to sign in on your phone; tap it on your laptop to sign in there. It won't work if you request it on one device and open it on another." },
    ],
  },
  {
    id: "magic-link-not-arriving",
    category: "account",
    title: "The sign-in email didn't arrive",
    summary: "Check spam, wait a minute, make sure the address is exactly right, try again.",
    keywords: ["no email", "link not arriving", "can't log in", "sign in email", "spam"],
    body: [
      { type: "steps", items: [
        "Check your spam / junk / promotions folder.",
        "Give it up to a minute or two — email can be slow.",
        "Make sure you typed the exact address your account uses (a typo sends the link nowhere).",
        "Request a new link — each one is single-use and the newest one is the only valid one.",
        `Still nothing after a few tries? Email **${SUPPORT}** from the address on your account.`,
      ] },
      { type: "note", text: "An old link stops working once you request a newer one, or after it's used once." },
    ],
  },
  {
    id: "new-device",
    category: "account",
    title: "Signing in on a new phone or computer",
    summary: "Just request a fresh sign-in link on the new device.",
    keywords: ["new device", "new phone", "new laptop", "switch device", "lost access"],
    body: [
      { type: "p", text: "There's nothing to transfer. On the new device, go to the login page, enter your email, and tap the link in the email you receive on that device. You can be signed in on as many devices as you like at once." },
    ],
  },
  {
    id: "change-email",
    category: "account",
    title: "Changing the email on your account",
    summary: "Contact support to move your account to a new email address.",
    keywords: ["change email", "update email", "new email address"],
    body: [
      { type: "p", text: `Your login email can't be changed from inside the app yet. Email **${SUPPORT}** from your current address, telling us the new address you'd like, and we'll move the account across.` },
    ],
  },
  {
    id: "coach-profile",
    category: "account",
    title: "Your coach profile & photo",
    summary: "Settings → Your profile: set your display name and photo.",
    keywords: ["profile", "photo", "avatar", "coach name", "display name"],
    body: [
      { type: "p", text: "At the top of **Settings**, **👤 Your profile** lets you upload or change your photo. Your name is what colleagues see in the Team list and on coach-to-coach comments." },
      { type: "p", text: "Your own **🔔 Push notifications** preferences (PB alerts, athlete messages) are set here too — they're personal to you, not org-wide." },
    ],
  },
  {
    id: "transfer-ownership",
    category: "account",
    title: "Transferring organisation ownership",
    summary: "Contact support to move the owner role to another coach.",
    keywords: ["transfer ownership", "change owner", "new owner", "hand over"],
    body: [
      { type: "p", text: "The **owner** is whoever created the organisation. Ownership can't be reassigned from inside the app. If it needs to move to another coach (e.g. someone leaving), email us at " + SUPPORT + " from the current owner's address and we'll transfer it." },
      { type: "p", text: "The new owner must already be an active coach in the organisation (invite them via Settings → Team first)." },
    ],
  },
  {
    id: "multiple-organisations",
    category: "account",
    title: "Can one login belong to two organisations?",
    summary: "No — one coach account belongs to one organisation.",
    keywords: ["two organisations", "multiple orgs", "switch org", "second business"],
    body: [
      { type: "p", text: "A coach account is tied to a single organisation. If you genuinely need to work across two separate businesses, use a different email address for each, or contact support to discuss." },
      { type: "note", text: "An email that's already registered to a coach in one organisation can't be invited into another." },
    ],
  },
  {
    id: "close-account",
    category: "account",
    title: "Closing your account",
    summary: "Contact support. We'll confirm what happens to your athletes' data.",
    keywords: ["close account", "delete account", "cancel", "leave", "shut down"],
    body: [
      { type: "p", text: `To close an organisation, email **${SUPPORT}** from the owner's address. We'll cancel any subscription and confirm the data-deletion timeline with you.` },
    ],
  },

  // ═══════════════════════ Athletes ═══════════════════════
  {
    id: "athletes-list",
    category: "athletes",
    title: "The Athletes list",
    summary: "Cards, the live-group star, archiving, search and Export all.",
    keywords: ["roster", "athlete list", "star", "archive", "export"],
    body: [
      { type: "p", text: "Each athlete is a card showing their name and group. Click the body of a card to open the athlete." },
      {
        type: "steps",
        items: [
          "**★ / ☆** on a card adds or removes the athlete from your **Live group** starred list.",
          "**📦** archives the athlete — they leave your active roster (and free up a seat) but nothing is deleted.",
          "**Archived (N)** switches to the archived list, where you can **Restore** or permanently delete.",
          "**Export all** downloads a data export for every athlete.",
        ],
      },
      { type: "tip", text: "A search box appears once you have more than five athletes." },
    ],
  },
  {
    id: "athlete-page",
    category: "athletes",
    title: "The athlete page",
    summary: "Calendar, the + Add session button, and the Manage menu.",
    keywords: ["athlete detail", "calendar", "manage menu", "add session"],
    body: [
      { type: "p", text: "Opening an athlete gives you their training calendar plus a set of tools." },
      { type: "subhead", text: "Header" },
      { type: "p", text: "The **★ / ☆** star toggles Live group. The **✎** pencil next to the name lets you rename them. **+ Add session** creates a session; **Manage** opens everything else." },
      { type: "subhead", text: "The Manage menu" },
      {
        type: "steps",
        items: [
          "**Build · Voice**, **Build · Notes**, **Modify** — build or change sessions.",
          "**💬 Message** — open your direct message thread with the athlete.",
          "**Copy range**, **Delete range** — bulk calendar operations over a date range.",
          "**Load template**, **Assign programme**, **Save as programme** — templates and programmes.",
          "**Session Library**, **Reports**, **Copy share link**, **Profile**, **Goals**.",
        ],
      },
      { type: "subhead", text: "Dashboard / Month / Week" },
      { type: "p", text: "The toggle above the calendar switches between three views. **Dashboard** is an at-a-glance summary — key metrics across the top (this week's sessions, 7-day completion, last trained, average RPE, recent PBs, next test) and three columns below: recent **messages**, the athlete's **session notes**, and recent **check-ins**. **Month** / **Week** are the programming calendar." },
      { type: "p", text: "In Month/Week: drag a session between days to move it. Each session chip has a **⧉** button to copy it to other dates, and small arrows to reorder sessions within the same day." },
      { type: "subhead", text: "Cards below the calendar" },
      { type: "p", text: "**⚡ Power / Speed Benchmarks** and **🧪 Testing** open those sections. **🔬 Testing schedule** sets how often they should retest — it feeds the Dashboard \"Test week due\" panel." },
    ],
  },
  {
    id: "edit-athlete-details",
    category: "athletes",
    title: "Editing an athlete's details",
    summary: "Rename on their page; change group, DOB, sex and bodyweight on the Profile.",
    keywords: ["rename athlete", "edit athlete", "change group", "date of birth", "bodyweight", "sex"],
    body: [
      { type: "steps", items: [
        "**Name** — on the athlete page, click the **✎** pencil next to their name, edit, **Save**.",
        "**Group, date of birth, sex, bodyweight** — **Manage** → **Profile**, in the **Athlete details** block.",
      ] },
      { type: "tip", text: "Changing the **Group** field moves the athlete in Live group's group mode and in squad reports immediately." },
    ],
  },
  {
    id: "athlete-photo",
    category: "athletes",
    title: "Athlete photos",
    summary: "You upload one on the Profile; the athlete can also set their own from their home screen.",
    keywords: ["photo", "avatar", "picture", "headshot"],
    body: [
      { type: "p", text: "On the athlete **Profile**, click the **✎** button over the avatar to upload a photo. The athlete can also change their own photo from their app's home screen (the **✎** over their avatar)." },
    ],
  },
  {
    id: "athlete-profile",
    category: "athletes",
    title: "The athlete profile & per-athlete settings",
    summary: "Manage → Profile: stats, per-athlete toggles, date of birth, sex and bodyweight.",
    keywords: ["profile", "date of birth", "dob", "sex", "bodyweight", "per athlete toggle", "override"],
    body: [
      { type: "p", text: "Open the athlete → **Manage** → **Profile**." },
      { type: "subhead", text: "Per-athlete overrides" },
      { type: "p", text: "Each of these can be turned off for one athlete even if it's on for the org: **Session check-in**, **Hybrid sessions**, **Personal Bests**, **Challenges**, **Squad comparison**." },
      { type: "subhead", text: "Athlete details" },
      { type: "p", text: "**Date of birth** and **Sex** drive age- and sex-matched norms in the testing reports. **Bodyweight (kg)** pre-fills test sessions and is needed for relative-strength scores (e.g. force per kg)." },
      { type: "subhead", text: "Also on the Profile" },
      { type: "p", text: "Lifetime stats, the **🏋️ 1RM Tracker**, **📈 Velocity profile (VBT)**, and **🏆 Personal bests** (with progression charts and manual entry)." },
    ],
  },
  {
    id: "one-rm-tracker",
    category: "athletes",
    title: "The 1RM Tracker",
    summary: "Set a fixed 1RM per exercise so %1RM prescriptions turn into real kg targets.",
    keywords: ["1rm", "one rep max", "percentage", "%1rm", "targets", "loads"],
    body: [
      { type: "p", text: "On the athlete **Profile**, the **🏋️ 1RM Tracker** holds a one-rep-max per exercise." },
      {
        type: "steps",
        items: [
          "Click **+ Add 1RM**.",
          "Type the **Exercise name** (it autocompletes from your Library) and the **1RM (kg)**.",
          "Click **Save**. Edit the kg value inline any time.",
        ],
      },
      { type: "p", text: "When a session prescribes **Use %1RM**, the athlete's app shows a suggested kg for each set based on this value." },
      { type: "note", text: "Your org setting **1RM source** (Settings → Calculations) decides whether the app uses these fixed values or a rolling estimate from training logs. If an exercise has no value here, it falls back to the rolling estimate." },
    ],
  },
  {
    id: "velocity-profile",
    category: "athletes",
    title: "Velocity profiles (VBT)",
    summary: "Calibrate a load–velocity line per exercise so reports can estimate 1RM from bar speed.",
    keywords: ["vbt", "velocity based training", "bar speed", "load velocity", "profile"],
    body: [
      { type: "p", text: "On the athlete **Profile**, **📈 Velocity profile (VBT)** stores a load–velocity relationship for an exercise." },
      {
        type: "steps",
        items: [
          "Click **+ Add profile**.",
          "Enter the **Exercise name** and a **Minimum velocity threshold** (m/s).",
          "Add at least two **Test points** — a **Load (kg)** and the **Velocity (m/s)** it moved at. Click **+ Add point** for more.",
          "Check the fit (slope / intercept / R²) looks sensible, then **Save**.",
        ],
      },
      { type: "p", text: "With a profile saved, the Training Load report can estimate that lift's 1RM from ordinary logged bar-speed data (from exercises prescribed with **Bar speed (m/s)**)." },
    ],
  },
  {
    id: "personal-bests-coach",
    category: "athletes",
    title: "Personal bests",
    summary: "Detected automatically on every logged set; also add them by hand.",
    keywords: ["pb", "personal best", "pr", "records", "celebration"],
    body: [
      { type: "p", text: "A PB is recorded whenever a completed set beats the athlete's best-ever for that exercise. Detection runs on every set save — whether you logged it in Live group or the athlete logged it — so fixing a mistyped weight also corrects the PB." },
      { type: "p", text: "There are three PB shapes, chosen by the exercise's **Bodyweight only** flag: heaviest weight, most reps (bodyweight), or longest hold (bodyweight + time). Only sets marked **done** count." },
      { type: "subhead", text: "Add one manually" },
      { type: "p", text: "Athlete **Profile** → **🏆 Personal bests** → **+ Add manual PB** → exercise, weight, reps, date → **Save PB**. Click any PB row to see a weight-over-time chart." },
      { type: "note", text: "If **Personal Bests** is off (Settings, or the athlete's profile) there is no detection, no celebration popup and no feed entry." },
    ],
  },
  {
    id: "groups",
    category: "athletes",
    title: "Groups: the two kinds",
    summary: "The free-text Group field vs structured Community groups — used in different places.",
    keywords: ["group", "squad", "team", "cohort"],
    body: [
      { type: "p", text: "**The Group field** on an athlete (free text) drives: Live group's **👥 Group** mode, group filters in Reporting, and \"upload to group\" in Documents." },
      { type: "p", text: "**Community groups** (Community → Groups) are structured lists with members. They drive: group **Chat**, and the squad picker used by **Challenges** and Live group's challenge launcher." },
      { type: "tip", text: "It's fine to mirror them — a \"U15 Squad\" Group field value and a \"U15 Squad\" Community group." },
    ],
  },
  {
    id: "reassign-group",
    category: "athletes",
    title: "Moving an athlete to a different group",
    summary: "Change the Group field on their Profile — it's just text.",
    keywords: ["change group", "move athlete", "reassign", "squad change"],
    body: [
      { type: "p", text: "Open the athlete → **Manage** → **Profile** → edit **Group** in Athlete details. Typing an existing group's exact name puts them in that group; a new name creates a new group label." },
      { type: "note", text: "This is separate from Community groups — for chat and structured challenges, also update their membership in Community → Groups." },
    ],
  },
  {
    id: "archive-vs-delete",
    category: "athletes",
    title: "Archive vs delete an athlete",
    summary: "Archive is reversible. Delete is permanent.",
    keywords: ["archive", "delete", "remove athlete", "restore"],
    body: [
      { type: "p", text: "**Archive** (the **📦** button) hides the athlete from your roster, the Dashboard and every assignment picker. Nothing is deleted. Restore them any time from the **Archived** view." },
      { type: "p", text: "**Permanently delete** (the **×** in the Archived view) removes the athlete and every session they ever had. It cannot be undone." },
      { type: "tip", text: "Not coaching someone right now? Archive them rather than deleting — you keep all their history and can bring them back later." },
    ],
  },
  {
    id: "athlete-not-showing",
    category: "athletes",
    title: "An athlete isn't in my list",
    summary: "Usually archived, or your access is set to \"assigned only\".",
    keywords: ["missing athlete", "can't find athlete", "athlete disappeared", "not in list"],
    body: [
      { type: "steps", items: [
        "Check the **Archived (N)** view — they may have been archived. **Restore** to bring them back.",
        "If you're not the owner, your access might be **Assigned only** — ask the owner to assign that athlete to you (Settings → Team).",
        "Use the search box (appears with more than five athletes) in case the list is just long.",
      ] },
    ],
  },
  {
    id: "export-athlete-data",
    category: "athletes",
    title: "Exporting athlete data",
    summary: "Export all (whole roster) or per athlete from the Profile.",
    keywords: ["export", "csv", "download data", "backup", "spreadsheet"],
    body: [
      { type: "p", text: "**Athletes** → **Export all** exports data for every athlete. On a single athlete, **Manage** → **Profile** → **📥 Export** does just that one." },
      { type: "p", text: "Reports and testing also have their own exports (Reporting → Raw data export, and a test report's **⬇ Download CSV**)." },
    ],
  },
  {
    id: "bulk-add-athletes",
    category: "athletes",
    title: "Adding lots of athletes at once",
    summary: "Athletes are added individually. Contact support for a bulk import of a large squad.",
    keywords: ["bulk import", "import athletes", "csv athletes", "add many", "upload roster"],
    body: [
      { type: "p", text: "There's no self-serve bulk athlete import — add them one at a time with **+ Add athlete**. It's quick: only the name is required." },
      { type: "p", text: `Onboarding a large existing squad from a spreadsheet? Email **${SUPPORT}** with the list and we can help load it.` },
    ],
  },
  {
    id: "rtp-status",
    category: "athletes",
    title: "Availability & return-to-play status",
    summary: "Mark each athlete Available / Return to play / Modified training / Rehab / Unavailable, with a note and a date.",
    keywords: ["return to play", "return-to-play", "rtp", "availability", "rehab", "injury", "injured", "modified training", "unavailable", "physio", "status"],
    body: [
      { type: "note", text: "Needs **Track additional training load & rehab data** turned on — see **Turn on training-load & rehab monitoring**." },
      { type: "p", text: "Open the athlete → **Manage → Profile**, and in the **Settings** section set their **Availability**: **Available**, **Return to play**, **Modified training**, **Rehab** or **Unavailable**, plus a **since** date (fills in with today when you move them off Available)." },
      { type: "subhead", text: "Two notes" },
      { type: "steps", items: [
        "**Note — coaches only** — clinical context for you and the physio (\"L hamstring grade 2, running progression\"). Never shown to the athlete.",
        "**What the athlete can / can't do** — a plain-language message the athlete sees in their app (\"Upper body + bike only, no running or jumping. Reassess Friday.\").",
      ] },
      { type: "subhead", text: "Where it shows" },
      { type: "steps", items: [
        "**Coach side:** a coloured badge on the **Athletes** list, an **Availability** panel on the **Dashboard**, a tile on the athlete's **Dashboard** tab, and a line at the top of their training report + AI summary.",
        "**Athlete side:** a coloured banner on their app home screen and a card in their app **Settings**, showing the status and the \"what you can / can't do\" message.",
      ] },
      { type: "note", text: "Setting a status other than **Available** also switches on the **pain and wellness questions** in that athlete's daily check-in (when those tick-boxes are enabled). Move them back to **Available** and the questions stop — unless you tick **Keep the pain & wellness questions on** on their profile, which forces them on for an athlete you want to keep watching even though they're cleared." },
      { type: "tip", text: "It doesn't restrict what you can programme — it's a shared status + the athlete's instructions, not a lock. Use it as the single source of truth between the S&C coach, the physio and the athlete." },
    ],
  },

  // ═══════════════════════ Sessions ═══════════════════════
  {
    id: "build-session",
    category: "sessions",
    title: "Build a session",
    summary: "+ Add session → pick a type → add exercises manually, or use Voice / Notes / CSV.",
    keywords: ["build session", "create session", "add exercise", "strength", "programme a session", "workout"],
    body: [
      {
        type: "steps",
        items: [
          "Click **Athletes** in the left sidebar, then click the athlete.",
          "On the calendar, click the day you want (optional), then click **+ Add session**.",
          "Pick a type: **Strength**, **Hybrid**, **Cardio**, **Power/Speed** or **Recovery**. The session opens in the builder.",
          "Build it manually: click **+ Add exercise**, start typing the exercise name (it autocompletes from your **Library**), and fill in the prescription — **Sets**, **Reps** (or **Time**), **Rest**, **Load**, **Tempo**.",
          "Or build it fast: use **Import CSV**, **Build · Voice** or **Build · Notes** on the toolbar (Strength sessions).",
        ],
      },
      { type: "subhead", text: "Per-exercise flags" },
      { type: "p", text: "Tick as needed: **Each side** (doubles tonnage), **Bodyweight only**, **Use %1RM** (per-set % ramp instead of a fixed load), **Primer / activation** (excluded from reports), **Completion only** (just a done tick), **Bar speed (m/s)** (adds a velocity box and a target speed), **Pause (s)** (adds a pause box per set — a longer hold at the same load counts as progress)." },
      { type: "tip", text: "If a typed exercise isn't in your Library, a **+ Add \"…\" to library** button appears so you can save it for next time." },
    ],
  },
  {
    id: "build-voice",
    category: "sessions",
    title: "Build a session by talking (Build · Voice)",
    summary: "Record yourself describing the session; it's transcribed, parsed and shown for review.",
    keywords: ["voice", "dictate", "speak", "audio", "build by talking"],
    body: [
      {
        type: "steps",
        items: [
          "From the athlete page or a Strength session's toolbar, click **Build · Voice**.",
          "Click **🎤 Tap to record** and describe the session — exercises, sets, reps, loads. Click **■ Stop recording**.",
          "Wait for **Transcribing…** then **Parsing…**.",
          "Review the result. Fix or match any exercise the app couldn't link to your Library. You can also click **🎤 Say a correction** to adjust by voice.",
          "Click **✓ Save**.",
        ],
      },
      { type: "note", text: "Your browser will ask for microphone permission the first time. Every unmatched exercise must be resolved before you can save." },
    ],
  },
  {
    id: "build-notes",
    category: "sessions",
    title: "Build sessions from notes or a spreadsheet (Build · Notes)",
    summary: "Paste text or upload a .txt / .xlsx / .pdf; it turns into sessions on the calendar.",
    keywords: ["notes", "import", "paste", "spreadsheet", "excel", "pdf", "bulk"],
    body: [
      {
        type: "steps",
        items: [
          "Click **Build · Notes** (athlete page, or a Strength session toolbar).",
          "**📎 Upload .txt, .xlsx, or .pdf**, or paste your programme text into the box.",
          "Click **✨ Generate sessions**.",
          "Review. For a multi-week block you'll see each session's name and computed date; set the **Programme start date**.",
          "Type any corrections (e.g. \"session 1 exercise 2 should be 5 sets not 3\") and click **Apply**.",
          "Click **✓ Save … sessions to calendar**.",
        ],
      },
      { type: "tip", text: "Clear layout helps — one exercise per line with sets, reps and load; label weeks and days if it's a block." },
    ],
  },
  {
    id: "build-csv",
    category: "sessions",
    title: "Import a session from CSV",
    summary: "The Import CSV button on the Strength session toolbar.",
    keywords: ["csv", "import", "upload", "excel export", "spreadsheet"],
    body: [
      { type: "p", text: "On a Strength session, click **Import CSV** on the toolbar and pick your file. Exercises are created and, where the name matches, linked to your Library. You'll see a flash like \"Imported 12 exercises across 3 sessions (9 linked to library)\"." },
      { type: "p", text: "Use a column for the exercise name plus columns for sets, reps and load. One row per exercise (or per set). If in doubt, export an existing session first (Reporting → Raw data export, or Export all) to see the shape." },
    ],
  },
  {
    id: "csv-format",
    category: "sessions",
    title: "What should my session CSV look like?",
    summary: "A header row, then one row per exercise with name / sets / reps / load.",
    keywords: ["csv format", "columns", "import template", "spreadsheet layout"],
    body: [
      { type: "p", text: "Keep it simple: a header row, then a row per exercise. Useful columns: exercise name, sets, reps, load, and optionally a session name/date so several sessions can come in at once." },
      { type: "p", text: "Exercise names that match your Exercise Library (by name) are linked automatically, picking up the Library's video and defaults. Unmatched names still import — you can add them to the Library afterwards." },
      { type: "tip", text: "If your CSV isn't parsing cleanly, try **Build · Notes** instead and upload the spreadsheet there — it's more forgiving of layout." },
    ],
  },
  {
    id: "modify-sessions",
    category: "sessions",
    title: "Change upcoming sessions in plain language (Modify)",
    summary: "Manage → Modify: describe the change, review each proposed edit, apply.",
    keywords: ["modify", "edit sessions", "adjust programme", "deload", "reduce volume", "ai edit"],
    body: [
      {
        type: "steps",
        items: [
          "Open the athlete → **Manage** → **Modify**.",
          "Choose **⌨️ Type** or **🎤 Voice** and describe the change — e.g. \"Reduce squat volume by 20% this week\" or \"Delete all lower body sessions this month\".",
          "Click **Analyse changes**.",
          "Review each proposed change as a card. Toggle **✓ Accept** / **✗ Skip** per card (or **Accept all** / **Skip all**). Use **Refine** to tweak further.",
          "Click **✓ Apply … changes**.",
        ],
      },
      { type: "note", text: "Sessions that already have logged data show a warning, and whole-session deletes ask for a second confirmation." },
    ],
  },
  {
    id: "session-flags",
    category: "sessions",
    title: "Exercise flags & toggles explained",
    summary: "Each side, Bodyweight only, Use %1RM, Primer, Completion only, Bar speed, Pause.",
    keywords: ["flags", "toggles", "each side", "unilateral", "%1rm", "completion only", "bar speed", "primer", "pause", "paused reps", "tempo"],
    body: [
      { type: "steps", items: [
        "**Each side** — the prescription is per limb. Doubles the tonnage counted in reports.",
        "**Bodyweight only** — no load box. Reps (or a hold time) are what's tracked, and PBs compare on those.",
        "**Use %1RM** — instead of one fixed load, each set gets a percentage. The athlete sees a suggested kg from their 1RM.",
        "**Primer / activation** — a deliberately light session (e.g. pre-match). Excluded from reports and the rolling 1RM estimate.",
        "**Completion only** — just a done tick per set, no weight/reps/time boxes.",
        "**Bar speed (m/s)** — adds a velocity box per set and a target speed. Feeds VBT sections in reports.",
        "**Pause (s)** — adds a pause box per set and an optional target hold, for paused-tempo lifts. A longer pause at the same weight and reps shows as progress in Live Group and the \"vs last time\" comparison (e.g. \"Best: same, +1s pause\", green).",
      ] },
    ],
  },
  {
    id: "reorder-exercises",
    category: "sessions",
    title: "Reordering exercises & building supersets",
    summary: "Drag the ⠿ handle, use the arrows, or type a position. 1A / 1B marks a superset.",
    keywords: ["reorder", "superset", "1a 1b", "move exercise", "order", "drag"],
    body: [
      { type: "p", text: "In the builder, drag the **⠿** handle on an exercise card, or use the small **▴ / ▾** arrows." },
      { type: "p", text: "The little **#** field on each card takes a position — type a plain number to move the exercise there. Type **1A** / **1B** (etc.) to pair exercises as a superset; those are left in place rather than renumbered." },
    ],
  },
  {
    id: "move-exercise",
    category: "sessions",
    title: "Moving an exercise to another session",
    summary: "The ↪ button on an exercise card — logged sets move with it.",
    keywords: ["move exercise", "wrong session", "transfer exercise"],
    body: [
      { type: "p", text: "Click **↪** on the exercise card and pick another Strength session for that athlete. The exercise and any sets the athlete already logged move across." },
    ],
  },
  {
    id: "delete-session",
    category: "sessions",
    title: "Deleting a session",
    summary: "Delete session on the builder toolbar, or Delete range for many at once.",
    keywords: ["delete session", "remove session", "cancel session"],
    body: [
      { type: "p", text: "Open the session and click **Delete session** on the toolbar, then confirm. To clear several sessions, use the athlete's **Manage** → **Delete range** with a start and end date." },
      { type: "note", text: "Deleting is permanent — there's no undo. If a session had logged data, that goes too. Consider moving it to a future date instead if you're not sure." },
    ],
  },
  {
    id: "edit-after-logged",
    category: "sessions",
    title: "Editing a session the athlete has already logged",
    summary: "You can — logged sets stay. Changing the prescription doesn't erase what they did.",
    keywords: ["edit logged session", "change after logging", "already trained", "logged data"],
    body: [
      { type: "p", text: "Editing an exercise's prescription (sets, reps, load, %1RM) changes what's *prescribed*; the sets the athlete already completed keep their logged values. Adding or removing sets adjusts the grid but doesn't touch existing entries." },
      { type: "p", text: "Deleting an exercise or the whole session **does** remove its logged data. PBs re-check automatically after any set change." },
      { type: "tip", text: "To adjust future weeks without touching what's been done, use **Modify** or the **Update future occurrences** banner on copied sessions." },
    ],
  },
  {
    id: "progress-signals",
    category: "sessions",
    title: "The \"vs last time\" line on each exercise",
    summary: "Best-set and total-work change against the same exercise last session. Saved data only, no AI.",
    keywords: ["progress", "vs last time", "signals", "best", "load", "total", "tonnage", "reps", "arrows", "comparison"],
    body: [
      { type: "p", text: "At the bottom of each Strength exercise card (in the session builder, in Live group, and on the athlete's own **Session summary**) you'll see the previous session's sets, plus **▲ / ▼ / ＝ Best** and **▲ / ▼ / ＝ Total** — how the best set and the total work moved." },
      { type: "p", text: "**Best** compares weight first, then reps at the same weight, then — if the exercise has **Pause (s)** ticked — the pause held. A longer pause at the same load and reps reads as progress (\"same, +1s pause\", green)." },
      { type: "p", text: "**Total** is Σ (weight × reps) across the completed sets — the session tonnage. For a **bodyweight** exercise with no load (e.g. pull-ups) it's the **total reps** across all sets instead, so doing 8/7/6 this week vs 6/6/6 last week shows as **▲ Total: +5 reps** even when the best single set is unchanged." },
      { type: "p", text: "This is computed purely from saved data. The coach's Live group and the athlete's session summary use the exact same maths." },
      { type: "note", text: "It needs a previous session containing an exercise with the **same name**. Primer sessions are skipped, and it's Strength-only." },
    ],
  },
  {
    id: "copy-session",
    category: "sessions",
    title: "Copy a session to other dates",
    summary: "The ⧉ button on a calendar chip — single date or a repeat pattern.",
    keywords: ["copy", "repeat", "duplicate session", "recurring", "schedule"],
    body: [
      {
        type: "steps",
        items: [
          "On the calendar, click the **⧉** button on the session's chip.",
          "Choose **📅 Single date** (one copy) or **🔁 Repeat pattern**.",
          "For a pattern, pick the days (**Mon / Wed / Fri**, **Weekdays**, **Custom days**, etc.) and a duration (**Next X weeks** or a **Date range**).",
          "Check the preview list of dates, then **Copy … sessions**.",
        ],
      },
      { type: "note", text: "Logged weights are not carried over — copies come through as fresh prescriptions." },
    ],
  },
  {
    id: "update-future",
    category: "sessions",
    title: "Update future occurrences of a session",
    summary: "The banner that appears on copied sessions when you edit them.",
    keywords: ["update future", "propagate", "all future", "recurring edit"],
    body: [
      { type: "p", text: "If a session was made with the copy tool, editing it shows an **Update future occurrences** banner with three choices: **This session only**, **All future**, or **Same day of week only**. Pick one and click **Apply to future sessions →**." },
      { type: "note", text: "The banner only appears on copied sessions. Template-loaded, programme-assigned and scratch-built sessions don't have it — edit each one directly, or use **Modify**." },
    ],
  },
  {
    id: "apply-to-all-future",
    category: "sessions",
    title: "\"Apply changes below to all future sessions\" (per exercise)",
    summary: "A checkbox on an exercise card that pushes prescription edits to matching future exercises.",
    keywords: ["apply to future", "propagate exercise", "bump weight everywhere"],
    body: [
      { type: "p", text: "Each exercise card has an **↻ Apply changes below to all future sessions** checkbox. Tick it, then edit the prescription — the change also applies to every future session that has an exercise with the same name." },
      { type: "p", text: "Handy for \"bump this lift by 2.5 kg from here on\" without opening every session." },
    ],
  },
  {
    id: "exercise-history",
    category: "sessions",
    title: "See an exercise's history & PB",
    summary: "The 📈 button on any exercise card.",
    keywords: ["history", "past sessions", "exercise log", "previous"],
    body: [
      { type: "p", text: "Click **📈** on an exercise card (in the builder or Live group) to see the athlete's **🏆 Personal Best** for that lift plus every previous session — the peak set and all completed sets." },
    ],
  },
  {
    id: "approved-alternatives",
    category: "sessions",
    title: "Set approved alternatives for an exercise",
    summary: "The 🔀 button on an exercise — the swaps the athlete is allowed to make.",
    keywords: ["alternatives", "swap options", "substitutions", "approved swaps"],
    body: [
      { type: "p", text: "Click **🔀** on an exercise card, search your Library, and add exercises as chips. Those become the **Coach-approved alternatives** the athlete can pick from if they need to swap that exercise for a session." },
      { type: "p", text: "The athlete can also search your whole Library for a swap unless you'd rather they didn't — approved alternatives just make the common swaps one tap." },
    ],
  },
  {
    id: "session-notes",
    category: "sessions",
    title: "Session notes",
    summary: "The 📋 Session Notes block — visible to the athlete — plus reusable note templates.",
    keywords: ["notes", "coaching cues", "session notes", "note template"],
    body: [
      { type: "p", text: "Every session has a **📋 Session Notes** block. What you write there is visible to the athlete in their app. Use **Load template ▾** to drop in a saved note template (managed on the Templates page)." },
      { type: "p", text: "If the athlete adds their own notes, they appear in a read-only **📝 Athlete's Notes** block below yours, and re-flag the session for your review." },
    ],
  },
  {
    id: "primer-session",
    category: "sessions",
    title: "Primer / activation sessions",
    summary: "A checkbox that marks a session as deliberately light and keeps it out of reports.",
    keywords: ["primer", "activation", "pre match", "potentiation", "deload"],
    body: [
      { type: "p", text: "On a Strength session, tick **Primer / activation session**. It's then excluded from the Training Load report's totals and from the rolling %1RM estimate, so a pre-match top-up doesn't drag your numbers around." },
      { type: "note", text: "The \"vs last time\" progression comparison also skips primer sessions." },
    ],
  },
  {
    id: "recovery-session-builder",
    category: "sessions",
    title: "Recovery sessions",
    summary: "Pick a format; add items; optionally ask the athlete for feedback afterwards.",
    keywords: ["recovery", "mobility", "soft tissue", "breathing", "regen"],
    body: [
      { type: "p", text: "**+ Add session** → **Recovery** opens a format picker, then the recovery editor. Build the session as a list of items the athlete works through as a checklist." },
      { type: "p", text: "You can turn on a short post-session feedback form (how recovered they feel, soreness, fatigue, any pain). Save a configuration you'll reuse with **Save as preset**." },
    ],
  },
  {
    id: "sport-session",
    category: "sessions",
    title: "Sport / Other sessions",
    summary: "Log non-gym training — club sessions, matches, swims, rehab work — with a duration and intensity so it counts toward load.",
    keywords: ["sport", "other", "cross training", "cross-training", "match", "game", "club training", "pitch", "swim", "external session", "rehab session", "duration", "rpe", "return to play"],
    body: [
      { type: "note", text: "The **Sport / Other** type only appears when **Track additional training load & rehab data** is on (Settings)." },
      { type: "p", text: "**+ Add session** → **Sport / Other**. Enter the **activity** (\"5-a-side\", \"team training\", \"pool session\"), a **planned duration** in minutes, a **planned intensity** (session RPE 1–10), and any notes for the athlete." },
      { type: "p", text: "When the athlete opens it they confirm the **actual duration** and **actual RPE** and can add a note back. That's what feeds the load figures — see **Training load & return-to-play monitoring**." },
      { type: "subhead", text: "Athletes can add their own" },
      { type: "p", text: "From their app home screen an athlete can tap **Log a sport / other session** to record something you didn't schedule (\"played 5-a-side, 60 min, RPE 7\"). It shows on both calendars and counts toward load — but not toward programme adherence." },
    ],
  },
  {
    id: "hybrid-cardio-builder",
    category: "sessions",
    title: "Hybrid & Cardio sessions",
    summary: "Stations, intervals and metric tracking — a different builder from Strength.",
    keywords: ["hybrid", "hyrox", "cardio", "conditioning", "intervals", "erg", "run"],
    body: [
      { type: "p", text: "**Hybrid** and **Cardio** sessions use the Hybrid/Cardio builder: choose a sub-type and configure stations/intervals with the metrics you want tracked (distance, time, pace, calories, etc.)." },
      { type: "p", text: "Which metrics show depends on the equipment you pick for each item — and on the Exercise Library entry's tracked metrics." },
      { type: "p", text: "Cardio efforts (Continuous, Intervals, Over-Unders), Threshold/Tempo blocks and Hybrid Interval efforts have a **Training zone** picker (Z1–Z5). Pick a zone and the athlete gets their own HR and pace targets — see **Training zones (MAS & HR)**. Pick **Custom** to type free-hand intensity/pace/HR instead." },
      { type: "note", text: "The Voice / Notes / CSV helpers are Strength-only." },
    ],
  },
  {
    id: "training-zones",
    category: "sessions",
    title: "Training zones (MAS & heart rate)",
    summary: "Set an athlete's Max HR and MAS, then prescribe Z1–Z5 and they see their own bpm + pace targets.",
    keywords: ["mas", "maximal aerobic speed", "heart rate zones", "hr zones", "z1", "z2", "z3", "z4", "z5", "zone 2", "karvonen", "conditioning intensity", "pace", "bpm"],
    body: [
      { type: "subhead", text: "Set the athlete's aerobic profile" },
      { type: "steps", items: [
        "Open the athlete → **Manage → Profile** → **🫀 Aerobic profile**.",
        "**Max HR** — measured, or tap **~xxx** to estimate from date of birth (208 − 0.7 × age).",
        "**Resting HR** — optional; adding it switches HR zones to the more accurate heart-rate-reserve (Karvonen) method.",
        "**MAS (km/h)** — your Maximal Aerobic Speed. Enter it directly, or use **Set MAS from a field test** (distance covered in a max-effort test).",
        "The 5-zone table below fills in live — HR band, pace /km and speed for each zone.",
      ] },
      { type: "subhead", text: "Prescribe a zone" },
      { type: "p", text: "On a Cardio session (Continuous / Intervals / Over-Unders), a Threshold block, or a Hybrid Interval, use the **Training zone** picker and choose **Z1–Z5**. The readout shows that athlete's target. Choose **Custom** to type a free-hand intensity/pace/HR instead." },
      { type: "subhead", text: "What the athlete sees" },
      { type: "p", text: "When they open the session, each zoned segment shows **\"Zone 2 Aerobic · 138–158 bpm · 4:41–5:21 /km\"**, computed live from their current profile. Their full zone table is on their **Settings** page under **🫀 Training zones**." },
      { type: "subhead", text: "The zone model" },
      { type: "p", text: "The standard endurance 5-zone model — **Z1 Recovery · Z2 Endurance · Z3 Tempo · Z4 Threshold · Z5 VO2 Max** — is defined as % of Max HR and % of MAS in **Settings → Heart rate & MAS zones**, where the owner can adjust the boundaries and names." },
      { type: "note", text: "Older cardio sessions with a hand-typed zone/pace still show exactly as before — nothing changes until you use the zone picker." },
      { type: "note", text: "Don't prescribe by zone? Turn the whole feature off in **Settings → Heart rate & MAS zones** — the aerobic profile section, the zone picker and the athlete zone table all disappear." },
    ],
  },
  {
    id: "power-speed-builder",
    category: "sessions",
    title: "Power/Speed sessions",
    summary: "Sprints, jumps, throws and sled work — each exercise tracks the metrics you pick.",
    keywords: ["power", "speed", "sprint", "jump", "throw", "plyometric", "sled", "med ball", "metrics"],
    body: [
      { type: "p", text: "**+ Add session** → **Power/Speed** gives each exercise a Power/Speed card and a session summary bar." },
      { type: "subhead", text: "Metrics" },
      { type: "p", text: "Tap **Metrics** on the card and tick what this exercise logs — you can pick several at once. **Load (kg)** and **Reps** are one value per set; **Time, Distance, Height, Velocity, Power, RSI, Contact time** are one value per rep. Examples: a sled sprint = Load + Time + Distance; a med-ball throw = Load + Reps + Distance; a drop jump = Height + Contact time (RSI fills in automatically). Movement type (Acceleration / Plyometric / …) seeds a sensible default set." },
      { type: "p", text: "**Completion only** hides all boxes — the athlete just ticks each set done." },
      { type: "p", text: "Set these as defaults on a library exercise (**Library → edit → Metrics logged**) so they apply every time you add it." },
      { type: "note", text: "Athletes logging a Power/Speed session now get these same metric boxes, per set and per rep." },
      { type: "p", text: "Results feed the athlete's **⚡ Power / Speed** page and the Power/Speed sections of reports (one trend line per metric). The red/amber/green ratings there come from Settings → Power/Speed Benchmarks." },
    ],
  },
  {
    id: "session-types-overview",
    category: "sessions",
    title: "The five session types",
    summary: "Strength, Hybrid, Cardio, Power/Speed, Recovery — and which builder each uses.",
    keywords: ["session types", "strength", "hybrid", "hyrox", "cardio", "power speed", "recovery"],
    body: [
      { type: "steps", items: [
        "**Strength** — the standard exercise/sets/reps builder. Voice, Notes and CSV helpers work here.",
        "**Hybrid** — stations and intervals (running, erg, sled, etc.). Uses the Hybrid/Cardio builder. (Stored internally as \"Hyrox\" — same thing.)",
        "**Cardio** — steady/interval conditioning with metric tracking.",
        "**Power/Speed** — sprints, jumps and throws with their own card layout and a summary bar.",
        "**Recovery** — mobility / soft-tissue / breathing. Can optionally ask the athlete for structured feedback afterwards.",
      ] },
      { type: "note", text: "The **Hybrid** type only appears if it's enabled in Settings → Session Types (and on the athlete's profile)." },
    ],
  },
  {
    id: "session-rpe",
    category: "sessions",
    title: "Session RPE",
    summary: "The athlete rates the whole session 1–10 once every set is done; it feeds the Training Load report.",
    keywords: ["rpe", "session rpe", "srpe", "effort", "how hard"],
    body: [
      { type: "p", text: "After the athlete ticks off every set, their app shows **🔥 Session RPE** — a 1–10 scale for how hard the session felt overall. One tap saves it." },
      { type: "p", text: "In the Training Load report, tick **Session RPE** to see the range average, a weekly trend, and a per-session list. Combined with session duration it also drives the **Training load (sRPE)** section." },
    ],
  },
  {
    id: "session-not-on-athlete-calendar",
    category: "sessions",
    title: "A session I built isn't on the athlete's calendar",
    summary: "Check the date, the right athlete, and that it's not a Library session.",
    keywords: ["session missing", "not showing", "athlete can't see session", "wrong date"],
    body: [
      { type: "steps", items: [
        "Confirm the **date** — it may be further ahead or behind than you think; scroll the athlete's calendar.",
        "Confirm you built it on the **right athlete** (easy to do on the wrong tab).",
        "Sessions the athlete started from their **Session Library** don't appear on the calendar by design.",
        "Ask the athlete to fully close and reopen the app — mobile browsers cache aggressively.",
      ] },
    ],
  },

  // ═══════════════════════ Programmes & templates ═══════════════════════
  {
    id: "templates-overview",
    category: "programmes",
    title: "What a template is",
    summary: "One or more saved session definitions you can drop onto any athlete.",
    keywords: ["template", "saved session", "reusable"],
    body: [
      { type: "p", text: "A template is a saved session (or a few). You create one from a session you've already built:" },
      { type: "steps", items: [
        "Open the session in the builder.",
        "Click **Save as template** on the toolbar and give it a name.",
      ] },
      { type: "note", text: "You can't build a template from scratch on the Templates page — that page is for browsing, renaming, loading and deleting. Build the session on an athlete first, then Save as template." },
    ],
  },
  {
    id: "load-template",
    category: "programmes",
    title: "Load a template onto an athlete",
    summary: "Templates → open one → Load onto athlete, with a date range.",
    keywords: ["load template", "apply template", "assign template"],
    body: [
      {
        type: "steps",
        items: [
          "Click **Templates**, open the template.",
          "Click **Load onto athlete**.",
          "Pick the athlete and set a **Start date** and **End date**.",
          "Click **Load template**.",
        ],
      },
      { type: "p", text: "Sessions with repeat days set are added on every matching weekday in the range. Sessions with no repeat days are added once, on the start date." },
      { type: "tip", text: "You can also do this from the athlete page: **Manage** → **Load template**." },
    ],
  },
  {
    id: "repeat-days-explained",
    category: "programmes",
    title: "How repeat days work when loading",
    summary: "A session with repeat days lands on every matching weekday in the range; without, it lands once.",
    keywords: ["repeat days", "recurring", "weekday", "pattern", "load range"],
    body: [
      { type: "p", text: "When you load a template or programme over a date range:" },
      { type: "steps", items: [
        "Sessions that have **repeat days** set (e.g. Mon + Thu) are added on every matching weekday between the start and end dates.",
        "Sessions with **no repeat days** are added once, on the start date.",
        "Programmes can instead keep the exact day pattern they were saved with (rest days included), starting from your chosen date — or you can override with fixed spacing (every 1–3 days / weekly) in the preview step.",
      ] },
    ],
  },
  {
    id: "edit-template-after-load",
    category: "programmes",
    title: "Editing a template after it's been loaded",
    summary: "Changes to the template do not reach sessions already on athletes' calendars.",
    keywords: ["edit template", "update template", "template changes", "propagate"],
    body: [
      { type: "p", text: "A template is a starting point. Once you've loaded it onto an athlete, those calendar sessions are independent copies — editing the template later won't change them." },
      { type: "p", text: "To change what's already loaded, edit the athlete's sessions directly, use **Modify**, or delete the range and re-load the updated template." },
    ],
  },
  {
    id: "note-templates",
    category: "programmes",
    title: "Session note templates",
    summary: "Reusable blocks of session-note text, managed at the bottom of the Templates page.",
    keywords: ["note template", "session notes", "boilerplate", "warm up"],
    body: [
      {
        type: "steps",
        items: [
          "On the **Templates** page, scroll to **Session Note Templates**.",
          "Click **+ New note template**. Set a **Name**, a **Category** (General / Warm-Up / Strength / Power / Speed / Cardio) and the **Content**.",
          "Click **Save template**.",
        ],
      },
      { type: "p", text: "These then appear under **Load template ▾** inside the Session Notes block on any session." },
    ],
  },
  {
    id: "home-programme",
    category: "programmes",
    title: "Publish a Home Programme (public link)",
    summary: "Turn a template into a no-login web page for home workouts, with equipment swaps.",
    keywords: ["home programme", "public link", "no login", "share workout", "equipment alternatives"],
    body: [
      {
        type: "steps",
        items: [
          "Open a template on the **Templates** page.",
          "In the **Home Programme** panel, choose when the link expires (Never / 30 / 60 / 90 days).",
          "Click **Publish as Home Programme** and copy the link.",
          "Optionally set up **Equipment alternatives** so the page can swap exercises based on what the person has.",
        ],
      },
      { type: "p", text: "Anyone with the link can open it — no token, no login. Click **Unpublish** to switch it off." },
    ],
  },
  {
    id: "programmes-overview",
    category: "programmes",
    title: "What a programme is",
    summary: "A multi-session training block you can assign to athletes.",
    keywords: ["programme", "program", "block", "mesocycle", "multi session"],
    body: [
      { type: "p", text: "A programme is an ordered set of sessions — a training block. Build one by either:" },
      { type: "steps", items: [
        "Athlete page → **Manage** → **Save as programme** (saves every session on that athlete's calendar within a date range), or",
        "Templates page → open a template → **Add to Programme Library**.",
      ] },
      { type: "p", text: "The **Programmes** page is for browsing, renaming and assigning. Open a programme to add sessions from templates or remove sessions." },
    ],
  },
  {
    id: "assign-programme",
    category: "programmes",
    title: "Assign a programme to an athlete",
    summary: "Manage → Assign programme: pick, type or say when it starts; preview; confirm.",
    keywords: ["assign programme", "schedule programme", "start programme", "ai assign"],
    body: [
      {
        type: "steps",
        items: [
          "Open the athlete → **Manage** → **Assign programme**.",
          "Choose **🖱️ Pick**, **⌨️ Type** or **🎤 Voice**.",
          "**Pick**: choose the programme, a **Start date**, and **Session spacing** (original day pattern, or every 1–3 days / weekly).",
          "**Type / Voice**: describe it — e.g. \"Start the 8-week strength programme this coming Monday, every other day\".",
          "Click through to the **preview** — check the schedule — then **✓ Confirm & schedule … sessions**.",
        ],
      },
      { type: "p", text: "This both assigns the programme to the athlete and writes every session onto their calendar." },
    ],
  },
  {
    id: "load-programme-bulk",
    category: "programmes",
    title: "Load a programme (the two-step flow)",
    summary: "Pick athlete + start date, then a preview where you can adjust spacing and drop sessions.",
    keywords: ["load programme", "bulk load", "spacing", "day pattern"],
    body: [
      {
        type: "steps",
        items: [
          "On the **Programmes** page, open a programme and click **Load onto athlete**.",
          "**Step 1** — pick the athlete and a **Start date**. Sessions keep the day pattern they were saved with (rest days included); the first one lands on the start date. Click **Preview →**.",
          "**Step 2** — optionally tick **Use fixed spacing instead of the original day pattern** and choose every 1–3 days / weekly. Remove any session from *this* load with its **×**.",
          "Click **Generate programme**.",
        ],
      },
    ],
  },
  {
    id: "remove-session-from-programme",
    category: "programmes",
    title: "Removing a session from a programme or template",
    summary: "Open it, click the × on the session — the source stays; loaded copies aren't touched.",
    keywords: ["remove session", "delete from programme", "edit programme"],
    body: [
      { type: "p", text: "Open the programme or template and click the **×** on a session in the list (confirm, with an undo). This only edits the library item — sessions already loaded onto athletes are unaffected." },
      { type: "p", text: "On a programme you can also **+ Add from template** to append sessions." },
    ],
  },
  {
    id: "unassign-programme",
    category: "programmes",
    title: "Unassigning a programme",
    summary: "Open the programme → Assigned athletes → × next to the athlete.",
    keywords: ["unassign", "remove programme", "detach"],
    body: [
      { type: "p", text: "In a programme's **Assigned athletes** section, click the **×** by an athlete to unassign it. This removes the link between athlete and programme; it doesn't delete the sessions already on their calendar." },
      { type: "p", text: "To also clear those sessions, use the athlete's **Manage** → **Delete range**." },
    ],
  },
  {
    id: "programme-expiry",
    category: "programmes",
    title: "\"Programme expiry\" on the Dashboard",
    summary: "Flags athletes whose current block has run out or is about to.",
    keywords: ["programme expiry", "block ending", "out of sessions", "dashboard"],
    body: [
      { type: "p", text: "The Dashboard's **Programme expiry** section splits athletes into **Needs attention** (no upcoming sessions, last day today, or a few days left) and **On track**, based on the dates of their scheduled sessions. Click a row to open the athlete and programme their next block." },
    ],
  },

  // ═══════════════════════ Live coaching ═══════════════════════
  {
    id: "live-group",
    category: "live",
    title: "Live group",
    summary: "Coach a room in real time — starred athletes or a whole group, one tab each.",
    keywords: ["live", "live group", "in the room", "session floor", "coaching"],
    body: [
      {
        type: "steps",
        items: [
          "Click **Live group** in the sidebar.",
          "Choose **★ Starred** (athletes you've starred) or **👥 Group** (pick a group).",
          "Each athlete is a tab across the top. Click a tab to see their session.",
          "Use the session dropdown to switch between today's, the next, or yesterday's session for that athlete.",
          "Click **Open full session →** for the complete builder/timer view.",
        ],
      },
      { type: "tip", text: "Star athletes from the Athletes list or an athlete's page (the ☆ toggle)." },
    ],
  },
  {
    id: "live-logging",
    category: "live",
    title: "Logging sets in Live group",
    summary: "Tap set dots, quick-edit an exercise, leave a note, mark ready-to-progress.",
    keywords: ["log sets", "tick sets", "quick edit", "progress call", "thumbs up"],
    body: [
      { type: "steps", items: [
        "Tap a **set dot** to mark it done. On a %1RM exercise this captures the suggested kg.",
        "**✏️** — quick-edit the exercise (swap name, sets, reps/time, rest, load).",
        "**📝** — add a coaching-cue note on the exercise.",
        "**👍** / **👎** — mark whether the athlete could progress this next time. Tap again to clear.",
        "Expand a row for the full per-set editor (weight, reps/time, bar speed, copy-previous, done toggle).",
      ] },
      { type: "note", text: "The **👍 / 👎** call writes to the same field the athlete's own \"could you have progressed this?\" prompt uses — so you and they are updating one shared signal." },
    ],
  },
  {
    id: "live-checkin",
    category: "live",
    title: "Check-ins from Live group",
    summary: "The ✅ button opens the readiness questions — advisory only here.",
    keywords: ["check in", "readiness", "recommendations", "energy sleep soreness"],
    body: [
      { type: "p", text: "Click **✅** on an athlete's panel to open the check-in: four 1–5 questions (Energy, Sleep, Soreness, Volume tolerance). **Get recommendations** shows today's suggested adaptations based on your check-in rules." },
      { type: "note", text: "On Live group this is advisory only — it isn't saved. When the athlete does their own check-in in their app, that one is stored." },
    ],
  },
  {
    id: "live-challenge",
    category: "live",
    title: "Run a challenge in the room",
    summary: "The 🏆 button — pick a challenge and squad, log results live, watch the leaderboard.",
    keywords: ["challenge", "leaderboard", "competition", "live challenge"],
    body: [
      {
        type: "steps",
        items: [
          "In **👥 Group** mode, click **🏆**.",
          "Pick a saved challenge, or **+ New challenge** to build one.",
          "Pick a squad (a Community group).",
          "Enter each athlete's value and click **Save**. The **leaderboard** updates live.",
        ],
      },
      { type: "note", text: "The **🏆** button only shows if Challenges is enabled in Settings." },
    ],
  },
  {
    id: "live-group-empty",
    category: "live",
    title: "Live group is empty",
    summary: "No athletes starred, or nobody in the chosen group, or no session in the date window.",
    keywords: ["live group empty", "nothing showing", "no athletes", "blank"],
    body: [
      { type: "steps", items: [
        "In **★ Starred** mode: open an athlete and tap **☆** to star them.",
        "In **👥 Group** mode: check the group dropdown, and that athletes have that exact group on their Profile.",
        "Live group only shows sessions dated yesterday through the next seven days — an athlete with nothing scheduled in that window won't appear with a session.",
      ] },
    ],
  },
  {
    id: "live-multiple-coaches",
    category: "live",
    title: "Two coaches in Live group at once",
    summary: "Fine — edits save to the same data. Refresh to pull in a colleague's changes.",
    keywords: ["multiple coaches", "concurrent", "two coaches", "shared"],
    body: [
      { type: "p", text: "Several coaches can log the same room at once. Each save writes to the shared session, so the last edit to a given field wins. Use the **↻** refresh button to pull in what a colleague just entered." },
    ],
  },
  {
    id: "live-offline",
    category: "live",
    title: "Does Live group work if the gym Wi-Fi drops?",
    summary: "Saves that fail are queued and retried automatically.",
    keywords: ["offline", "no signal", "wifi", "connection", "gym"],
    body: [
      { type: "p", text: "If a save can't reach the server, it goes into a retry queue and is sent again automatically — every 30 seconds and the moment the connection returns. You won't lose entries to a brief signal drop." },
      { type: "tip", text: "Keep the tab open until it reconnects. If you see a \"couldn't be saved\" warning that won't clear, note those values and re-enter them once you're back online." },
    ],
  },

  // ═══════════════════════ Testing ═══════════════════════
  {
    id: "testing-overview",
    category: "testing",
    title: "How the testing system fits together",
    summary: "Metrics & Benchmarks → Batteries → log sessions → reports.",
    keywords: ["testing", "physical testing", "norms", "batteries", "metrics"],
    body: [
      { type: "p", text: "The **Testing** page has three tabs:" },
      { type: "steps", items: [
        "**Metrics & Benchmarks** — define what you measure (e.g. 10m Sprint, CMJ) and the norm thresholds.",
        "**Batteries** — group metrics into a named test (e.g. \"Pre-season screen\").",
        "**Group Testing** — run a whole squad through a battery in one scrollable grid.",
      ] },
      { type: "p", text: "You log individual test sessions from an athlete's **🧪 Testing** page, and generate reports from there or from a group session." },
      { type: "p", text: "Every organisation starts with two built-in batteries: a **youth physical testing** battery (sprint / jump / strength / agility, with dual elite-youth + general-population norms) and the **FMS (Functional Movement Screen)**." },
      { type: "tip", text: "The testing system is VIS BUILD's core differentiator — dual elite-youth and general-population norms, age- and sex-matched." },
    ],
  },
  {
    id: "metrics-benchmarks",
    category: "testing",
    title: "Create a metric and its benchmarks",
    summary: "Testing → Metrics & Benchmarks → + New metric, then + Add benchmark.",
    keywords: ["metric", "benchmark", "norm", "threshold", "bilateral", "rag"],
    body: [
      {
        type: "steps",
        items: [
          "**Testing** → **Metrics & Benchmarks** tab → **+ New metric**.",
          "Set the **name**, **Unit** (s, cm, kg…), and whether **Higher** or **Lower is better**. Click **Create**.",
          "On the metric, tick **Bilateral (L/R)** if it's measured per side, and **Requires bodyweight** for relative scores.",
          "Click **+ Add benchmark**: choose **General population** or **Elite youth**, a **Sex**, an **Age range**, and the **Average / Good / Excellent** thresholds. **Save benchmark**.",
        ],
      },
      { type: "p", text: "A result worse than Average is rated \"Needs Work\" automatically." },
    ],
  },
  {
    id: "norms-explained",
    category: "testing",
    title: "How the norms & RAG ratings work",
    summary: "Each result is graded against an age- and sex-matched benchmark for the population you choose.",
    keywords: ["norms", "rag", "red amber green", "elite youth", "general population", "rating", "percentile"],
    body: [
      { type: "p", text: "A benchmark has four bands: below **Average** = Needs Work, then **Average**, **Good**, **Excellent**. A result is placed in a band and coloured red / amber / green accordingly." },
      { type: "p", text: "Benchmarks are split into **General population** and **Elite youth**, and each is matched to the athlete's **sex** and **age at the test date**. So the same jump height can be \"Good\" for a 14-year-old and \"Average\" for an 18-year-old." },
      { type: "p", text: "Reports show both side by side by default, but the **Ratings** control on the report lets you show just one — elite-youth only, or general-population only." },
      { type: "note", text: "No rating shows if the athlete has no date of birth, or if there's no benchmark covering their age/sex for that metric and population." },
    ],
  },
  {
    id: "batteries",
    category: "testing",
    title: "Create a test battery",
    summary: "Testing → Batteries → + New battery, then tick the metrics it includes.",
    keywords: ["battery", "test battery", "screen", "testing session"],
    body: [
      {
        type: "steps",
        items: [
          "**Testing** → **Batteries** tab → **+ New battery**. Name it and click **Create**.",
          "Tick the metrics that belong in this battery.",
          "Click **Save battery metrics**.",
        ],
      },
      { type: "note", text: "Deleting a battery keeps any test sessions logged against it — they're just unlinked." },
    ],
  },
  {
    id: "log-test-session",
    category: "testing",
    title: "Log a test session for an athlete",
    summary: "Athlete → 🧪 Testing → + Log Session: battery, date, bodyweight, trials.",
    keywords: ["log test", "test session", "record results", "trials"],
    body: [
      {
        type: "steps",
        items: [
          "Open the athlete and click the **🧪 Testing** card.",
          "Click **+ Log Session** (or **Log First Session**).",
          "Choose the **Battery** and **Date**. Enter **Bodyweight (kg)** and check the **Age at test date** (auto from DOB, or type it).",
          "Enter results per metric. Add trials with **+ trial**; bilateral metrics have **Left** / **Right** columns.",
          "Click **Save Session**.",
        ],
      },
    ],
  },
  {
    id: "trials-and-best",
    category: "testing",
    title: "Trials — how the best is chosen",
    summary: "Log every attempt with + trial; the report uses the best trial (per the metric's direction).",
    keywords: ["trials", "attempts", "best trial", "multiple attempts"],
    body: [
      { type: "p", text: "Add as many attempts as you took with **+ trial** (**＋** in the group grid). The rating and progress comparisons use the **best** trial — the fastest time if lower is better, the highest value if higher is better." },
      { type: "p", text: "All trials are kept and appear in the raw CSV export." },
    ],
  },
  {
    id: "bilateral-asymmetry",
    category: "testing",
    title: "Bilateral metrics & asymmetry",
    summary: "Tick Bilateral (L/R) on the metric; reports then show a left/right imbalance screen.",
    keywords: ["bilateral", "asymmetry", "left right", "imbalance", "limb"],
    body: [
      { type: "p", text: "Mark a metric **Bilateral (L/R)** and test sessions get **Left** and **Right** columns. The test report includes an asymmetry section showing the percentage difference between sides, which is also summarised across a squad in the group Squad summary." },
    ],
  },
  {
    id: "bodyweight-in-testing",
    category: "testing",
    title: "Why bodyweight is asked for in testing",
    summary: "For relative-strength scores like force per kg. Required on metrics marked \"Requires bodyweight\".",
    keywords: ["bodyweight", "relative strength", "imtp", "n/kg", "per kg"],
    body: [
      { type: "p", text: "Some metrics (e.g. isometric mid-thigh pull) are scored relative to body mass — newtons per kilo, say. Those metrics have **Requires bodyweight** ticked, and the test session needs a bodyweight value to compute and rate them." },
      { type: "p", text: "The bodyweight field pre-fills from the athlete's Profile; edit it to the value on test day." },
    ],
  },
  {
    id: "age-at-test",
    category: "testing",
    title: "Age at test date",
    summary: "Calculated from the athlete's date of birth, or entered by hand. Drives age-matched norms.",
    keywords: ["age at test", "date of birth", "dob", "age", "norms"],
    body: [
      { type: "p", text: "If the athlete has a **Date of birth** on their Profile, the test session fills in their age on the test date automatically. Without a DOB, type the age manually so the report can still pick the right age band." },
      { type: "note", text: "No DOB and no manual age = no norm ratings on that session (the raw numbers still show)." },
    ],
  },
  {
    id: "edit-delete-test-session",
    category: "testing",
    title: "Editing or deleting a test session",
    summary: "On the athlete's 🧪 Testing page, each session card has ✎ edit and 🗑 delete.",
    keywords: ["edit test", "delete test", "fix test", "wrong result"],
    body: [
      { type: "p", text: "Open the athlete → **🧪 Testing**. Each logged session shows **✎** to edit values and **🗑** to delete it (with a confirm). Editing recomputes ratings and progress comparisons." },
    ],
  },
  {
    id: "test-report-individual",
    category: "testing",
    title: "Individual test reports",
    summary: "📄 View Report: Full / Progress / Raw, with a Compare-to control.",
    keywords: ["test report", "view report", "compare", "norms", "print", "pdf", "csv", "elite", "population", "ratings"],
    body: [
      { type: "p", text: "On the athlete's **🧪 Testing** page, click **📄 View Report**." },
      { type: "steps", items: [
        "Pick a mode: **Full report + norms**, **Progress only**, or **Raw data export**.",
        "**Ratings** — show **Elite + Population** (default), **Elite youth only**, or **General population only**. This also picks which norm drives the personalised commentary.",
        "With two or more sessions, set **Compare to** — **Previous test**, **Best previous result**, **First test**, or a specific earlier date.",
        "Full/Progress: click **🖨 Print / Save PDF**. Raw: click **⬇ Download CSV**.",
      ] },
    ],
  },
  {
    id: "group-testing-grid",
    category: "testing",
    title: "Group Testing (the grid)",
    summary: "Run a squad through one battery in a scrollable grid that autosaves as you type.",
    keywords: ["group testing", "grid", "squad test", "autosave", "batch test"],
    body: [
      {
        type: "steps",
        items: [
          "**Testing** → **Group Testing** tab → **+ New group session**.",
          "Name it, pick a **Battery** and **Date**, and select athletes (group chips bulk-select). Click **Start grid**.",
          "Athlete names run down the left; metrics run along the top. Type values straight into the cells — each one saves automatically, even if the connection drops.",
          "**＋ / －** in a cell adds or removes a trial. The coloured left border on a cell is its rating against the elite-youth norm.",
          "**+ Add athletes** to bring more people in. Click **Done** when finished.",
        ],
      },
      { type: "tip", text: "The banner at the top shows save status — \"All changes saved\", \"Saving…\", or a retry count if the signal is bad." },
    ],
  },
  {
    id: "group-testing-offline",
    category: "testing",
    title: "Does the Group Testing grid need a connection?",
    summary: "It saves continuously and retries dropped saves — keep the tab open.",
    keywords: ["group testing offline", "autosave", "connection", "retry", "lost data"],
    body: [
      { type: "p", text: "Every cell saves as you type (debounced by a fraction of a second). If a save fails, it's queued and retried automatically. The status banner tells you where things stand. As long as you don't close the tab before it reconnects, nothing is lost." },
    ],
  },
  {
    id: "group-test-reports",
    category: "testing",
    title: "Group test reports",
    summary: "The 📄 Reports ▾ menu — athlete reports, squad summary, print-all, ZIP.",
    keywords: ["group report", "squad summary", "batch print", "zip", "reports menu", "tier"],
    body: [
      { type: "p", text: "From a group session, open **📄 Reports ▾**. Set **Compare to** and **Ratings** (Elite + Population / Elite youth only / General population only) at the top — these apply to whichever report you open — then pick:" },
      { type: "steps", items: [
        "**Athlete reports** — flick through each athlete's report with Prev/Next.",
        "**Squad summary** — one landscape table: athletes × metrics, RAG-coloured, with Prev / Now / Δ and a squad-average row.",
        "**Print all — combined** — one print document, a page per athlete.",
        "**Download all as PDF ZIP** — one PDF per athlete, zipped.",
      ] },
      { type: "note", text: "All four are available free while VIS BUILD is in preview. Some may become plan-gated once paid plans launch — a 🔒 tag will show on anything your plan doesn't include." },
    ],
  },
  {
    id: "testing-schedule",
    category: "testing",
    title: "Retest reminders",
    summary: "The 🔬 Testing schedule card on the athlete page feeds the Dashboard.",
    keywords: ["retest", "test schedule", "test due", "reminder"],
    body: [
      { type: "p", text: "On the athlete page, the **🔬 Testing schedule** card takes a **Last test date** and a **Retest every N weeks**. It computes a **Next test due** date, and any athlete due within 14 days (or overdue) shows in the Dashboard's **Test week due** panel." },
    ],
  },
  {
    id: "fms-battery",
    category: "testing",
    title: "The FMS (Functional Movement Screen) battery",
    summary: "A built-in default battery on every organisation — the 7 FMS patterns, total score and clearing tests.",
    keywords: ["fms", "functional movement screen", "movement screen", "deep squat", "hurdle step", "clearing test", "cook", "21"],
    body: [
      { type: "p", text: "Every organisation has a ready-made **FMS (Functional Movement Screen)** battery under **Testing → Batteries** — no setup needed. Log it against an athlete like any other test (**🧪 Testing → + Log Session → FMS (Functional Movement Screen)**)." },
      { type: "subhead", text: "What's in it" },
      { type: "steps", items: [
        "The **7 movement patterns** — Deep Squat, Hurdle Step, In-Line Lunge, Shoulder Mobility, Active Straight-Leg Raise, Trunk Stability Push-Up, Rotary Stability. Each scored **0–3**. Hurdle Step, In-Line Lunge, Shoulder Mobility, ASLR and Rotary Stability are **bilateral** (Left / Right).",
        "**FMS Total Score** (0–21) — you add up the seven scores (lower side on each bilateral test) and enter it.",
        "The **3 clearing tests** — Shoulder, Extension, Flexion. Recorded as **0 = no pain** / **1 = pain**; a positive test scores its movement 0. These are screening-only (not RAG-rated).",
      ] },
      { type: "subhead", text: "How it rates" },
      { type: "p", text: "Each pattern: **3** is green, **2** amber, **0–1** red. Total: **15–21** green, **14** amber, **13 or below** red — the classic \"≤14 = elevated injury risk\" cut-point. FMS ratings don't need a date of birth (a 3 is a 3 at any age)." },
      { type: "note", text: "Any score of 0 (pain), or any left-right asymmetry, is worth attention regardless of the total. Don't want the clearing tests or the manual total? Remove them from the battery (Testing → Batteries → FMS → untick)." },
    ],
  },
  {
    id: "screening-metrics",
    category: "testing",
    title: "Screening-only metrics",
    summary: "Metrics tagged SCREEN are recorded for movement screening, not scored against norms.",
    keywords: ["screening", "screen tag", "movement screen", "fms"],
    body: [
      { type: "p", text: "A metric can be used purely for screening — you record the value but it isn't rated red/amber/green. Those show a **SCREEN** tag in the log session form and are reported as raw data." },
    ],
  },
  {
    id: "power-speed-page",
    category: "testing",
    title: "The athlete's Power / Speed page",
    summary: "10m / 20m / CMJ / RSI / broad jump / 505 — with RAG cards from your Settings benchmarks.",
    keywords: ["power speed", "sprint", "jump", "cmj", "rsi", "505", "benchmarks"],
    body: [
      { type: "p", text: "Open an athlete → **⚡ Power / Speed Benchmarks** card. It pulls together sprint, jump and change-of-direction results and colours each against the thresholds you set in **Settings → Power/Speed Benchmarks**." },
      { type: "p", text: "Results come from Power/Speed sessions and any matching logged exercises (matched by the benchmark's match phrases)." },
    ],
  },

  // ═══════════════════════ Reporting ═══════════════════════
  {
    id: "reporting-overview",
    category: "reporting",
    title: "Reporting: the two tabs",
    summary: "Athlete Reports and Squad Report, sharing one date range.",
    keywords: ["reporting", "reports", "training load", "squad report"],
    body: [
      { type: "p", text: "The **Reporting** page has **Athlete Reports** (a Training Load report per athlete) and **Squad Report** (leaderboards and trends for a group). They share the date range you set." },
      { type: "p", text: "You can also generate a single athlete's report from their page: **Manage** → **Reports**." },
      { type: "note", text: "Every report carries your branding at the top (your logo/colour on Premium, the wordmark otherwise) and a \"Produced using visbuild.co.uk\" credit at the foot — see the Branding article." },
    ],
  },
  {
    id: "training-load-report",
    category: "reporting",
    title: "Build a Training Load report",
    summary: "Pick athletes, a range, and which metrics and sections to include.",
    keywords: ["training load", "ttl", "tonnage", "e1rm", "report options", "srpe"],
    body: [
      {
        type: "steps",
        items: [
          "**Reporting** → **Athlete Reports**. Pick athletes or groups and a **Date range**.",
          "In **Metrics**, choose what to include: **Total Training Load (TTL)**, **Estimated 1RM (e1RM)**, and display parts like **AI summary**, **Highlights**, **Progression table**, **Sparklines**, **Line chart over time**.",
          "Turn on scope sections as needed: **Power/Speed**, **VBT (bar speed)**, **Cardio / Hybrid metric trends**, **Training load (sRPE)**, **Session RPE**, **Athlete notes**.",
          "If the athlete is in a squad, tick **Compare to squad** and pick the comparison metrics.",
          "Click **Generate report** (or use Preview / ZIP — see the next article).",
        ],
      },
      { type: "tip", text: "Use **🔍 Load exercise list** to hand-pick which lifts appear in trend charts, or leave it to auto-pick." },
    ],
  },
  {
    id: "ttl-explained",
    category: "reporting",
    title: "What is Total Training Load (TTL)?",
    summary: "Total tonnage — sets × reps × weight — summed across the range. Each-side exercises count double.",
    keywords: ["ttl", "total training load", "tonnage", "volume load", "how calculated"],
    body: [
      { type: "p", text: "TTL adds up sets × reps × weight for every completed set in the date range. An exercise flagged **Each side** counts both limbs, so its contribution doubles. Bodyweight-only and completion-only work contribute no tonnage." },
      { type: "note", text: "Primer / activation sessions are excluded from TTL." },
    ],
  },
  {
    id: "e1rm-explained",
    category: "reporting",
    title: "What is Estimated 1RM (e1RM)?",
    summary: "A one-rep-max estimated from your logged sets using the org's formula.",
    keywords: ["e1rm", "estimated 1rm", "one rep max", "epley", "confidence cap", "strength trend"],
    body: [
      { type: "p", text: "e1RM takes a completed set (weight and reps) and projects a 1RM using the formula set in **Settings → Calculations**. Plotting it over the range shows a strength trend without needing to actually max out." },
      { type: "steps", items: [
        "**Bodyweight-relative** expresses it per kg of body mass.",
        "**Low-confidence rep cap** ignores very high-rep sets, where the estimate gets unreliable.",
        "**Exercise limit** caps how many lifts appear in the radar/chart.",
      ] },
      { type: "note", text: "e1RM is a computed trend from training data. It's separate from the fixed values in the athlete's 1RM Tracker, which drive %1RM targets." },
    ],
  },
  {
    id: "srpe-training-load",
    category: "reporting",
    title: "Training load (sRPE)",
    summary: "Session RPE × session duration — a whole-body internal-load measure, separate from tonnage.",
    keywords: ["srpe", "session rpe", "internal load", "acwr", "training load"],
    body: [
      { type: "p", text: "When athletes log a **Session RPE** (1–10), the report can multiply it by session duration to give an sRPE load per session, then a weekly trend and a per-session list. It captures conditioning and skill work that tonnage misses." },
      { type: "p", text: "Tick **Training load (sRPE)** in the report options; add **List every session** for the full breakdown." },
      { type: "p", text: "For the return-to-play view of the same data — acute:chronic workload ratio, load-spike and monotony flags across every session type — see **Training load & return-to-play monitoring**." },
    ],
  },
  {
    id: "load-monitoring",
    category: "reporting",
    title: "Training load & return-to-play monitoring",
    summary: "Turns session RPE + duration into ACWR, load-spike and monotony flags for rehab and return-to-play decisions.",
    keywords: ["training load", "return to play", "return-to-play", "rtp", "acwr", "acute chronic", "workload ratio", "load spike", "monotony", "strain", "rehab", "reconditioning", "physio", "physiotherapist", "sports therapist", "srpe", "internal load", "injury risk"],
    body: [
      { type: "p", text: "Built for coaches working with a physiotherapist or sports therapist. It takes what athletes already log — a **session RPE** (1–10) and a **duration** — and turns it into the internal-load measures used for return-to-play and rehab progression, across **every** session type (Strength, Power/Speed, Hybrid, Cardio and Sport / Other)." },
      { type: "subhead", text: "The one number: session load (sRPE)" },
      { type: "p", text: "**Session load = RPE × duration in minutes** (Foster's sRPE). A 60-minute session at RPE 7 = 420. Sum a day, a week, and you have one figure that puts a gym session, a pitch session and a rehab circuit on the same scale." },
      { type: "note", text: "A session with an RPE but no duration is left out of the load figures (the report says how many). Strength and Power sessions need a duration — entered by you in the builder, or by the athlete when they log RPE — to count." },
      { type: "subhead", text: "Turn it on" },
      { type: "steps", items: [
        "**Settings → Training load & rehab → Track additional training load & rehab data**.",
        "Tick the elements you want: **ACWR**, **weekly load-spike alert**, **monotony & strain**, **return-to-play status**, **daily wellness questions**, **pain tracking**.",
        "Set your thresholds — the load-spike % and the ACWR sweet-spot band.",
      ] },
      { type: "note", text: "The ACWR / spike / monotony analytics and the Sport / Other session type apply to your whole roster. The **pain and wellness check-in questions** only reach an athlete once you set their **Availability** to something other than “Available” — so you're not asking healthy athletes to rate their pain every day." },
      { type: "subhead", text: "Where you read it" },
      { type: "steps", items: [
        "**Dashboard** → a **Load flags** panel (athletes whose ACWR, weekly spike or monotony crossed a threshold) and an **Availability** panel.",
        "**Athlete → Dashboard tab** → ACWR and Availability tiles in the metric strip.",
        "**Reporting** → tick **Training load & ACWR**, pick a **26-week** range → the ACWR chart, weekly load with % change, and the monotony/strain table. It's also fed into the AI summary.",
      ] },
      { type: "tip", text: "For a meaningful ACWR you need roughly 4 weeks of consistent logging first — it compares the last 7 days against the last 28." },
      { type: "note", text: "It's one org-wide toggle with per-element tick-boxes. A pure strength & conditioning coach who leaves it off sees no change anywhere, and the **Sport / Other** session type stays hidden." },
    ],
  },
  {
    id: "acwr-explained",
    category: "reporting",
    title: "ACWR, load spike & monotony — what they mean",
    summary: "Plain definitions of the return-to-play load metrics and how to read the flags.",
    keywords: ["acwr", "acute chronic workload ratio", "load spike", "monotony", "strain", "foster", "sweet spot", "detraining", "return to play", "how calculated", "injury risk"],
    body: [
      { type: "subhead", text: "ACWR — acute:chronic workload ratio" },
      { type: "p", text: "The last **7 days** of session load divided by the average week across the last **28 days**. Around **1.0** means this week matches recent training. The default **sweet spot is 0.8–1.3** (you can change it): below suggests detraining or lost fitness; above means load is climbing faster than the body has adapted to — where injury risk rises. Shown as a line chart with the band shaded, plus the latest value." },
      { type: "subhead", text: "Weekly load-spike alert" },
      { type: "p", text: "Flags any week whose total load is more than a set percentage (default **50%**) above the average of the previous four weeks. A blunter, easier-to-explain version of ACWR — good for catching a heavy match week or an over-ambitious return." },
      { type: "subhead", text: "Monotony & strain (Foster)" },
      { type: "p", text: "**Monotony** = the week's average daily load ÷ its day-to-day variation. A high value (flagged above **2.0**) means every day looked the same — no hard/easy structure, which is itself a risk factor. **Strain** = weekly load × monotony, so a big unvarying week scores highest." },
      { type: "note", text: "All of these are built on athlete-reported RPE and duration. They're decision support for a coach and physio, not a diagnosis." },
    ],
  },
  {
    id: "report-presets",
    category: "reporting",
    title: "Report presets",
    summary: "Save a set of report options and reuse it — shared across your org.",
    keywords: ["preset", "save options", "report template"],
    body: [
      { type: "p", text: "Once your **Metrics** options are set the way you like, use **Save current metrics as a preset** — name it and click **💾 Save**. Load it later from the **Load preset** dropdown. Presets are shared with every coach in your org and also appear in the athlete-page report modal." },
    ],
  },
  {
    id: "report-preview-vs-zip",
    category: "reporting",
    title: "Preview one report vs download a ZIP",
    summary: "👁 Preview / print 1 report, or 📦 Download reports as ZIP for the whole selection.",
    keywords: ["preview", "zip", "download", "bulk reports", "pdf", "ai calls"],
    body: [
      { type: "steps", items: [
        "**👁 Preview / print 1 report** opens the first selected athlete's report in a new tab to check the layout.",
        "**📦 Download reports (N) as ZIP** builds a PDF for every selected athlete and zips them.",
        "**Include AI summary** adds the written summary — one extra AI generation per athlete. Leave it off for a quick numbers-only export.",
      ] },
      { type: "note", text: "Charts are disabled in the bulk PDF export to keep it fast and small. Use a single on-screen report if you need the charts." },
    ],
  },
  {
    id: "ai-summary",
    category: "reporting",
    title: "The AI summary on reports",
    summary: "An optional written summary of the numbers. Re-running with no new data is free.",
    keywords: ["ai", "summary", "written report", "cost", "tokens"],
    body: [
      { type: "p", text: "When **AI summary** is ticked, the report includes a short written interpretation of the athlete's data for that range. It's optional — untick it and the report is all tables and charts." },
      { type: "p", text: "If you re-open, re-print or re-export a report and nothing has changed underneath, the summary is served from a cache — no new generation. Log new sets and the next run refreshes it." },
      { type: "p", text: "Add a **Context for AI summary** note (goals, injuries, what block they're in) to steer it. Treat the output as a first draft, not gospel — you know the athlete." },
    ],
  },
  {
    id: "squad-report",
    category: "reporting",
    title: "Squad reports",
    summary: "Leaderboards and per-athlete trend sheets for a whole group.",
    keywords: ["squad report", "leaderboard", "group report", "team report"],
    body: [
      {
        type: "steps",
        items: [
          "**Reporting** → **Squad Report**. Pick a group and a date range.",
          "In **Leaderboards**, tick what to rank: **Total Training Load**, **Estimated 1RM**, **Power / Speed**, **Cardio / Hybrid**, **Session completion**.",
          "For the PDF, tick **per-athlete exercise trend charts** (tonnage / e1RM).",
          "Click **🏆 Generate squad report**. Boards render on screen; **🖨 Print / download PDF** for the document.",
        ],
      },
    ],
  },
  {
    id: "squad-comparison-requirements",
    category: "reporting",
    title: "\"Compare to squad\" isn't available",
    summary: "The athlete must be in a group and squad comparison must be enabled.",
    keywords: ["compare to squad", "squad comparison", "benchmark against team", "missing option"],
    body: [
      { type: "steps", items: [
        "The athlete needs a **Group** on their Profile — the comparison is against that squad.",
        "**Settings → Squad Comparison → Enable squad comparison in reports** must be on.",
        "It can also be turned off for one athlete on their Profile.",
      ] },
    ],
  },
  {
    id: "exercise-missing-from-report",
    category: "reporting",
    title: "An exercise isn't showing in a report",
    summary: "Name mismatch, out of the date range, a primer session, or filtered out by session type.",
    keywords: ["exercise missing", "not in report", "no data", "chart empty"],
    body: [
      { type: "steps", items: [
        "The exercise name must match across sessions — \"Back Squat\" and \"Backsquat\" are treated as different lifts.",
        "Only completed sets inside the **date range** count.",
        "Sets in **Primer / activation** sessions are excluded.",
        "Check the **Session types** pills in the report options — unticking Strength hides strength work, etc.",
        "Trend charts auto-pick a limited number of exercises; use **🔍 Load exercise list** to force one in.",
      ] },
    ],
  },
  {
    id: "report-date-ranges",
    category: "reporting",
    title: "Report date ranges",
    summary: "Defaults to the last 4 weeks; switch to other presets or a custom start/end.",
    keywords: ["date range", "4 weeks", "custom range", "period"],
    body: [
      { type: "p", text: "The **Date range** card defaults to the last four weeks. Use the preset buttons for other windows, or **Custom** to set an exact start and end date. Athlete Reports and Squad Report share whatever you set." },
    ],
  },
  {
    id: "what-counts-as-a-session",
    category: "reporting",
    title: "Session completion — how it's counted",
    summary: "Completed sets ÷ prescribed sets, ignoring opted-out exercises.",
    keywords: ["completion", "adherence", "percent complete", "sessions logged"],
    body: [
      { type: "p", text: "A session's completion is the number of sets the athlete marked done divided by the number prescribed. Exercises the athlete skipped/opted out of are removed from both sides, so skipping isn't punished as \"incomplete\"." },
      { type: "p", text: "The Dashboard's **Below 70% completion** panel and the report's completion figures use this." },
    ],
  },

  // ═══════════════════════ Community & messaging ═══════════════════════
  {
    id: "community-overview",
    category: "community",
    title: "Community: the tabs",
    summary: "Groups, Announcements, PB Feed, Competitions, Chat.",
    keywords: ["community", "social", "feed", "announcements"],
    body: [
      { type: "steps", items: [
        "**👥 Groups** — structured squads with members (needed for Chat and challenges).",
        "**📢 Announcements** — post news to everyone or one group.",
        "**🏆 PB Feed** — recent personal bests, with reactions and comments.",
        "**🏁 Competitions** — upcoming/past events athletes can react and comment on.",
        "**💬 Chat** — real-time group chat, per group.",
      ] },
    ],
  },
  {
    id: "community-groups",
    category: "community",
    title: "Create a Community group",
    summary: "Community → Groups → + New group, then add members.",
    keywords: ["group", "squad", "members", "create group"],
    body: [
      {
        type: "steps",
        items: [
          "**Community** → **Groups** → **+ New group**. Set a name, optional description and a colour. **Create group**.",
          "On the group card, click **Manage ▼** and add athletes with the **+ {name}** buttons.",
        ],
      },
      { type: "note", text: "You need at least one group before **Chat** works and before you can run a structured challenge against a squad. Deleting a group doesn't delete athletes." },
    ],
  },
  {
    id: "announcements",
    category: "community",
    title: "Post an announcement",
    summary: "Community → Announcements → compose, target everyone or a group, optionally pin.",
    keywords: ["announcement", "notice", "broadcast", "pin"],
    body: [
      {
        type: "steps",
        items: [
          "**Community** → **Announcements**.",
          "Type a **Title** and optional **Message**. Choose **📢 All athletes** or a specific group.",
          "Tick **📌 Pin** to keep it at the top. Click **Post**.",
        ],
      },
      { type: "p", text: "Athletes see announcements aimed at them or their groups under **💬 Community** in their app. Delete one with its **Delete** link." },
    ],
  },
  {
    id: "pb-feed",
    category: "community",
    title: "The PB Feed",
    summary: "React and comment on your athletes' personal bests.",
    keywords: ["pb feed", "personal best", "reactions", "kudos"],
    body: [
      { type: "p", text: "**Community** → **🏆 PB Feed** lists recent PBs. Tap **🔥 💪 ⭐ 👏** to react, or **💬** to comment. The Dashboard's **Recent PBs** panel links straight here. The **✕** deletes a PB (with a confirm)." },
      { type: "note", text: "Hidden entirely if Personal Bests is turned off for your org. Athletes who've chosen \"hide my PBs\" don't appear in other athletes' feed, but you still see them." },
    ],
  },
  {
    id: "leaderboards",
    category: "community",
    title: "Community leaderboards",
    summary: "Age-banded, boys/girls rankings for testing metrics and picked strength lifts.",
    keywords: ["leaderboard", "leaderboards", "ranking", "rankings", "age band", "age group", "relative strength", "table", "compare athletes"],
    body: [
      { type: "p", text: "**Settings → Community leaderboards → Enable leaderboards** adds a **🥇 Leaderboards** tab to Community — yours and the athletes'. Off by default." },
      { type: "subhead", text: "What's ranked" },
      { type: "steps", items: [
        "**Testing metrics** — tick the ones you want under Settings (bilateral / per-side metrics can't be ranked and aren't listed). Leave it untouched and every eligible metric is included. Ranked on the best recorded value, using the metric's better-direction.",
        "**Strength lifts** — the ones you pick under Settings. Ranked on each athlete's best PB. Per lift, tick **×BW** for a relative board (weight ÷ bodyweight), **kg** for an absolute board, or both — each ticked option is its own row. An athlete with no bodyweight recorded is left off that lift's ×BW board.",
      ] },
      { type: "subhead", text: "Age groups view" },
      { type: "p", text: "Tests run down the left, age groups across the top. Each strength row is labelled with its unit (**· ×BW** or **· kg**). Each box shows that group's **leader** (name + score). Tap a box for the full ranking. A **Boys / Girls** toggle sits above. The bands mirror your testing norms with **16–17** and **18+** always added on top." },
      { type: "subhead", text: "Squads view" },
      { type: "p", text: "Switch the toggle to **Squads** and pick a squad to see its **top 5** for every exercise and test — one combined list per board, no age or sex split. Exercises and tests no one in the squad has done are hidden. Coaches can pick any squad; athletes see only squads they're in (the toggle is hidden if they're in none)." },
      { type: "p", text: "Within Squads, a **List / Table** toggle switches between stacked top-5 lists (with **Show all** to see the whole squad) and a table with the five places across the top and exercises down the side." },
      { type: "subhead", text: "Print / PDF" },
      { type: "p", text: "The **Print / PDF** button (top right) opens a clean printable version of whatever's on screen — the age-group table for the selected sex, or the selected squad's top 5 — ready to print or save as PDF." },
      { type: "note", text: "Names show first name only. A surname initial is added when two athletes in the same list share a first name." },
      { type: "note", text: "Athletes who've chosen \"hide my PBs from the feed\" don't appear on any board. Names follow each athlete's \"first name only\" preference. Athletes with no date of birth or sex on file are left off." },
    ],
  },
  {
    id: "competitions",
    category: "community",
    title: "Competitions",
    summary: "Log an athlete's events; the squad can react and comment.",
    keywords: ["competition", "event", "fixture", "meet"],
    body: [
      {
        type: "steps",
        items: [
          "**Community** → **🏁 Competitions** → **+ Add**.",
          "Pick the athlete, an **Event name**, date, and optional location/notes. **Save**.",
        ],
      },
      { type: "p", text: "Events split into Upcoming and Past, each with reactions and comments. Athletes also have a competitions feed where they can log their own results." },
    ],
  },
  {
    id: "messaging",
    category: "community",
    title: "Direct messages with an athlete",
    summary: "Manage → 💬 Message, or the Dashboard's Athlete messages panel. Text and voice notes.",
    keywords: ["message", "dm", "direct message", "voice note", "chat with athlete"],
    body: [
      { type: "p", text: "Open a thread from the athlete page (**Manage** → **💬 Message**) or from the Dashboard's **Athlete messages** panel — on the Dashboard it opens as a pop-up so you can read and reply without leaving the page. Tick **✓** on a message to clear it off the Dashboard. The **Session comments** panel has a **💬** button to message the athlete about their note." },
      { type: "p", text: "There's one thread per athlete, and every coach in your org can see it. Send text or record a voice note. The athlete gets a push notification (if they've enabled it)." },
      { type: "p", text: "On your own messages, **Edit** (text messages) and **Delete** appear under the message. Editing marks it \"edited\"; deleting removes it for everyone, including the athlete." },
    ],
  },
  {
    id: "who-sees-messages",
    category: "community",
    title: "Who can see my messages with an athlete?",
    summary: "Every coach in your organisation shares the athlete's 1:1 thread. Athletes never see coach-to-coach chat.",
    keywords: ["message privacy", "who sees", "private message", "coach visibility"],
    body: [
      { type: "p", text: "The direct thread with an athlete is shared across your coaching team — any coach with access to that athlete sees the full history. It's designed for continuity of care, not private side conversations." },
      { type: "p", text: "The athlete only ever sees their own thread with \"the coaches\". They can't see other athletes' threads or anything coaches post between themselves." },
    ],
  },
  {
    id: "group-chat",
    category: "community",
    title: "Group chat",
    summary: "Community → Chat, scoped to a Community group. Text and voice notes.",
    keywords: ["group chat", "squad chat", "team chat"],
    body: [
      { type: "p", text: "**Community** → **💬 Chat**, then pick a group. Messages are real-time for you; athletes see the chat in their app under **Community**. Voice notes are supported." },
      { type: "p", text: "Under each of your own messages: **Edit** (text only) and **Delete**. An edited message is marked \"edited\"; a deleted one is removed for the whole group." },
      { type: "note", text: "Chat needs a Community group with members — create one first. You can edit/delete your own messages, not a colleague's or an athlete's." },
    ],
  },
  {
    id: "voice-notes",
    category: "community",
    title: "Voice notes",
    summary: "Record and send audio in direct messages and group chat, on both apps.",
    keywords: ["voice note", "audio message", "record", "playback"],
    body: [
      { type: "p", text: "In any message thread or group chat, use the voice-note recorder next to the text box: tap to record, tap to stop, send. Voice notes play inline for whoever receives them, on both the coach and athlete apps." },
    ],
  },
  {
    id: "realtime-vs-polling",
    category: "community",
    title: "Why chat messages take a few seconds to appear",
    summary: "The athlete app checks for new messages every few seconds rather than pushing instantly.",
    keywords: ["chat delay", "not instant", "realtime", "slow messages", "polling"],
    body: [
      { type: "p", text: "Because athletes have no login session, their app polls for new chat and DM messages every few seconds rather than receiving them instantly. A short delay is normal. Push notifications (if enabled) alert them to a new coach message straight away." },
    ],
  },
  {
    id: "checkins-explained",
    category: "community",
    title: "Daily readiness check-ins",
    summary: "Four questions the athlete answers before a session; you see the flags on the Dashboard.",
    keywords: ["check in", "readiness", "wellness", "monitoring", "lock programme"],
    body: [
      { type: "p", text: "The check-in is four 1–5 questions — Energy, Sleep, Soreness, Volume tolerance — one per day per athlete. Based on your rules, the app suggests adaptations (reduce load, skip sore-muscle work, etc.)." },
      { type: "subhead", text: "Turn it on" },
      { type: "p", text: "**Settings** → **Check-in** → **Enable session check-in** (and it can be turned off per athlete on their Profile)." },
      { type: "subhead", text: "Lock until checked in" },
      { type: "p", text: "The same section has **Lock programme until check-in completed** — the athlete can't log today's programmed session until they've done their check-in. Past, future and library sessions are never locked." },
      { type: "subhead", text: "Where you see the results" },
      { type: "p", text: "The Dashboard's **Poor check-ins today** panel lists athletes whose answers flagged something. You can also open the check-in (advisory) from Live group." },
      { type: "note", text: "With **Track additional training load & rehab data** on, athletes whose **Availability** isn't set to “Available” also get **fatigue**, **life stress** and a **0–10 pain score** with a body-area — see **Sport sessions & the pain check-in**. Pain, high fatigue and high stress flag on the Dashboard too." },
    ],
  },
  {
    id: "checkin-rules-editing",
    category: "community",
    title: "Editing the check-in recommendations",
    summary: "Settings → Check-in: choose the action for each flagged condition, plus custom advice.",
    keywords: ["check in rules", "recommendations", "adaptations", "conditions"],
    body: [
      { type: "p", text: "Under **Settings → Check-in**, for each condition (low energy, poor sleep, high soreness, low volume tolerance) pick the recommendation the athlete sees — or choose **custom** and write your own." },
      { type: "p", text: "High soreness has a secondary \"Also recommend\" line. **Additional custom suggestions** are shown to every athlete on every check-in regardless of their answers." },
    ],
  },
  {
    id: "weekly-reflection-setup",
    category: "community",
    title: "Weekly reflections",
    summary: "A prompt on the athlete's calendar with score metrics and three written prompts.",
    keywords: ["weekly reflection", "reflection", "sunday", "saturday", "review", "journaling"],
    body: [
      { type: "p", text: "**Settings → Weekly Reflection → Enable weekly reflections**. Then define the **Score metrics** the athlete rates 1–5 each week (drag to reorder, **+ Add metric**) and the three **Reflection prompts** (Good / Better / How)." },
      { type: "p", text: "The prompt sits on the athlete's calendar for the **week being viewed**. The current week's reflection is **read-only until Saturday** (\"Opens Sat\") — they can fill it in on the Saturday or Sunday. A past week they missed stays open: they scroll the calendar back to that week and complete it there. Saved reflections can still be edited." },
    ],
  },
  {
    id: "recovery-alerts-setup",
    category: "community",
    title: "Recovery alerts on the Dashboard",
    summary: "Flag athletes with repeated low recovery/check-in scores.",
    keywords: ["recovery alert", "poor recovery", "dashboard flag", "monitoring"],
    body: [
      { type: "p", text: "**Settings → Recovery alerts → Flag poor recovery on the dashboard**. Set the trigger to **1 / 2 / 3** low scores within 7 days. Athletes over the threshold appear in the Dashboard's **Poor recovery (last 7 days)** panel with an \"Nx low\" badge." },
    ],
  },

  // ═══════════════════════ Documents & challenges ═══════════════════════
  {
    id: "documents",
    category: "documents-challenges",
    title: "Share documents and links",
    summary: "Upload files or link URLs to one athlete, a group, or everyone.",
    keywords: ["documents", "files", "pdf", "upload", "share resource", "video link"],
    body: [
      { type: "p", text: "The **Documents** page has six buttons: **⬆ Upload** or **🔗 Link**, each to an **athlete**, a **group**, or **everyone**." },
      {
        type: "steps",
        items: [
          "Pick the target (athlete search / group / everyone).",
          "**Upload**: drop a **PDF, Word or Excel** file (max 10 MB), add a title and optional note.",
          "**Link**: paste a URL (e.g. a YouTube video), add a title.",
          "Click **Save** / **Send to group** / **Send to everyone**.",
        ],
      },
      { type: "p", text: "Athletes see these under **📁 Docs** in their app — **Open** for files, **Watch** for video links." },
    ],
  },
  {
    id: "document-limits",
    category: "documents-challenges",
    title: "Document types & size limits",
    summary: "PDF, Word and Excel files up to 10 MB. Anything else, use a link.",
    keywords: ["file type", "file size", "10mb", "upload limit", "pdf word excel"],
    body: [
      { type: "p", text: "Uploads must be PDF, Word (.doc/.docx) or Excel (.xls/.xlsx) and no larger than 10 MB. For videos, images, Google Docs, or big files, use **🔗 Link** and paste the URL instead." },
    ],
  },
  {
    id: "document-not-opening",
    category: "documents-challenges",
    title: "A document won't open",
    summary: "File links are time-limited — close and reopen to get a fresh one.",
    keywords: ["document not opening", "link expired", "can't open file", "broken document"],
    body: [
      { type: "p", text: "File links are signed and expire after a short window for security. If **Open** fails, go back to the Documents list (or the athlete's Docs tab) and click it again to generate a fresh link. Video links go to the third-party site and depend on that site being up." },
    ],
  },
  {
    id: "challenges-overview",
    category: "documents-challenges",
    title: "Challenges",
    summary: "Gym challenges with squad leaderboards. Enable in Settings first.",
    keywords: ["challenge", "leaderboard", "competition", "skierg", "ranking"],
    body: [
      { type: "note", text: "The **Challenges** sidebar item only appears when **Settings → Challenges → Enable Challenges** is on (and it can be turned off per athlete)." },
      {
        type: "steps",
        items: [
          "**Challenges** → **+ New**.",
          "Set a **Name**, pick **Equipment**, then the **Metric to rank by** and the **Ranking direction** (higher or lower is better).",
          "Optionally set a **Duration cap** (e.g. 30 seconds). Tick **Reuse** to save it as a reusable challenge (leave off for a one-off).",
          "Click **Save**. Open the challenge to log results per athlete, and see the **Leaderboard**.",
        ],
      },
      { type: "tip", text: "You can also launch and log challenges live from the **🏆** button in Live group." },
    ],
  },
  {
    id: "challenge-metrics-equipment",
    category: "documents-challenges",
    title: "Challenge equipment & metrics",
    summary: "Picking equipment narrows the metrics you can rank by.",
    keywords: ["challenge equipment", "challenge metric", "erg", "narrow", "options"],
    body: [
      { type: "p", text: "In the challenge form, choosing **Equipment** (SkiErg, Row, Bike, Treadmill, None…) restricts the **Metric to rank by** list to the ones that equipment supports. The **Duration cap** just describes the task (e.g. \"30-second sprint\") — it isn't itself ranked." },
    ],
  },
  {
    id: "challenge-results",
    category: "documents-challenges",
    title: "Logging challenge results",
    summary: "Coach logs from the challenge page or Live group; athletes can log their own.",
    keywords: ["log challenge", "challenge result", "who logs", "leaderboard entry"],
    body: [
      { type: "p", text: "Open a challenge and, per athlete in a chosen squad, type the value and **Save**. You can also do this live from Live group's **🏆** button. Athletes can log their own results from **🏆 Challenges** in their app — those are marked as athlete-entered." },
      { type: "p", text: "The **Leaderboard** ranks by the challenge's direction (higher or lower better), grouped by squad." },
    ],
  },

  // ═══════════════════════ Settings & admin ═══════════════════════
  {
    id: "settings-overview",
    category: "settings",
    title: "Settings: what applies where",
    summary: "Settings are org-wide and auto-save. Some areas are owner-only.",
    keywords: ["settings", "preferences", "org", "auto save", "owner"],
    body: [
      { type: "p", text: "**Settings** preferences apply to your whole organisation and save automatically (a \"✓ Saved\" indicator appears)." },
      { type: "note", text: "Only the organisation **owner** can change org-wide settings, Billing, Branding and the Team. Other coaches see these as read-only. Everyone can set their own profile and push preferences." },
    ],
  },
  {
    id: "calculations-units",
    category: "settings",
    title: "1RM formula, 1RM source & units",
    summary: "How %1RM targets are calculated, and kg vs lbs display.",
    keywords: ["1rm formula", "epley", "brzycki", "lander", "rolling", "fixed", "kg", "lbs", "units"],
    body: [
      { type: "steps", items: [
        "**Calculations → 1RM estimation formula** — pick the formula (Lander is the default) used to estimate a 1RM from a set.",
        "**1RM source for %1RM targets** — **Rolling** (estimated from each athlete's training logs) or **Fixed** (the values you set in each athlete's 1RM Tracker, falling back to rolling if unset).",
        "**Units → Weight unit** — **kg** or **lbs**. This is display only; data is always stored in kg.",
      ] },
    ],
  },
  {
    id: "1rm-formulas-explained",
    category: "settings",
    title: "Which 1RM formula should I pick?",
    summary: "They differ most at higher reps. Lander is a solid default; pick one and stay consistent.",
    keywords: ["1rm formula", "epley", "brzycki", "lander", "lombardi", "which formula", "estimate max"],
    body: [
      { type: "p", text: "All the formulas estimate a 1RM from a weight-and-reps set. At 1–3 reps they agree closely; they diverge as reps climb. Epley tends to read higher at high reps, Brzycki lower, Lander sits between." },
      { type: "note", text: "The exact formula matters less than consistency — changing it shifts every athlete's e1RM trend and %1RM targets, so choose one early and leave it." },
    ],
  },
  {
    id: "rolling-vs-fixed-1rm",
    category: "settings",
    title: "Rolling vs fixed 1RM source",
    summary: "Rolling adapts automatically from logs; Fixed uses the numbers you set and control.",
    keywords: ["rolling", "fixed", "1rm source", "%1rm targets", "estimate vs set"],
    body: [
      { type: "p", text: "**Rolling** keeps %1RM targets current from recent training with no upkeep, but moves around with day-to-day performance. **Fixed** gives you exact control — targets only change when you update the 1RM Tracker — but needs maintaining, and falls back to rolling for any exercise with no fixed value." },
      { type: "tip", text: "Many coaches run Fixed for the main barbell lifts they test, and let rolling cover everything else." },
    ],
  },
  {
    id: "feature-toggles",
    category: "settings",
    title: "Every feature toggle in one place",
    summary: "What each Settings switch does, and which ones have per-athlete overrides.",
    keywords: ["toggles", "enable", "disable", "hybrid", "pbs", "challenges", "recovery", "reflection"],
    body: [
      { type: "steps", items: [
        "**Enable Hybrid sessions** — shows the Hybrid session type. Per-athlete override: yes.",
        "**Enable Personal Bests** — PB detection, celebration popup, feed and history. Per-athlete override: yes.",
        "**Enable Challenges** — the Challenges nav item and the Live group launcher. Per-athlete override: yes.",
        "**Enable squad comparison in reports** — the \"Compare to squad\" option on reports. Per-athlete override: yes.",
        "**Enable session check-in** — plus **Lock programme until check-in completed** and the per-condition recommendation rules. Per-athlete override: yes.",
        "**Flag poor recovery on the dashboard** — the Dashboard recovery panel; set how many low scores in 7 days triggers it.",
        "**Enable weekly reflections** — a reflection prompt on the athlete's calendar (read-only until Saturday, missed weeks stay open to back-fill), with your score metrics and prompts.",
        "**Report reminder frequency** — drives the Dashboard \"Reports due\" panel.",
        "**Enable MAS & heart-rate zones** — the aerobic profile on athlete pages, the Z1–Z5 picker on Cardio/Hybrid sessions, and the athlete zone table.",
        "**Track additional training load & rehab data** — ACWR, load-spike and monotony flags, a return-to-play status per athlete, the Sport / Other session type, and pain/wellness questions on the check-in. Each element has its own tick-box.",
        "**Enable leaderboards** — a Community tab with age-banded, boys/girls rankings for testing metrics and the strength lifts you pick.",
        "**Let athletes set goals from their test results** (Settings → Goals) — athletes can turn a test result into a target on their Goals page. Off = coach-only; they still see test goals you set.",
      ] },
    ],
  },
  {
    id: "load-monitoring-setup",
    category: "settings",
    title: "Turn on training-load & rehab monitoring",
    summary: "Settings → Training load & rehab: one master toggle, then tick the elements you want.",
    keywords: ["training load", "rehab", "return to play", "acwr", "enable", "toggle", "pain tracking", "wellness", "monotony", "load spike", "physio settings", "sport session"],
    body: [
      { type: "p", text: "**Settings → Training load & rehab → Track additional training load & rehab data** is the master switch (owner only). Off by default — nothing about it shows until you turn it on." },
      { type: "subhead", text: "The tick-boxes" },
      { type: "steps", items: [
        "**Acute:chronic workload ratio (ACWR)** — the ACWR chart and dashboard flag.",
        "**Weekly load-spike alert** — dashboard flag for a week well above the recent average.",
        "**Monotony & strain** — Foster's measures in the report.",
        "**Return-to-play / availability status** — the status field on each athlete, plus its badges and panels.",
        "**Daily wellness questions** — adds fatigue and life-stress to the daily check-in.",
        "**Pain tracking** — adds a 0–10 pain score and body-area to the daily check-in.",
      ] },
      { type: "note", text: "The wellness and pain questions are only asked of athletes whose **Availability** is set to anything other than **Available** — so the availability status is the on/off for an individual athlete. Healthy athletes keep the original 4-question check-in. To keep the questions running for a cleared athlete you still want to watch, tick **Keep the pain & wellness questions on** in the Availability box on their profile." },
      { type: "subhead", text: "Thresholds" },
      { type: "p", text: "Set the **weekly load-spike %** (default 50) and the **ACWR sweet-spot band** (default 0.8–1.3). These decide when an athlete gets flagged." },
      { type: "note", text: "Turning the master toggle back off hides every part of the feature but keeps the data — including any Sport / Other sessions already logged." },
    ],
  },
  {
    id: "power-speed-benchmarks",
    category: "settings",
    title: "Power / Speed benchmarks",
    summary: "The match-phrase rows that colour the athlete Power/Speed dashboard.",
    keywords: ["power speed", "benchmark", "sprint", "jump", "match phrase", "rag", "thresholds"],
    body: [
      { type: "p", text: "**Settings → Power/Speed Benchmarks**. Each row is a benchmark: an icon, name, unit, **match phrases** (comma-separated — an exercise counts if its logged name contains any phrase), a **Lower is better** checkbox, and **Green** / **Amber** thresholds." },
      { type: "p", text: "These drive the red/amber/green cards on an athlete's **⚡ Power / Speed** page. Click **+ Add benchmark** to add one." },
    ],
  },
  {
    id: "change-org-name",
    category: "settings",
    title: "Changing your organisation name",
    summary: "The internal org name is set at sign-up; contact support to change it. Premium sets a separate brand name.",
    keywords: ["organisation name", "org name", "rename organisation", "business name"],
    body: [
      { type: "p", text: `Your organisation's name (from sign-up) isn't editable in the app — email **${SUPPORT}** to change it.` },
      { type: "p", text: "On the **Premium** branding tier, the **Brand name** in Settings → Branding is what your athletes see, and you control that yourself regardless of the internal org name." },
    ],
  },
  {
    id: "team",
    category: "settings",
    title: "Invite and manage coaches",
    summary: "Settings → Team: invite colleagues, set roles and per-coach athlete access.",
    keywords: ["team", "coaches", "invite coach", "colleague", "assigned athletes", "roles"],
    body: [
      { type: "note", text: "Owner only." },
      {
        type: "steps",
        items: [
          "**Settings → 👥 Team → + Invite coach**. Enter their **Email** (and optional name) and **Send invite** — they get an email link to join.",
          "New coaches are **Pending** until their first login, then **Active**.",
          "Per coach you can set **All athletes** or **Assigned only**; for the latter, **Manage athletes (N)** picks which.",
          "Use **Revoke** (pending), **Archive** / **Reactivate** (active) to manage access.",
        ],
      },
      { type: "note", text: "The coach seat limit is separate from athlete seats and isn't self-serve — contact support to add coach seats." },
    ],
  },
  {
    id: "invite-coach-troubleshooting",
    category: "settings",
    title: "Coach invite problems",
    summary: "Common messages: already registered, pending invite exists, previously removed.",
    keywords: ["invite coach", "coach can't join", "invite error", "already registered", "reactivate coach"],
    body: [
      { type: "steps", items: [
        "\"Already registered to a coach account in another organisation\" — that email belongs to a different org. Use another address, or have them leave the other org first.",
        "\"Already has a pending invite\" — the invite's already been sent; ask them to check spam.",
        "\"Was previously removed. Reactivate them from the Team list\" — don't re-invite; find them in the Team list and click **Reactivate**.",
        "Invite email not arriving — check spam; resend by revoking and inviting again.",
      ] },
    ],
  },
  {
    id: "coach-athlete-access",
    category: "settings",
    title: "Limiting a coach to certain athletes",
    summary: "Set a coach to \"Assigned only\" and choose their athletes.",
    keywords: ["assigned only", "coach access", "restrict coach", "which athletes"],
    body: [
      { type: "p", text: "In **Settings → Team**, each non-owner coach has an access dropdown: **All athletes** or **Assigned only**. Choose **Assigned only** and click **Manage athletes (N)** to pick exactly who they can see and coach." },
      { type: "p", text: "An assigned-only coach won't see unassigned athletes anywhere — list, Dashboard, Live group, reports, pickers." },
    ],
  },
  {
    id: "settings-not-saving",
    category: "settings",
    title: "My settings changes aren't saving",
    summary: "Org-wide settings, Billing, Branding and Team are owner-only.",
    keywords: ["settings not saving", "read only", "can't change", "greyed out", "disabled"],
    body: [
      { type: "p", text: "If the settings fields are disabled and there's a note about org-wide settings, you're not the organisation owner. Only the owner can change these. Ask your owner to make the change, or to transfer ownership (email support)." },
      { type: "p", text: "Your own profile and push preferences at the top of the page are always editable." },
    ],
  },
  {
    id: "branding",
    category: "settings",
    title: "Branding",
    summary: "Accent colour on every plan; brand name and logo on Premium (white-label).",
    keywords: ["branding", "logo", "colour", "white label", "premium", "brand name"],
    body: [
      { type: "p", text: "**Settings → 🎨 Branding**. Every plan can set an **Accent colour** (presets or a custom picker) — it applies across your dashboard and the athlete app." },
      { type: "p", text: "**Premium** adds white-labelling: a **Brand name** and **Logo** (PNG or SVG, max 2 MB) that replace \"VIS BUILD\" for your athletes, plus an optional powered-by footer toggle." },
      { type: "p", text: "**On reports** (Training Load, Testing, Squad and the Leaderboards print — printed or saved as PDF) your branding sits at the **top**: your logo and accent colour on Premium, otherwise the \"VIS BUILD\" wordmark in your accent colour. A small **\"Produced using visbuild.co.uk\"** credit always appears at the **foot** of every report." },
      { type: "note", text: "Owner only. Premium isn't self-serve — contact support to upgrade your organisation." },
    ],
  },
  {
    id: "owner-vs-coach",
    category: "settings",
    title: "Owner vs coach — what each can do",
    summary: "The owner controls org settings, billing, branding and the team; coaches do the coaching.",
    keywords: ["owner", "coach", "role", "permissions", "admin"],
    body: [
      { type: "p", text: "**Owner** (whoever created the organisation): everything a coach can do, plus — invite/remove coaches, set each coach's athlete access, change all org-wide settings, manage billing, manage branding." },
      { type: "p", text: "**Coach**: full day-to-day coaching — athletes, sessions, programmes, templates, reports, community, messaging, testing (limited to assigned athletes if set to \"Assigned only\"). Sees Team / Billing / Branding / org settings as read-only. Controls their own profile and push preferences." },
    ],
  },
  {
    id: "coach-forum",
    category: "getting-started",
    title: "The Coach Forum",
    summary: "A community forum for every coach on VIS BUILD — topic rooms, a journal club, and feature requests.",
    keywords: ["forum", "coach forum", "community", "discuss", "rooms", "journal club", "feature request", "roadmap"],
    body: [
      { type: "p", text: "**Coach Forum** in the sidebar is a discussion space shared with every coach on the platform (not just your organisation). Pick a room on the left, read threads, and post your own." },
      { type: "subhead", text: "Rooms" },
      { type: "p", text: "**Feature Requests** sits at the top, then topic rooms — Programming, Rehab & Injury, Testing & Assessment, Athlete Psychology, Coaching Skills, Business & Pricing, Journal Club, Using VIS BUILD, General." },
      { type: "subhead", text: "Posting" },
      { type: "steps", items: [
        "Open a room, click **+ New thread**, give it a title and body, **Post**.",
        "Open any thread to reply. **Upvote** a thread with **▲**; sort the list by **Active** / **Top** / **New**.",
        "You can **Edit** or **Delete** your own threads and replies.",
      ] },
      { type: "subhead", text: "Journal Club" },
      { type: "p", text: "In the Journal Club room, **+ Post a summary** gives you extra fields: source type (journal article / book chapter / conference / seminar / podcast), a reference or link, a summary, and key takeaways. It renders as a citation card." },
      { type: "note", text: "Anything you post is visible to all VIS BUILD coaches — keep athlete-identifying details out of it." },
    ],
  },
  {
    id: "request-a-feature",
    category: "settings",
    title: "Feature requests",
    summary: "Suggest and upvote improvements — the Feature Requests room in the Coach Forum.",
    keywords: ["feature request", "roadmap", "suggestion", "vote", "idea", "forum"],
    body: [
      { type: "p", text: "Feature requests live in the **Feature Requests** room of the **Coach Forum** (sidebar). Click **+ New request**, give it a title, description and category, and post it. Upvote others with the **▲** button; sort by **Top** or **New**." },
      { type: "p", text: "Requests carry a status — Open / Planned / In Progress / Done — updated by the VIS BUILD team, who also reply in the comments." },
      { type: "note", text: "The old **/requests** link still works — it redirects into the forum." },
    ],
  },

  // ═══════════════════════ Billing & plans ═══════════════════════
  {
    id: "billing",
    category: "billing",
    title: "Pricing & the free preview",
    summary: "VIS BUILD is free while in preview — full access, no card, no limits.",
    keywords: ["billing", "plan", "plans", "pricing", "price", "cost", "how much", "subscription", "stripe", "trial", "free", "payment", "seats", "upgrade", "tiers"],
    body: [
      { type: "p", text: "**VIS BUILD is currently free while in preview.** Every feature is unlocked, there's no athlete limit, and no card is required — there's nothing to set up in **Settings → 💳 Billing**." },
      { type: "p", text: "Paid plans and pricing are still being finalised. When they're ready we'll announce them and give you plenty of notice — nothing about your account changes until then, and you won't be charged without opting in." },
      { type: "note", text: "Got a question about pricing for a larger squad or a multi-site setup? Email " + SUPPORT + "." },
    ],
  },
  {
    id: "refunds",
    category: "billing",
    title: "Refunds",
    summary: "Email support — we'll sort it out.",
    keywords: ["refund", "money back", "overcharged", "billing dispute"],
    body: [
      { type: "p", text: `For a refund or a billing query — a charge you didn't expect, a double charge, cancelling within a cooling-off period — email **${SUPPORT}** with your organisation name and the invoice date. We'll look into it.` },
    ],
  },

  // ═══════════════════════ Your athletes' app ═══════════════════════
  {
    id: "athlete-app-overview",
    category: "athlete-app",
    title: "What your athlete sees",
    summary: "No login. A calendar, an upcoming list, and tabs for Community, Goals, Challenges, Docs, Library.",
    keywords: ["athlete app", "athlete view", "what they see", "calendar"],
    body: [
      { type: "p", text: "The athlete opens their share link — no login. The home screen has:" },
      { type: "steps", items: [
        "A **calendar** (Week or Month) with today highlighted and each session as a coloured card.",
        "An **Upcoming sessions** list underneath (next five).",
        "A nav row: **💬 Community**, **🎯 Goals**, **🏆 Challenges** (if enabled), **📁 Docs**, **📚 Library**.",
        "A **📝 Weekly Reflection** prompt on the calendar (if enabled) — completable Saturday/Sunday for the current week, any time for a missed past week.",
        "🎯 **milestone** markers on the calendar for any goal you've flagged to show there.",
      ] },
    ],
  },
  {
    id: "athlete-first-time",
    category: "athlete-app",
    title: "Helping an athlete set up (first visit)",
    summary: "Open the link, allow notifications, add to home screen.",
    keywords: ["athlete setup", "first time", "add to home screen", "install", "onboard athlete"],
    body: [
      { type: "steps", items: [
        "Tap the link you sent. It opens straight to their calendar — no sign-up.",
        "When the **🔔 Turn on notifications?** banner appears, tap **Enable** and allow it.",
        "iPhone: in Safari, tap Share → **Add to Home Screen**. Android: browser menu → **Install app** / **Add to Home screen**.",
        "Optionally add a photo with the **✎** over the avatar.",
      ] },
      { type: "note", text: "On iPhone, push notifications only work after Add to Home Screen." },
    ],
  },
  {
    id: "athlete-logging",
    category: "athlete-app",
    title: "How athletes log a session",
    summary: "Open the session, type loads and reps, tick sets, rate the session.",
    keywords: ["athlete logging", "log session", "enter weights", "set dots", "rpe", "rest timer"],
    body: [
      { type: "steps", items: [
        "Tap a session from the calendar or Upcoming list.",
        "Type the **Load** and **Reps** (or **Time**) for each set — values save when they tap out of the box, and typing a value marks the set done.",
        "**↑ Same** copies the previous set. For a %1RM exercise, a greyed suggested kg shows in the load box.",
        "**⏱ Start rest** runs a rest timer with a buzz at the end.",
        "After an exercise, they answer \"Could you have progressed this next session?\" — **Yes** / **No**.",
        "At the end, they set a **🔥 Session RPE** (1–10) and can add notes for you.",
      ] },
      { type: "p", text: "The **Session summary** screen (shown when they finish, and reachable afterwards) recaps sets, volume and RPE, and — per Strength exercise — the same **▲ / ▼ / ＝ Best** and **Load** \"vs last time\" lines you see in Live group, so the athlete can see how the session moved against their last one." },
      { type: "tip", text: "If the gym signal drops, saves queue up and retry automatically — the athlete sees \"changes waiting for a connection\" rather than losing data." },
    ],
  },
  {
    id: "athlete-swap",
    category: "athlete-app",
    title: "Athletes swapping or skipping an exercise",
    summary: "For one session only — it doesn't change the programme you set.",
    keywords: ["swap exercise", "skip exercise", "substitute", "alternative", "athlete swap"],
    body: [
      { type: "p", text: "The **🔀** button on an exercise lets the athlete swap it — for **coach-approved alternatives** or anything from your Library — or **⏭ Skip this exercise**." },
      { type: "note", text: "This only affects that one session. Their regular programme is untouched, and you'll see a \"🔀 Swapped from …\" or \"⏭ Skipped\" badge on the exercise, plus swapped exercises reset their logged sets." },
    ],
  },
  {
    id: "athlete-checkin",
    category: "athlete-app",
    title: "Check-ins from the athlete's side",
    summary: "The ✓ Check-in button on a session; a lock screen if you enabled it.",
    keywords: ["athlete check in", "readiness", "lock", "unlock session"],
    body: [
      { type: "p", text: "On a session, the athlete taps **✓ Check-in**, answers the four questions, and gets **Today's Recommendations**." },
      { type: "p", text: "If you've turned on **Lock programme until check-in completed**, today's programmed session is blurred with a **🔒 Complete your check-in to unlock today's session** overlay until they do it." },
    ],
  },
  {
    id: "athlete-pbs",
    category: "athlete-app",
    title: "Personal bests for the athlete",
    summary: "A full-screen 🏆 New PB! celebration, plus their PB history.",
    keywords: ["athlete pb", "celebration", "new pb", "records"],
    body: [
      { type: "p", text: "When a logged set beats their best, the athlete sees a **🏆 New PB!** card (it auto-dismisses after a few seconds). PBs also show in the exercise history (**📈**) and, unless they've hidden them, on the Community PB Feed. You get a push the moment it happens." },
    ],
  },
  {
    id: "athlete-community",
    category: "athlete-app",
    title: "Community for athletes",
    summary: "Announcements, PB feed reactions, group chat, and messaging you.",
    keywords: ["athlete community", "chat", "message coach", "reactions", "voice note"],
    body: [
      { type: "p", text: "Under **💬 Community** the athlete can read your **Announcements**, react/comment on the **PB Feed**, use **Chat** (their groups), message you directly under **💬 Coach** (text or voice note), and see **Competitions**." },
      { type: "note", text: "Chat and DMs poll every few seconds rather than being truly instant — athletes have no login session for realtime." },
    ],
  },
  {
    id: "athlete-goals",
    category: "athlete-app",
    title: "Goals for athletes",
    summary: "Goals you set plus goals they add; priority stars, target dates, calendar milestones, live progress.",
    keywords: ["goals", "targets", "athlete goals", "goal type", "milestone", "target date"],
    body: [
      { type: "p", text: "Under **🎯 Goals** the athlete sees goals you've set for them alongside any they add themselves (**+ Add your own goal**). The **⭐** star marks a goal as a priority." },
      { type: "p", text: "You set goals from the athlete's page: **Manage** → **Goals**. Goal types: **Exercise** (weight/rep target — progress tracked automatically from logged sets), **Test** (a testing metric — see below), **Weight**, **Time**, and **Other** (free text). Any goal can carry an **Achieve by** date and a priority **tier**." },
      { type: "subhead", text: "Test-result goals" },
      { type: "p", text: "Pick a testing metric the athlete has a result for, and it snapshots their current best as the starting point — e.g. **CMJ 33 cm now → 35 cm target**. The athlete's Goals page then shows **Started → Now → Target** with a progress bar that updates from their next test, respecting whether higher or lower is better for that test." },
      { type: "p", text: "By default only you create test goals; athletes still see the ones you set. Turn on **Settings → Goals → Let athletes set goals from their test results** to let them add their own." },
      { type: "subhead", text: "Calendar milestones" },
      { type: "p", text: "Any goal with a target date has a **Show as a 🎯 milestone** tick-box. Ticked, the target date shows as a 🎯 marker on the athlete's app calendar **and** on their calendar in your dashboard." },
    ],
  },
  {
    id: "athlete-library-docs",
    category: "athlete-app",
    title: "Session Library & Docs for athletes",
    summary: "Extra sessions they can start informally, and the files you've shared.",
    keywords: ["session library", "athlete library", "documents", "extra sessions"],
    body: [
      { type: "p", text: "Under **📚 Library** the athlete sees any templates you've granted them (athlete page → **Manage** → **Session Library**). Tapping **Start** turns one into a real dated session they can log — separate from their programme, and not shown on the calendar." },
      { type: "p", text: "Under **📁 Docs** they see the files and links you've shared with them or their group." },
    ],
  },
  {
    id: "athlete-notifications",
    category: "athlete-app",
    title: "Athlete push notifications",
    summary: "They opt in on their device; you can't enable it for them.",
    keywords: ["push", "notifications", "reminders", "opt in", "ios home screen"],
    body: [
      { type: "p", text: "On their first visit the athlete sees a **🔔 Turn on notifications?** banner. In **⚙️ Settings** they can toggle push and choose which reminders they get: session today (with a time picker), evening not-started, evening not-rated, and \"my coach sends me a message\"." },
      { type: "note", text: "You can't turn push on for an athlete — the browser requires them to tap Allow. On iPhone it only works if they've added the link to their Home Screen. Reminder times are UK time (not per-athlete timezone yet)." },
    ],
  },
  {
    id: "athlete-privacy",
    category: "athlete-app",
    title: "Athlete privacy settings",
    summary: "They can hide their PBs and show only their first name. You always see everything.",
    keywords: ["privacy", "hide pbs", "first name only", "anonymity"],
    body: [
      { type: "p", text: "In **⚙️ Settings** the athlete has **Hide my PBs from the feed** and **Only show my first name** (on PBs, comments, reactions, chat and competitions). New athletes default to first-name-only on." },
      { type: "note", text: "These only affect what other athletes see. You, as their coach, always see their full name and all their data." },
    ],
  },
  {
    id: "athlete-recovery-hybrid",
    category: "athlete-app",
    title: "Recovery & Hybrid sessions for athletes",
    summary: "These have their own athlete views — checklists and interval timers, not a set grid.",
    keywords: ["recovery", "hybrid", "cardio", "athlete view", "intervals", "feedback"],
    body: [
      { type: "p", text: "Recovery sessions show as a checklist; Hybrid/Cardio sessions show stations with interval timers. Neither uses the weight/reps grid. If you prescribed a training zone, the athlete sees their target HR and pace band for it (from the aerobic profile you set)." },
      { type: "p", text: "If you enabled feedback on a Recovery session, the athlete taps **Finish session** and answers a short check (how recovered, soreness, fatigue, any pain) that comes back to you." },
    ],
  },
  {
    id: "athlete-load-monitoring",
    category: "athlete-app",
    title: "Sport sessions & the pain check-in (athlete app)",
    summary: "What the athlete sees when load monitoring is on: a sport-session logger and extra check-in questions.",
    keywords: ["athlete", "sport session", "log training", "pain", "wellness", "check in", "check-in", "fatigue", "stress", "return to play", "rehab"],
    body: [
      { type: "p", text: "When you've turned on **Track additional training load & rehab data**, your athletes get two extra things in their app." },
      { type: "subhead", text: "Log a sport / other session" },
      { type: "p", text: "A button on their home screen: **Log a sport / other session**. They enter the activity, date, duration and how hard it felt (RPE), plus an optional note. It's for anything outside their programme — club training, a match, a swim, extra running. Every athlete gets this." },
      { type: "subhead", text: "Extra check-in questions" },
      { type: "p", text: "**Only for athletes you're monitoring** — anyone whose **Availability** isn't set to “Available”, or who has **Keep the pain & wellness questions on** ticked on their profile. Their daily check-in gains **fatigue** and **life stress** (1–5), and a **pain** question — a 0–10 score and where it is (a body-area picker). Anything they flag shows in your Dashboard's **Poor check-ins today** panel and on their Dashboard tab, with **pain first** so it's the first thing you see. A healthy athlete's check-in is unchanged." },
      { type: "p", text: "A **Sport / Other** session you scheduled works like any other: they open it and confirm the actual duration and RPE." },
    ],
  },
  {
    id: "athlete-new-phone",
    category: "athlete-app",
    title: "An athlete got a new phone",
    summary: "They just open their link on the new phone. Re-add to home screen and re-enable notifications.",
    keywords: ["new phone", "changed device", "lost app", "athlete new device"],
    body: [
      { type: "p", text: "Nothing to migrate — the link is all they need. Ask them to open it on the new phone, add it to the home screen again, and turn notifications back on in Settings. If they lost the link, resend it from the athlete page (**Manage → Copy share link**)." },
    ],
  },
  {
    id: "athlete-logged-wrong-day",
    category: "athlete-app",
    title: "An athlete logged the wrong session / day",
    summary: "You can move sessions and edit logged values from the builder.",
    keywords: ["wrong day", "logged wrong session", "mistake", "fix athlete log"],
    body: [
      { type: "p", text: "Open the session in the builder. Drag it to the correct date on the calendar, and correct any set values in the per-set editor. PBs re-check automatically after any change." },
      { type: "p", text: "If they logged into a session that should stay empty, clear the set values (or delete/re-add the session)." },
    ],
  },
  {
    id: "athlete-multiple-people",
    category: "athlete-app",
    title: "One person managing two athletes (e.g. a parent)",
    summary: "Each athlete has their own link. The parent keeps both and opens whichever they need.",
    keywords: ["parent", "two athletes", "sibling", "multiple links", "family"],
    body: [
      { type: "p", text: "There's no combined view — each athlete is separate with its own link. A parent with two children in your squad gets two links and switches between them (bookmark both, or add both to the home screen)." },
    ],
  },

  // ═══════════════════════ Data & privacy ═══════════════════════
  {
    id: "who-can-see-athlete-data",
    category: "data-privacy",
    title: "Who can see an athlete's data?",
    summary: "Coaches in your organisation (subject to assigned-athlete limits), and the athlete themselves.",
    keywords: ["who can see", "data access", "privacy", "confidential", "rls"],
    body: [
      { type: "p", text: "An athlete's data is visible to the coaches in your organisation. A coach set to **Assigned only** sees just their assigned athletes. Coaches in other organisations can never see your data." },
      { type: "p", text: "The athlete sees their own data through their link. VIS BUILD staff can access data only as needed for support and maintenance." },
    ],
  },
  {
    id: "share-link-security",
    category: "data-privacy",
    title: "How secure is the athlete share link?",
    summary: "It's a long random token — effectively a password. Treat it like one.",
    keywords: ["link security", "token", "share link safe", "guess", "rotate"],
    body: [
      { type: "p", text: "The link contains a long, unguessable token. Anyone who has the link can view that one athlete's data (not anyone else's). Malformed or unknown links show a generic \"not found\" so links can't be probed." },
      { type: "p", text: "If a link is shared with the wrong person, contact support to rotate that athlete's token — the old link then stops working." },
    ],
  },
  {
    id: "data-storage",
    category: "data-privacy",
    title: "Where is my data stored?",
    summary: "On managed cloud infrastructure, encrypted in transit. Contact support for specifics or a DPA.",
    keywords: ["data storage", "hosting", "server", "cloud", "encryption", "where"],
    body: [
      { type: "p", text: "VIS BUILD runs on managed cloud infrastructure (a hosted Postgres database and edge hosting). Traffic between your browser and the servers is encrypted (HTTPS)." },
      { type: "p", text: `For hosting region, sub-processors, retention specifics, or a data processing agreement (DPA), email **${SUPPORT}**.` },
    ],
  },
  {
    id: "gdpr",
    category: "data-privacy",
    title: "GDPR, DPAs and data requests",
    summary: "You're the data controller for your athletes; VIS BUILD processes it for you. Contact support for paperwork.",
    keywords: ["gdpr", "dpa", "data processing agreement", "controller", "processor", "subject access"],
    body: [
      { type: "p", text: "For your athletes' personal data you are the controller and VIS BUILD is the processor. You're responsible for having a lawful basis to hold their data and for your own privacy notice to athletes." },
      { type: "p", text: `For a signed DPA, sub-processor list, or help with a subject-access or erasure request, email **${SUPPORT}**.` },
    ],
  },
  {
    id: "delete-my-data",
    category: "data-privacy",
    title: "Deleting an athlete's data",
    summary: "Archive then permanently delete from the Archived view — or contact support for a full erasure.",
    keywords: ["delete data", "erase", "right to be forgotten", "remove athlete data", "gdpr erasure"],
    body: [
      { type: "steps", items: [
        "**Athletes → 📦** archive the athlete, then open **Archived (N)** and use the **×** to permanently delete them and all their sessions.",
        `For a documented erasure (e.g. an athlete's formal request), or to remove data from backups, email **${SUPPORT}**.`,
      ] },
      { type: "note", text: "Permanent deletion can't be undone." },
    ],
  },
  {
    id: "data-retention",
    category: "data-privacy",
    title: "Archived vs deleted — what's kept",
    summary: "Archived data is retained and restorable. Deleted data is gone.",
    keywords: ["retention", "archive", "delete", "kept", "backup"],
    body: [
      { type: "p", text: "Archiving an athlete (or unlinking a programme, or deleting a battery) keeps all the underlying data — you can reverse it. Only **permanent delete** and **Delete range** actually destroy data. Closing the whole account triggers deletion on a timeline we'll confirm with you." },
    ],
  },
  {
    id: "staff-access",
    category: "data-privacy",
    title: "Can VIS BUILD staff see my data?",
    summary: "Only as needed to run the service and provide support.",
    keywords: ["staff access", "employees", "support access", "who at visbuild", "snooping"],
    body: [
      { type: "p", text: "Access to customer data is limited to what's needed to operate the platform and respond to support requests. When you raise a ticket, giving us the athlete name and organisation lets us look at the specific records involved." },
    ],
  },

  // ═══════════════════════ Common questions ═══════════════════════
  {
    id: "faq-quick-start",
    category: "faq",
    title: "I'm brand new — where do I start?",
    summary: "Add an athlete, send them the link, build a session.",
    keywords: ["new", "start", "first time", "beginner", "what now"],
    body: [
      { type: "steps", items: [
        "**Athletes → + Add athlete.**",
        "Open the athlete → **Manage → Copy share link** → text it to them.",
        "**+ Add session → Strength → + Add exercise** — build their first session.",
        "Then explore: build your Exercise Library, set up Testing, check Settings.",
      ] },
      { type: "tip", text: "See the \"Getting started\" section of this help centre for the full checklist." },
    ],
  },
  {
    id: "faq-athlete-no-link-email",
    category: "faq",
    title: "Does VIS BUILD email the athlete their link?",
    summary: "No — you copy it and send it yourself.",
    keywords: ["athlete email", "send link", "invite email", "automatic"],
    body: [
      { type: "p", text: "The app doesn't contact your athletes. Use **Manage → Copy share link** on the athlete's page and send the link by text, WhatsApp or email — whatever they'll actually open." },
    ],
  },
  {
    id: "faq-athlete-forgot-link",
    category: "faq",
    title: "An athlete lost their link",
    summary: "Re-copy it and resend — it's the same link.",
    keywords: ["lost link", "forgot link", "resend link", "athlete access"],
    body: [
      { type: "p", text: "Open the athlete → **Manage → Copy share link** and send it again. It's stable, so the link they lost is the same one you're resending (unless you asked support to rotate it)." },
    ],
  },
  {
    id: "faq-challenges-missing",
    category: "faq",
    title: "The Challenges menu disappeared",
    summary: "It's controlled by a Settings toggle.",
    keywords: ["challenges missing", "no challenges", "menu gone", "nav item"],
    body: [
      { type: "p", text: "The **Challenges** sidebar item is hidden when **Settings → Challenges → Enable Challenges** is off. Turn it back on there. It can also be disabled per athlete on their profile." },
    ],
  },
  {
    id: "faq-hyrox-hybrid",
    category: "faq",
    title: "Is \"Hybrid\" the same as Hyrox?",
    summary: "Yes — it's the same session type, just relabelled.",
    keywords: ["hyrox", "hybrid", "naming", "same thing"],
    body: [
      { type: "p", text: "Everywhere in the app it's shown as **Hybrid**. The underlying data still calls it \"Hyrox\" — you may see that word in exports or older screens. Same feature." },
    ],
  },
  {
    id: "faq-supersets",
    category: "faq",
    title: "How do I build a superset?",
    summary: "Type 1A / 1B in the # field on the exercise cards.",
    keywords: ["superset", "1a 1b", "paired exercises", "circuit"],
    body: [
      { type: "p", text: "In the session builder, put the exercises next to each other and set the small **#** field to **1A**, **1B** (and **2A**, **2B** for the next pair, etc.). Letter-suffixed positions are treated as a superset and kept in place rather than renumbered." },
    ],
  },
  {
    id: "faq-two-coaches-same-athlete",
    category: "faq",
    title: "Can two coaches work with the same athlete?",
    summary: "Yes. All coaches with access share the same view, notes and message thread.",
    keywords: ["two coaches", "shared athlete", "co-coaching", "team"],
    body: [
      { type: "p", text: "Any coach set to **All athletes** (or assigned that athlete) sees and edits the same data. The direct message thread is shared. In Live group, edits from multiple coaches save to the same session — refresh to see a colleague's latest input." },
    ],
  },
  {
    id: "faq-1rm-targets",
    category: "faq",
    title: "A %1RM exercise shows no kg target",
    summary: "There's no 1RM to work from yet.",
    keywords: ["no target", "%1rm blank", "1rm missing", "suggested weight"],
    body: [
      { type: "p", text: "The suggested kg needs either a fixed 1RM (athlete **Profile → 🏋️ 1RM Tracker**) or enough logged history to estimate one. Add a 1RM for that exercise and the targets appear." },
      { type: "p", text: "Also check **Settings → Calculations → 1RM source** — if it's **Fixed** and there's no fixed value, it falls back to the rolling estimate, which needs history." },
    ],
  },
  {
    id: "faq-e1rm-vs-1rm",
    category: "faq",
    title: "What's the difference between e1RM and the 1RM Tracker?",
    summary: "e1RM is an estimated trend from training data. The 1RM Tracker is fixed numbers you set for %1RM targets.",
    keywords: ["e1rm", "1rm tracker", "difference", "estimated vs fixed"],
    body: [
      { type: "p", text: "The **1RM Tracker** (on the athlete Profile) holds values you decide, used to turn %1RM prescriptions into kg. **e1RM** in reports is calculated from logged sets to show a strength trend over time — it's an output, not something you set." },
    ],
  },
  {
    id: "faq-no-progress-signal",
    category: "faq",
    title: "The \"vs last time\" line isn't showing",
    summary: "It needs a matching previous exercise, and it's Strength-only.",
    keywords: ["no progress signal", "vs last time missing", "best load blank"],
    body: [
      { type: "p", text: "The signal compares against the most recent session that contains an exercise with the **same name**. If the athlete has never done that exact exercise before — or the name is spelled differently — there's nothing to compare to. This applies everywhere the line shows: the session builder, Live group, and the athlete's session summary." },
      { type: "note", text: "It's Strength-only, and **Primer / activation** sessions are excluded from the comparison." },
    ],
  },
  {
    id: "faq-cant-change-settings",
    category: "faq",
    title: "I can't change a setting / billing / branding",
    summary: "Those areas are owner-only.",
    keywords: ["can't save settings", "read only", "greyed out", "owner only", "permission"],
    body: [
      { type: "p", text: "Org-wide settings, Billing, Branding and the Team are only editable by the organisation **owner** (whoever created the account). Other coaches see them read-only. Ask your owner to make the change, or to transfer ownership." },
    ],
  },
  {
    id: "faq-owner-change",
    category: "faq",
    title: "How do I change the organisation owner?",
    summary: "Email support from the current owner's address.",
    keywords: ["change owner", "transfer ownership", "owner left"],
    body: [
      { type: "p", text: `Ownership isn't reassignable in the app. Email **${SUPPORT}** from the current owner's address, naming the coach (already an active member of the org) who should take over.` },
    ],
  },
  {
    id: "faq-athlete-link-broken",
    category: "faq",
    title: "An athlete's link stopped working",
    summary: "Re-copy it; check they're not archived.",
    keywords: ["link broken", "404", "link not working", "athlete can't get in", "expired link"],
    body: [
      { type: "p", text: "Open the athlete → **Manage → Copy share link** and send the current link. Also check the **Archived** view — an archived athlete's link stops working until you **Restore** them. If a token was rotated by support, the old link is dead by design." },
    ],
  },
  {
    id: "faq-voice-not-working",
    category: "faq",
    title: "Build · Voice / voice notes won't record",
    summary: "The browser needs microphone permission.",
    keywords: ["voice not working", "microphone", "mic permission", "can't record", "no audio"],
    body: [
      { type: "p", text: "Your browser asks for microphone access the first time. If you blocked it, re-enable it: click the padlock/site-info icon in the address bar → allow microphone → reload. On a phone, also check the OS-level microphone permission for your browser." },
    ],
  },
  {
    id: "faq-video-not-playing",
    category: "faq",
    title: "An exercise video won't play",
    summary: "Check the video URL — use a standard YouTube/Vimeo watch link.",
    keywords: ["video not playing", "exercise video", "youtube", "demo won't load"],
    body: [
      { type: "p", text: "In the Library entry, the **Video URL** should be a normal watch link (e.g. a full YouTube or Vimeo URL). Private/unlisted videos with playback restrictions, or non-video pages, won't embed. Test the link in a new tab." },
    ],
  },
  {
    id: "faq-exercise-not-in-library",
    category: "faq",
    title: "An exercise I typed isn't in my Library",
    summary: "Click \"+ Add … to library\" on the exercise card, or add it on the Library page.",
    keywords: ["not in library", "add exercise", "new exercise", "autocomplete"],
    body: [
      { type: "p", text: "You can prescribe any exercise by just typing its name — it doesn't have to be in the Library. When it isn't, a **+ Add \"…\" to library** button appears so you can save it (with a video and defaults) for next time. Or build your Library up front on the **Library** page." },
    ],
  },
  {
    id: "faq-report-empty",
    category: "faq",
    title: "My report came out empty or thin",
    summary: "No logged data in the range, or the options/filters are excluding it.",
    keywords: ["empty report", "no data", "blank report", "nothing in report"],
    body: [
      { type: "steps", items: [
        "Check the **date range** covers sessions the athlete actually logged.",
        "Check the **Session types** pills — unticking a type hides that work.",
        "Make sure the metrics/sections you want are ticked in **Metrics**.",
        "Only **completed** sets count; prescribed-but-not-done work doesn't add tonnage.",
        "**Primer** sessions are excluded from load totals.",
      ] },
    ],
  },
  {
    id: "faq-ai-summary-wrong",
    category: "faq",
    title: "The AI summary said something off",
    summary: "Add a context note and regenerate. It's a drafting aid, not the final word.",
    keywords: ["ai wrong", "summary inaccurate", "ai mistake", "regenerate"],
    body: [
      { type: "p", text: "The summary is generated from the numbers in the report. If it misses context (an injury, a taper, a change of focus), add it in the **Context for AI summary** box and regenerate. Always read it before sending — you know things the data doesn't show." },
    ],
  },
  {
    id: "faq-checkin-not-appearing",
    category: "faq",
    title: "The check-in isn't appearing for an athlete",
    summary: "Check it's enabled org-wide and on that athlete's profile.",
    keywords: ["check in not showing", "no check in", "readiness missing"],
    body: [
      { type: "p", text: "**Settings → Check-in → Enable session check-in** must be on, and it mustn't be turned off on the athlete's **Profile**. The check-in button shows on Strength/Hybrid/Cardio/Power sessions (not Recovery)." },
    ],
  },
  {
    id: "faq-weekly-reflection-not-showing",
    category: "faq",
    title: "The weekly reflection isn't showing / can't be filled in",
    summary: "It's read-only until Saturday for the current week; check reflections are enabled.",
    keywords: ["weekly reflection missing", "reflection not showing", "sunday", "saturday", "read only", "opens sat"],
    body: [
      { type: "p", text: "The prompt sits on the athlete's calendar for the week they're viewing. The **current** week shows **\"Opens Sat\"** and is read-only until Saturday — it can be completed on the Saturday or Sunday. A **past** week is always editable: the athlete scrolls the calendar back to that week and fills it in there." },
      { type: "p", text: "If it's not there at all, check **Settings → Weekly Reflection → Enable weekly reflections** is on, with at least one score metric and the three prompts filled in." },
    ],
  },
  {
    id: "faq-notifications-coach",
    category: "faq",
    title: "What notifications do I (the coach) get?",
    summary: "PB alerts and athlete-message alerts, if you've enabled push in Settings.",
    keywords: ["coach notifications", "push", "alerts", "pb notification", "message notification"],
    body: [
      { type: "p", text: "In **Settings → 🔔 Push notifications**, turn push on for your device, then choose **An athlete hits a PB** and/or **An athlete sends a message**. These fire in real time. Other coaching prompts live on the Dashboard rather than as pushes." },
    ],
  },
  {
    id: "faq-white-label",
    category: "faq",
    title: "Can I remove VIS BUILD branding for my athletes?",
    summary: "Yes, on the Premium branding tier.",
    keywords: ["white label", "remove branding", "own logo", "premium", "rebrand"],
    body: [
      { type: "p", text: "The **Premium** tier lets you set your own **Brand name** and **Logo**, which replace \"VIS BUILD\" in your athletes' app, plus hide the powered-by footer. Every plan can already set a custom **accent colour**. Premium isn't self-serve — email " + SUPPORT + " to enable it." },
    ],
  },
  {
    id: "faq-rehab-load",
    category: "faq",
    title: "How do I monitor training load for a return-to-play athlete?",
    summary: "Turn on Training load & rehab, set the athlete's availability, and log sessions with a duration + RPE.",
    keywords: ["return to play", "rtp", "rehab", "load monitoring", "physio", "reconditioning", "acwr", "injury", "physiotherapist"],
    body: [
      { type: "steps", items: [
        "**Settings → Training load & rehab → Track additional training load & rehab data**, and tick the elements you want (ACWR, load-spike, monotony, pain/wellness).",
        "On the athlete's **Profile**, set their **Availability** (Return to play / Modified training / Rehab). That also switches on the pain & wellness check-in questions for them.",
        "Log their sessions — gym, conditioning or **Sport / Other** — each with a **duration** and a **session RPE**.",
        "Read it back on the **Dashboard** (Load flags, Availability) and in **Reporting** → tick **Training load & ACWR**, 26-week range.",
      ] },
      { type: "p", text: "Full detail: **Training load & return-to-play monitoring** in the Reporting section." },
    ],
  },
  {
    id: "faq-what-is-load",
    category: "faq",
    title: "What counts toward an athlete's training load?",
    summary: "Session RPE × duration, for any session that has both. Recovery sessions and primers don't count.",
    keywords: ["training load", "srpe", "what counts", "load calculation", "included", "excluded", "duration"],
    body: [
      { type: "p", text: "Load = the athlete's **session RPE (1–10) × the session duration in minutes**, added up across Strength, Power/Speed, Hybrid, Cardio and Sport / Other sessions." },
      { type: "p", text: "A session needs **both** an RPE and a duration to count. Strength/Power sessions have no duration unless you or the athlete enter one — the report says how many were left out. Recovery sessions and primer/activation sessions never count." },
    ],
  },
  {
    id: "faq-acwr-blank",
    category: "faq",
    title: "An athlete's ACWR or training-load report is empty",
    summary: "It needs the toggle on, a few weeks of history, and sessions with a duration + RPE.",
    keywords: ["acwr blank", "no training load", "empty report", "load not showing", "acwr missing", "no acwr"],
    body: [
      { type: "steps", items: [
        "**Settings → Training load & rehab** must be on, and **Training load & ACWR** ticked in the report options.",
        "ACWR compares the last 7 days to the last 28 — it needs about **3–4 weeks** of logged sessions before it shows anything.",
        "Sessions only count if they have a **duration** and a **session RPE** — check the athlete has been logging RPE.",
        "Use a longer range — **26 weeks** — so there's enough to plot.",
      ] },
    ],
  },
  {
    id: "faq-pain-questions-everyone",
    category: "faq",
    title: "Do all my athletes get the pain questions on their check-in?",
    summary: "No — only athletes whose availability isn't \"Available\", plus anyone you've manually flagged.",
    keywords: ["pain check in", "wellness questions", "everyone", "all athletes", "pain score", "opt out", "healthy athletes"],
    body: [
      { type: "p", text: "The extra **fatigue / stress / pain** questions only appear for an athlete whose **Availability** is set to something other than **Available** (Return to play, Modified training, Rehab, Unavailable)." },
      { type: "p", text: "To keep the questions running for a cleared athlete you still want to watch, tick **Keep the pain & wellness questions on** in the Availability box on their profile. Everyone else keeps the standard 4-question check-in." },
    ],
  },
  {
    id: "faq-log-match",
    category: "faq",
    title: "How does an athlete log a match or a club training session?",
    summary: "A Sport / Other session — you schedule one, or the athlete adds it from their app.",
    keywords: ["match", "game", "club training", "fixture", "external session", "log match", "non gym", "pitch session"],
    body: [
      { type: "p", text: "With **Training load & rehab** on: **+ Add session → Sport / Other**, enter the activity, duration and intensity. Or the athlete taps **Log a sport / other session** on their app home screen (\"5-a-side, 60 min, RPE 7\")." },
      { type: "p", text: "Either way it counts toward their training load, so a heavy match week shows up in ACWR and the load-spike flag." },
    ],
  },
  {
    id: "faq-sport-type-missing",
    category: "faq",
    title: "There's no \"Sport / Other\" session type",
    summary: "It's hidden until you turn on Training load & rehab in Settings.",
    keywords: ["sport session missing", "no sport type", "add session menu", "sport other", "menu item gone"],
    body: [
      { type: "p", text: "The **Sport / Other** type only appears in the **+ Add session** menu once **Settings → Training load & rehab → Track additional training load & rehab data** is on." },
    ],
  },
  {
    id: "faq-feature-request",
    category: "faq",
    title: "How do I request a feature or report a bug?",
    summary: "Feature ideas: the Feature Requests room in the Coach Forum. Bugs: email support with details.",
    keywords: ["feature request", "bug report", "roadmap", "suggestion", "report problem", "forum"],
    body: [
      { type: "p", text: "For ideas and votes, use the **Feature Requests** room in the **Coach Forum** (sidebar) — the VIS BUILD team reads and updates statuses there. For coaching questions, the other forum rooms." },
      { type: "p", text: `For something broken, email **${SUPPORT}** with: what you did, what you expected, what happened, the athlete/session involved, your browser, and a screenshot.` },
    ],
  },
  {
    id: "faq-contact-support",
    category: "faq",
    title: "How do I contact support?",
    summary: "Email support@visbuild.co.uk with your org name and details.",
    keywords: ["contact", "support", "email", "help", "get in touch"],
    body: [
      { type: "p", text: `Email **${SUPPORT}**. Include your organisation name and, if it's about a specific athlete or session, name it — that lets us find the exact records. Screenshots help a lot.` },
    ],
  },

  // ═══════════════════════ Troubleshooting ═══════════════════════
  {
    id: "ts-athlete-cant-log",
    category: "troubleshooting",
    title: "An athlete says they can't log today's session",
    summary: "Usually the check-in lock.",
    keywords: ["can't log", "locked", "blurred session", "unlock", "athlete stuck"],
    body: [
      { type: "p", text: "If **Lock programme until check-in completed** is on (Settings → Check-in), the athlete must finish today's check-in before logging today's *programmed* session. Ask them to tap **Check in now** on the lock overlay." },
      { type: "note", text: "Only today's programmed session locks. Past sessions, future sessions and anything they started from the Session Library are never locked." },
    ],
  },
  {
    id: "ts-session-not-showing-athlete",
    category: "troubleshooting",
    title: "An athlete can't see a session you scheduled",
    summary: "Wrong date, wrong athlete, a Library session, or a stale cache.",
    keywords: ["session not showing", "athlete missing session", "not on calendar"],
    body: [
      { type: "steps", items: [
        "Check the session's **date** on the athlete's calendar (scroll weeks/months).",
        "Confirm it's on the **right athlete**.",
        "Sessions the athlete started from the **Session Library** never appear on the calendar.",
        "Ask them to fully close the app/tab and reopen — mobile Safari especially caches hard. Adding the app to the home screen helps.",
      ] },
    ],
  },
  {
    id: "ts-stale-data-mobile",
    category: "troubleshooting",
    title: "The athlete app is showing old data",
    summary: "Mobile browsers cache aggressively — fully close and reopen, or reinstall to the home screen.",
    keywords: ["old data", "not updating", "stale", "cache", "refresh", "not syncing"],
    body: [
      { type: "steps", items: [
        "Pull to refresh, or fully close the tab/app (not just background it) and reopen.",
        "If it persists, remove the home-screen icon and re-add it from the link.",
        "As a last resort, clear the browser's site data for the VIS BUILD domain and reopen the link.",
      ] },
      { type: "p", text: "The app re-fetches on open and when the tab regains focus, so a genuine reopen almost always fixes it." },
    ],
  },
  {
    id: "ts-offline-gym",
    category: "troubleshooting",
    title: "Bad gym signal — will logs be lost?",
    summary: "No. Both apps queue failed saves and retry automatically.",
    keywords: ["offline", "no signal", "gym wifi", "lost data", "retry", "connection"],
    body: [
      { type: "p", text: "On the athlete app and in Live group and the Group Testing grid, a save that can't reach the server is queued and retried — every 30 seconds and on reconnect. Keep the tab open until it catches up." },
      { type: "p", text: "If you see a hard \"couldn't be saved\" warning that won't clear, note those values and re-enter them once back online, then dismiss the warning." },
    ],
  },
  {
    id: "ts-push-not-working",
    category: "troubleshooting",
    title: "Push notifications aren't arriving",
    summary: "Browser permission, iOS home screen, or timing.",
    keywords: ["push not working", "no notifications", "reminders not arriving", "ios"],
    body: [
      { type: "steps", items: [
        "The person must have tapped **Allow** on the browser permission prompt. If they blocked it, re-enable in browser/device settings.",
        "On iPhone, the link must be added to the Home Screen — Safari only delivers push to installed web apps.",
        "Reminder times are compared against UK time, not the athlete's local timezone.",
        "The morning \"session today\" reminder needs the athlete to have set a time in their Settings.",
        "A device that's off or fully closed may deliver the notification late.",
      ] },
    ],
  },
  {
    id: "ts-pb-wrong",
    category: "troubleshooting",
    title: "A personal best looks wrong",
    summary: "Fix the set value — PBs re-check on every save.",
    keywords: ["wrong pb", "false pb", "bad personal best", "fix pb"],
    body: [
      { type: "p", text: "PB detection runs on every set save, so correcting a mistyped weight or rep count also corrects (or removes) the PB. Only sets marked **done** count. You can also edit or delete a PB directly on the athlete **Profile → 🏆 Personal bests** (tap the ✎ on the PB row)." },
      { type: "p", text: "**Deleting a PB** clears the record for that exercise and hides it from the list — even a value re-derived from a logged session (so a fluke weight goes away without editing the session). It comes back automatically the next time a genuine PB is logged for that exercise, or straight away if you add one manually." },
    ],
  },
  {
    id: "ts-test-no-rating",
    category: "troubleshooting",
    title: "A test result has no colour / rating",
    summary: "No date of birth, no age entered, or no benchmark for that age/sex/population.",
    keywords: ["no rating", "test not rated", "no colour", "no norm", "grey"],
    body: [
      { type: "steps", items: [
        "The athlete needs a **Date of birth** on their Profile, or an **Age at test date** typed on the session.",
        "There must be a benchmark covering that age band and sex for the metric, in the population you're viewing (elite youth vs general).",
        "**Screening** metrics are never rated — that's by design.",
      ] },
    ],
  },
  {
    id: "ts-report-charts-pdf",
    category: "troubleshooting",
    title: "Charts are missing from my PDF report",
    summary: "Bulk ZIP exports omit charts on purpose. Use a single on-screen/preview report.",
    keywords: ["charts missing", "pdf no charts", "graphs gone", "zip report"],
    body: [
      { type: "p", text: "The **Download reports as ZIP** export leaves out charts to keep the files small and generation fast. For the full visual report, open it on screen (**Generate report** or **Manage → Reports** on the athlete) or use **👁 Preview / print 1 report** and print that." },
    ],
  },
  {
    id: "ts-billing-banner",
    category: "troubleshooting",
    title: "There's a billing warning banner across the top",
    summary: "A payment on an existing subscription failed or was cancelled. The owner needs to act.",
    keywords: ["billing banner", "payment failed banner", "account read only", "warning bar"],
    body: [
      { type: "p", text: "This only appears for an organisation that already has a paid subscription (it never shows during the free preview). Tap the banner to go to **Settings → Billing**: a failed payment gives the owner a 7-day grace period to update the card via the Stripe portal; for anything else, email support. Nothing is deleted in either state." },
    ],
  },
  {
    id: "ts-cant-log-in",
    category: "troubleshooting",
    title: "I can't log in",
    summary: "Request a fresh magic link on the device you want to use; check spam.",
    keywords: ["can't log in", "login not working", "magic link", "locked out", "no access"],
    body: [
      { type: "steps", items: [
        "Request a new sign-in link — old ones expire and only the latest works.",
        "Open the link on the **same device** you want to be signed in on.",
        "Check spam/junk. Confirm the email address is the exact one on your account.",
        "If you get \"archived\", your coach access was removed — ask your owner to reactivate you (Settings → Team).",
        `Still stuck: email **${SUPPORT}** from your account address.`,
      ] },
    ],
  },
  {
    id: "ts-something-broken",
    category: "troubleshooting",
    title: "Something looks broken or won't load",
    summary: "Reload, try another browser, then send support the details.",
    keywords: ["broken", "error", "won't load", "blank page", "not working", "glitch"],
    body: [
      { type: "steps", items: [
        "Reload the page. If you're on a phone, fully close and reopen.",
        "Try a different browser or a private window to rule out an extension or cache.",
        "Check you're not in read-only mode (billing banner at the top).",
        `Report it to **${SUPPORT}** with the page you were on, what you clicked, any error text, your browser, and a screenshot.`,
      ] },
    ],
  },
  {
    id: "ts-notes-csv-import-failing",
    category: "troubleshooting",
    title: "My Notes / CSV import isn't parsing well",
    summary: "Simplify the layout: one exercise per line, clear sets/reps/load, labelled weeks.",
    keywords: ["import failing", "notes not parsing", "csv wrong", "bad import", "garbled"],
    body: [
      { type: "steps", items: [
        "One exercise per line, with sets, reps and load in a consistent order.",
        "Label weeks and days explicitly (\"Week 1 – Day 1\").",
        "Remove decorative formatting, merged cells and images.",
        "After generating, use the correction box (\"session 2 exercise 3 should be 4 sets\") to fix the rest.",
        "For a spreadsheet, prefer **Build · Notes** (upload the .xlsx) over **Import CSV** — it's more forgiving.",
      ] },
    ],
  },
];
