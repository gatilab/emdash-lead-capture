/**
 * Shared types. Field names follow the WordPress drop-in where data crosses
 * the boundary (block attributes, CSV, imports), and camelCase in storage.
 */

/** Lifecycle of a lead. `unverified` is used by imported Optins rows. */
export type LeadStatus = "active" | "pending" | "unverified" | "spam" | "trash";

export const LEAD_STATUSES: readonly LeadStatus[] = ["active", "pending", "unverified", "spam", "trash"];

/** Where a lead came from. Only `block` is produced here; the others arrive by import. */
export type SourceType = "block" | "optin" | "upgrade";

export type SuccessAction = "message" | "instant" | "redirect";
export type FormStyle = "card" | "inline" | "capsule";

/** Email services leads can be forwarded to. */
export type ServiceId = "mailchimp" | "kit" | "convertkit" | "mailerlite" | "brevo" | "beehiiv" | "sendfox" | "emailit";

export const SERVICES: Readonly<Record<ServiceId, string>> = {
	mailchimp: "Mailchimp",
	kit: "Kit (v4 API)",
	convertkit: "ConvertKit (legacy v3)",
	mailerlite: "MailerLite",
	brevo: "Brevo",
	beehiiv: "Beehiiv",
	sendfox: "SendFox",
	emailit: "Emailit",
};

export function isServiceId(value: unknown): value is ServiceId {
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(SERVICES, value);
}

/**
 * Block attributes as stored on the `leadCapture` Portable Text block. They
 * are the WordPress block's attributes, unchanged, so imported content keeps
 * rendering. Every field is optional: Gutenberg omits values equal to their
 * default, and the renderer applies the same fallbacks WordPress did.
 */
export interface LeadCaptureBlock {
	_type: "leadCapture";
	_key?: string;
	title?: string;
	description?: string;
	deliverableUrl?: string;
	deliverableLabel?: string;
	nameLabel?: string;
	emailLabel?: string;
	submitText?: string;
	showName?: boolean;
	showNewsletter?: boolean;
	newsletterLabel?: string;
	successMessage?: string;
	successAction?: SuccessAction | string;
	redirectUrl?: string;
	emailService?: string;
	emailList?: string;
	bgColor?: string;
	bgColorClass?: string;
	textColor?: string;
	textColorClass?: string;
	buttonColor?: string;
	buttonColorClass?: string;
	marginBottom?: string;
	padding?: string;
	shadow?: boolean;
	style?: FormStyle | string;
	align?: string;
}

/**
 * What a submission needs to know about its block, sealed into the page
 * (encrypted) so the deliverable URL never appears in markup.
 */
export interface BlockConfig {
	deliverableUrl: string;
	deliverableLabel: string;
	service: string;
	list: string;
	successAction: SuccessAction;
	newsletterLabel: string;
	/** Path of the page the block was rendered on: the lead's source. */
	path: string;
}

/** What the visitor agreed to, where and when (stored with newsletter opt-ins). */
export interface ConsentRecord {
	source: string;
	text: string;
	/** First 8 hex chars of md5(text), as in WordPress. */
	version: string;
	/** ISO 8601 UTC. */
	at: string;
}

export interface Lead {
	id: string;
	email: string;
	/** Lowercased email, for lookups. */
	emailKey: string;
	name: string;
	/** Page path the lead came from (WordPress keyed this by post id). */
	sourcePath: string;
	sourceUrl: string;
	sourceType: SourceType | string;
	deliverableUrl: string;
	deliverableLabel: string;
	/** Forwarding target captured at submit, used when a pending lead confirms. */
	service: string;
	list: string;
	newsletterOptIn: boolean;
	status: LeadStatus;
	spamScore: string;
	downloadToken: string;
	confirmToken: string;
	consent: ConsentRecord | null;
	/** ISO timestamps (UTC). */
	tokenIssuedAt: string | null;
	confirmedAt: string | null;
	deliveredAt: string | null;
	clickedAt: string | null;
	createdAt: string;
	/** Imported rows keep their WordPress identity. */
	legacyId?: number;
	legacySourcePostId?: number;
}

/** Plugin settings (EmDash plugin settings page), with WordPress keys. */
export interface LeadCaptureSettings {
	double_optin: boolean;
	/** Days a download link stays valid; 0 = never expires. */
	link_expiry_days: number;
	/** Days to keep leads; 0 = forever. Spam and trash always purge after 90 days. */
	retention_days: number;
	default_service: string;
	default_list: string;
	from_name: string;
	from_email: string;
	use_emailit: boolean;
	notify_admin: boolean;
	notify_email: string;
	email_button_color: string;
	email_text_color: string;
	email_heading_color: string;
}

/** API keys, stored as encrypted plugin settings. */
export type ServiceKeys = Partial<Record<ServiceId | "akismet", string>>;
