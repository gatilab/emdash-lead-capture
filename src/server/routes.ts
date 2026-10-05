/**
 * Route handlers.
 *
 * Public: `submit`, `impression`, `download`, `confirm`. The last two take
 * a 32-character token from an emailed link (holding the token is the
 * permission), and the site's middleware calls them in-process.
 * Admin: see admin.ts.
 */
import { after } from "emdash";
import type { PluginContext, RouteContext } from "emdash";

import { LIMITS } from "../core/defaults.js";
import { openBlockConfig } from "../seal.js";
import { firstWithin, withinLimit } from "./config.js";
import { confirm, purgeOld, resolveDownload, runDueForwards, submit, type SubmitInput } from "./leads.js";
import { bumpStat, counters, today } from "./storage.js";

type Ctx = RouteContext<unknown>;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Schedule the maintenance task once per deployment of this version. */
export async function ensureCron(ctx: Pick<PluginContext, "kv" | "cron">): Promise<void> {
	if (!ctx.cron || (await ctx.kv.get<boolean>("state:cron:v1"))) return;
	await ctx.cron.schedule("maintenance", { schedule: "*/5 * * * *" });
	await ctx.kv.set("state:cron:v1", true);
}

export const publicRoutes = {
	async submit(ctx: Ctx) {
		after(() => ensureCron(ctx));
		return submit(ctx, obj(ctx.input) as SubmitInput);
	},

	/** Counts a form seen in the viewport: once per page per IP per hour, at most 60 per IP per hour. */
	async impression(ctx: Ctx) {
		const config = await openBlockConfig(obj(ctx.input).block_key);
		if (!config) return { counted: false };
		const ip = ctx.requestMeta.ip ?? "unknown";
		const fresh = await firstWithin(ctx, "imp", `${ip}|${config.path}`, LIMITS.impressionWindowMs);
		if (!fresh || !(await withinLimit(ctx, "impb", ip, LIMITS.impressionsPerIp, LIMITS.impressionWindowMs))) return { counted: false };
		await bumpStat(ctx, config.path, "impressions");
		return { counted: true };
	},

	async download(ctx: Ctx) {
		return resolveDownload(ctx, str(obj(ctx.input).token));
	},

	async confirm(ctx: Ctx) {
		return confirm(ctx, str(obj(ctx.input).token));
	},
};

/** Every five minutes: due forward retries, expired counters, and once a day the retention purge. */
export async function maintenance(ctx: PluginContext): Promise<void> {
	const now = Date.now();
	await runDueForwards(ctx, now);

	for (let i = 0; i < 4; i++) {
		const { items } = await counters(ctx).query({ where: { exp: { lt: now } }, limit: 50 });
		if (!items.length) break;
		await counters(ctx).deleteMany(items.map((c) => c.id));
		if (items.length < 50) break;
	}

	const day = today(now);
	if ((await ctx.kv.get<string>("state:purged-day")) !== day) {
		await purgeOld(ctx, now);
		await ctx.kv.set("state:purged-day", day);
	}
}
