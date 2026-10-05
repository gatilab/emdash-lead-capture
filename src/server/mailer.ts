/**
 * Outgoing mail. Emailit's Email API when a key is set and "Send via
 * Emailit" is on (it honours a From address and a plain-text part, as in
 * WordPress); otherwise the site's EmDash email provider, which picks the
 * From address itself.
 */
import type { PluginContext } from "emdash";

import type { EmailMessage, EmailTheme } from "../core/email.js";
import { sendViaEmailit } from "../core/services.js";
import type { LeadCaptureSettings, ServiceKeys } from "../core/types.js";

type Ctx = Pick<PluginContext, "email" | "http" | "users" | "site" | "log">;

/** The site owner's address: the first admin, when the plugin may read users. */
export async function ownerEmail(ctx: Ctx): Promise<string> {
	try {
		const { items } = (await ctx.users?.list({ role: 50, limit: 1 })) ?? { items: [] };
		return items[0]?.email ?? "";
	} catch {
		return "";
	}
}

export function emailTheme(ctx: Ctx, settings: LeadCaptureSettings): EmailTheme {
	return {
		siteName: ctx.site.name || new URL(ctx.site.url).host,
		buttonColor: settings.email_button_color,
		textColor: settings.email_text_color,
		headingColor: settings.email_heading_color,
	};
}

export async function sendMail(ctx: Ctx, settings: LeadCaptureSettings, keys: ServiceKeys, to: string, message: EmailMessage): Promise<boolean> {
	if (keys.emailit && settings.use_emailit && ctx.http) {
		const fromName = settings.from_name || ctx.site.name;
		const fromEmail = settings.from_email || (await ownerEmail(ctx)) || `noreply@${new URL(ctx.site.url).hostname}`;
		const sent = await sendViaEmailit(keys.emailit, { from: `${fromName} <${fromEmail}>`, to, ...message }, ctx.http.fetch.bind(ctx.http));
		if (!sent) ctx.log.warn("Lead capture: Emailit rejected an email", { to: redact(to) });
		return sent;
	}
	if (!ctx.email) {
		ctx.log.warn("Lead capture: no email provider is configured; email not sent", { to: redact(to) });
		return false;
	}
	try {
		await ctx.email.send({ to, subject: message.subject, text: message.text, html: message.html });
		return true;
	} catch (error) {
		ctx.log.warn("Lead capture: sending email failed", { to: redact(to), error: String(error) });
		return false;
	}
}

/** "j***@example.com": enough to recognise an address in a log, no more. */
export function redact(email: string): string {
	const at = email.lastIndexOf("@");
	return at <= 0 ? "***" : `${email[0]}***${email.slice(at)}`;
}
