import { beforeEach, describe, expect, it, vi } from "vitest";

const pending: Promise<unknown>[] = [];

vi.mock("emdash", async (importOriginal) => {
	const actual = await importOriginal<typeof import("emdash")>();
	// Run after() work immediately but let tests await it.
	return { ...actual, after: (fn: () => unknown) => void pending.push(Promise.resolve().then(fn)) };
});

const { submit, resolveDownload, confirm, applyAction, runDueForwards, purgeOld } = await import("../src/server/leads.js");
const { publicRoutes, maintenance } = await import("../src/server/routes.js");
const { sealBlockConfig } = await import("../src/seal.js");
const { blockConfig, formModel } = await import("../src/core/attrs.js");
const { adminRoutes } = await import("../src/server/admin.js");
const { fakeContext } = await import("./fake-context.js");

const flush = async () => {
	while (pending.length) await pending.shift();
};

const BLOCK = {
	_type: "leadCapture",
	title: "Get the Website Audit Operating Workbook",
	deliverableUrl: "https://r2.gatilab.com/wp-content/uploads/2026/07/gatilab-website-audit-workbook-v1.zip",
	deliverableLabel: "Website Audit Operating Workbook",
	showName: false,
	newsletterLabel: "Yes, send me practical growth and WordPress updates.",
	successAction: "instant",
};

type Fake = ReturnType<typeof fakeContext>;

async function seal(_f: Fake, block: Record<string, unknown> = BLOCK, path = "/comprehensive-website-audit/") {
	return sealBlockConfig(blockConfig(formModel(block as never), path));
}

async function send(f: Fake, input: Record<string, unknown>) {
	const result = await submit(f.ctx as never, input);
	await flush();
	return result;
}

const tokenOf = (url: string) => new URL(url).searchParams.get("md_lead_dl")!;

describe("submit", () => {
	let f: Fake;
	beforeEach(() => {
		pending.length = 0;
		f = fakeContext();
	});

	it("captures a lead, emails the link and returns it instantly", async () => {
		const key = await seal(f);
		const res = await send(f, { email: "Asha@Example.com", block_key: key, newsletter_opt_in: "1", source_url: "https://gatilab.test/comprehensive-website-audit/?utm=x" });
		expect(res).toMatchObject({ success: true, message: "Check your email for the download link!" });
		expect(res.download_url).toMatch(/^https:\/\/gatilab\.test\/\?md_lead_dl=[A-Za-z0-9]{32}$/);

		const [lead] = [...f.storage.leads.rows.values()].map((r) => r.data as Record<string, unknown>);
		expect(lead).toMatchObject({ email: "Asha@Example.com", emailKey: "asha@example.com", status: "active", sourcePath: "/comprehensive-website-audit/", newsletterOptIn: true, live: true });
		expect(lead!.sourceUrl).toBe("https://gatilab.test/comprehensive-website-audit/?utm=x");
		expect((lead!.consent as { text: string }).text).toBe("Yes, send me practical growth and WordPress updates.");

		expect(f.sent).toHaveLength(1);
		expect(f.sent[0]!.subject).toBe("Your Resource: Website Audit Operating Workbook");
		expect(f.sent[0]!.text).toContain(res.download_url!);
		expect([...f.storage.stats.rows.values()][0]!.data).toMatchObject({ path: "/comprehensive-website-audit/", submissions: 1, impressions: 0 });
	});

	it("rejects bad input with WordPress's messages", async () => {
		const key = await seal(f);
		expect(await send(f, { email: "x@y.co", block_key: key, website: "bot" })).toEqual({ success: false, message: "Invalid submission." });
		expect(await send(f, { email: "not-an-email", block_key: key })).toEqual({ success: false, message: "Please enter a valid email address." });
		expect(await send(f, { email: "x@y.co", block_key: "forged" })).toEqual({ success: false, message: "Configuration error. Please contact the site owner." });
		expect(f.sent).toHaveLength(0);
	});

	it("resends to a returning visitor with a fresh token instead of a second lead", async () => {
		const key = await seal(f);
		const first = await send(f, { email: "a@b.co", block_key: key });
		const again = await send(f, { email: "A@B.co", block_key: key });
		expect(again).toEqual({ success: true, message: "We already sent this to your email. Check your inbox (and spam folder)!" });
		expect(f.storage.leads.rows.size).toBe(1);
		expect(f.sent).toHaveLength(2);
		const [lead] = [...f.storage.leads.rows.values()].map((r) => r.data as { downloadToken: string });
		expect(lead!.downloadToken).not.toBe(tokenOf(first.download_url!));
	});

	it("rate limits 3 attempts per email in 10 minutes", async () => {
		const key = await seal(f);
		for (let i = 0; i < 3; i++) await send(f, { email: "a@b.co", block_key: key });
		expect(await send(f, { email: "a@b.co", block_key: key })).toEqual({ success: false, message: "Too many attempts. Please try again in a few minutes." });
	});

	it("restores a trashed lead instead of inserting", async () => {
		const key = await seal(f);
		await send(f, { email: "a@b.co", block_key: key });
		const id = [...f.storage.leads.rows.keys()][0]!;
		await applyAction(f.ctx as never, "trash", (await f.storage.leads.get(id)) as never, { double_optin: false } as never, {});
		expect((await f.storage.leads.get(id))).toMatchObject({ status: "trash", live: false });
		const res = await send(f, { email: "a@b.co", block_key: key, name: "Asha" });
		expect(res.message).toBe("Check your email for the download link!");
		expect(await f.storage.leads.get(id)).toMatchObject({ status: "active", live: true, name: "Asha" });
	});
});

describe("double opt-in", () => {
	it("sends a confirmation, then delivers and forwards after confirm", async () => {
		pending.length = 0;
		const f = fakeContext({ settings: { double_optin: true, default_service: "brevo", default_list: "4", brevo_api_key: "k" } });
		const key = await seal(f);
		const res = await send(f, { email: "a@b.co", block_key: key, newsletter_opt_in: "1" });
		expect(res).toEqual({ success: true, message: "Almost there — check your email and click the confirmation link." });
		expect(f.sent[0]!.subject).toBe("Confirm your email to get Website Audit Operating Workbook");
		expect(f.requests).toHaveLength(0);

		const confirmToken = new URL(f.sent[0]!.text.split("\n").pop()!).searchParams.get("md_lead_confirm")!;
		const { redirect } = await confirm(f.ctx as never, confirmToken);
		await flush();
		expect(redirect).toBe("https://gatilab.test/comprehensive-website-audit/?md_lead_confirmed=1");
		expect(f.sent[1]!.subject).toBe("Your Resource: Website Audit Operating Workbook");
		expect(f.requests[0]!.url).toBe("https://api.brevo.com/v3/contacts");

		// a second click on the same link just goes back to the page
		expect((await confirm(f.ctx as never, confirmToken)).redirect).toBe("https://gatilab.test/");
	});
});

describe("download links", () => {
	it("resolves, stamps the first click, and expires", async () => {
		pending.length = 0;
		const f = fakeContext({ settings: { link_expiry_days: 7 } });
		const key = await seal(f);
		const { download_url } = await send(f, { email: "a@b.co", block_key: key });
		const token = tokenOf(download_url!);

		expect(await resolveDownload(f.ctx as never, token)).toEqual({ status: "ok", url: BLOCK.deliverableUrl });
		const id = [...f.storage.leads.rows.keys()][0]!;
		expect(await f.storage.leads.get(id)).toMatchObject({ clicked: true });
		expect(await resolveDownload(f.ctx as never, "nope")).toEqual({ status: "invalid" });

		await f.storage.leads.updateIf(id, { where: {}, set: { tokenIssuedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() } });
		expect(await resolveDownload(f.ctx as never, token)).toEqual({ status: "expired" });
	});
});

describe("forwarding retries", () => {
	it("queues a failed forward and logs it after the third attempt", async () => {
		pending.length = 0;
		const f = fakeContext({ httpStatus: 500, settings: { default_service: "mailerlite", mailerlite_api_key: "k" } });
		const key = await seal(f);
		await send(f, { email: "a@b.co", block_key: key, newsletter_opt_in: "1" });
		expect(f.storage.forwards.rows.size).toBe(1);

		const job = [...f.storage.forwards.rows.values()][0]!.data as { dueAt: number };
		await runDueForwards(f.ctx as never, job.dueAt);
		const job2 = [...f.storage.forwards.rows.values()][0]!.data as { dueAt: number; attempt: number };
		expect(job2.attempt).toBe(2);
		await runDueForwards(f.ctx as never, job2.dueAt);
		expect(f.storage.forwards.rows.size).toBe(0);
		expect(await f.kv.get("forward-failures")).toEqual([expect.objectContaining({ service: "mailerlite", email: "a***@b.co" })]);
	});
});

describe("impressions, admin and maintenance", () => {
	it("counts an impression once per page per IP per hour", async () => {
		const f = fakeContext();
		const key = await seal(f);
		f.ctx.input = { block_key: key };
		expect(await publicRoutes.impression(f.ctx as never)).toEqual({ counted: true });
		expect(await publicRoutes.impression(f.ctx as never)).toEqual({ counted: false });
		expect([...f.storage.stats.rows.values()][0]!.data).toMatchObject({ impressions: 1 });
	});

	it("lists, counts, searches and purges", async () => {
		pending.length = 0;
		const f = fakeContext({ settings: { retention_days: 30 } });
		const key = await seal(f);
		await send(f, { email: "asha@example.com", block_key: key, newsletter_opt_in: "1" });
		await send(f, { email: "ravi@example.com", block_key: key });

		f.ctx.input = {};
		expect(await adminRoutes["leads/counts"]!(f.ctx as never)).toMatchObject({ all: 2, active: 2, newsletter: 1, trash: 0 });
		f.ctx.input = { search: "ravi" };
		const found = (await adminRoutes["leads/list"]!(f.ctx as never)) as { items: { email: string; live?: boolean }[] };
		expect(found.items.map((l) => l.email)).toEqual(["ravi@example.com"]);
		expect(found.items[0]).not.toHaveProperty("live");

		const asha = [...f.storage.leads.rows.entries()].find(([, r]) => (r.data as { email: string }).email === "asha@example.com")![0];
		await f.storage.leads.updateIf(asha, { where: {}, set: { createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() } });
		expect(await purgeOld(f.ctx as never)).toBe(1);

		await maintenance(f.ctx as never);
		expect(await f.kv.get("state:purged-day")).toBe(new Date().toISOString().slice(0, 10));
	});

	it("imports WordPress rows, keeping tokens", async () => {
		const f = fakeContext();
		f.ctx.input = {
			leads: [{ id: 7, email: "a@b.co", name: "A", source_post_id: 42, deliverable_url: "https://x.test/f.zip", deliverable_label: "F", newsletter_opt_in: "1", status: "active", download_token: "TOKENTOKENTOKENTOKENTOKENTOKEN12", created_at: "2026-08-15 00:41:13", token_issued_at: "2026-08-15 00:41:13" }],
			stats: [{ stat_date: "2026-08-15", post_id: 42, impressions: "3", submissions: "1" }],
			paths: { "42": "/comprehensive-website-audit/" },
		};
		expect(await adminRoutes.import!(f.ctx as never)).toEqual({ leads: 1, stats: 1 });
		const lead = [...f.storage.leads.rows.values()][0]!.data;
		expect(lead).toMatchObject({ sourcePath: "/comprehensive-website-audit/", legacyId: 7, createdAt: "2026-08-15T00:41:13.000Z", downloadToken: "TOKENTOKENTOKENTOKENTOKENTOKEN12" });
	});
});
