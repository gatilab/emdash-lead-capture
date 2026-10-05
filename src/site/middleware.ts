/**
 * Astro middleware for the link formats the WordPress drop-in emailed:
 *
 *   /?md_lead_dl=<token>       → redirect to the resource (stamps the click)
 *   /?md_lead_confirm=<token>  → confirm the email, then back to the page
 *
 * Plugin routes can only redirect within the site, and deliverables usually
 * live elsewhere (a file host, a CDN), so this runs in the site. It resolves
 * tokens through the plugin's `download` and `confirm` routes, in-process.
 * Any page path works, as in WordPress.
 */
import { defineMiddleware } from "astro:middleware";

import { MESSAGES } from "../core/defaults.js";
import { escapeHtml } from "../core/text.js";
import { callPublic } from "../astro/seal.js";

type DownloadResult = { status: "ok"; url: string } | { status: "invalid" } | { status: "expired" };

const NO_STORE = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

function redirect(location: string, status = 302): Response {
	return new Response(null, { status, headers: { Location: location, ...NO_STORE } });
}

function messagePage(status: number, title: string, message: string, home: string): Response {
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f5;color:#1f2937;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:32rem;margin:1.5rem;padding:2rem;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
h1{margin:0 0 .5rem;font-size:1.25rem}
p{margin:0 0 1rem}
a{color:#2563eb}
@media (prefers-color-scheme:dark){body{background:#111827;color:#e5e7eb}main{background:#1f2937;border-color:#374151}a{color:#93c5fd}}
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(home)}">Go to the home page</a></p></main></body>
</html>`;
	return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
}

export const onRequest = defineMiddleware(async (context, next) => {
	const download = context.url.searchParams.get("md_lead_dl");
	const confirm = context.url.searchParams.get("md_lead_confirm");
	if ((!download && !confirm) || (context.request.method !== "GET" && context.request.method !== "HEAD")) return next();

	const home = new URL("/", context.url).toString();

	if (download) {
		const result = await callPublic<DownloadResult>(context, "download", { token: download });
		if (result?.status === "ok") return redirect(new URL(result.url, context.url).toString());
		if (result?.status === "expired") return messagePage(410, MESSAGES.linkExpiredTitle, MESSAGES.linkExpired, home);
		return messagePage(404, MESSAGES.linkInvalidTitle, MESSAGES.linkInvalid, home);
	}

	const result = await callPublic<{ redirect: string }>(context, "confirm", { token: confirm });
	return redirect(result?.redirect ? new URL(result.redirect, context.url).toString() : home);
});
