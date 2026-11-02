# Sheets Connectors: Toggl Track and Calendly → Google Sheets

Free Google Apps Script tools that sync your data into your own Google Sheet:

| Tool | What you get | Script |
|---|---|---|
| **Toggl Track → Sheets** | Time entries with date, start/stop, hours, description, project, client, tags, billable, user. Re-syncs update edited entries in place. Daily auto-sync. Stays inside Toggl's free-plan API limit. | [`toggl/Code.gs`](toggl/Code.gs) |
| **Calendly → Sheets** | One row per booking: time, event, name, email, status, cancellations, reschedules, no-shows, UTM tags, and every booking question as its own column. Works on Calendly's **free plan**. Hourly auto-sync. | [`calendly/Code.gs`](calendly/Code.gs) |

## Setup (about 3 minutes)
1. In your Google Sheet, open **Extensions → Apps Script**.
2. Paste the contents of `toggl/Code.gs` or `calendly/Code.gs` and click **Save**.
3. Reload the sheet and use the new **Toggl Sync** or **Calendly Sync** menu:
   - **Connect**: paste your Toggl API token (Profile settings → API Token) or a Calendly personal access token (Integrations & apps → API and webhooks).
   - **Sync now**, or **Sync a custom date range**.
   - **Turn on daily/hourly sync** to keep the sheet current.

Step-by-step guides: [Toggl](https://woa2013-cpu.github.io/sheets-connectors/toggl.html) · [Calendly](https://woa2013-cpu.github.io/sheets-connectors/calendly.html)

## Privacy
Requests go directly from Apps Script, running under your Google account, to Toggl's or Calendly's API, and the results land in your spreadsheet. There's no server in between. Your token stays in your own Apps Script user properties. The scripts only read from Toggl and Calendly; they never write. [Privacy policy](https://woa2013-cpu.github.io/sheets-connectors/privacy.html)

## Pro version (planned)
One-click install, no copy-pasting, longer history, support. $9/month, with a free tier for small accounts.
Join the waitlist: [Toggl](https://tally.so/r/jeZ5M9) · [Calendly](https://tally.so/r/7Xq1W9)

---
MIT licence. Not affiliated with, endorsed by, or sponsored by Toggl, Calendly or Google. Toggl, Calendly and Google Sheets are trademarks of their owners.
