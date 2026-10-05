/**
 * Typed client for the plugin's private admin routes (src/server/admin.ts).
 * Every call is a JSON POST through EmDash's `apiFetch`, which adds the
 * `X-EmDash-Request` header private routes require; `parseApiResponse`
 * unwraps the `{ success, data }` envelope and throws the server's message.
 */

import { apiFetch, parseApiResponse } from "emdash/plugin-utils";

import type { Lead } from "../core/types.js";
import type { LeadAction, LeadCounts, LeadPage, LeadView, PrivacyRecord, StatsSummary } from "./helpers.js";

export const PLUGIN_ID = "lead-capture";
export const API_BASE = `/_emdash/api/plugins/${PLUGIN_ID}`;

export interface CallOptions {
	signal?: AbortSignal;
}

export interface ForwardFailure {
	time: string;
	service: string;
	list: string;
	/** Redacted by the server. */
	email: string;
}

export interface ListLeadsInput {
	status: LeadView;
	search?: string;
	cursor?: string;
	limit?: number;
}

export interface ListLeadsResult {
	items: Lead[];
	cursor?: string;
	/** Search only: the server stopped after its scan limit. */
	truncated?: boolean;
}

async function call<T>(route: string, body: unknown, fallback: string, options: CallOptions = {}): Promise<T> {
	const response = await apiFetch(`${API_BASE}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
		signal: options.signal,
	});
	return parseApiResponse<T>(response, fallback);
}

export function listLeads(input: ListLeadsInput, options?: CallOptions): Promise<ListLeadsResult> {
	return call("leads/list", input, "Could not load leads.", options);
}

export function getCounts(options?: CallOptions): Promise<LeadCounts> {
	return call("leads/counts", {}, "Could not load lead counts.", options);
}

export function runAction(action: LeadAction, ids: string[]): Promise<{ updated: number }> {
	return call("leads/action", { action, ids }, "Could not update the leads.");
}

/** One page (100 leads) of the export for a view. */
export function exportPage(status: LeadView, cursor: string | undefined, options?: CallOptions): Promise<LeadPage> {
	return call("leads/export", { status, cursor }, "Could not export leads.", options);
}

export function getStats(days = 30, options?: CallOptions): Promise<StatsSummary> {
	return call("stats/summary", { days }, "Could not load conversion stats.", options);
}

export function getForwardFailures(options?: CallOptions): Promise<{ items: ForwardFailure[] }> {
	return call("forward/failures", {}, "Could not load failed forwards.", options);
}

export function privacyExport(email: string): Promise<{ items: PrivacyRecord[] }> {
	return call("privacy/export", { email }, "Could not look up that email address.");
}

export function privacyErase(email: string): Promise<{ removed: number }> {
	return call("privacy/erase", { email }, "Could not erase that email address's data.");
}

/** True for the error `fetch` throws when an AbortController cancels a call. */
export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";
}
