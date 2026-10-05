/**
 * Pure helpers for the Lead Capture admin: views, row and bulk actions,
 * percentages, the 30-day series behind the sparkline, CSV and JSON exports,
 * and formatting. No React and no network here, so they're unit-tested.
 */

import { leadsToCsv } from "../core/csv.js";
import type { Lead, LeadStatus } from "../core/types.js";

// =============================================================================
// Views
// =============================================================================

/** A status view. "all" is everything except trash, as in WordPress. */
export type LeadView = "all" | LeadStatus;

export const VIEWS: readonly LeadView[] = ["all", "active", "pending", "unverified", "spam", "trash"];

export const VIEW_LABELS: Readonly<Record<LeadView, string>> = {
	all: "All",
	active: "Active",
	pending: "Pending",
	unverified: "Unverified",
	spam: "Spam",
	trash: "Trash",
};

export const STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
	active: "Active",
	pending: "Pending",
	unverified: "Unverified",
	spam: "Spam",
	trash: "Trash",
};

/** What `leads/counts` returns. */
export interface LeadCounts extends Record<LeadStatus, number> {
	/** Every lead except trash. */
	all: number;
	/** Active leads who opted in to the newsletter. */
	newsletter: number;
	/** Active leads who opened their download link. */
	clicked: number;
}

export function parseView(value: string | null | undefined): LeadView {
	return VIEWS.includes(value as LeadView) ? (value as LeadView) : "all";
}

/**
 * Views to show: All and Active always, the others only when they hold
 * leads, or when they're the view on screen (so emptying it doesn't hide it).
 */
export function visibleViews(counts: LeadCounts | null, current: LeadView): LeadView[] {
	return VIEWS.filter((view) => view === "all" || view === "active" || view === current || (counts?.[view] ?? 0) > 0);
}

/** Whether a lead with `status` belongs in `view`. */
export function matchesView(status: LeadStatus, view: LeadView): boolean {
	return view === "all" ? status !== "trash" : status === view;
}

// =============================================================================
// Actions
// =============================================================================

/** Mirrors the server's LEAD_ACTIONS. */
export type LeadAction = "resend" | "spam" | "unspam" | "trash" | "restore" | "delete";

export const ACTION_ORDER: readonly LeadAction[] = ["resend", "unspam", "spam", "restore", "trash", "delete"];

export const ACTION_LABELS: Readonly<Record<LeadAction, string>> = {
	resend: "Resend",
	spam: "Spam",
	unspam: "Not spam",
	trash: "Trash",
	restore: "Restore",
	delete: "Delete permanently",
};

/** One-line explanations, used as button descriptions. */
export const ACTION_HELP: Readonly<Record<LeadAction, string>> = {
	resend: "Email the download link again (pending leads get the confirmation email).",
	spam: "Mark as spam. Reported to Akismet when a key is set.",
	unspam: "Restore as active and email the download link.",
	trash: "Move to the trash. Trash empties after 90 days.",
	restore: "Restore as active.",
	delete: "Delete permanently. This can't be undone.",
};

/**
 * Actions valid for one lead, as in WordPress: resend for active and pending
 * leads, spam or not spam, trash or restore, and delete only from the trash.
 */
export function rowActions(status: LeadStatus): LeadAction[] {
	switch (status) {
		case "active":
		case "pending":
			return ["resend", "spam", "trash"];
		case "unverified":
			return ["spam", "trash"];
		case "spam":
			return ["unspam", "trash"];
		case "trash":
			return ["restore", "delete"];
	}
}

/**
 * Bulk actions for a selection: every action valid for at least one selected
 * lead, in a stable order. Delete permanently only in the trash view.
 */
export function bulkActions(statuses: readonly LeadStatus[], view: LeadView): LeadAction[] {
	const valid = new Set(statuses.flatMap(rowActions));
	return ACTION_ORDER.filter((action) => valid.has(action) && (action !== "delete" || view === "trash"));
}

/** The selected leads an action applies to; the rest are skipped. */
export function applicableIds(leads: readonly Pick<Lead, "id" | "status">[], action: LeadAction): string[] {
	return leads.filter((lead) => rowActions(lead.status).includes(action)).map((lead) => lead.id);
}

/** A lead's status after an action, or null when it's deleted. */
export function statusAfter(action: LeadAction, status: LeadStatus): LeadStatus | null {
	switch (action) {
		case "resend":
			return status;
		case "spam":
			return "spam";
		case "unspam":
		case "restore":
			return "active";
		case "trash":
			return "trash";
		case "delete":
			return null;
	}
}

/** The announcement after an action ran on `count` leads. */
export function actionDoneMessage(action: LeadAction, count: number, skipped = 0): string {
	const leads = pluralize(count, "lead");
	const base = {
		resend: `Resent the email to ${leads}.`,
		spam: `Marked ${leads} as spam.`,
		unspam: `Restored ${leads} from spam and sent the download link.`,
		trash: `Moved ${leads} to the trash.`,
		restore: `Restored ${leads}.`,
		delete: `Deleted ${leads} permanently.`,
	}[action];
	return skipped > 0 ? `${base} Skipped ${pluralize(skipped, "lead")} the action doesn't apply to.` : base;
}

// =============================================================================
// Numbers
// =============================================================================

/** `part` as a percentage of `whole`, or null when `whole` is zero. */
export function percentOf(part: number, whole: number): number | null {
	return whole > 0 ? (part / whole) * 100 : null;
}

/** "34%", "12.5%" or "—" when there's nothing to divide by. */
export function formatPercent(value: number | null, digits = 0): string {
	if (value === null || !Number.isFinite(value)) return "—";
	const factor = 10 ** digits;
	const rounded = Math.round(value * factor) / factor;
	return `${rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

/** Conversion for a page: submissions per impression, one decimal, "—" without impressions. */
export function conversionLabel(submissions: number, impressions: number): string {
	return formatPercent(percentOf(submissions, impressions), 1);
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
	return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

// =============================================================================
// Daily stats and the sparkline
// =============================================================================

export interface DailyStat {
	day: string;
	impressions: number;
	submissions: number;
}

export interface PageStat {
	path: string;
	impressions: number;
	submissions: number;
}

export interface StatsSummary {
	since: string;
	daily: DailyStat[];
	pages: PageStat[];
}

export const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in UTC, the key the server stores stats under. */
export function utcDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The last `days` days ending on `endDay` (inclusive), oldest first, with
 * zeros for days the server has no row for.
 */
export function dailySeries(daily: readonly DailyStat[], endDay: string, days = 30): DailyStat[] {
	const byDay = new Map(daily.map((d) => [d.day, d]));
	const end = Date.parse(`${endDay}T00:00:00Z`);
	const out: DailyStat[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const day = utcDay(end - i * DAY_MS);
		const row = byDay.get(day);
		out.push({ day, impressions: row?.impressions ?? 0, submissions: row?.submissions ?? 0 });
	}
	return out;
}

/** Submissions over the last `days` entries of a series. */
export function sumLast(series: readonly DailyStat[], days: number): number {
	return series.slice(-days).reduce((sum, d) => sum + d.submissions, 0);
}

/** The busiest day in a series, or null when every day is zero. */
export function peakDay(series: readonly DailyStat[]): DailyStat | null {
	let peak: DailyStat | null = null;
	for (const d of series) if (d.submissions > 0 && (!peak || d.submissions > peak.submissions)) peak = d;
	return peak;
}

/**
 * `points` for an SVG polyline: values spread across `width`, scaled into
 * `height` minus `pad` on each side, with y growing downward. A flat series
 * lies on the baseline.
 */
export function sparklinePoints(values: readonly number[], width: number, height: number, pad = 2): string {
	if (values.length === 0) return "";
	const max = Math.max(0, ...values);
	const inner = Math.max(0, height - pad * 2);
	const round = (n: number) => Math.round(n * 100) / 100;
	const yOf = (v: number) => round(max > 0 ? pad + inner - (Math.max(0, v) / max) * inner : pad + inner);
	// A single point would draw nothing: stretch it into a flat segment.
	if (values.length === 1) return `0,${yOf(values[0]!)} ${round(width)},${yOf(values[0]!)}`;
	const step = width / (values.length - 1);
	return values.map((v, i) => `${round(i * step)},${yOf(v)}`).join(" ");
}

// =============================================================================
// Exports
// =============================================================================

/** `YYYY-MM-DD` in the browser's time zone. */
export function localDay(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function csvFilename(date: Date = new Date()): string {
	return `leads-${localDay(date)}.csv`;
}

export function privacyFilename(date: Date = new Date()): string {
	return `lead-personal-data-${localDay(date)}.json`;
}

export interface LeadPage {
	items: Lead[];
	cursor?: string;
}

/**
 * Fetch every page of an export (100 leads each) and build the CSV, with the
 * WordPress columns. `onProgress` reports the running total.
 */
export async function collectCsv(
	fetchPage: (cursor: string | undefined) => Promise<LeadPage>,
	onProgress?: (count: number) => void,
	maxPages = 10_000,
): Promise<{ csv: string; count: number }> {
	const leads: Lead[] = [];
	const seen = new Set<string>();
	let cursor: string | undefined;
	for (let page = 0; page < maxPages; page++) {
		const res = await fetchPage(cursor);
		for (const lead of res.items) {
			if (seen.has(lead.id)) continue;
			seen.add(lead.id);
			leads.push(lead);
		}
		onProgress?.(leads.length);
		if (!res.cursor || res.cursor === cursor) break;
		cursor = res.cursor;
	}
	return { csv: leadsToCsv(leads), count: leads.length };
}

export interface PrivacyRecord {
	id: string;
	data: { name: string; value: string }[];
}

/** The personal-data export as a JSON document. */
export function privacyJson(email: string, items: readonly PrivacyRecord[], now: Date = new Date()): string {
	return `${JSON.stringify(
		{
			email,
			exportedAt: now.toISOString(),
			leads: items.map((item) => Object.fromEntries(item.data.map(({ name, value }) => [name, value]))),
		},
		null,
		2,
	)}\n`;
}

// =============================================================================
// Formatting
// =============================================================================

export function formatDate(iso: string | null | undefined, locale?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined, locale?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Mar 4" for a `YYYY-MM-DD` stats day (read as UTC). */
export function formatDay(day: string, locale?: string): string {
	const d = new Date(`${day}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return day;
	return d.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return fallback;
}

/** A path from a source URL when the lead has none, for display. */
export function sourceLabel(lead: Pick<Lead, "sourcePath" | "sourceUrl">): string {
	if (lead.sourcePath) return lead.sourcePath;
	try {
		return new URL(lead.sourceUrl).pathname || "/";
	} catch {
		return lead.sourceUrl || "—";
	}
}

/** True for http(s) URLs only, so stored values can't become `javascript:` links. */
export function isHttpUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
