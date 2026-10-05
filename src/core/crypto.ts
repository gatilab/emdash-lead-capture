/**
 * Tokens, hashing, the block-config wire format and consent records, on
 * WebCrypto (Workers and Node 20+). Encryption of block configs lives in
 * ../seal.ts, on EmDash's secret-setting helpers.
 */
import { md5 } from "./md5.js";
import type { BlockConfig, ConsentRecord, SuccessAction } from "./types.js";

const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** `wp_generate_password(32, false)`: 32 random letters and digits. */
export function randomToken(length = 32): string {
	const out: string[] = [];
	const buf = new Uint8Array(length * 2);
	while (out.length < length) {
		crypto.getRandomValues(buf);
		for (const byte of buf) {
			// 248 = 4 × 62: reject the tail so every character is equally likely.
			if (byte < 248) out.push(ALNUM[byte % 62]!);
			if (out.length === length) break;
		}
	}
	return out.join("");
}

export function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
	try {
		const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
		return Uint8Array.from(binary, (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compact wire form of a block config (sealed by the site, opened by the plugin). */
interface CompactConfig {
	u: string;
	l: string;
	s: string;
	i: string;
	a: SuccessAction;
	n: string;
	p: string;
}

export function encodeConfig(config: BlockConfig): string {
	const compact: CompactConfig = {
		u: config.deliverableUrl,
		l: config.deliverableLabel,
		s: config.service,
		i: config.list,
		a: config.successAction,
		n: config.newsletterLabel,
		p: config.path,
	};
	return JSON.stringify(compact);
}

export function decodeConfig(json: string): BlockConfig | null {
	try {
		const c = JSON.parse(json) as Partial<CompactConfig>;
		if (typeof c.u !== "string" || typeof c.p !== "string" || !c.u) return null;
		return {
			deliverableUrl: c.u,
			deliverableLabel: typeof c.l === "string" ? c.l : "",
			service: typeof c.s === "string" ? c.s : "",
			list: typeof c.i === "string" ? c.i : "",
			successAction: c.a === "instant" || c.a === "redirect" ? c.a : "message",
			newsletterLabel: typeof c.n === "string" ? c.n : "",
			path: c.p,
		};
	} catch {
		return null;
	}
}

/** A deliverable must be an http(s) URL or a path on this site. */
export function deliverableAllowed(url: string): boolean {
	if (url.startsWith("/") && !url.startsWith("//")) return true;
	try {
		const u = new URL(url);
		return u.protocol === "https:" || u.protocol === "http:";
	} catch {
		return false;
	}
}

/**
 * The consent record stored on a newsletter opt-in: what the visitor agreed
 * to, where and when. The version is a short hash of the wording, so a later
 * edit stays distinguishable from what earlier subscribers saw.
 */
export function consentRecord(source: string, text: string, now = new Date()): ConsentRecord {
	const wording = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
	return {
		source: source.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
		text: wording,
		version: md5(wording).slice(0, 8),
		at: now.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
	};
}

/** "source @ at: text", as the WordPress CSV export prints consent. */
export function consentSummary(consent: ConsentRecord | null | undefined): string {
	if (!consent?.source) return "";
	return `${consent.source} @ ${consent.at ?? ""}: ${consent.text ?? ""}`.trim();
}
