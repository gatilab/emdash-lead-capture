/** CSV export with the WordPress drop-in's columns and PHP `fputcsv` quoting. */
import { consentSummary } from "./crypto.js";
import { csvSafe } from "./text.js";
import type { Lead } from "./types.js";

export const CSV_HEADER = ["Name", "Email", "Source Page", "Source Type", "Resource", "Newsletter", "Consent", "Downloaded", "Status", "Date"] as const;

/** PHP `fputcsv` encloses fields containing the delimiter, a quote, a backslash, whitespace or line breaks. */
export function csvField(value: string): string {
	return /[,"\\\s]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvRow(values: string[]): string {
	return `${values.map(csvField).join(",")}\n`;
}

/** `Y-m-d H:i:s` in UTC, the shape WordPress printed. */
export function wpDateTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 19).replace("T", " ");
}

export function leadCsvRow(lead: Lead): string {
	return csvRow([
		csvSafe(lead.name),
		csvSafe(lead.email),
		csvSafe(lead.sourcePath),
		lead.sourceType,
		csvSafe(lead.deliverableLabel),
		lead.newsletterOptIn ? "Yes" : "No",
		csvSafe(consentSummary(lead.consent)),
		lead.clickedAt ? "Yes" : "No",
		lead.status,
		wpDateTime(lead.createdAt),
	]);
}

export function leadsToCsv(leads: Lead[]): string {
	return csvRow([...CSV_HEADER]) + leads.map(leadCsvRow).join("");
}
