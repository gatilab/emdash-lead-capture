/** Text helpers that mirror the WordPress functions the drop-in relied on. */

export function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const LOCAL_CHARS = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const LABEL = /^[a-z0-9-]+$/i;

/**
 * WordPress `is_email()`: at least 6 characters, one `@`, a dotted domain
 * whose labels are letters, digits and inner hyphens. RFC-strictness beyond
 * that is not attempted, as in WordPress.
 */
export function isEmail(value: string): boolean {
	if (value.length < 6 || value.length > 254) return false;
	const at = value.indexOf("@", 1);
	if (at < 1 || value.indexOf("@", at + 1) !== -1) return false;
	const local = value.slice(0, at);
	const domain = value.slice(at + 1);
	if (!LOCAL_CHARS.test(local)) return false;
	if (/\.{2,}/.test(domain)) return false;
	const trimmed = domain.replace(/^[\s.]+|[\s.]+$/g, "");
	if (trimmed !== domain) return false;
	const labels = domain.split(".");
	if (labels.length < 2) return false;
	return labels.every((label) => label.length > 0 && !label.startsWith("-") && !label.endsWith("-") && LABEL.test(label));
}

/** WordPress `sanitize_email()` for our purposes: trim, then validate. Returns "" when invalid. */
export function sanitizeEmail(value: unknown): string {
	const email = typeof value === "string" ? value.trim() : "";
	return isEmail(email) ? email : "";
}

/** WordPress `sanitize_text_field()`: strip tags, collapse whitespace, trim. */
export function sanitizeText(value: unknown, max = 255): string {
	if (typeof value !== "string") return "";
	return value
		.replace(/<[^>]*>/g, "")
		.replace(/[\r\n\t ]+/g, " ")
		.trim()
		.slice(0, max);
}

/**
 * The name to greet a lead by, or "there". The form mails any address it is
 * given, so the name is the one attacker-chosen string in a message from
 * this domain: long names and anything that reads like a link are dropped.
 */
export function greetingName(name: string): string {
	const n = name.trim();
	if (n === "" || [...n].length > 40 || /(:\/\/|www\.|@|\b[a-z0-9-]+\.(?:[a-z]{2,})\b)/i.test(n)) return "there";
	return n;
}

/** Spreadsheet formula guard used by the CSV export. */
export function csvSafe(value: unknown): string {
	const v = value === null || value === undefined ? "" : String(value);
	return v !== "" && ["=", "+", "-", "@", "\t", "\r"].includes(v[0]!) ? `'${v}` : v;
}

const ALLOWED_INLINE = new Set(["a", "strong", "em", "b", "i", "code", "br", "span", "u", "mark", "small"]);

/**
 * Light `wp_kses_post` for block descriptions: escapes everything except a
 * few inline tags; links keep only a safe `href`, `target` and `rel`.
 */
export function sanitizeInlineHtml(html: string): string {
	return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[<>&"]/g, (match, tag?: string, attrs?: string) => {
		if (!tag) return escapeHtml(match);
		const name = tag.toLowerCase();
		if (!ALLOWED_INLINE.has(name)) return escapeHtml(match);
		if (match.startsWith("</")) return `</${name}>`;
		if (name !== "a") return name === "br" ? "<br />" : `<${name}>`;
		const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs ?? "");
		const target = /\btarget\s*=\s*(?:"(_blank|_self)"|'(_blank|_self)')/i.exec(attrs ?? "");
		const url = (href?.[1] ?? href?.[2] ?? "").trim();
		const safe = /^(https?:|mailto:|\/|#)/i.test(url) ? url : "";
		const t = target?.[1] ?? target?.[2];
		return `<a${safe ? ` href="${escapeHtml(safe)}"` : ""}${t ? ` target="${t}" rel="noopener"` : ""}>`;
	});
}

/** Minimal `wpautop`: blank lines split paragraphs, single newlines become `<br />`. */
export function autop(text: string): string {
	const normalized = text.replace(/\r\n?/g, "\n").trim();
	if (!normalized) return "";
	return normalized
		.split(/\n\s*\n/)
		.map((p) => `<p>${p.trim().replace(/\n/g, "<br />\n")}</p>`)
		.join("\n");
}
