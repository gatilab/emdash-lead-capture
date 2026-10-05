/**
 * Browser side of the lead capture form: impression beacon and AJAX submit.
 * Port of the WordPress drop-in's lead-capture-frontend.js, with two fixes:
 * the compact styles' newsletter checkbox lives outside the <form> (linked by
 * its `form` attribute), so it is read through `form.elements`; and errors go
 * to the block's own `.md-lead-capture-error` paragraph.
 */

interface SubmitReply {
	success: boolean;
	message: string;
	download_url?: string;
}

const READY = "lcReady";

function seenKey(blockKey: string): string {
	return `mdLcSeen${blockKey.slice(0, 24)}`;
}

/** Count a form once per session when at least half of it is visible. */
function trackImpressions(wrappers: HTMLElement[]): void {
	if (!("IntersectionObserver" in window)) return;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				observer.unobserve(el);
				const key = el.dataset.blockKey ?? "";
				const url = el.dataset.impressionUrl;
				if (!key || !url) continue;
				try {
					if (sessionStorage.getItem(seenKey(key))) continue;
					sessionStorage.setItem(seenKey(key), "1");
				} catch {
					// private mode: count anyway
				}
				const payload = JSON.stringify({ block_key: key });
				if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
				else void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
			}
		},
		{ threshold: 0.5 },
	);
	for (const w of wrappers) observer.observe(w);
}

function showError(wrapper: HTMLElement, form: HTMLFormElement, message: string): void {
	let err = wrapper.querySelector<HTMLElement>(".md-lead-capture-error");
	if (!err) {
		err = document.createElement("p");
		err.className = "md-lead-capture-error";
		err.setAttribute("role", "alert");
		form.appendChild(err);
	}
	err.textContent = message;
	err.hidden = false;
}

function clearError(wrapper: HTMLElement): void {
	const err = wrapper.querySelector<HTMLElement>(".md-lead-capture-error");
	if (err) {
		err.textContent = "";
		err.hidden = true;
	}
}

async function submit(form: HTMLFormElement, wrapper: HTMLElement): Promise<void> {
	const button = form.querySelector<HTMLButtonElement>(".email-form-submit");
	if (!button || button.disabled) return;
	button.classList.add("is-loading");
	button.disabled = true;
	clearError(wrapper);

	const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
	const newsletter = field("newsletter_opt_in");
	const body = {
		name: field("name")?.value.trim() ?? "",
		email: field("email")?.value.trim() ?? "",
		block_key: wrapper.dataset.blockKey ?? "",
		source_url: window.location.href.split("#")[0],
		newsletter_opt_in: newsletter ? (newsletter.type === "hidden" || newsletter.checked ? "1" : "0") : "0",
		website: field("website")?.value ?? "",
	};

	let reply: SubmitReply;
	try {
		const res = await fetch(wrapper.dataset.submitUrl ?? "", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", Accept: "application/json", "X-EmDash-Request": "1" },
			body: JSON.stringify(body),
		});
		const json = (await res.json()) as { data?: SubmitReply; error?: { message?: string } };
		reply = json.data ?? { success: false, message: json.error?.message || "Something went wrong." };
	} catch {
		reply = { success: false, message: "Network error. Please try again." };
	} finally {
		button.classList.remove("is-loading");
		button.disabled = false;
	}

	if (!reply.success) {
		showError(wrapper, form, reply.message || "Something went wrong.");
		field("email")?.focus();
		return;
	}

	if (wrapper.dataset.successAction === "redirect" && wrapper.dataset.redirectUrl) {
		window.location.href = wrapper.dataset.redirectUrl;
		return;
	}

	form.style.display = "none";
	const compactNewsletter = wrapper.querySelector<HTMLElement>(".md-lead-capture-newsletter-compact");
	if (compactNewsletter) compactNewsletter.style.display = "none";
	const success = wrapper.querySelector<HTMLElement>(".md-lead-capture-success");
	const message = wrapper.querySelector<HTMLElement>(".md-lead-capture-success-msg");
	if (message) message.textContent = reply.message;
	if (success) success.style.display = "";

	const download = wrapper.querySelector<HTMLElement>(".md-lead-capture-download");
	const link = download?.querySelector<HTMLAnchorElement>("a");
	if (reply.download_url && download && link) {
		link.href = reply.download_url;
		download.style.display = "";
	}
	message?.setAttribute("tabindex", "-1");
	message?.focus({ preventScroll: true });
}

export function initLeadCapture(root: ParentNode = document): void {
	const wrappers = [...root.querySelectorAll<HTMLElement>(".md-lead-capture")].filter((w) => !w.dataset[READY]);
	if (!wrappers.length) return;
	for (const wrapper of wrappers) {
		wrapper.dataset[READY] = "1";
		const form = wrapper.querySelector<HTMLFormElement>(".md-lead-capture-form");
		form?.addEventListener("submit", (event) => {
			event.preventDefault();
			void submit(form, wrapper);
		});
	}
	trackImpressions(wrappers);
}
