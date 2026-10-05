/**
 * Defaults and visitor-facing strings, word for word from the WordPress
 * drop-in (Lead Capture 1.5.0) so migrated sites read the same.
 */
import type { LeadCaptureSettings } from "./types.js";

export const DEFAULT_SETTINGS: LeadCaptureSettings = {
	double_optin: false,
	link_expiry_days: 7,
	retention_days: 0,
	default_service: "",
	default_list: "",
	from_name: "",
	from_email: "",
	use_emailit: true,
	notify_admin: false,
	notify_email: "",
	email_button_color: "#2563eb",
	email_text_color: "#374151",
	email_heading_color: "#111827",
};

export const MESSAGES = {
	honeypot: "Invalid submission.",
	invalidEmail: "Please enter a valid email address.",
	rateLimited: "Too many attempts. Please try again in a few minutes.",
	configError: "Configuration error. Please contact the site owner.",
	alreadySent: "We already sent this to your email. Check your inbox (and spam folder)!",
	confirmResent: "Almost there — confirm your email using the link we just re-sent.",
	captured: "Check your email for the download link!",
	capturedDoubleOptIn: "Almost there — check your email and click the confirmation link.",
	failed: "Something went wrong. Please try again.",
	linkInvalidTitle: "Link unavailable",
	linkInvalid: "This download link is invalid or no longer available.",
	linkExpiredTitle: "Link expired",
	linkExpired: "This download link has expired. Submit the form again to get a fresh one.",
} as const;

export const FORM_DEFAULTS = {
	nameLabel: "Your name",
	emailLabel: "Email address",
	submitText: "Get Free Access",
	newsletterLabel: "Also send me free resources and tips",
	successMessage: "Check your email for the download link!",
	downloadNow: "Download now",
	spamNote: "If you don’t see the email in your inbox, please check your spam folder.",
} as const;

/** Rate limits per sliding 10-minute window (WordPress values). */
export const LIMITS = {
	windowMs: 10 * 60_000,
	perIp: 5,
	perEmail: 3,
	/** Impressions: one per page per IP per hour, at most 60 per IP per hour. */
	impressionWindowMs: 60 * 60_000,
	impressionsPerIp: 60,
	/** Spam and trash are purged after this many days regardless of retention. */
	junkRetentionDays: 90,
	/** Forwarding retries: 3 attempts, 5 minutes × attempt apart. */
	forwardAttempts: 3,
	forwardBackoffMs: 5 * 60_000,
} as const;

/** Day in milliseconds. */
export const DAY_MS = 86_400_000;
