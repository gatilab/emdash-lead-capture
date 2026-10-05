import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";

import { blockComponents, LeadCapture } from "../src/astro/index.js";
import type { LeadCaptureBlock } from "../src/core/types.js";
import { openBlockConfig } from "../src/seal.js";

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

async function render(node: LeadCaptureBlock): Promise<string> {
	const html = await container.renderToString(LeadCapture, {
		props: { node },
		locals: {},
		request: new Request("https://gatilab.test/comprehensive-website-audit/"),
	});
	return html.replace(/\s+data-astro-source-(?:file|loc)="[^"]*"/g, "");
}

const BLOCK: LeadCaptureBlock = {
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

describe("LeadCapture", () => {
	it("is registered for the imported block type", () => {
		expect(blockComponents.leadCapture).toBe(LeadCapture);
	});

	it("renders the WordPress markup without exposing the deliverable", async () => {
		const html = await render(BLOCK);
		expect(html).not.toContain("r2.gatilab.com");
		const key = /data-block-key="([^"]+)"/.exec(html)?.[1] ?? "";
		expect(html).toMatch(/<div class="md-lead-capture md-lead-capture-style-card mb-mid block-single shadow"/);
		// sealed for the page it renders on
		expect(await openBlockConfig(key)).toMatchObject({ deliverableUrl: BLOCK.deliverableUrl, path: "/comprehensive-website-audit/", successAction: "instant" });
		expect(html).toContain('data-success-action="instant"');
		expect(html).toContain('data-success-message="Check your email for the download link!"');
		expect(html).toContain('<div class="email-form-title med-title mb-half">Get the Website Audit Operating Workbook</div>');
		expect(html).toContain("<div class=\"email-form-intro-desc\"><p>Audit nine areas, score and prioritize findings, then turn them into a client-ready 30-day action plan.</p></div>");
		expect(html).toMatch(/<form id="md-lead-form-1" class="md-lead-capture-form email-form form-full clear" method="post" novalidate/);
		expect(html).not.toContain('name="name"');
		expect(html).toMatch(/<input type="checkbox" id="md-lead-form-1-newsletter" name="newsletter_opt_in" value="1">/);
		expect(html).toContain('<input type="text" name="website" tabindex="-1" autocomplete="off">');
		expect(html).toContain("If you don’t see the email in your inbox, please check your spam folder.");
	});

	it("puts the compact newsletter checkbox below the form, linked by id", async () => {
		const html = await render({ ...BLOCK, style: "inline" });
		expect(html).toContain("md-lead-capture-form email-form form-full clear md-lead-capture-inline");
		expect(html).toMatch(/<p class="md-lead-capture-newsletter md-lead-capture-newsletter-compact">\s*<input type="checkbox" id="md-lead-form-\d+-newsletter" name="newsletter_opt_in" value="1" form="md-lead-form-\d+">/);
	});

	it("drops unsafe redirect URLs and description markup", async () => {
		const html = await render({ ...BLOCK, successAction: "redirect", redirectUrl: "javascript:alert(1)", description: "Hi <img src=x onerror=1>" });
		expect(html).toMatch(/data-redirect-url(="")?[ >]/);
		expect(html).toContain("Hi &lt;img src=x onerror=1&gt;");
	});
});
