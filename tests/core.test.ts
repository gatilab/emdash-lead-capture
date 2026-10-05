import { describe, expect, it } from "vitest";

import {
	akismetCheck,
	autop,
	blockConfig,
	confirmEmail,
	consentRecord,
	consentSummary,
	decodeConfig,
	deliverableAllowed,
	encodeConfig,
	CSV_HEADER,
	csvField,
	csvSafe,
	deliveryEmail,
	formModel,
	forwardSubscriber,
	greetingName,
	isEmail,
	leadsToCsv,
	md5,
	ownerNotice,
	randomToken,
	sanitizeInlineHtml,
	type Lead,
	type LeadCaptureBlock,
} from "../src/core/index.js";
import { openBlockConfig, sealBlockConfig } from "../src/seal.js";

/** The shape every one of Gatilab's 9 imported blocks has. */
const GATILAB_BLOCK: LeadCaptureBlock = {
	_type: "leadCapture",
	title: "Get the Website Audit Operating Workbook",
	description: "Audit nine areas, score and prioritize findings, then turn them into a client-ready 30-day action plan.",
	deliverableUrl: "https://r2.gatilab.com/wp-content/uploads/2026/07/gatilab-website-audit-workbook-v1.zip",
	deliverableLabel: "Website Audit Operating Workbook",
	submitText: "Get Free Access",
	showName: false,
	showNewsletter: true,
	newsletterLabel: "Yes, send me practical growth and WordPress updates.",
	successAction: "instant",
	style: "card",
};

describe("block attributes (WordPress fallbacks)", () => {
	it("renders Gatilab's imported blocks like the live site", () => {
		const m = formModel(GATILAB_BLOCK);
		expect(m.classes).toEqual(["md-lead-capture", "md-lead-capture-style-card", "mb-mid", "block-single", "shadow"]);
		expect(m.showName).toBe(false);
		expect(m.showNewsletter).toBe(true);
		expect(m.emailLabel).toBe("Email address");
		expect(m.successMessage).toBe("Check your email for the download link!");
		expect(m.successAction).toBe("instant");
	});

	it("treats absent booleans as on and keeps empty strings, except the newsletter label", () => {
		const m = formModel({ _type: "leadCapture", submitText: "", newsletterLabel: "" });
		expect(m.showName).toBe(true);
		expect(m.showNewsletter).toBe(true);
		expect(m.submitText).toBe("");
		expect(m.newsletterLabel).toBe("Also send me free resources and tips");
		expect(m.successAction).toBe("message");
	});

	it("hides the name field in compact styles and skips card-only classes", () => {
		const m = formModel({ _type: "leadCapture", style: "capsule", showName: true, padding: "block-double" });
		expect(m.showName).toBe(false);
		expect(m.compact).toBe(true);
		expect(m.classes).toEqual(["md-lead-capture", "md-lead-capture-style-capsule", "mb-mid"]);
	});

	it("only lets safe colors and class names through", () => {
		const m = formModel({ _type: "leadCapture", bgColor: "red;background:url(x)", buttonColor: "#C0392B", bgColorClass: 'x" onmouseover="y' });
		expect(m.inlineStyle).toBe("");
		expect(m.buttonStyle).toBe("background-color:#C0392B");
		expect(m.classes.every((c) => /^[A-Za-z0-9_-]+$/.test(c))).toBe(true);
	});
});

describe("sealing", () => {
	it("round-trips a config and rejects tampering or another key", async () => {
		const config = blockConfig(formModel(GATILAB_BLOCK), "/comprehensive-website-audit/");
		expect(decodeConfig(encodeConfig(config))).toEqual(config);

		const token = await sealBlockConfig(config);
		expect(token).not.toContain("gatilab");
		expect(atob(token.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain("r2.gatilab.com");
		expect(await openBlockConfig(token)).toEqual(config);

		const flipped = token.slice(0, 60) + (token[60] === "A" ? "B" : "A") + token.slice(61);
		expect(await openBlockConfig(flipped)).toBeNull();
		expect(await openBlockConfig("not-a-token")).toBeNull();
		expect(await openBlockConfig(undefined)).toBeNull();

		const previous = process.env.EMDASH_ENCRYPTION_KEY;
		process.env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${"B".repeat(42)}A`;
		try {
			expect(await openBlockConfig(token)).toBeNull();
		} finally {
			process.env.EMDASH_ENCRYPTION_KEY = previous;
		}
	});

	it("accepts only http(s) URLs and site paths as deliverables", () => {
		expect(deliverableAllowed("https://r2.gatilab.com/x.zip")).toBe(true);
		expect(deliverableAllowed("/files/x.pdf")).toBe(true);
		expect(deliverableAllowed("//evil.test/x")).toBe(false);
		expect(deliverableAllowed("javascript:alert(1)")).toBe(false);
	});

	it("generates 32-character alphanumeric tokens", () => {
		const t = randomToken();
		expect(t).toMatch(/^[A-Za-z0-9]{32}$/);
		expect(randomToken()).not.toBe(t);
	});
});

describe("md5", () => {
	it("matches the RFC 1321 test vectors", () => {
		expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
		expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
		expect(md5("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
		expect(md5("12345678901234567890123456789012345678901234567890123456789012345678901234567890")).toBe("57edf4a22be3c955ac49da2e2107b67a");
	});

	it("versions consent wording like WordPress", () => {
		const c = consentRecord("lead-capture-form", "Yes, send me practical growth and WordPress updates.", new Date("2026-08-15T00:41:13Z"));
		expect(c).toEqual({ source: "lead-capture-form", text: "Yes, send me practical growth and WordPress updates.", version: md5("Yes, send me practical growth and WordPress updates.").slice(0, 8), at: "2026-08-15T00:41:13+00:00" });
		expect(consentSummary(c)).toBe("lead-capture-form @ 2026-08-15T00:41:13+00:00: Yes, send me practical growth and WordPress updates.");
	});
});

describe("text helpers", () => {
	it("validates email like is_email()", () => {
		expect(isEmail("asha@example.com")).toBe(true);
		expect(isEmail("a@b.co")).toBe(true);
		expect(isEmail("a@b")).toBe(false);
		expect(isEmail("@example.com")).toBe(false);
		expect(isEmail("a b@example.com")).toBe(false);
		expect(isEmail("a@-x.com")).toBe(false);
		expect(isEmail("a@x..com")).toBe(false);
	});

	it("greets with a plain name or 'there'", () => {
		expect(greetingName("Asha")).toBe("Asha");
		expect(greetingName("")).toBe("there");
		expect(greetingName("visit evil.com now")).toBe("there");
		expect(greetingName("http://x")).toBe("there");
		expect(greetingName("A".repeat(41))).toBe("there");
	});

	it("allows inline HTML in descriptions and escapes the rest", () => {
		expect(sanitizeInlineHtml('Get <strong>free</strong> <a href="/x" onclick="y">kit</a><script>z</script>')).toBe(
			'Get <strong>free</strong> <a href="/x">kit</a>&lt;script&gt;z&lt;/script&gt;',
		);
		expect(sanitizeInlineHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
		expect(autop("One\ntwo\n\nThree")).toBe("<p>One<br />\ntwo</p>\n<p>Three</p>");
	});

	it("guards spreadsheet formulas", () => {
		expect(csvSafe("=SUM(A1)")).toBe("'=SUM(A1)");
		expect(csvSafe("-1")).toBe("'-1");
		expect(csvSafe("plain")).toBe("plain");
	});
});

describe("emails", () => {
	const theme = { siteName: "Gatilab", buttonColor: "#2563eb", textColor: "#374151", headingColor: "#111827" };

	it("builds the delivery email with an HTML and a text part", () => {
		const e = deliveryEmail({ name: "Asha", label: "Website Audit Workbook", newsletterOptIn: true, downloadUrl: "https://gatilab.com/?md_lead_dl=abc" }, theme);
		expect(e.subject).toBe("Your Resource: Website Audit Workbook");
		expect(e.html).toContain("Hi Asha,");
		expect(e.html).toContain("Click the button below to access <strong>Website Audit Workbook</strong>.");
		expect(e.html).toContain('href="https://gatilab.com/?md_lead_dl=abc"');
		expect(e.html).toContain("You&#039;ve also signed up for our updates. Welcome aboard.");
		expect(e.text).toBe(
			'Hi Asha,\n\nYour resource "Website Audit Workbook" is ready.\n\nAccess it here:\nhttps://gatilab.com/?md_lead_dl=abc\n\nIf you didn\'t request this, you can safely ignore this email.',
		);
	});

	it("escapes an attacker-chosen name and falls back to 'there'", () => {
		const e = deliveryEmail({ name: "<b>x</b>", label: "", newsletterOptIn: false, downloadUrl: "https://x.test/" }, theme);
		expect(e.html).toContain("Hi &lt;b&gt;x&lt;/b&gt;,");
		expect(e.subject).toBe("Your Resource: Your Resource");
		expect(deliveryEmail({ name: "see www.spam.test", label: "Kit", newsletterOptIn: false, downloadUrl: "u" }, theme).text.startsWith("Hi there,")).toBe(true);
	});

	it("builds the confirmation email and owner notice", () => {
		const c = confirmEmail({ name: "", label: "", confirmUrl: "https://gatilab.com/?md_lead_confirm=t" }, theme);
		expect(c.subject).toBe("Confirm your email to get your resource");
		expect(c.text).toContain("Confirm here:\nhttps://gatilab.com/?md_lead_confirm=t");
		expect(ownerNotice({ email: "a@b.co", name: "", page: "/x/", adminUrl: "https://s/admin" })).toEqual({
			subject: "New lead: a@b.co",
			text: "Email: a@b.co\nName: —\nPage: /x/\n\nhttps://s/admin",
		});
	});
});

describe("service requests", () => {
	function recorder(status = 200, body = "") {
		const calls: { url: string; init?: RequestInit }[] = [];
		const fetch = async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return new Response(body, { status });
		};
		return { calls, fetch };
	}

	it("upserts Mailchimp members by md5 of the lowercased email", async () => {
		const { calls, fetch } = recorder();
		const ok = await forwardSubscriber("mailchimp", "abc123", { email: "Asha@Example.com", name: "Asha" }, { mailchimp: "key-us21" }, fetch);
		expect(ok).toBe(true);
		expect(calls[0]!.url).toBe(`https://us21.api.mailchimp.com/3.0/lists/abc123/members/${md5("asha@example.com")}`);
		expect(calls[0]!.init?.method).toBe("PUT");
		expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ email_address: "Asha@Example.com", status_if_new: "subscribed", status: "subscribed", merge_fields: { FNAME: "Asha" } });
	});

	it("posts Brevo list ids as integers and treats Emailit 409 as success", async () => {
		const brevo = recorder();
		await forwardSubscriber("brevo", "3, 7", { email: "a@b.co", name: "A" }, { brevo: "k" }, brevo.fetch);
		expect(JSON.parse(String(brevo.calls[0]!.init?.body))).toEqual({ email: "a@b.co", attributes: { FIRSTNAME: "A" }, updateEnabled: true, listIds: [3, 7] });

		const emailit = recorder(409);
		expect(await forwardSubscriber("emailit", "aud_1", { email: "a@b.co", name: "Asha Rao" }, { emailit: "k" }, emailit.fetch)).toBe(true);
		expect(JSON.parse(String(emailit.calls[0]!.init?.body))).toEqual({ email: "a@b.co", first_name: "Asha", last_name: "Rao" });
	});

	it("fails without a key or required list, without calling out", async () => {
		const { calls, fetch } = recorder();
		expect(await forwardSubscriber("mailchimp", "", { email: "a@b.co", name: "" }, { mailchimp: "k-us1" }, fetch)).toBe(false);
		expect(await forwardSubscriber("brevo", "", { email: "a@b.co", name: "" }, {}, fetch)).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("reads Akismet's verdict", async () => {
		const spam = recorder(200, "true");
		const result = await akismetCheck("akey", { blog: "https://gatilab.com", ip: "1.2.3.4", userAgent: "UA", referrer: "", name: "x", email: "a@b.co" }, spam.fetch);
		expect(result).toEqual({ isSpam: true, score: "true" });
		expect(spam.calls[0]!.url).toBe("https://akey.rest.akismet.com/1.1/comment-check");
		expect(String(spam.calls[0]!.init?.body)).toContain("comment_type=signup");
	});
});

describe("CSV export", () => {
	it("uses the WordPress columns and fputcsv quoting", () => {
		const lead: Lead = {
			id: "lead_1",
			email: "asha@example.com",
			emailKey: "asha@example.com",
			name: "Asha Rao",
			sourcePath: "/comprehensive-website-audit/",
			sourceUrl: "https://gatilab.com/comprehensive-website-audit/",
			sourceType: "block",
			deliverableUrl: "https://r2.gatilab.com/x.zip",
			deliverableLabel: "Website Audit Operating Workbook",
			service: "",
			list: "",
			newsletterOptIn: true,
			status: "active",
			spamScore: "",
			downloadToken: "t",
			confirmToken: "",
			consent: null,
			tokenIssuedAt: null,
			confirmedAt: null,
			deliveredAt: null,
			clickedAt: null,
			createdAt: "2026-08-15T00:41:13.000Z",
		};
		expect(leadsToCsv([lead])).toBe(
			`${CSV_HEADER.join(",").replace("Source Page", '"Source Page"').replace("Source Type", '"Source Type"')}\n"Asha Rao",asha@example.com,/comprehensive-website-audit/,block,"Website Audit Operating Workbook",Yes,,No,active,"2026-08-15 00:41:13"\n`,
		);
		expect(csvField('say "hi"')).toBe('"say ""hi"""');
	});
});
