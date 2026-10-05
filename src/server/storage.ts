/**
 * Storage collections and typed accessors.
 *
 * EmDash storage queries are AND-only and every filtered or sorted field must
 * be indexed, so the lead document carries a few derived fields (`live`,
 * `clicked`) that the admin views filter on. Uniqueness of (email, page),
 * WordPress's UNIQUE KEY, comes from a deterministic document id rather than
 * a unique index, so it holds from the first request after a deploy.
 */
import type { PluginContext, PluginStorageConfig, StorageCollection } from "emdash";

import { sha256Hex } from "../core/crypto.js";
import type { Lead, LeadStatus } from "../core/types.js";

/** A lead as stored: the public shape plus fields that exist for indexing. */
export interface StoredLead extends Lead {
	/** False only for trash: "All" excludes trash, and storage has no `!=`. */
	live: boolean;
	clicked: boolean;
}

export interface StatRow {
	/** `YYYY-MM-DD`, UTC. */
	day: string;
	path: string;
	impressions: number;
	submissions: number;
}

export interface Counter {
	count: number;
	/** Epoch ms when the window ends; the row is ignored and swept after. */
	exp: number;
}

export interface ForwardJob {
	service: string;
	list: string;
	email: string;
	name: string;
	tags: string[];
	attempt: number;
	dueAt: number;
	leadId: string;
}

export const STORAGE: PluginStorageConfig = {
	leads: {
		indexes: [
			"status",
			"emailKey",
			"sourcePath",
			"createdAt",
			"downloadToken",
			"confirmToken",
			"live",
			"clicked",
			"newsletterOptIn",
			["status", "createdAt"],
			["live", "createdAt"],
		],
	},
	stats: { indexes: ["day", "path"] },
	counters: { indexes: ["exp"] },
	forwards: { indexes: ["dueAt"] },
};

type Ctx = Pick<PluginContext, "storage">;

export const leads = (ctx: Ctx) => ctx.storage.leads as StorageCollection<StoredLead>;
export const stats = (ctx: Ctx) => ctx.storage.stats as StorageCollection<StatRow>;
export const counters = (ctx: Ctx) => ctx.storage.counters as StorageCollection<Counter>;
export const forwards = (ctx: Ctx) => ctx.storage.forwards as StorageCollection<ForwardJob>;

/** The one lead per (email, page) pair, as in WordPress's UNIQUE(email, post). */
export async function leadId(emailKey: string, sourcePath: string): Promise<string> {
	return `lead_${(await sha256Hex(`${emailKey}|${sourcePath}`)).slice(0, 32)}`;
}

export function toStored(lead: Lead): StoredLead {
	return { ...lead, live: lead.status !== "trash", clicked: Boolean(lead.clickedAt) };
}

/** Strip the index-only fields before a lead leaves the server. */
export function toPublic(stored: StoredLead): Lead {
	const { live: _live, clicked: _clicked, ...lead } = stored;
	return lead;
}

export async function findByToken(ctx: Ctx, field: "downloadToken" | "confirmToken", token: string): Promise<{ id: string; data: StoredLead } | null> {
	if (!/^[A-Za-z0-9]{20,64}$/.test(token)) return null;
	const { items } = await leads(ctx).query({ where: { [field]: token }, limit: 1 });
	return items[0] ?? null;
}

/** Update a lead's status, keeping the derived fields in step. */
export async function setStatus(ctx: Ctx, id: string, status: LeadStatus, extra: Partial<StoredLead> = {}): Promise<boolean> {
	const res = await leads(ctx).updateIf(id, { where: {}, set: { ...extra, status, live: status !== "trash" } });
	return res.applied;
}

/** `YYYY-MM-DD` in UTC. */
export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Add one to a day's impressions or submissions for a page. */
export async function bumpStat(ctx: Ctx, path: string, field: "impressions" | "submissions", now = Date.now()): Promise<void> {
	const day = today(now);
	const id = `${day}|${(await sha256Hex(path)).slice(0, 24)}`;
	const col = stats(ctx);
	const bumped = await col.updateIf(id, { where: {}, delta: { [field]: { inc: 1 } } });
	if (bumped.applied) return;
	const created = await col.compareAndSet(id, null, { day, path, impressions: field === "impressions" ? 1 : 0, submissions: field === "submissions" ? 1 : 0 });
	// Lost a create race: the row exists now, so the increment applies.
	if (!created.applied) await col.updateIf(id, { where: {}, delta: { [field]: { inc: 1 } } });
}
