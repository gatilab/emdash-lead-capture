/**
 * Server-side helpers for the site: seal a block while rendering, and call
 * the plugin's public routes in-process through EmDash's dispatcher (no HTTP
 * round trip; available on every request, including anonymous ones).
 */
import { blockConfig, formModel } from "../core/attrs.js";
import { deliverableAllowed } from "../core/crypto.js";
import type { LeadCaptureBlock } from "../core/types.js";
import { sealBlockConfig } from "../seal.js";

export const PLUGIN_ID = "lead-capture";
export const SUBMIT_URL = `/_emdash/api/plugins/${PLUGIN_ID}/submit`;
export const IMPRESSION_URL = `/_emdash/api/plugins/${PLUGIN_ID}/impression`;

type Dispatch = (pluginId: string, method: string, path: string, request: Request) => Promise<{ success: boolean; data?: unknown }>;

interface AstroLike {
	locals: unknown;
	url: URL;
}

/** POST a JSON body to one of this plugin's public routes, in-process. Returns `data`, or null. */
export async function callPublic<T>(astro: AstroLike, route: string, body: unknown): Promise<T | null> {
	const dispatch = (astro.locals as { emdash?: { handlePublicPluginApiRoute?: Dispatch } }).emdash?.handlePublicPluginApiRoute;
	if (typeof dispatch !== "function") {
		console.warn("[lead-capture] EmDash route dispatcher unavailable; is the plugin registered?");
		return null;
	}
	const request = new Request(new URL(`/_emdash/api/plugins/${PLUGIN_ID}/${route}`, astro.url), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const res = await dispatch(PLUGIN_ID, "POST", `/${route}`, request);
	return res.success ? ((res.data ?? null) as T | null) : null;
}

/**
 * The opaque, encrypted block key for a block on the current page, or ""
 * when the block has no usable resource URL (the form then can't submit).
 */
export async function sealBlock(astro: AstroLike, block: LeadCaptureBlock): Promise<string> {
	const model = formModel(block);
	if (!model.deliverableUrl || !deliverableAllowed(model.deliverableUrl)) return "";
	try {
		return await sealBlockConfig(blockConfig(model, astro.url.pathname.slice(0, 500)));
	} catch (error) {
		console.warn("[lead-capture] could not seal the block; is EMDASH_ENCRYPTION_KEY set?", error);
		return "";
	}
}

/** Per-request counter for unique form ids (WordPress used wp_unique_id()). */
export function nextFormId(locals: unknown): string {
	const store = locals as { __leadCaptureForms?: number };
	store.__leadCaptureForms = (store.__leadCaptureForms ?? 0) + 1;
	return `md-lead-form-${store.__leadCaptureForms}`;
}
