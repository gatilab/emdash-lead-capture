/**
 * Below the leads list: failed newsletter forwards (only when there are any)
 * and the privacy tools — find and export, or erase, everything stored for
 * one email address (what WordPress's personal-data exporter and eraser did).
 */

import { Button, Input } from "@cloudflare/kumo";
import { DownloadSimpleIcon, MagnifyingGlassIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";

import { SERVICES } from "../core/types.js";
import { getForwardFailures, isAbortError, privacyErase, privacyExport, type ForwardFailure } from "./api.js";
import { errorMessage, formatDateTime, pluralize, privacyFilename, privacyJson, type PrivacyRecord } from "./helpers.js";
import { AdminLink, SETTINGS_HREF } from "./navigation.js";
import { ConfirmDialog, downloadText, ErrorNotice } from "./ui.js";

const EMAIL = /^[^\s@]+@[^\s@]+$/;

// =============================================================================
// Failed newsletter forwards
// =============================================================================

export function ForwardFailures({ reloadKey }: { reloadKey: number }) {
	const [items, setItems] = React.useState<ForwardFailure[]>([]);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		const controller = new AbortController();
		getForwardFailures({ signal: controller.signal })
			.then((res) => {
				setItems([...res.items].reverse());
				setError(null);
			})
			.catch((cause: unknown) => {
				if (!isAbortError(cause)) setError(errorMessage(cause, "Could not load failed forwards."));
			});
		return () => controller.abort();
	}, [reloadKey]);

	if (error) return <ErrorNotice title="Could not load failed newsletter forwards" message={error} />;
	if (!items.length) return null;

	return (
		<section className="lca-card lca-stack-sm" aria-labelledby="lca-failures-title">
			<h2 id="lca-failures-title" className="lca-section-title">
				Failed newsletter forwards
			</h2>
			<p className="lca-help">
				The most recent leads that couldn't be added to your newsletter service ({pluralize(items.length, "failure")}, newest
				first). The leads themselves were saved. Check the service's API key and list ID in{" "}
				<AdminLink href={SETTINGS_HREF} className="lca-link-accent">
					Settings
				</AdminLink>
				.
			</p>
			<div className="lca-table-wrap">
				<table className="lca-table">
					<caption className="lca-sr-only">Failed newsletter forwards, newest first</caption>
					<thead>
						<tr>
							<th scope="col">When</th>
							<th scope="col">Service</th>
							<th scope="col">List</th>
							<th scope="col">Email</th>
						</tr>
					</thead>
					<tbody>
						{items.map((item, index) => (
							<tr key={`${item.time}-${index}`}>
								<td className="lca-nowrap">
									<time dateTime={item.time}>{formatDateTime(item.time)}</time>
								</td>
								<td>{(SERVICES as Record<string, string>)[item.service] ?? (item.service || "—")}</td>
								<td className="lca-mono">{item.list || "—"}</td>
								<td>{item.email}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

// =============================================================================
// Privacy
// =============================================================================

interface Found {
	email: string;
	items: PrivacyRecord[];
}

export function PrivacyPanel({ announce, onErased }: { announce: (text: string) => void; onErased: () => void }) {
	const [email, setEmail] = React.useState("");
	const [inputError, setInputError] = React.useState<string | undefined>();
	const [found, setFound] = React.useState<Found | null>(null);
	const [finding, setFinding] = React.useState(false);
	const [findError, setFindError] = React.useState<string | null>(null);
	const [confirmErase, setConfirmErase] = React.useState<string | null>(null);
	const [erasing, setErasing] = React.useState(false);
	const [eraseError, setEraseError] = React.useState<string | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const focusInput = () => window.requestAnimationFrame(() => inputRef.current?.focus());

	const validEmail = (): string | null => {
		const value = email.trim();
		if (!EMAIL.test(value)) {
			setInputError("Enter an email address, like name@example.com.");
			focusInput();
			return null;
		}
		setInputError(undefined);
		return value;
	};

	const find = async (event: React.SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = validEmail();
		if (!value) return;
		setFinding(true);
		setFindError(null);
		try {
			const res = await privacyExport(value);
			setFound({ email: value, items: res.items });
			announce(res.items.length ? `Found ${pluralize(res.items.length, "lead")} for ${value}.` : `No leads found for ${value}.`);
		} catch (error) {
			setFindError(errorMessage(error, "Could not look up that email address."));
		} finally {
			setFinding(false);
		}
	};

	const erase = async () => {
		if (!confirmErase) return;
		setErasing(true);
		setEraseError(null);
		try {
			const { removed } = await privacyErase(confirmErase);
			announce(removed ? `Erased ${pluralize(removed, "lead")} for ${confirmErase}.` : `No leads were stored for ${confirmErase}.`);
			if (found?.email.toLowerCase() === confirmErase.toLowerCase()) setFound({ email: confirmErase, items: [] });
			setConfirmErase(null);
			onErased();
			focusInput();
		} catch (error) {
			setEraseError(errorMessage(error, "Could not erase that email address's data."));
		} finally {
			setErasing(false);
		}
	};

	return (
		<section className="lca-card lca-stack" aria-labelledby="lca-privacy-title">
			<div className="lca-stack-xs">
				<h2 id="lca-privacy-title" className="lca-section-title">
					Privacy
				</h2>
				<p className="lca-help">
					Answer a personal-data request: find and export, or erase, every lead stored for one email address, consent records
					included.
				</p>
			</div>

			<form className="lca-search" onSubmit={(event) => void find(event)} noValidate>
				<div className="lca-search-input">
					<Input
						ref={inputRef}
						type="email"
						label="Email address"
						autoComplete="off"
						value={email}
						error={inputError}
						onChange={(event) => {
							setEmail(event.target.value);
							if (inputError) setInputError(undefined);
						}}
					/>
				</div>
				<div className="lca-row" style={{ alignSelf: "flex-end" }}>
					<Button type="submit" variant="secondary" icon={<MagnifyingGlassIcon aria-hidden="true" />} loading={finding} disabled={finding}>
						Find data
					</Button>
					<Button
						type="button"
						variant="secondary-destructive"
						icon={<TrashIcon aria-hidden="true" />}
						onClick={() => {
							const value = validEmail();
							if (!value) return;
							setEraseError(null);
							setConfirmErase(value);
						}}
					>
						Erase data…
					</Button>
				</div>
			</form>

			{findError ? <ErrorNotice title="Lookup failed" message={findError} /> : null}

			{found ? (
				<div className="lca-stack-sm">
					<div className="lca-row lca-between">
						<h3 id="lca-privacy-results" className="lca-label">
							{found.items.length ? `${pluralize(found.items.length, "lead")} for ${found.email}` : `No leads stored for ${found.email}`}
						</h3>
						{found.items.length ? (
							<Button
								size="sm"
								variant="secondary"
								icon={<DownloadSimpleIcon aria-hidden="true" />}
								onClick={() => {
									downloadText(privacyJson(found.email, found.items), privacyFilename(), "application/json");
									announce("Downloaded the personal data as JSON.");
								}}
							>
								Download JSON
							</Button>
						) : null}
					</div>
					{found.items.length ? (
						<ul className="lca-plain-list">
							{found.items.map((item) => (
								<li key={item.id} className="lca-record">
									<dl className="lca-record-dl">
										{item.data.map(({ name, value }) => (
											<React.Fragment key={name}>
												<dt>{name}</dt>
												<dd>{value || "—"}</dd>
											</React.Fragment>
										))}
									</dl>
								</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}

			<ConfirmDialog
				open={confirmErase !== null}
				title="Erase this person's data?"
				description={
					<>
						Every lead stored for <strong>{confirmErase}</strong> is deleted permanently, consent records included. Download a
						copy first if you need one. This can't be undone.
					</>
				}
				confirmLabel="Erase data"
				pendingLabel="Erasing…"
				pending={erasing}
				error={eraseError}
				onConfirm={() => void erase()}
				onClose={() => setConfirmErase(null)}
			/>
		</section>
	);
}
