/**
 * Admin routes: lead views, actions, stats, export, privacy and import.
 * All private: EmDash checks the admin session (or an API token) first.
 */
import { PluginRouteError } from "emdash";
import type { PluginContext, RouteContext } from "emdash";

import { sha256Hex } from "../core/crypto.js";
import { DAY_MS } from "../core/defaults.js";
import { LEAD_STATUSES, type ConsentRecord, type Lead, type LeadStatus } from "../core/types.js";
import { readKeys, readSettings } from "./config.js";
import { applyAction, LEAD_ACTIONS, type ForwardFailure, type LeadAction } from "./leads.js";
import { leadId, leads, stats, toPublic, toStored, today, type StatRow, type StoredLead } from "./storage.js";

type Ctx = RouteContext<unknown>;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isStatus = (v: unknown): v is LeadStatus => typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);

/** The filter for a view: one status, or "all", which (as in WordPress) leaves out trash. */
function viewWhere(status: unknown): Record<string, unknown> {
	return isStatus(status) ? { status } : { live: true };
}

const SEARCH_SCAN_LIMIT = 2000;

async function listLeads(ctx: Ctx) {
	const input = obj(ctx.input);
	const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
	const where = viewWhere(input.status);
	const search = str(input.search).toLowerCase();
	const col = leads(ctx);

	if (!search) {
		const page = await col.query({ where: where as never, orderBy: { createdAt: "desc" }, limit, cursor: str(input.cursor) || undefined });
		return { items: page.items.map((i) => toPublic(i.data)), cursor: page.hasMore ? page.cursor : undefined };
	}

	// Storage has no substring search: scan newest-first and match in code,
	// stopping at `limit` matches or SEARCH_SCAN_LIMIT rows.
	const items: Lead[] = [];
	let cursor: string | undefined;
	let scanned = 0;
	do {
		const page = await col.query({ where: where as never, orderBy: { createdAt: "desc" }, limit: 100, cursor });
		for (const { data } of page.items) {
			scanned++;
			if (data.emailKey.includes(search) || data.name.toLowerCase().includes(search)) items.push(toPublic(data));
			if (items.length >= limit) break;
		}
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && items.length < limit && scanned < SEARCH_SCAN_LIMIT);
	return { items, truncated: Boolean(cursor) && scanned >= SEARCH_SCAN_LIMIT };
}

async function counts(ctx: Ctx) {
	const col = leads(ctx);
	const [byStatus, newsletter, clicked] = await Promise.all([
		Promise.all(LEAD_STATUSES.map(async (s) => [s, await col.count({ status: s })] as const)),
		col.count({ status: "active", newsletterOptIn: true }),
		col.count({ status: "active", clicked: true }),
	]);
	const map = Object.fromEntries(byStatus) as Record<LeadStatus, number>;
	const all = byStatus.reduce((sum, [s, n]) => (s === "trash" ? sum : sum + n), 0);
	return { ...map, all, newsletter, clicked };
}

async function statsSummary(ctx: Ctx) {
	const days = Math.min(365, Math.max(1, Number(obj(ctx.input).days) || 30));
	const since = today(Date.now() - days * DAY_MS);
	const daily = new Map<string, { impressions: number; submissions: number }>();
	const pages = new Map<string, { impressions: number; submissions: number }>();
	let cursor: string | undefined;
	for (let page = 0; page < 100; page++) {
		const res = await stats(ctx).query({ where: { day: { gte: since } }, limit: 100, cursor });
		for (const { data } of res.items) {
			const d = daily.get(data.day) ?? { impressions: 0, submissions: 0 };
			d.impressions += data.impressions ?? 0;
			d.submissions += data.submissions ?? 0;
			daily.set(data.day, d);
			const p = pages.get(data.path) ?? { impressions: 0, submissions: 0 };
			p.impressions += data.impressions ?? 0;
			p.submissions += data.submissions ?? 0;
			pages.set(data.path, p);
		}
		cursor = res.hasMore ? res.cursor : undefined;
		if (!cursor) break;
	}
	return {
		since,
		daily: [...daily].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
		pages: [...pages]
			.map(([path, v]) => ({ path, ...v }))
			.sort((a, b) => b.submissions - a.submissions || b.impressions - a.impressions)
			.slice(0, 10),
	};
}

async function act(ctx: Ctx) {
	const input = obj(ctx.input);
	const action = str(input.action) as LeadAction;
	if (!LEAD_ACTIONS.includes(action)) throw new PluginRouteError("VALIDATION_ERROR", "Unknown action", 400);
	const ids = Array.isArray(input.ids) ? input.ids.filter((v): v is string => typeof v === "string").slice(0, 100) : [];
	if (!ids.length) throw new PluginRouteError("VALIDATION_ERROR", "No leads selected", 400);
	const [settings, keys] = await Promise.all([readSettings(ctx), readKeys(ctx)]);
	let updated = 0;
	for (const id of ids) {
		const lead = await leads(ctx).get(id);
		if (!lead) continue;
		await applyAction(ctx, action, lead, settings, keys);
		updated++;
	}
	return { updated };
}

/** One page of leads for the CSV export; the admin assembles the file. */
async function exportPage(ctx: Ctx) {
	const input = obj(ctx.input);
	const page = await leads(ctx).query({ where: viewWhere(input.status ?? "active") as never, orderBy: { createdAt: "desc" }, limit: 100, cursor: str(input.cursor) || undefined });
	return { items: page.items.map((i) => toPublic(i.data)), cursor: page.hasMore ? page.cursor : undefined };
}

async function byEmail(ctx: Pick<PluginContext, "storage">, email: string): Promise<{ id: string; data: StoredLead }[]> {
	const { items } = await leads(ctx).query({ where: { emailKey: email.toLowerCase() }, limit: 100 });
	return items;
}

/** What WordPress's personal-data exporter listed, per lead. */
async function privacyExport(ctx: Ctx) {
	const email = str(obj(ctx.input).email);
	if (!email) throw new PluginRouteError("VALIDATION_ERROR", "Enter an email address", 400);
	return {
		items: (await byEmail(ctx, email)).map(({ data: lead }) => {
			const rows: [string, string][] = [
				["Name", lead.name],
				["Email", lead.email],
				["Source Page", lead.sourceUrl],
				["Captured via", lead.sourceType],
				["Resource", lead.deliverableLabel],
				["Newsletter opt-in", lead.newsletterOptIn ? "Yes" : "No"],
				["Status", lead.status],
				["Date", lead.createdAt],
			];
			if (lead.consent?.source) {
				rows.push(["Consent given via", lead.consent.source], ["Consent wording", lead.consent.text], ["Consent wording version", lead.consent.version], ["Consent given at (UTC)", lead.consent.at]);
			}
			if (lead.confirmedAt) rows.push(["Email confirmed", lead.confirmedAt]);
			return { id: lead.id, data: rows.map(([name, value]) => ({ name, value })) };
		}),
	};
}

async function privacyErase(ctx: Ctx) {
	const email = str(obj(ctx.input).email);
	if (!email) throw new PluginRouteError("VALIDATION_ERROR", "Enter an email address", 400);
	const items = await byEmail(ctx, email);
	const removed = items.length ? await leads(ctx).deleteMany(items.map((i) => i.id)) : 0;
	return { removed };
}

/** A row from WordPress's `md_leads` table, as exported. */
interface WpLeadRow {
	id: number | string;
	email: string;
	name?: string;
	source_post_id?: number | string;
	source_url?: string;
	source_type?: string;
	deliverable_url?: string;
	deliverable_label?: string;
	newsletter_opt_in?: number | string;
	status?: string;
	spam_score?: string;
	download_token?: string;
	confirm_token?: string;
	consent?: string | null;
	token_issued_at?: string | null;
	confirmed_at?: string | null;
	delivered_at?: string | null;
	clicked_at?: string | null;
	created_at?: string;
}

interface WpStatRow {
	stat_date: string;
	post_id: number | string;
	impressions?: number | string;
	submissions?: number | string;
}

/** WordPress `Y-m-d H:i:s` (site time) to ISO UTC. */
function wpTime(value: string | null | undefined, offsetMinutes: number): string | null {
	if (!value || value.startsWith("0000")) return null;
	const ms = Date.parse(`${value.replace(" ", "T")}Z`);
	return Number.isNaN(ms) ? null : new Date(ms - offsetMinutes * 60_000).toISOString();
}

function pathOf(row: { source_post_id?: number | string; source_url?: string }, paths: Record<string, string>): string {
	const mapped = paths[String(row.source_post_id ?? "")];
	if (mapped) return mapped;
	try {
		return new URL(row.source_url ?? "").pathname || "/";
	} catch {
		return "/";
	}
}

/**
 * Import WordPress leads and stats. Tokens are kept, so download and confirm
 * links already emailed keep working. Re-running updates in place.
 * `paths` maps WordPress post ids to page paths on this site.
 */
async function importWordPress(ctx: Ctx) {
	const input = obj(ctx.input);
	const paths = obj(input.paths) as Record<string, string>;
	// created_at, confirmed_at, delivered_at and clicked_at were site-local time.
	const offset = Number(input.gmtOffsetMinutes) || 0;
	const rows = Array.isArray(input.leads) ? (input.leads as WpLeadRow[]) : [];
	let imported = 0;
	for (const row of rows) {
		const email = str(row.email);
		if (!email) continue;
		const sourcePath = pathOf(row, paths);
		let consent: ConsentRecord | null = null;
		try {
			const parsed = row.consent ? (JSON.parse(row.consent) as ConsentRecord) : null;
			consent = parsed?.source ? parsed : null;
		} catch {
			consent = null;
		}
		const createdAt = wpTime(row.created_at, offset) ?? new Date().toISOString();
		const lead: Lead = {
			id: await leadId(email.toLowerCase(), sourcePath),
			email,
			emailKey: email.toLowerCase(),
			name: str(row.name),
			sourcePath,
			sourceUrl: str(row.source_url),
			sourceType: str(row.source_type) || "block",
			deliverableUrl: str(row.deliverable_url),
			deliverableLabel: str(row.deliverable_label),
			service: "",
			list: "",
			newsletterOptIn: String(row.newsletter_opt_in ?? "0") === "1",
			status: isStatus(row.status) ? row.status : "active",
			spamScore: str(row.spam_score),
			downloadToken: str(row.download_token),
			confirmToken: str(row.confirm_token),
			consent,
			// token_issued_at was already UTC in WordPress.
			tokenIssuedAt: wpTime(row.token_issued_at, 0) ?? createdAt,
			confirmedAt: wpTime(row.confirmed_at, offset),
			deliveredAt: wpTime(row.delivered_at, offset),
			clickedAt: wpTime(row.clicked_at, offset),
			createdAt,
			legacyId: Number(row.id) || undefined,
			legacySourcePostId: Number(row.source_post_id) || undefined,
		};
		await leads(ctx).put(lead.id, toStored(lead));
		imported++;
	}

	const totals = new Map<string, StatRow>();
	for (const row of Array.isArray(input.stats) ? (input.stats as WpStatRow[]) : []) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(row.stat_date)) continue;
		const path = pathOf({ source_post_id: row.post_id }, paths);
		const key = `${row.stat_date}|${path}`;
		const t = totals.get(key) ?? { day: row.stat_date, path, impressions: 0, submissions: 0 };
		t.impressions += Number(row.impressions) || 0;
		t.submissions += Number(row.submissions) || 0;
		totals.set(key, t);
	}
	for (const t of totals.values()) {
		await stats(ctx).put(`${t.day}|${(await sha256Hex(t.path)).slice(0, 24)}`, t);
	}
	return { leads: imported, stats: totals.size };
}

export const adminRoutes: Record<string, (ctx: Ctx) => Promise<unknown>> = {
	"leads/list": listLeads,
	"leads/counts": counts,
	"leads/action": act,
	"leads/export": exportPage,
	"stats/summary": statsSummary,
	"forward/failures": async (ctx) => ({ items: (await ctx.kv.get<ForwardFailure[]>("forward-failures")) ?? [] }),
	"privacy/export": privacyExport,
	"privacy/erase": privacyErase,
	import: importWordPress,
};

