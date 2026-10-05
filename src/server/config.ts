/**
 * Settings, secrets and rate limits.
 *
 * Settings live in EmDash plugin settings (`admin.settingsSchema`), with the
 * WordPress option keys. API keys are `secret` fields, encrypted at rest.
 */
import type { PluginContext } from "emdash";

import { sha256Hex } from "../core/crypto.js";
import { DEFAULT_SETTINGS } from "../core/defaults.js";
import type { LeadCaptureSettings, ServiceId, ServiceKeys } from "../core/types.js";
import { counters } from "./storage.js";

type Ctx = Pick<PluginContext, "settings" | "kv" | "storage">;

export const SECRET_KEYS: Record<ServiceId | "akismet", string> = {
	emailit: "emailit_api_key",
	mailchimp: "mailchimp_api_key",
	kit: "kit_api_key",
	convertkit: "convertkit_api_key",
	mailerlite: "mailerlite_api_key",
	brevo: "brevo_api_key",
	beehiiv: "beehiiv_api_key",
	sendfox: "sendfox_api_key",
	akismet: "akismet_api_key",
};

export async function readSettings(ctx: Ctx): Promise<LeadCaptureSettings> {
	const keys = Object.keys(DEFAULT_SETTINGS) as (keyof LeadCaptureSettings)[];
	const values = await Promise.all(keys.map((k) => ctx.settings.get<unknown>(k)));
	const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
	keys.forEach((k, i) => {
		const v = values[i];
		const d = DEFAULT_SETTINGS[k];
		if (v === undefined || v === null || v === "") return;
		if (typeof d === "number") {
			const n = Number(v);
			if (Number.isFinite(n)) out[k] = Math.max(0, Math.trunc(n));
		} else if (typeof d === "boolean") {
			out[k] = v === true || v === "1" || v === 1 || v === "true";
		} else if (typeof v === "string") {
			out[k] = v.trim();
		}
	});
	const s = out as unknown as LeadCaptureSettings;
	s.link_expiry_days = Math.min(365, s.link_expiry_days);
	s.retention_days = Math.min(3650, s.retention_days);
	return s;
}

export async function readKeys(ctx: Ctx): Promise<ServiceKeys> {
	const entries = await Promise.all(
		(Object.entries(SECRET_KEYS) as [keyof ServiceKeys, string][]).map(async ([service, key]) => {
			const v = await ctx.settings.get<string>(key);
			return [service, typeof v === "string" ? v.trim() : ""] as const;
		}),
	);
	return Object.fromEntries(entries.filter(([, v]) => v)) as ServiceKeys;
}

/**
 * Sliding-window limit, as WordPress's transient did: each counted attempt
 * pushes the window end out again. Returns false once `max` is reached.
 */
export async function withinLimit(ctx: Ctx, bucket: string, subject: string, max: number, windowMs: number, now = Date.now()): Promise<boolean> {
	const id = `${bucket}:${(await sha256Hex(subject)).slice(0, 32)}`;
	const col = counters(ctx);
	const current = await col.getVersioned(id);
	const live = current && current.value.exp > now ? current.value : null;
	if (live && live.count >= max) return false;
	const next = { count: (live?.count ?? 0) + 1, exp: now + windowMs };
	const res = await col.compareAndSet(id, current?.revision ?? null, next);
	// Lost a race with a concurrent attempt: count it as allowed once rather
	// than failing an honest visitor; the next attempt sees the new count.
	return res.applied || next.count <= max;
}

/** First-call-wins marker that expires (impression dedupe). */
export async function firstWithin(ctx: Ctx, bucket: string, subject: string, windowMs: number, now = Date.now()): Promise<boolean> {
	const id = `${bucket}:${(await sha256Hex(subject)).slice(0, 32)}`;
	const col = counters(ctx);
	const current = await col.getVersioned(id);
	if (current && current.value.exp > now) return false;
	const res = await col.compareAndSet(id, current?.revision ?? null, { count: 1, exp: now + windowMs });
	return res.applied;
}
