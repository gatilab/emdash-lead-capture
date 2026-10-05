# Lead Capture for EmDash

A lead magnet block for [EmDash](https://emdashcms.com). A visitor enters an email address and gets a resource (a PDF, a template pack, a spreadsheet) through a download link. The link is emailed and can also be shown on the spot. Leads land in an inbox in the EmDash admin.

It's a port of the Lead Capture drop-in for the Marketers Delight WordPress theme (1.5.0). Its blocks, emailed links and data carry over.

- **The file stays gated.** The resource URL never appears in the page. The form carries its configuration encrypted, and the visitor gets a personal, expiring link (`/?md_lead_dl=…`).
- **Double opt-in**, when you want it. Leads confirm by email before they receive the file.
- **Newsletter forwarding** to Mailchimp, Kit, ConvertKit (v3), MailerLite, Brevo, Beehiiv, SendFox or Emailit. The newsletter checkbox starts unticked, and the wording a visitor agreed to is stored with their lead.
- **Spam protection**: a honeypot, rate limits (5 per IP and 3 per email per 10 minutes), and Akismet if you add a key.
- **Conversion stats**: impressions and submissions per page per day.
- **A leads inbox**: views by status, search, bulk actions, resend, CSV export, privacy export and erase by email, and automatic retention.

## Install

```sh
pnpm add @gatilab/emdash-lead-capture
```

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { leadCapture } from "@gatilab/emdash-lead-capture";
import { leadCaptureSite } from "@gatilab/emdash-lead-capture/site";

export default defineConfig({
	integrations: [emdash({ plugins: [leadCapture()] }), leadCaptureSite()],
});
```

`leadCaptureSite()` adds a small middleware that answers download and confirmation links. EmDash plugin routes can't redirect visitors to a file on another host, so this part runs in the site itself.

The plugin asks for three capabilities:
- `email:send`: delivery and confirmation emails.
- `network:request`: limited to the newsletter services' and Akismet's API hosts.
- `users:read`: the first admin's address, used as the default for owner notifications.

### Styles

The block ships the drop-in's own stylesheet. It builds on the Marketers Delight theme's form classes, such as `.form-input`, `.form-submit` and `.block-single`. On any other site, also import the standalone base styles once:

```js
import "@gatilab/emdash-lead-capture/styles/standalone.css";
```

Override its look with `--lc-*` custom properties (`--lc-accent`, `--lc-radius`, `--lc-border` and so on).

### Email

Lead emails go through your EmDash email provider. Add an Emailit API key in the plugin settings, and keep "Send via Emailit" on, to send through Emailit instead. That lets you set the From name and address, and it adds a plain-text part. EmDash's own email API picks the From address itself.

## Using the block

Type `/` in the editor and choose **Lead capture**. Every field is optional except the resource URL:

| Field | Notes |
| --- | --- |
| Title, Description | The description accepts a few inline tags: links, bold, italics, code. |
| Resource URL | Any `https://` URL or a path on your site. It's never shown on the page. |
| Resource name | Used in the email ("Access ‹name›"). |
| After submitting | Show a message, show the message plus an instant download button, or redirect to a thank-you page. With double opt-in the file is only sent after confirmation. |
| Newsletter service, list | Leave the service empty to use the site default from settings. |
| Style | Card, Inline (attached button) or Capsule (pill). Inline and capsule never ask for a name. |

The block can also be used directly in a template:

```astro
---
import { LeadCapture } from "@gatilab/emdash-lead-capture/astro";
---
<LeadCapture node={{ _type: "leadCapture", title: "Get the checklist", deliverableUrl: "/files/checklist.pdf", deliverableLabel: "Launch checklist" }} />
```

## Settings

Find these under **Plugins › lead-capture › Settings**:
- double opt-in
- link expiry in days (0 means links never expire)
- Emailit routing, and the From name and address
- the default newsletter service and list
- an email to you for each new lead
- retention in days: spam and trash always purge after 90 days
- the email colours
- API keys for each service and Akismet, which are stored encrypted

Encrypted settings need `EMDASH_ENCRYPTION_KEY` to be set on the site.

## How a submission is handled

Checks run in this order:
1. The honeypot rejects bots.
2. The email address must be valid.
3. Rate limits per IP and per email.
4. The sealed block configuration is opened. If it doesn't open, nothing is sent.
5. If this email already asked for this page's file: an active lead gets a fresh link, a pending lead gets the confirmation again, a trashed lead is restored, and spam gets a pretend success.
6. Akismet, if configured.
7. The lead is saved and the email is sent. A newsletter opt-in is forwarded after the response. A failed forward is retried twice, 5 and 10 minutes later, and then appears under failed forwards in the admin.

Each answer is `{ success, message, download_url? }` with HTTP 200, as the WordPress endpoint answered.

## Migrating from WordPress

[`wordpress/export-lead-capture.php`](./wordpress/export-lead-capture.php) is a read-only WP-CLI script. It exports leads, daily stats, and each source post's path:

```sh
wp eval-file export-lead-capture.php > lead-capture.json             # leads and stats (personal data)
wp eval-file export-lead-capture.php stats-only > lead-capture-stats.json
```

Post the file to the plugin's `import` admin route. Blocks need no conversion: the `leadCapture` block keeps the WordPress block's attributes. Imported leads keep their tokens, so links already emailed keep working through `leadCaptureSite()`.

## What's different from the WordPress drop-in

- **Leads are keyed by page path, not post id**, so the same block can live in posts, sections or templates.
- **The block key is an encrypted configuration**, not an HMAC that's re-resolved from the post on submit.
- **Two front-end bugs are fixed**: the inline and capsule styles now really send the newsletter checkbox, and errors show in the block's error line.
- **Optins and Content Upgrades bridges are not included.** Those drop-ins are WordPress-only. Their imported leads keep their source type.
- **FluentCRM is not available.** It's a WordPress plugin.

## License

GPL-2.0-or-later.
