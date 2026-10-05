/**
 * Newsletter forwarding, transactional email through Emailit, and Akismet.
 * Requests are the WordPress drop-in's, call for call. `fetch` is injected
 * (the plugin passes EmDash's `ctx.http.fetch`), so this module has no
 * platform dependency and every request shape is testable.
 */
import { md5 } from "./md5.js";
import type { ServiceId, ServiceKeys } from "./types.js";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Subscriber {
	email: string;
	name: string;
	tags?: string[];
}

const json = (body: unknown) => JSON.stringify(body);
const ok = (res: Response) => res.status < 300;

const splitIds = (list: string, numeric: boolean) =>
	list
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => (numeric ? Number.parseInt(s, 10) : s))
		.filter((v) => (numeric ? Number.isFinite(v) && (v as number) > 0 : true));

/** Forward one subscriber. Resolves true on success; never throws for HTTP errors. */
export async function forwardSubscriber(service: ServiceId, list: string, sub: Subscriber, keys: ServiceKeys, fetch: Fetch): Promise<boolean> {
	const key = (keys[service] ?? "").trim();
	const { email, name, tags = [] } = sub;
	try {
		switch (service) {
			case "mailchimp": {
				if (!key || !list) return false;
				const dc = key.slice(key.indexOf("-") + 1);
				const body: Record<string, unknown> = { email_address: email, status_if_new: "subscribed", status: "subscribed", merge_fields: { FNAME: name } };
				if (tags.length) body.tags = tags;
				// PUT upsert, so a resubmission doesn't fail with "already a member".
				const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(list)}/members/${md5(email.toLowerCase())}`, {
					method: "PUT",
					headers: { Authorization: `Basic ${btoa(`anystring:${key}`)}`, "Content-Type": "application/json" },
					body: json(body),
				});
				return ok(res);
			}
			case "kit": {
				const kitKey = key || (keys.convertkit ?? "").trim();
				if (!kitKey) return false;
				const headers = { "X-Kit-Api-Key": kitKey, "Content-Type": "application/json" };
				const res = await fetch("https://api.kit.com/v4/subscribers", { method: "POST", headers, body: json({ email_address: email, first_name: name }) });
				if (!ok(res)) return false;
				if (list) await fetch(`https://api.kit.com/v4/forms/${encodeURIComponent(list)}/subscribers`, { method: "POST", headers, body: json({ email_address: email }) });
				for (const tag of tags) {
					if (/^\d+$/.test(tag)) await fetch(`https://api.kit.com/v4/tags/${tag}/subscribers`, { method: "POST", headers, body: json({ email_address: email }) });
				}
				return true;
			}
			case "convertkit": {
				if (!key || !list) return false;
				const res = await fetch(`https://api.convertkit.com/v3/forms/${encodeURIComponent(list)}/subscribe`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: json({ api_key: key, email, first_name: name }),
				});
				return ok(res);
			}
			case "mailerlite": {
				if (!key) return false;
				const body: Record<string, unknown> = { email, fields: { name } };
				if (list) body.groups = splitIds(list, false);
				const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
					method: "POST",
					headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
					body: json(body),
				});
				return ok(res);
			}
			case "brevo": {
				if (!key) return false;
				const body: Record<string, unknown> = { email, attributes: { FIRSTNAME: name }, updateEnabled: true };
				if (list) body.listIds = splitIds(list, true);
				const res = await fetch("https://api.brevo.com/v3/contacts", {
					method: "POST",
					headers: { "api-key": key, "Content-Type": "application/json" },
					body: json(body),
				});
				return ok(res);
			}
			case "beehiiv": {
				const publication = list;
				if (!key || !/^[A-Za-z0-9_-]+$/.test(publication)) return false;
				const body: Record<string, unknown> = { email, reactivate_existing: false, send_welcome_email: true };
				if (name) body.custom_fields = [{ name: "First Name", value: name }];
				const res = await fetch(`https://api.beehiiv.com/v2/publications/${encodeURIComponent(publication)}/subscriptions`, {
					method: "POST",
					headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
					body: json(body),
				});
				return ok(res);
			}
			case "sendfox": {
				if (!key) return false;
				const body: Record<string, unknown> = { email };
				if (name) body.first_name = name;
				if (list) body.lists = splitIds(list, true);
				const res = await fetch("https://api.sendfox.com/contacts", {
					method: "POST",
					headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
					body: json(body),
				});
				return ok(res);
			}
			case "emailit": {
				if (!key || !list) return false;
				const space = name.indexOf(" ");
				const first = space > 0 ? name.slice(0, space) : name;
				const last = space > 0 ? name.slice(space + 1) : "";
				const body: Record<string, unknown> = { email };
				if (first) body.first_name = first;
				if (last) body.last_name = last;
				if (tags.length) body.custom_fields = { source: tags.join(", ") };
				const res = await fetch(`https://api.emailit.com/v2/audiences/${encodeURIComponent(list)}/subscribers`, {
					method: "POST",
					headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
					body: json(body),
				});
				// 409: already in the audience, which is success for our purposes.
				return ok(res) || res.status === 409;
			}
		}
	} catch {
		return false;
	}
}

export interface OutgoingEmail {
	from: string;
	to: string;
	subject: string;
	html: string;
	text: string;
}

/** Send a transactional email through Emailit's Email API. */
export async function sendViaEmailit(apiKey: string, message: OutgoingEmail, fetch: Fetch): Promise<boolean> {
	try {
		const body: Record<string, string> = { from: message.from, to: message.to, subject: message.subject, html: message.html };
		if (message.text) body.text = message.text;
		const res = await fetch("https://api.emailit.com/v2/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: json(body),
		});
		return ok(res);
	} catch {
		return false;
	}
}

export interface AkismetInput {
	blog: string;
	ip: string;
	userAgent: string;
	referrer: string;
	name: string;
	email: string;
	lang?: string;
}

const form = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** Akismet `comment-check` with `comment_type=signup`. */
export async function akismetCheck(apiKey: string, input: AkismetInput, fetch: Fetch): Promise<{ isSpam: boolean; score: string }> {
	try {
		const res = await fetch(`https://${encodeURIComponent(apiKey)}.rest.akismet.com/1.1/comment-check`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
			body: form({
				blog: input.blog,
				user_ip: input.ip,
				user_agent: input.userAgent,
				referrer: input.referrer,
				comment_type: "signup",
				comment_author: input.name,
				comment_author_email: input.email,
				blog_lang: input.lang ?? "en",
				blog_charset: "UTF-8",
			}),
		});
		const verdict = (await res.text()).trim();
		return verdict ? { isSpam: verdict === "true", score: verdict } : { isSpam: false, score: "" };
	} catch {
		return { isSpam: false, score: "" };
	}
}

/** Report a lead as spam or ham, so Akismet learns from the admin's correction. */
export async function akismetReport(apiKey: string, kind: "spam" | "ham", input: Pick<AkismetInput, "blog" | "name" | "email">, fetch: Fetch): Promise<void> {
	try {
		await fetch(`https://${encodeURIComponent(apiKey)}.rest.akismet.com/1.1/submit-${kind}`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
			body: form({ blog: input.blog, comment_type: "signup", comment_author: input.name, comment_author_email: input.email }),
		});
	} catch {
		// best effort, as in WordPress
	}
}
