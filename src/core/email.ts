/**
 * Delivery, confirmation and owner-notification emails. Wording, layout and
 * the plain-text part are the WordPress drop-in's.
 */
import { escapeHtml, greetingName } from "./text.js";

export interface EmailMessage {
	subject: string;
	html: string;
	text: string;
}

export interface EmailTheme {
	siteName: string;
	buttonColor: string;
	textColor: string;
	headingColor: string;
}

interface Parts {
	greeting: string;
	heading: string;
	intro: string;
	ctaUrl: string;
	ctaText: string;
	footnote: string;
	note: string;
}

const attr = (value: string) => escapeHtml(value);

function shell(parts: Parts, theme: EmailTheme): string {
	const note = parts.note ? `<p style="font-size:14px;color:#6b7280;margin:24px 0 0;">${escapeHtml(parts.note)}</p>` : "";
	return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
	<tr><td style="padding:40px 32px;">
		<p style="font-size:16px;color:${attr(theme.textColor)};margin:0 0 8px;">${parts.greeting}</p>
		<h1 style="font-size:24px;color:${attr(theme.headingColor)};margin:0 0 24px;font-weight:700;">${escapeHtml(parts.heading)}</h1>
		<p style="font-size:16px;color:${attr(theme.textColor)};margin:0 0 32px;line-height:1.6;">${parts.intro}</p>
		<table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;"><tr><td>
			<a href="${attr(parts.ctaUrl)}" style="display:inline-block;background-color:${attr(theme.buttonColor)};color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:6px;">
				${escapeHtml(parts.ctaText)}
			</a>
		</td></tr></table>
		<p style="font-size:13px;color:#9ca3af;margin:0;">${escapeHtml(parts.footnote)}</p>
		${note}
	</td></tr>
	<tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
		<p style="font-size:13px;color:#9ca3af;margin:0;text-align:center;">${escapeHtml(theme.siteName)}</p>
	</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export interface DeliveryInput {
	name: string;
	label: string;
	newsletterOptIn: boolean;
	downloadUrl: string;
}

export function deliveryEmail(input: DeliveryInput, theme: EmailTheme): EmailMessage {
	const label = input.label || "Your Resource";
	const name = greetingName(input.name);
	const footnote = "If you didn't request this, you can safely ignore this email.";
	return {
		subject: `Your Resource: ${label}`,
		html: shell(
			{
				greeting: `Hi ${escapeHtml(name)},`,
				heading: "Your resource is ready",
				intro: `Click the button below to access <strong>${escapeHtml(label)}</strong>.`,
				ctaUrl: input.downloadUrl,
				ctaText: `Access ${label}`,
				footnote,
				note: input.newsletterOptIn ? "You've also signed up for our updates. Welcome aboard." : "",
			},
			theme,
		),
		text: `Hi ${name},\n\nYour resource "${label}" is ready.\n\nAccess it here:\n${input.downloadUrl}\n\n${footnote}`,
	};
}

export interface ConfirmInput {
	name: string;
	label: string;
	confirmUrl: string;
}

export function confirmEmail(input: ConfirmInput, theme: EmailTheme): EmailMessage {
	const label = input.label || "your resource";
	const name = greetingName(input.name);
	return {
		subject: `Confirm your email to get ${label}`,
		html: shell(
			{
				greeting: `Hi ${escapeHtml(name)},`,
				heading: "One quick click",
				intro: `Confirm your email address and we'll send <strong>${escapeHtml(label)}</strong> right over.`,
				ctaUrl: input.confirmUrl,
				ctaText: "Confirm my email",
				footnote: "If you didn't request this, you can safely ignore this email — nothing will be sent.",
				note: "",
			},
			theme,
		),
		text: `Hi ${name},\n\nConfirm your email address and we'll send ${label} right over.\n\nConfirm here:\n${input.confirmUrl}`,
	};
}

export interface OwnerNoticeInput {
	email: string;
	name: string;
	page: string;
	adminUrl: string;
}

/** Plain-text notice to the site owner about a new lead. */
export function ownerNotice(input: OwnerNoticeInput): { subject: string; text: string } {
	const lines = [`Email: ${input.email}`, input.name ? `Name: ${input.name}` : "Name: —", input.page ? `Page: ${input.page}` : ""];
	return { subject: `New lead: ${input.email}`, text: `${lines.join("\n")}\n\n${input.adminUrl}` };
}
