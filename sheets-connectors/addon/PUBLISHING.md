# Publishing the two add-ons to Google Workspace Marketplace

You have to do the account steps yourself: accepting Google Cloud and Marketplace terms, entering your details, and verifying your domain. I can't do those for you. Everything you need to paste is in this folder.

Plan about 2 hours of clicking for the first add-on and about 45 minutes for the second. Google's review typically takes "several days", and longer if they request changes.

## 0. Before you start
- **Website:** publish the `docs/` folder on GitHub Pages (Settings → Pages → Branch: main, folder: /docs). You need public URLs for privacy, terms and support.
- **Support email:** wadeaoa77@gmail.com is already filled in on the privacy, terms and support pages.
- **Domain:** Google's OAuth brand verification asks you to verify the domain of your homepage and privacy-policy links in Google Search Console. A `github.io` address may not be accepted as an authorized domain (unverified). If it isn't, buy a cheap domain (about $10/year) and point it at GitHub Pages.
- **Account type:** with a @gmail.com account, Marketplace apps can only be published as **Public**. That's what we want.

## 1. Create the Apps Script project (once per add-on)
1. Go to script.google.com → New project. Name it "Toggl Track to Sheets" (or "Calendly to Sheets").
2. Project Settings → tick **Show "appsscript.json" manifest file in editor**.
3. Replace `Code.gs` with `addon/toggl/Code.gs` and `appsscript.json` with `addon/toggl/appsscript.json`. These have `IS_ADDON = true`, so the menu sits under Extensions.
4. **Test it first:** Deploy → Test deployments → Editor add-on → pick a test spreadsheet → Execute. Connect with a real Toggl token, run **Sync now**, and fix anything that breaks before going further. The scripts have only been tested against mocked API responses.
5. Take **screenshots** of the real result at 1280×800: the menu, and the filled sheet. Use a test account with fake client names, not real data.

## 2. Google Cloud project
1. console.cloud.google.com → New project (e.g. "toggl-sheets-addon").
2. Apps Script → Project Settings → Google Cloud Platform (GCP) Project → **Change project** → paste the Cloud **project number**.
3. APIs & Services → **OAuth consent screen** (Google Auth Platform):
   - App name: same as the listing name below. User support email: yours.
   - Audience: **External**, then **Publish app** (it must not stay in "Testing").
   - Branding: app logo (`assets/toggl-icon-128.png`), homepage `https://<you>.github.io/sheets-connectors/toggl.html`, privacy `…/privacy.html`, terms `…/terms.html`, authorized domain.
   - Data access (scopes): add the 4 scopes from `appsscript.json`. The console shows each one as non-sensitive, sensitive or restricted. Write down what it says; that decides how long verification takes.
   - Submit for verification. With only non-sensitive scopes this is brand verification, typically 2–3 business days. With sensitive scopes, expect up to about 10 days.
4. APIs & Services → Library → enable **Google Workspace Marketplace SDK**.

## 3. Create a versioned deployment
Apps Script → Deploy → New deployment → type **Add-on** → Deploy. Note the **version number**, and get the **Script ID** from Project Settings.

## 4. Marketplace SDK → App Configuration
- App visibility: **Public** (you can't change this later).
- Installation settings: **Individual + Admin install**.
- App integration: **Editor add-on → Sheets add-on**. Enter the Script ID and version.
- OAuth scopes: the same 4 as `appsscript.json`.
- Developer information: your name, email, website. **Trader status: Non-trader** while it's free. Change this when you start charging (and see the licence note).

## 5. Marketplace SDK → Store Listing (copy below)
- Category: Business Tools (or Productivity).
- Icons: `assets/<app>-icon-32.png`, `assets/<app>-icon-128.png`. Banner: `assets/<app>-banner-220x140.png`. Screenshots: your real 1280×800 screenshots from step 1.
- Terms, privacy and support URLs: the GitHub Pages links.
- Submit. Check status under Marketplace SDK → Publish status.

---

## Listing copy: Toggl
**Name (≤50 characters):** `Time Entries Sync for Toggl Track`

**Short description (≤200 characters):**
Sync your Toggl Track time entries into Google Sheets: descriptions, projects, clients, tags and hours. Updates in place, daily auto-sync, built for Toggl's free-plan API limit.

**Detailed description:**
Get your Toggl Track time entries into a Google Sheet you control, and keep them current.

What you get, in a tab called "Toggl entries":
• Date, start, stop, hours (decimal) and duration (h:mm:ss)
• Description, project, client, tags, billable, user, entry ID
• Re-syncs update edited entries in place, without duplicates
• Optional daily sync that refreshes the last 7 days every morning
• Custom ranges of up to 365 days

Built for invoices, client timesheets and monthly summaries with your own formulas and pivot tables.

How it works: paste your Toggl Track API token (Profile settings → API Token). The add-on reads your time entries through Toggl's official API and writes them into the current spreadsheet. It only reads from Toggl and never changes anything there. There's no server in between, and your token stays in your own Google account.

Light on API calls: a typical 30-day sync uses about 5–8 requests, so it stays inside the Toggl Track free plan's limit of about 30 requests per hour.

Free during beta. Not affiliated with, endorsed by, or sponsored by Toggl. Toggl is a trademark of its owner.

## Listing copy: Calendly
**Name (≤50 characters):** `Booking Sync for Calendly`

**Short description (≤200 characters):**
Sync your Calendly bookings into Google Sheets: one row per invitee, with every booking question as a column. Cancellations, reschedules, no-shows, UTM tags. Works on the free plan.

**Detailed description:**
Turn your Calendly bookings into a live Google Sheet.

What you get, in a tab called "Calendly bookings":
• One row per invitee: event time, event name, status, name, email, time zone, booked-at time
• Cancellations (who canceled and why), reschedules and no-shows
• Location or meeting link, plus UTM source, medium and campaign
• Every booking question as its own column, added automatically
• Optional hourly sync. Re-syncs update rows in place, without duplicates

Works on Calendly's free plan: it uses Calendly's API, which is available on every plan, so you don't need CSV export (paid plans only) or Zapier.

How it works: paste a Calendly personal access token (Integrations & apps → API and webhooks). The add-on reads your scheduled events through Calendly's official API and writes them into the current spreadsheet. It only reads from Calendly and never changes anything there. There's no server in between, and your token stays in your own Google account.

Free during beta. Not affiliated with, endorsed by, or sponsored by Calendly. Calendly is a trademark of its owner.

---

## Open questions to confirm (unverified)
- Whether each of the 4 scopes counts as sensitive. Check in step 2.3.
- Whether a `github.io` domain is accepted for brand verification.
- Whether Google accepts personal access tokens or API keys pasted by the user for a public add-on. Many existing Marketplace connectors work this way, but I haven't confirmed it in the policy text.
- Whether "Toggl" and "Calendly" in the add-on names will pass review. Both names say "for <App>" and both descriptions carry the "not affiliated" line.
