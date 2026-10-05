# Changelog

## 0.1.0 (unreleased)

First release: an EmDash port of the Marketers Delight Lead Capture drop-in 1.5.0.

- Lead capture block (`leadCapture`), with the WordPress block's attributes and markup, and card, inline and capsule styles.
- Encrypted block configuration, so the resource URL never reaches the page.
- Tokenized, expiring download links and double opt-in confirmation, through the same `/?md_lead_dl=` and `/?md_lead_confirm=` URLs, served by the `leadCaptureSite()` middleware.
- Delivery, confirmation and owner emails, through Emailit or the site's EmDash email provider.
- Newsletter forwarding to Mailchimp, Kit, ConvertKit, MailerLite, Brevo, Beehiiv, SendFox and Emailit, with durable retries.
- Honeypot, per-IP and per-email rate limits, and optional Akismet.
- Impressions and submissions per page per day.
- Leads admin with status views, search, bulk actions, CSV export and privacy tools, plus a dashboard widget.
- Daily retention purge, and an import from the WordPress drop-in that keeps already-emailed links working.
