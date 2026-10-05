/**
 * @gatilab/emdash-lead-capture
 *
 * Lead magnet block for EmDash: a visitor enters an email address and gets a
 * resource through a tokenized download link, emailed and optionally shown
 * right away. Double opt-in, newsletter forwarding, Akismet, conversion
 * stats, a leads inbox with CSV export, and privacy tools. Port of the
 * Marketers Delight "Lead Capture" drop-in (1.5.0); its blocks, links and
 * data carry over.
 *
 * @example
 * ```js
 * // astro.config.mjs
 * import { leadCapture } from "@gatilab/emdash-lead-capture";
 * import { leadCaptureSite } from "@gatilab/emdash-lead-capture/site";
 *
 * export default defineConfig({
 *   integrations: [emdash({ plugins: [leadCapture()] }), leadCaptureSite()],
 * });
 * ```
 */
import { definePlugin } from "emdash";
import type { PluginDescriptor, ResolvedPlugin, RouteContext } from "emdash";

import { LEAD_CAPTURE_BLOCK } from "./blocks.js";
import { DEFAULT_SETTINGS } from "./core/defaults.js";
import { SERVICES } from "./core/types.js";
import { adminRoutes } from "./server/admin.js";
import { SECRET_KEYS } from "./server/config.js";
import { ensureCron, maintenance, publicRoutes } from "./server/routes.js";
import { STORAGE } from "./server/storage.js";

export const PLUGIN_ID = "lead-capture";
export const PLUGIN_VERSION = "0.1.0";
export const PACKAGE_NAME = "@gatilab/emdash-lead-capture";

export type LeadCaptureOptions = Record<string, never>;

/** Descriptor factory for the `plugins` array of the `emdash()` integration. */
export function leadCapture(options: LeadCaptureOptions = {}): PluginDescriptor<LeadCaptureOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: PACKAGE_NAME,
		componentsEntry: `${PACKAGE_NAME}/astro`,
		adminEntry: `${PACKAGE_NAME}/admin`,
		options,
	};
}

type Handler = (ctx: RouteContext<unknown>) => Promise<unknown>;

const json = (handler: Handler, maxBytes = 64 * 1024) => ({ request: { body: "json" as const, maxBytes }, handler });

/** Admin routes also make sure the maintenance task is scheduled. */
const admin = (handler: Handler) => json(async (ctx) => {
	await ensureCron(ctx);
	return handler(ctx);
}, 8 * 1024 * 1024);

const serviceOptions = [{ value: "", label: "— none —" }, ...Object.entries(SERVICES).map(([value, label]) => ({ value, label }))];

export function createPlugin(_options: LeadCaptureOptions = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		// Mail for delivery and confirmation, outbound calls to newsletter
		// services and Akismet only, and the first admin's address as the
		// fallback for owner notices.
		capabilities: ["email:send", "network:request", "users:read"],
		allowedHosts: [
			"*.api.mailchimp.com",
			"api.kit.com",
			"api.convertkit.com",
			"connect.mailerlite.com",
			"api.brevo.com",
			"api.beehiiv.com",
			"api.sendfox.com",
			"api.emailit.com",
			"*.rest.akismet.com",
		],
		storage: STORAGE,
		hooks: {
			cron: {
				timeout: 25_000,
				handler: async (event, ctx) => {
					if (event.name === "maintenance") await maintenance(ctx);
				},
			},
		},
		routes: {
			submit: { public: true, methods: ["POST"], ...json(publicRoutes.submit, 16 * 1024) },
			impression: { public: true, methods: ["POST"], ...json(publicRoutes.impression, 8 * 1024) },
			download: { public: true, methods: ["POST"], ...json(publicRoutes.download, 1024) },
			confirm: { public: true, methods: ["POST"], ...json(publicRoutes.confirm, 1024) },
			...Object.fromEntries(Object.entries(adminRoutes).map(([name, handler]) => [name, admin(handler)])),
		},
		admin: {
			entry: `${PACKAGE_NAME}/admin`,
			pages: [{ path: "/", label: "Leads", icon: "users" }],
			widgets: [{ id: "leads", title: "Lead capture", size: "half" }],
			portableTextBlocks: [LEAD_CAPTURE_BLOCK],
			settingsSchema: {
				double_optin: { type: "boolean", label: "Double opt-in", description: "Require email confirmation before delivering resources.", default: DEFAULT_SETTINGS.double_optin },
				link_expiry_days: { type: "number", label: "Download link expiry (days)", description: "0 = never expires.", default: DEFAULT_SETTINGS.link_expiry_days, min: 0, max: 365 },
				use_emailit: { type: "boolean", label: "Send via Emailit", description: "Route delivery and confirmation emails through Emailit when its API key is set. Otherwise the site's email provider sends them.", default: DEFAULT_SETTINGS.use_emailit },
				from_name: { type: "string", label: "From name", description: "Used with Emailit. Defaults to the site name." },
				from_email: { type: "email", label: "From email", description: "Used with Emailit: an address on your verified sending domain. Defaults to the first admin's address." },
				default_service: { type: "select", label: "Default newsletter service", description: "Used by blocks that don't pick their own service.", options: serviceOptions, default: "" },
				default_list: { type: "string", label: "Default list, audience or form ID" },
				notify_admin: { type: "boolean", label: "Email me each new lead", default: DEFAULT_SETTINGS.notify_admin },
				notify_email: { type: "email", label: "Notification address", description: "Defaults to the first admin's address." },
				retention_days: { type: "number", label: "Lead retention (days)", description: "Leads older than this are deleted automatically (0 = keep forever). Spam and trash always purge after 90 days.", default: 0, min: 0, max: 3650 },
				email_button_color: { type: "string", label: "Email button color", default: DEFAULT_SETTINGS.email_button_color },
				email_text_color: { type: "string", label: "Email text color", default: DEFAULT_SETTINGS.email_text_color },
				email_heading_color: { type: "string", label: "Email heading color", default: DEFAULT_SETTINGS.email_heading_color },
				[SECRET_KEYS.emailit]: { type: "secret", label: "Emailit API key" },
				[SECRET_KEYS.mailchimp]: { type: "secret", label: "Mailchimp API key", description: "Ends in the data center, e.g. …-us21." },
				[SECRET_KEYS.kit]: { type: "secret", label: "Kit (v4) API key" },
				[SECRET_KEYS.convertkit]: { type: "secret", label: "ConvertKit (v3) API key" },
				[SECRET_KEYS.mailerlite]: { type: "secret", label: "MailerLite API token" },
				[SECRET_KEYS.brevo]: { type: "secret", label: "Brevo API key" },
				[SECRET_KEYS.beehiiv]: { type: "secret", label: "Beehiiv API key", description: "Put the publication ID in the block's list field or the default list." },
				[SECRET_KEYS.sendfox]: { type: "secret", label: "SendFox API token" },
				[SECRET_KEYS.akismet]: { type: "secret", label: "Akismet API key", description: "Checks new leads for spam." },
			},
		},
	});
}

export default createPlugin;

export * from "./core/index.js";
export { LEAD_CAPTURE_BLOCK } from "./blocks.js";
