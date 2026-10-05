import { describe, expect, it } from "vitest";

import {
	actionDoneMessage,
	applicableIds,
	bulkActions,
	collectCsv,
	conversionLabel,
	csvFilename,
	dailySeries,
	formatPercent,
	isHttpUrl,
	localDay,
	matchesView,
	parseView,
	peakDay,
	percentOf,
	privacyFilename,
	privacyJson,
	rowActions,
	sourceLabel,
	sparklinePoints,
	statusAfter,
	sumLast,
	utcDay,
	visibleViews,
	type LeadCounts,
	type LeadPage,
} from "../src/admin/helpers.js";
import { CSV_HEADER, csvRow } from "../src/core/csv.js";
import type { Lead } from "../src/core/types.js";

function lead(overrides: Partial<Lead> = {}): Lead {
	return {
		id: "id-1",
		email: "jane@example.com",
		emailKey: "jane@example.com",
		name: "Jane",
		sourcePath: "/guide/",
		sourceUrl: "https://example.com/guide/",
		sourceType: "block",
		deliverableUrl: "https://example.com/file.pdf",
		deliverableLabel: "The guide",
		service: "",
		list: "",
		newsletterOptIn: false,
		status: "active",
		spamScore: "",
		downloadToken: "secret-download-token",
		confirmToken: "secret-confirm-token",
		consent: null,
		tokenIssuedAt: "2026-01-02T03:04:05.000Z",
		confirmedAt: null,
		deliveredAt: null,
		clickedAt: null,
		createdAt: "2026-01-02T03:04:05.000Z",
		...overrides,
	};
}

const counts = (overrides: Partial<LeadCounts> = {}): LeadCounts => ({
	active: 0,
	pending: 0,
	unverified: 0,
	spam: 0,
	trash: 0,
	all: 0,
	newsletter: 0,
	clicked: 0,
	...overrides,
});

describe("views", () => {
	it("parses known views and falls back to all", () => {
		expect(parseView("spam")).toBe("spam");
		expect(parseView("all")).toBe("all");
		expect(parseView("bogus")).toBe("all");
		expect(parseView(null)).toBe("all");
	});

	it("always shows All and Active, others only when they hold leads or are current", () => {
		expect(visibleViews(counts(), "all")).toEqual(["all", "active"]);
		expect(visibleViews(counts({ spam: 2, trash: 1 }), "all")).toEqual(["all", "active", "spam", "trash"]);
		expect(visibleViews(counts(), "pending")).toEqual(["all", "active", "pending"]);
		expect(visibleViews(null, "all")).toEqual(["all", "active"]);
	});

	it("All leaves out trash", () => {
		expect(matchesView("spam", "all")).toBe(true);
		expect(matchesView("trash", "all")).toBe(false);
		expect(matchesView("trash", "trash")).toBe(true);
		expect(matchesView("active", "pending")).toBe(false);
	});
});

describe("actions", () => {
	it("offers the WordPress row actions per status", () => {
		expect(rowActions("active")).toEqual(["resend", "spam", "trash"]);
		expect(rowActions("pending")).toEqual(["resend", "spam", "trash"]);
		expect(rowActions("unverified")).toEqual(["spam", "trash"]);
		expect(rowActions("spam")).toEqual(["unspam", "trash"]);
		expect(rowActions("trash")).toEqual(["restore", "delete"]);
	});

	it("builds bulk actions from the selection, with delete only in the trash view", () => {
		expect(bulkActions(["active", "spam"], "all")).toEqual(["resend", "unspam", "spam", "trash"]);
		expect(bulkActions(["trash"], "trash")).toEqual(["restore", "delete"]);
		expect(bulkActions(["trash"], "all")).toEqual(["restore"]);
		expect(bulkActions([], "all")).toEqual([]);
	});

	it("only sends the ids an action applies to", () => {
		const leads = [lead({ id: "a", status: "active" }), lead({ id: "b", status: "spam" }), lead({ id: "c", status: "unverified" })];
		expect(applicableIds(leads, "resend")).toEqual(["a"]);
		expect(applicableIds(leads, "trash")).toEqual(["a", "b", "c"]);
		expect(applicableIds(leads, "unspam")).toEqual(["b"]);
	});

	it("predicts the status after an action", () => {
		expect(statusAfter("resend", "pending")).toBe("pending");
		expect(statusAfter("spam", "active")).toBe("spam");
		expect(statusAfter("unspam", "spam")).toBe("active");
		expect(statusAfter("restore", "trash")).toBe("active");
		expect(statusAfter("trash", "active")).toBe("trash");
		expect(statusAfter("delete", "trash")).toBeNull();
	});

	it("words announcements, including skipped leads", () => {
		expect(actionDoneMessage("trash", 1)).toBe("Moved 1 lead to the trash.");
		expect(actionDoneMessage("resend", 3, 2)).toBe("Resent the email to 3 leads. Skipped 2 leads the action doesn't apply to.");
	});
});

describe("percentages", () => {
	it("returns null when there's nothing to divide by", () => {
		expect(percentOf(3, 0)).toBeNull();
		expect(percentOf(1, 4)).toBe(25);
	});

	it("formats percentages and the conversion column", () => {
		expect(formatPercent(null)).toBe("—");
		expect(formatPercent(33.333)).toBe("33%");
		expect(formatPercent(12.46, 1)).toBe("12.5%");
		expect(conversionLabel(1, 8)).toBe("12.5%");
		expect(conversionLabel(5, 0)).toBe("—");
		expect(conversionLabel(0, 10)).toBe("0%");
	});
});

describe("daily series and sparkline", () => {
	const daily = [
		{ day: "2026-03-01", impressions: 10, submissions: 2 },
		{ day: "2026-03-05", impressions: 4, submissions: 5 },
		{ day: "2026-01-01", impressions: 1, submissions: 9 },
	];

	it("fills the last N days ending on a day, oldest first, with zeros", () => {
		const series = dailySeries(daily, "2026-03-05", 7);
		expect(series.map((d) => d.day)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]);
		expect(series.map((d) => d.submissions)).toEqual([0, 0, 2, 0, 0, 0, 5]);
		// Days outside the window are ignored.
		expect(sumLast(series, 7)).toBe(7);
		expect(sumLast(series, 1)).toBe(5);
	});

	it("crosses month and year boundaries in UTC", () => {
		expect(dailySeries([], "2026-01-01", 3).map((d) => d.day)).toEqual(["2025-12-30", "2025-12-31", "2026-01-01"]);
		expect(utcDay(Date.UTC(2026, 9, 5, 23, 59))).toBe("2026-10-05");
	});

	it("finds the peak day", () => {
		expect(peakDay(dailySeries(daily, "2026-03-05", 7))?.day).toBe("2026-03-05");
		expect(peakDay(dailySeries([], "2026-03-05", 7))).toBeNull();
	});

	it("scales points into the box with the max at the top", () => {
		expect(sparklinePoints([0, 5, 10], 100, 20, 0)).toBe("0,20 50,10 100,0");
		// Padding keeps the line inside the box: 1 of 3 sits a third of the way up 6px of room.
		expect(sparklinePoints([1, 3], 10, 10, 2)).toBe("0,6 10,2");
		expect(sparklinePoints([1, 2, 3], 10, 10, 0)).toBe("0,6.67 5,3.33 10,0");
	});

	it("keeps a flat series on the baseline and stretches a single point", () => {
		expect(sparklinePoints([0, 0, 0], 100, 20, 2)).toBe("0,18 50,18 100,18");
		expect(sparklinePoints([4], 100, 20, 0)).toBe("0,0 100,0");
		expect(sparklinePoints([], 100, 20)).toBe("");
	});
});

describe("CSV export", () => {
	it("names the file leads-YYYY-MM-DD.csv in local time", () => {
		const date = new Date(2026, 9, 5, 23, 30);
		expect(localDay(date)).toBe("2026-10-05");
		expect(csvFilename(date)).toBe("leads-2026-10-05.csv");
		expect(privacyFilename(date)).toBe("lead-personal-data-2026-10-05.json");
	});

	it("walks every page, skips repeats and writes the WordPress columns", async () => {
		const pages: Record<string, LeadPage> = {
			start: { items: [lead({ id: "a", name: "Ann", email: "ann@example.com" }), lead({ id: "b", name: "=SUM(A1)" })], cursor: "p2" },
			p2: { items: [lead({ id: "b" }), lead({ id: "c", clickedAt: "2026-01-03T00:00:00.000Z", newsletterOptIn: true })] },
		};
		const seen: (string | undefined)[] = [];
		const progress: number[] = [];
		const { csv, count } = await collectCsv(
			async (cursor) => {
				seen.push(cursor);
				return pages[cursor ?? "start"]!;
			},
			(n) => progress.push(n),
		);
		expect(seen).toEqual([undefined, "p2"]);
		expect(progress).toEqual([2, 3]);
		expect(count).toBe(3);
		const lines = csv.trimEnd().split("\n");
		expect(lines[0]).toBe(csvRow([...CSV_HEADER]).trimEnd());
		expect(lines[0]).toBe("Name,Email,\"Source Page\",\"Source Type\",Resource,Newsletter,Consent,Downloaded,Status,Date");
		expect(lines).toHaveLength(4);
		expect(lines[1]).toBe('Ann,ann@example.com,/guide/,block,"The guide",No,,No,active,"2026-01-02 03:04:05"');
		// Formula injection is neutralised, as in WordPress.
		expect(lines[2]!.startsWith("'=SUM(A1)")).toBe(true);
		expect(lines[3]).toContain(",Yes,,Yes,active,");
		// Tokens never reach the export.
		expect(csv).not.toContain("secret-");
	});

	it("stops if the server repeats a cursor", async () => {
		let calls = 0;
		const { count } = await collectCsv(async () => {
			calls++;
			return { items: [lead({ id: `x${calls}` })], cursor: "same" };
		});
		expect(calls).toBe(2);
		expect(count).toBe(2);
	});
});

describe("privacy export", () => {
	it("turns rows into one object per lead", () => {
		const json = privacyJson(
			"jane@example.com",
			[{ id: "a", data: [{ name: "Name", value: "Jane" }, { name: "Status", value: "active" }] }],
			new Date("2026-10-05T00:00:00.000Z"),
		);
		expect(JSON.parse(json)).toEqual({
			email: "jane@example.com",
			exportedAt: "2026-10-05T00:00:00.000Z",
			leads: [{ Name: "Jane", Status: "active" }],
		});
	});
});

describe("display helpers", () => {
	it("falls back to the source URL's path", () => {
		expect(sourceLabel({ sourcePath: "/a/", sourceUrl: "" })).toBe("/a/");
		expect(sourceLabel({ sourcePath: "", sourceUrl: "https://example.com/b/?x=1" })).toBe("/b/");
		expect(sourceLabel({ sourcePath: "", sourceUrl: "" })).toBe("—");
	});

	it("only treats http(s) as links", () => {
		expect(isHttpUrl("https://example.com/f.pdf")).toBe(true);
		expect(isHttpUrl("javascript:alert(1)")).toBe(false);
		expect(isHttpUrl("")).toBe(false);
		expect(isHttpUrl(null)).toBe(false);
	});
});
