/**
 * The "Lead capture" editor block (`admin.portableTextBlocks`). Each field's
 * `action_id` is the attribute name stored on the block, matching the
 * WordPress block, so imported blocks open with their values in place.
 * Undeclared fields are preserved when a block is edited.
 */
import type { PortableTextBlockConfig, PortableTextBlockField } from "emdash";

import { STYLE_OPTIONS } from "./core/attrs.js";
import { SERVICES } from "./core/types.js";

type Field = PortableTextBlockField;
type Option = { value: string; label: string };

const text = (action_id: string, label: string, placeholder?: string): Field => ({ type: "text_input", action_id, label, ...(placeholder !== undefined && { placeholder }) });
const multiline = (action_id: string, label: string, placeholder?: string): Field => ({ type: "text_input", action_id, label, multiline: true, ...(placeholder !== undefined && { placeholder }) });
const toggle = (action_id: string, label: string, initial_value: boolean): Field => ({ type: "toggle", action_id, label, initial_value });
const select = (action_id: string, label: string, options: Option[], initial_value?: string): Field => ({ type: "select", action_id, label, options, ...(initial_value !== undefined && { initial_value }) });

export const LEAD_CAPTURE_BLOCK: PortableTextBlockConfig = {
	type: "leadCapture",
	label: "Lead capture",
	icon: "form",
	category: "Forms",
	description: "An email form that sends a download link for a resource.",
	fields: [
		text("title", "Title", "Get the free checklist"),
		multiline("description", "Description"),
		text("deliverableUrl", "Resource URL", "https://…/file.zip — never shown on the page"),
		text("deliverableLabel", "Resource name", "Used in the email: “Access <name>”"),
		text("submitText", "Button text", "Get Free Access"),
		toggle("showName", "Ask for a name", true),
		text("nameLabel", "Name field label", "Your name"),
		text("emailLabel", "Email field label", "Email address"),
		toggle("showNewsletter", "Newsletter checkbox", true),
		text("newsletterLabel", "Newsletter checkbox text", "Also send me free resources and tips"),
		select(
			"successAction",
			"After submitting",
			[
				{ value: "message", label: "Show message (email the link)" },
				{ value: "instant", label: "Message + instant download button" },
				{ value: "redirect", label: "Redirect to a thank-you page" },
			],
			"message",
		),
		text("successMessage", "Success message", "Check your email for the download link!"),
		text("redirectUrl", "Thank-you page URL"),
		select("emailService", "Newsletter service", [{ value: "", label: "— site default —" }, ...Object.entries(SERVICES).map(([value, label]) => ({ value, label }))], ""),
		text("emailList", "List, audience or form ID"),
		select("style", "Style", STYLE_OPTIONS, "card"),
		toggle("shadow", "Shadow (card style)", true),
		select(
			"marginBottom",
			"Space below",
			[
				{ value: "", label: "None" },
				{ value: "mb-half", label: "Small" },
				{ value: "mb-mid", label: "Medium" },
				{ value: "mb-double", label: "Large" },
			],
			"mb-mid",
		),
		select(
			"padding",
			"Padding (card style)",
			[
				{ value: "", label: "None" },
				{ value: "block-half", label: "Small" },
				{ value: "block-single", label: "Medium" },
				{ value: "block-double", label: "Large" },
			],
			"block-single",
		),
		text("bgColor", "Background color", "#f8fafc"),
		text("textColor", "Text color"),
		text("buttonColor", "Button color"),
	],
};
