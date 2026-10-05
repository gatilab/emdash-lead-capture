/**
 * Turns stored block attributes into what the form renders, with the
 * WordPress template's exact fallbacks:
 *
 * - Booleans default to on: Gutenberg omits values equal to the default, so
 *   "not present" means "on" (`showName`, `showNewsletter`, `shadow`).
 * - String labels fall back only when absent (`??`); an empty string stays
 *   empty, except the newsletter label, which also falls back when empty.
 * - Inline and capsule styles never show the name field.
 */
import { FORM_DEFAULTS } from "./defaults.js";
import type { BlockConfig, FormStyle, LeadCaptureBlock, SuccessAction } from "./types.js";

export interface FormModel {
	title: string;
	description: string;
	deliverableUrl: string;
	deliverableLabel: string;
	nameLabel: string;
	emailLabel: string;
	submitText: string;
	showName: boolean;
	showNewsletter: boolean;
	newsletterLabel: string;
	successMessage: string;
	successAction: string;
	redirectUrl: string;
	style: string;
	compact: boolean;
	align: string;
	classes: string[];
	inlineStyle: string;
	buttonClass: string;
	buttonStyle: string;
	service: string;
	list: string;
}

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const on = (value: unknown): boolean => value === undefined || value === null || Boolean(value);

/** WordPress `sanitize_html_class`: strip everything but A–Z, a–z, 0–9, `_` and `-`. */
export function sanitizeHtmlClass(value: string): string {
	return value.replace(/%[a-fA-F0-9]{2}/g, "").replace(/[^A-Za-z0-9_-]/g, "");
}

/** A class list from an attribute, keeping only safe class names. */
function classList(value: string | undefined): string[] {
	return (value ?? "")
		.split(/\s+/)
		.map(sanitizeHtmlClass)
		.filter(Boolean);
}

/** A CSS color value safe to place in a `style` attribute. */
export function safeColor(value: string | undefined): string {
	const v = (value ?? "").trim();
	return /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([\d\s.,%/a-z-]+\)|var\(--[\w-]+\)|[a-zA-Z]+)$/.test(v) ? v : "";
}

export function successActionOf(value: unknown): SuccessAction {
	return value === "instant" || value === "redirect" ? value : "message";
}

export function formModel(block: LeadCaptureBlock): FormModel {
	const style = str(block.style) ?? "card";
	const compact = style === "inline" || style === "capsule";
	const newsletterLabel = str(block.newsletterLabel);

	const classes = ["md-lead-capture", `md-lead-capture-style-${sanitizeHtmlClass(style)}`];
	const align = str(block.align) ?? "";
	if (align) classes.push(`align${sanitizeHtmlClass(align)}`);
	classes.push(...classList(block.bgColorClass), ...classList(block.textColorClass));
	classes.push(...classList(str(block.marginBottom) ?? "mb-mid"));
	if (style === "card") classes.push(...classList(str(block.padding) ?? "block-single"));
	if (on(block.shadow) && style === "card") classes.push("shadow");

	const inline: string[] = [];
	const bg = safeColor(block.bgColor);
	const fg = safeColor(block.textColor);
	if (bg && !block.bgColorClass) inline.push(`background-color:${bg}`);
	if (fg && !block.textColorClass) inline.push(`color:${fg}`);
	const button = safeColor(block.buttonColor);

	return {
		title: str(block.title) ?? "",
		description: str(block.description) ?? "",
		deliverableUrl: (str(block.deliverableUrl) ?? "").trim(),
		deliverableLabel: str(block.deliverableLabel) ?? "",
		nameLabel: str(block.nameLabel) ?? FORM_DEFAULTS.nameLabel,
		emailLabel: str(block.emailLabel) ?? FORM_DEFAULTS.emailLabel,
		submitText: str(block.submitText) ?? FORM_DEFAULTS.submitText,
		showName: compact ? false : on(block.showName),
		showNewsletter: on(block.showNewsletter),
		newsletterLabel: newsletterLabel ? newsletterLabel : FORM_DEFAULTS.newsletterLabel,
		successMessage: str(block.successMessage) ?? FORM_DEFAULTS.successMessage,
		successAction: str(block.successAction) ?? "message",
		redirectUrl: str(block.redirectUrl) ?? "",
		style,
		compact,
		align,
		classes: classes.filter(Boolean),
		inlineStyle: inline.join(";"),
		buttonClass: classList(block.buttonColorClass).join(" "),
		buttonStyle: button && !block.buttonColorClass ? `background-color:${button}` : "",
		service: str(block.emailService) ?? "",
		list: str(block.emailList) ?? "",
	};
}

/** The sealed part of a block, as resolved on submit. */
export function blockConfig(model: FormModel, path: string): BlockConfig {
	return {
		deliverableUrl: model.deliverableUrl,
		deliverableLabel: model.deliverableLabel,
		service: model.service,
		list: model.list,
		successAction: successActionOf(model.successAction),
		newsletterLabel: model.newsletterLabel,
		path,
	};
}

/** Style options offered in the editor. */
export const STYLE_OPTIONS: { value: FormStyle; label: string }[] = [
	{ value: "card", label: "Card" },
	{ value: "inline", label: "Inline (attached button)" },
	{ value: "capsule", label: "Capsule (pill)" },
];
