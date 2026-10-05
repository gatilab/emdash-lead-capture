/**
 * Lead lifecycle: capture, delivery, confirmation, downloads, forwarding,
 * admin actions and retention. A line-by-line port of Lead Capture 1.5.0's
 * `ajax_submit`, endpoints and privacy cron, minus WordPress.
 */
import { after } from "emdash";
import type { PluginContext, RouteContext } from "emdash";

import { consentRecord, randomToken } from "../core/crypto.js";
import { DAY_MS, LIMITS, MESSAGES } from "../core/defaults.js";
import { confirmEmail, deliveryEmail, ownerNotice } from "../core/email.js";
import { akismetCheck, akismetReport, forwardSubscriber, type Fetch } from "../core/services.js";
import { sanitizeEmail, sanitizeText } from "../core/text.js";
import { isServiceId, type BlockConfig, type LeadCaptureSettings, type LeadStatus, type ServiceKeys } from "../core/types.js";
import { openBlockConfig } from "../seal.js";
import { readKeys, readSettings, withinLimit } from "./config.js";
import { emailTheme, ownerEmail, redact, sendMail } from "./mailer.js";
import { bumpStat, findByToken, forwards, leadId, leads, setStatus, toStored, type StoredLead } from "./storage.js";

type Ctx = PluginContext;

const nowIso = () => new Date().toISOString();

export interface SubmitInput {
	email?: unknown;
	name?: unknown;
	block_key?: unknown;
	source_url?: unknown;
	newsletter_opt_in?: unknown;
	website?: unknown;
}

export interface SubmitResult {
	success: boolean;
	message: string;
	download_url?: string;
}

const fail = (message: string): SubmitResult => ({ success: false, message });
const done = (message: string, extra: Partial<SubmitResult> = {}): SubmitResult => ({ success: true, message, ...extra });

export function downloadUrl(ctx: Ctx, lead: Pick<StoredLead, "downloadToken" | "deliverableUrl">): string {
	// Rows imported from before tokens existed fall back to the raw URL, as in WordPress.
	return lead.downloadToken ? ctx.url(`/?md_lead_dl=${lead.downloadToken}`) : lead.deliverableUrl;
}

export function confirmUrl(ctx: Ctx, lead: Pick<StoredLead, "confirmToken">): string {
	return ctx.url(`/?md_lead_confirm=${lead.confirmToken}`);
}

/** A source URL on this site, or the page URL built from the trusted path. */
function sourceUrlFor(ctx: Ctx, claimed: unknown, path: string): string {
	const fallback = ctx.url(path);
	if (typeof claimed !== "string" || claimed.length > 500) return fallback;
	try {
		const url = new URL(claimed);
		return url.origin === new URL(fallback).origin ? `${url.origin}${url.pathname}${url.search}` : fallback;
	} catch {
		return fallback;
	}
}

function effectiveService(config: Pick<BlockConfig, "service" | "list">, settings: LeadCaptureSettings): [string, string] {
	return config.service ? [config.service, config.list] : [settings.default_service, settings.default_list];
}

export async function sendDelivery(ctx: Ctx, lead: StoredLead, settings: LeadCaptureSettings, keys: ServiceKeys): Promise<boolean> {
	const message = deliveryEmail({ name: lead.name, label: lead.deliverableLabel, newsletterOptIn: lead.newsletterOptIn, downloadUrl: downloadUrl(ctx, lead) }, emailTheme(ctx, settings));
	const sent = await sendMail(ctx, settings, keys, lead.email, message);
	if (sent) await leads(ctx).updateIf(lead.id, { where: {}, set: { deliveredAt: nowIso() } });
	return sent;
}

export async function sendConfirm(ctx: Ctx, lead: StoredLead, settings: LeadCaptureSettings, keys: ServiceKeys): Promise<boolean> {
	const message = confirmEmail({ name: lead.name, label: lead.deliverableLabel, confirmUrl: confirmUrl(ctx, lead) }, emailTheme(ctx, settings));
	return sendMail(ctx, settings, keys, lead.email, message);
}

/** Issue a fresh download token and restart its expiry clock. */
async function refreshToken(ctx: Ctx, id: string): Promise<StoredLead | null> {
	const res = await leads(ctx).updateIf(id, { where: {}, set: { downloadToken: randomToken(), tokenIssuedAt: nowIso() } });
	return res.applied ? (res.data as StoredLead) : null;
}

const fetchOf = (ctx: Ctx): Fetch | null => (ctx.http ? ctx.http.fetch.bind(ctx.http) : null);

/** Forward one subscriber now; a failure becomes a durable retry job. */
export async function forwardNow(ctx: Ctx, service: string, list: string, lead: Pick<StoredLead, "id" | "email" | "name">, attempt = 0): Promise<boolean> {
	const fetch = fetchOf(ctx);
	if (!isServiceId(service) || !fetch) return false;
	const keys = await readKeys(ctx);
	const ok = await forwardSubscriber(service, list, { email: lead.email, name: lead.name }, keys, fetch);
	if (ok) return true;
	const next = attempt + 1;
	if (next < LIMITS.forwardAttempts) {
		await forwards(ctx).put(`fwd_${lead.id}_${service}`, {
			service,
			list,
			email: lead.email,
			name: lead.name,
			tags: [],
			attempt: next,
			dueAt: Date.now() + LIMITS.forwardBackoffMs * next,
			leadId: lead.id,
		});
	} else {
		await logForwardFailure(ctx, service, list, lead.email);
	}
	return false;
}

export interface ForwardFailure {
	time: string;
	service: string;
	list: string;
	email: string;
}

async function logForwardFailure(ctx: Ctx, service: string, list: string, email: string): Promise<void> {
	const log = (await ctx.kv.get<ForwardFailure[]>("forward-failures")) ?? [];
	log.push({ time: nowIso(), service, list, email: redact(email) });
	await ctx.kv.set("forward-failures", log.slice(-20));
}

/** Post-capture side effects: confirmation, or delivery plus forwarding. */
async function afterCapture(ctx: Ctx, lead: StoredLead, settings: LeadCaptureSettings, keys: ServiceKeys): Promise<void> {
	if (settings.double_optin) {
		await sendConfirm(ctx, lead, settings, keys);
		return;
	}
	await sendDelivery(ctx, lead, settings, keys);
	if (lead.newsletterOptIn) {
		const [service, list] = effectiveService(lead, settings);
		if (service) after(() => forwardNow(ctx, service, list, lead).then(() => undefined));
	}
}

async function notifyOwner(ctx: Ctx, lead: StoredLead, settings: LeadCaptureSettings, keys: ServiceKeys): Promise<void> {
	if (!settings.notify_admin) return;
	const to = settings.notify_email || (await ownerEmail(ctx));
	if (!to) return;
	const notice = ownerNotice({ email: lead.email, name: lead.name, page: lead.sourcePath, adminUrl: ctx.url("/_emdash/admin/plugins/lead-capture/") });
	await sendMail(ctx, settings, keys, to, { subject: notice.subject, text: notice.text, html: "" });
}

/** The submit route. Always answers 200 with `{ success, message }`, as WordPress did. */
export async function submit(ctx: RouteContext<unknown>, input: SubmitInput): Promise<SubmitResult> {
	// No CSRF token on purpose: pages are cached far longer than a token
	// lives. The sealed block config, honeypot, rate limits and Akismet carry
	// the abuse protection for this anonymous action.
	if (typeof input.website === "string" && input.website !== "") return fail(MESSAGES.honeypot);

	const email = sanitizeEmail(input.email);
	const name = sanitizeText(input.name);
	const newsletter = input.newsletter_opt_in === true || input.newsletter_opt_in === "1" || input.newsletter_opt_in === 1;
	if (!email) return fail(MESSAGES.invalidEmail);

	const ip = ctx.requestMeta.ip ?? "unknown";
	const emailKey = email.toLowerCase();
	if (!(await withinLimit(ctx, "ip", ip, LIMITS.perIp, LIMITS.windowMs)) || !(await withinLimit(ctx, "em", emailKey, LIMITS.perEmail, LIMITS.windowMs))) {
		return fail(MESSAGES.rateLimited);
	}

	// The deliverable and forwarding config come from the sealed block, never
	// from anything else in the request.
	const config = await openBlockConfig(input.block_key);
	if (!config?.deliverableUrl) return fail(MESSAGES.configError);

	const [settings, keys] = await Promise.all([readSettings(ctx), readKeys(ctx)]);
	const doubleOptIn = settings.double_optin;
	const captured = doubleOptIn ? MESSAGES.capturedDoubleOptIn : MESSAGES.captured;
	const id = await leadId(emailKey, config.path);
	const col = leads(ctx);
	const consent = newsletter ? consentRecord("lead-capture-form", config.newsletterLabel) : null;

	const existing = await col.get(id);
	if (existing) {
		if (existing.status === "active") {
			const fresh = (await refreshToken(ctx, id)) ?? existing;
			await sendDelivery(ctx, fresh, settings, keys);
			return done(MESSAGES.alreadySent);
		}
		if (existing.status === "pending") {
			await sendConfirm(ctx, existing, settings, keys);
			return done(MESSAGES.confirmResent);
		}
		if (existing.status === "trash") {
			// Restore rather than insert a second row for the same email and page.
			const restored = await col.updateIf(id, {
				where: { status: "trash" },
				set: {
					status: doubleOptIn ? "pending" : "active",
					live: true,
					name: name || existing.name,
					newsletterOptIn: newsletter,
					consent,
					downloadToken: randomToken(),
					tokenIssuedAt: nowIso(),
					confirmToken: doubleOptIn ? randomToken() : "",
				},
			});
			if (restored.applied) await afterCapture(ctx, restored.data as StoredLead, settings, keys);
			return done(captured);
		}
		// Spam (or unverified): answer as if it worked, change nothing.
		return done(captured);
	}

	let spam = { isSpam: false, score: "" };
	const fetch = fetchOf(ctx);
	if (keys.akismet && fetch) {
		spam = await akismetCheck(
			keys.akismet,
			{ blog: ctx.site.url, ip, userAgent: ctx.requestMeta.userAgent ?? "", referrer: ctx.requestMeta.referer ?? "", name, email },
			fetch,
		);
	}

	const status: LeadStatus = spam.isSpam ? "spam" : doubleOptIn ? "pending" : "active";
	const now = nowIso();
	const lead = toStored({
		id,
		email,
		emailKey,
		name,
		sourcePath: config.path,
		sourceUrl: sourceUrlFor(ctx, input.source_url, config.path),
		sourceType: "block",
		deliverableUrl: config.deliverableUrl,
		deliverableLabel: config.deliverableLabel,
		service: effectiveService(config, settings)[0],
		list: effectiveService(config, settings)[1],
		newsletterOptIn: newsletter,
		status,
		spamScore: spam.score,
		downloadToken: randomToken(),
		confirmToken: doubleOptIn && !spam.isSpam ? randomToken() : "",
		consent,
		tokenIssuedAt: now,
		confirmedAt: null,
		deliveredAt: null,
		clickedAt: null,
		createdAt: now,
	});

	const created = await col.compareAndSet(id, null, lead);
	if (!created.applied) return done(captured); // a concurrent submit for the same email and page won
	if (status === "spam") return done(captured);

	await afterCapture(ctx, lead, settings, keys);
	after(async () => {
		await bumpStat(ctx, lead.sourcePath, "submissions");
		await notifyOwner(ctx, lead, settings, keys);
	});

	// Instant success action: hand back the tokenized link (never with
	// double opt-in, where confirmation gates delivery).
	return !doubleOptIn && config.successAction === "instant" ? done(captured, { download_url: downloadUrl(ctx, lead) }) : done(captured);
}

export type DownloadResult = { status: "ok"; url: string } | { status: "invalid" } | { status: "expired" };

/** When the current token was issued (UTC ms); pre-token rows fall back to creation. */
function tokenIssuedAt(lead: StoredLead): number {
	return Date.parse(lead.tokenIssuedAt ?? lead.createdAt) || 0;
}

export async function resolveDownload(ctx: Ctx, token: string): Promise<DownloadResult> {
	const row = await findByToken(ctx, "downloadToken", token);
	const lead = row?.data;
	if (!lead || !lead.deliverableUrl || lead.status !== "active") return { status: "invalid" };
	const settings = await readSettings(ctx);
	if (settings.link_expiry_days > 0 && tokenIssuedAt(lead) < Date.now() - settings.link_expiry_days * DAY_MS) return { status: "expired" };
	// Only the first click is stamped.
	if (!lead.clickedAt) await leads(ctx).updateIf(row.id, { where: { clicked: false }, set: { clickedAt: nowIso(), clicked: true } });
	return { status: "ok", url: lead.deliverableUrl };
}

/** Double opt-in confirmation. Returns where to send the visitor. */
export async function confirm(ctx: Ctx, token: string): Promise<{ redirect: string }> {
	const row = await findByToken(ctx, "confirmToken", token);
	const home = ctx.url("/");
	if (!row || row.data.status !== "pending") return { redirect: row ? ctx.url(row.data.sourcePath) : home };

	const claimed = await leads(ctx).updateIf(row.id, {
		where: { status: "pending" },
		set: { status: "active", live: true, confirmedAt: nowIso(), confirmToken: "", tokenIssuedAt: nowIso() },
	});
	if (!claimed.applied) return { redirect: ctx.url(row.data.sourcePath) };
	const lead = claimed.data as StoredLead;
	const [settings, keys] = await Promise.all([readSettings(ctx), readKeys(ctx)]);
	await sendDelivery(ctx, lead, settings, keys);
	if (lead.newsletterOptIn && lead.service) after(() => forwardNow(ctx, lead.service, lead.list, lead).then(() => undefined));
	const target = new URL(ctx.url(lead.sourcePath));
	target.searchParams.set("md_lead_confirmed", "1");
	return { redirect: target.toString() };
}

export type LeadAction = "resend" | "spam" | "unspam" | "trash" | "restore" | "delete";
export const LEAD_ACTIONS: readonly LeadAction[] = ["resend", "spam", "unspam", "trash", "restore", "delete"];

/** Admin row and bulk actions, as in WordPress. */
export async function applyAction(ctx: Ctx, action: LeadAction, lead: StoredLead, settings: LeadCaptureSettings, keys: ServiceKeys): Promise<void> {
	const fetch = fetchOf(ctx);
	const report = (kind: "spam" | "ham") =>
		keys.akismet && fetch ? akismetReport(keys.akismet, kind, { blog: ctx.site.url, name: lead.name, email: lead.email }, fetch) : Promise.resolve();

	switch (action) {
		case "resend":
			if (lead.status === "active") {
				const fresh = (await refreshToken(ctx, lead.id)) ?? lead;
				await sendDelivery(ctx, fresh, settings, keys);
			} else if (lead.status === "pending") {
				await sendConfirm(ctx, lead, settings, keys);
			}
			break;
		case "spam":
			await setStatus(ctx, lead.id, "spam");
			after(() => report("spam"));
			break;
		case "unspam": {
			await setStatus(ctx, lead.id, "active");
			after(() => report("ham"));
			const fresh = (await refreshToken(ctx, lead.id)) ?? lead;
			await sendDelivery(ctx, { ...fresh, status: "active" }, settings, keys);
			break;
		}
		case "trash":
			await setStatus(ctx, lead.id, "trash");
			break;
		case "restore":
			await setStatus(ctx, lead.id, "active");
			break;
		case "delete":
			await leads(ctx).delete(lead.id);
			break;
	}
}

/** Daily retention: spam and trash after 90 days, everything after `retention_days` when set. */
export async function purgeOld(ctx: Ctx, now = Date.now()): Promise<number> {
	const settings = await readSettings(ctx);
	let removed = 0;
	const sweep = async (where: Record<string, unknown>) => {
		for (let page = 0; page < 40; page++) {
			// 50 per batch: D1 caps a statement at 100 bound parameters.
			const { items } = await leads(ctx).query({ where: where as never, limit: 50 });
			if (!items.length) break;
			removed += await leads(ctx).deleteMany(items.map((i) => i.id));
			if (items.length < 50) break;
		}
	};
	const junkCutoff = new Date(now - LIMITS.junkRetentionDays * DAY_MS).toISOString();
	await sweep({ status: { in: ["spam", "trash"] }, createdAt: { lt: junkCutoff } });
	if (settings.retention_days > 0) await sweep({ createdAt: { lt: new Date(now - settings.retention_days * DAY_MS).toISOString() } });
	return removed;
}

/** Retry forwards that are due (cron). */
export async function runDueForwards(ctx: Ctx, now = Date.now()): Promise<void> {
	const { items } = await forwards(ctx).query({ where: { dueAt: { lte: now } }, orderBy: { dueAt: "asc" }, limit: 20 });
	for (const { id, data } of items) {
		await forwards(ctx).delete(id);
		await forwardNow(ctx, data.service, data.list, { id: data.leadId, email: data.email, name: data.name }, data.attempt);
	}
}
