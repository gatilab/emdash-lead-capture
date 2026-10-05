/**
 * Sealed block configs.
 *
 * WordPress put an HMAC of the deliverable URL in the markup and, on submit,
 * re-read the post to find the block. Here a block can live in a post, a
 * section or a template, so the form carries its whole configuration,
 * encrypted with EmDash's secret-setting helpers (AES-GCM under the site's
 * `EMDASH_ENCRYPTION_KEY`). The site seals while rendering; the plugin opens
 * on submit. The deliverable URL never reaches the page, and nobody without
 * the site's key can make the form send a file or label the site didn't
 * render. Requires `EMDASH_ENCRYPTION_KEY`, as EmDash secret settings do.
 */
import { decodePluginSettingValue, encryptPluginSetting } from "emdash";

import { decodeConfig, encodeConfig, fromBase64Url, toBase64Url } from "./core/crypto.js";
import type { BlockConfig } from "./core/types.js";

const PLUGIN_ID = "lead-capture";
const FIELD = "block-config";
const SCHEMA = { [FIELD]: { type: "secret" as const, label: "Block config" } };

export async function sealBlockConfig(config: BlockConfig): Promise<string> {
	const envelope = await encryptPluginSetting(PLUGIN_ID, FIELD, encodeConfig(config));
	return toBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}

/** Returns null for anything this site didn't seal. */
export async function openBlockConfig(token: unknown): Promise<BlockConfig | null> {
	if (typeof token !== "string" || token.length < 40 || token.length > 4096) return null;
	const bytes = fromBase64Url(token);
	if (!bytes) return null;
	try {
		const envelope: unknown = JSON.parse(new TextDecoder().decode(bytes));
		const plain = await decodePluginSettingValue<string>(PLUGIN_ID, FIELD, envelope, SCHEMA);
		return typeof plain === "string" ? decodeConfig(plain) : null;
	} catch {
		return null;
	}
}
