/**
 * The leads list: status views with counts, search, the table with row and
 * bulk actions, cursor pagination and a details panel. View and search come
 * from the URL; the open lead is local state (there is no single-lead route,
 * so the panel shows the row as listed).
 */

import { Button, Checkbox, Input } from "@cloudflare/kumo";
import { MagnifyingGlassIcon, TrayIcon, XIcon } from "@phosphor-icons/react";
import * as React from "react";

import { consentSummary } from "../core/crypto.js";
import { SERVICES, type Lead, type LeadStatus } from "../core/types.js";
import { isAbortError, listLeads, runAction } from "./api.js";
import {
	ACTION_HELP,
	ACTION_LABELS,
	actionDoneMessage,
	applicableIds,
	bulkActions,
	errorMessage,
	formatDate,
	formatDateTime,
	isHttpUrl,
	matchesView,
	pluralize,
	rowActions,
	sourceLabel,
	statusAfter,
	VIEW_LABELS,
	visibleViews,
	type LeadAction,
	type LeadCounts,
	type LeadView,
} from "./helpers.js";
import { AdminLink, pluginHref, setSearchParams } from "./navigation.js";
import { ConfirmDialog, EmptyState, ErrorNotice, focusSoon, LeadStatusBadge, LoadingState, Notice } from "./ui.js";

const PAGE_SIZE = 25;
/** The server returns at most this many matches per search. */
const SEARCH_LIMIT = 100;
/** The server applies an action to at most this many ids per call. */
const ACTION_BATCH = 100;
const HEADING_ID = "lca-leads-heading";

const openButtonId = (id: string) => `lca-open-${id}`;
const yesNo = (value: boolean) => (value ? "Yes" : <span className="lca-no">No</span>);

export function LeadsList({
	view,
	search,
	counts,
	reloadKey,
	onChanged,
	announce,
}: {
	view: LeadView;
	search: string;
	counts: LeadCounts | null;
	reloadKey: number;
	/** Called after leads change, so the page refreshes its counts. */
	onChanged: () => void;
	announce: (text: string) => void;
}) {
	const [items, setItems] = React.useState<Lead[] | null>(null);
	const [cursor, setCursor] = React.useState<string | undefined>();
	const [truncated, setTruncated] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [localKey, setLocalKey] = React.useState(0);
	const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
	const [busy, setBusy] = React.useState(false);
	const [actionError, setActionError] = React.useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);
	const [deleteError, setDeleteError] = React.useState<string | null>(null);
	const [openLead, setOpenLead] = React.useState<Lead | null>(null);
	const [draft, setDraft] = React.useState(search);
	const searchRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => setDraft(search), [search]);

	// ---- load the first page whenever the view, search or reload key changes
	React.useEffect(() => {
		const controller = new AbortController();
		setItems(null);
		setCursor(undefined);
		setTruncated(false);
		setLoadError(null);
		setSelected(new Set());
		listLeads({ status: view, search: search || undefined, limit: search ? SEARCH_LIMIT : PAGE_SIZE }, { signal: controller.signal })
			.then((page) => {
				setItems(page.items);
				setCursor(page.cursor);
				setTruncated(Boolean(page.truncated));
			})
			.catch((error: unknown) => {
				if (!isAbortError(error)) setLoadError(errorMessage(error, "Could not load leads."));
			});
		return () => controller.abort();
	}, [view, search, reloadKey, localKey]);

	// Close the panel when the view or search changes.
	React.useEffect(() => setOpenLead(null), [view, search]);

	const loadMore = async () => {
		if (!cursor || search) return;
		setLoadingMore(true);
		setActionError(null);
		try {
			const page = await listLeads({ status: view, cursor, limit: PAGE_SIZE });
			setItems((current) => {
				const seen = new Set((current ?? []).map((l) => l.id));
				return [...(current ?? []), ...page.items.filter((l) => !seen.has(l.id))];
			});
			setCursor(page.cursor);
			announce(`Loaded ${pluralize(page.items.length, "more lead")}.`);
		} catch (error) {
			setActionError(errorMessage(error, "Could not load more leads."));
		} finally {
			setLoadingMore(false);
		}
	};

	// ---- actions
	const leadsById = React.useMemo(() => new Map((items ?? []).map((l) => [l.id, l])), [items]);

	/**
	 * Apply local state after an action succeeded on `ids`. `extra` is a lead
	 * acted on from the panel that may no longer be listed (say, restored from
	 * the trash while viewing Active): it rejoins the list when it fits.
	 */
	const applyLocally = (action: LeadAction, ids: string[], extra?: Lead) => {
		const changed = new Set(ids);
		setItems((current) => {
			if (!current) return current;
			const next: Lead[] = [];
			for (const lead of current) {
				if (!changed.has(lead.id)) {
					next.push(lead);
					continue;
				}
				const status = statusAfter(action, lead.status);
				if (status && matchesView(status, view)) next.push({ ...lead, status });
			}
			const status = extra && changed.has(extra.id) ? statusAfter(action, extra.status) : null;
			if (extra && status && !search && matchesView(status, view) && !current.some((l) => l.id === extra.id)) {
				const oldest = next[next.length - 1];
				// Only within the loaded range, so "Load more" doesn't repeat it.
				if (!cursor || !oldest || extra.createdAt >= oldest.createdAt) {
					next.push({ ...extra, status });
					next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
				}
			}
			return next;
		});
		setOpenLead((current) => {
			if (!current || !changed.has(current.id)) return current;
			const status = statusAfter(action, current.status);
			return status ? { ...current, status } : null;
		});
		setSelected((current) => new Set([...current].filter((id) => !changed.has(id))));
	};

	/** Where focus goes when a row leaves the list: the next row, or the heading. */
	const focusAfterRemoval = (ids: string[]) => {
		const removed = new Set(ids);
		const list = items ?? [];
		const firstIndex = list.findIndex((l) => removed.has(l.id));
		const next = list.slice(firstIndex + 1).find((l) => !removed.has(l.id)) ?? [...list.slice(0, Math.max(0, firstIndex))].reverse().find((l) => !removed.has(l.id));
		focusSoon(next ? openButtonId(next.id) : HEADING_ID);
	};

	const send = async (action: LeadAction, ids: string[]): Promise<number> => {
		let updated = 0;
		for (let i = 0; i < ids.length; i += ACTION_BATCH) {
			const res = await runAction(action, ids.slice(i, i + ACTION_BATCH));
			updated += res.updated;
		}
		return updated;
	};

	/** Run an action on leads (skipping those it doesn't apply to); delete asks first. */
	const run = async (action: LeadAction, leads: Lead[], origin: "row" | "bulk" | "panel") => {
		const ids = applicableIds(leads, action);
		const skipped = leads.length - ids.length;
		if (!ids.length) {
			announce(`${ACTION_LABELS[action]} doesn't apply to the selected leads.`);
			return;
		}
		if (action === "delete") {
			setDeleteError(null);
			setConfirmDelete(ids);
			return;
		}
		setBusy(true);
		setActionError(null);
		try {
			const updated = await send(action, ids);
			const leaving = ids.filter((id) => {
				const lead = leadsById.get(id);
				const status = lead ? statusAfter(action, lead.status) : null;
				return !status || !matchesView(status, view);
			});
			// The clicked button may disappear (its row leaves, the bulk bar closes, the
			// row's actions change): move focus somewhere stable.
			if (origin === "panel") focusSoon("lca-detail-title");
			else if (origin === "bulk") focusSoon(HEADING_ID);
			else if (leaving.length) focusAfterRemoval(leaving);
			else if (leads[0] && !rowActions(statusAfter(action, leads[0].status) ?? leads[0].status).includes(action)) focusSoon(openButtonId(leads[0].id));
			applyLocally(action, ids, origin === "panel" ? leads[0] : undefined);
			onChanged();
			announce(actionDoneMessage(action, updated, skipped));
		} catch (error) {
			setActionError(errorMessage(error, "Could not update the leads."));
		} finally {
			setBusy(false);
		}
	};

	const runDelete = async () => {
		if (!confirmDelete) return;
		setBusy(true);
		setDeleteError(null);
		try {
			const updated = await send("delete", confirmDelete);
			if (!openLead || !confirmDelete.includes(openLead.id)) focusAfterRemoval(confirmDelete);
			else focusSoon(HEADING_ID);
			applyLocally("delete", confirmDelete);
			onChanged();
			announce(actionDoneMessage("delete", updated));
			setConfirmDelete(null);
		} catch (error) {
			setDeleteError(errorMessage(error, "Could not delete the leads."));
		} finally {
			setBusy(false);
		}
	};

	// ---- details panel
	const lastOpener = React.useRef<string | null>(null);
	const open = (lead: Lead) => {
		lastOpener.current = lead.id;
		setOpenLead(lead);
	};
	const close = () => {
		const id = openLead?.id ?? lastOpener.current;
		setOpenLead(null);
		if (id) focusSoon(document.getElementById(openButtonId(id)) ? openButtonId(id) : HEADING_ID);
	};

	// ---- selection
	const visibleIds = items?.map((l) => l.id) ?? [];
	const selectedLeads = (items ?? []).filter((l) => selected.has(l.id));
	const allSelected = visibleIds.length > 0 && selectedLeads.length === visibleIds.length;
	const someSelected = selectedLeads.length > 0 && !allSelected;
	const toggleAll = (checked: boolean) => setSelected(checked ? new Set(visibleIds) : new Set());
	const toggleOne = (id: string, checked: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	const bulk = bulkActions(
		selectedLeads.map((l) => l.status),
		view,
	);

	// ---- search
	const submitSearch = (event: React.SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSearchParams({ s: draft.trim() || undefined });
	};
	const clearSearch = () => {
		setDraft("");
		setSearchParams({ s: undefined });
		window.requestAnimationFrame(() => searchRef.current?.focus());
	};

	const heading = search ? `Search results for “${search}”` : `${VIEW_LABELS[view]} leads`;
	const views = visibleViews(counts, view);

	return (
		<section className="lca-stack" aria-labelledby={HEADING_ID}>
			<div className="lca-toolbar">
				<h2 id={HEADING_ID} tabIndex={-1} className="lca-section-title">
					{heading}
				</h2>
				<form role="search" className="lca-search" onSubmit={submitSearch}>
					<div className="lca-search-input">
						<Input
							ref={searchRef}
							type="search"
							aria-label="Search leads by name or email"
							placeholder="Name or email"
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
						/>
					</div>
					<Button type="submit" variant="secondary" icon={<MagnifyingGlassIcon aria-hidden="true" />}>
						Search
					</Button>
					{search ? (
						<Button type="button" variant="ghost" onClick={clearSearch}>
							Clear search
						</Button>
					) : null}
				</form>
			</div>

			<nav aria-label="Lead status">
				<ul className="lca-views">
					{views.map((v) => (
						<li key={v}>
							<AdminLink
								href={pluginHref("/", { status: v === "all" ? undefined : v, s: search || undefined })}
								aria-current={v === view ? "page" : undefined}
							>
								{VIEW_LABELS[v]} <span className="lca-count">({counts ? counts[v].toLocaleString() : "…"})</span>
							</AdminLink>
						</li>
					))}
				</ul>
			</nav>

			{truncated ? (
				<Notice variant="alert" title="Search stopped early">
					Search checks a limited number of the newest leads in this view, and stopped before the oldest. Older matches may
					be missing: try a more specific search, or export the CSV.
				</Notice>
			) : null}

			{actionError ? <ErrorNotice title="That didn't work" message={actionError} /> : null}

			{selected.size > 0 ? (
				<div className="lca-bulkbar" role="region" aria-label="Bulk actions">
					<span className="lca-label">{pluralize(selectedLeads.length, "lead")} selected</span>
					{bulk.map((action) => (
						<Button
							key={action}
							size="sm"
							variant={action === "delete" ? "secondary-destructive" : "secondary"}
							disabled={busy}
							onClick={() => void run(action, selectedLeads, "bulk")}
						>
							{action === "delete" ? "Delete permanently…" : ACTION_LABELS[action]}
						</Button>
					))}
					<Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
						Clear selection
					</Button>
				</div>
			) : null}

			<div className="lca-inbox" data-detail-open={openLead ? "" : undefined}>
				<div className="lca-stack" style={{ minWidth: 0 }}>
					{loadError ? (
						<ErrorNotice title="Could not load leads" message={loadError} onRetry={() => setLocalKey((n) => n + 1)} />
					) : items === null ? (
						<LoadingState label="Loading leads…" />
					) : items.length === 0 ? (
						<EmptyState
							icon={<TrayIcon size={40} aria-hidden="true" />}
							title={search ? "No matching leads" : view === "all" ? "No leads yet" : `No ${VIEW_LABELS[view].toLowerCase()} leads`}
							description={
								search
									? "No lead in this view has that name or email."
									: view === "all"
										? "Leads appear here when someone submits a Lead Capture block."
										: "Nothing in this view."
							}
						/>
					) : (
						<>
							<div className="lca-table-wrap">
								<table className="lca-table" aria-busy={busy || undefined}>
									<caption className="lca-sr-only">{heading}, newest first</caption>
									<thead>
										<tr>
											<th scope="col" className="lca-check">
												<Checkbox
													aria-label="Select all leads shown"
													checked={allSelected}
													indeterminate={someSelected}
													onCheckedChange={(checked) => toggleAll(checked === true)}
												/>
											</th>
											<th scope="col">Name / Email</th>
											<th scope="col">Source page</th>
											<th scope="col">Resource</th>
											<th scope="col">Newsletter</th>
											<th scope="col">Downloaded</th>
											<th scope="col">Status</th>
											<th scope="col">Date</th>
										</tr>
									</thead>
									<tbody>
										{items.map((lead) => (
											<LeadRow
												key={lead.id}
												lead={lead}
												active={lead.id === openLead?.id}
												selected={selected.has(lead.id)}
												busy={busy}
												view={view}
												onSelect={(checked) => toggleOne(lead.id, checked)}
												onOpen={() => open(lead)}
												onAction={(action) => void run(action, [lead], "row")}
											/>
										))}
									</tbody>
								</table>
							</div>
							<div className="lca-row lca-between">
								<p className="lca-help">
									{search
										? items.length >= SEARCH_LIMIT
											? `Showing the first ${SEARCH_LIMIT} matches. Refine the search to see others.`
											: `${pluralize(items.length, "match", "matches")}.`
										: `Showing ${pluralize(items.length, "lead")}${cursor ? "" : " (all)"}.`}
								</p>
								{cursor && !search ? (
									<Button variant="secondary" loading={loadingMore} disabled={loadingMore} onClick={() => void loadMore()}>
										Load more
									</Button>
								) : null}
							</div>
						</>
					)}
				</div>

				{openLead ? (
					<LeadDetail
						key={openLead.id}
						lead={openLead}
						busy={busy}
						onClose={close}
						onAction={(action) => void run(action, [openLead], "panel")}
					/>
				) : null}
			</div>

			<ConfirmDialog
				open={confirmDelete !== null}
				title={
					confirmDelete && confirmDelete.length > 1 ? `Delete ${pluralize(confirmDelete.length, "lead")} permanently?` : "Delete this lead permanently?"
				}
				description="This can't be undone. The lead, its consent record and its download link are removed for good."
				confirmLabel="Delete permanently"
				pendingLabel="Deleting…"
				pending={busy && confirmDelete !== null}
				error={deleteError}
				onConfirm={() => void runDelete()}
				onClose={() => setConfirmDelete(null)}
			/>
		</section>
	);
}

// =============================================================================
// Row
// =============================================================================

function RowActions({
	lead,
	view,
	busy,
	onAction,
}: {
	lead: Lead;
	view: LeadView;
	busy: boolean;
	onAction: (action: LeadAction) => void;
}) {
	// Delete permanently only from the trash view, as in WordPress.
	const actions = rowActions(lead.status).filter((a) => a !== "delete" || view === "trash");
	if (!actions.length) return null;
	return (
		<div className="lca-row-actions" role="group" aria-label={`Actions for ${lead.email}`}>
			{actions.map((action) => (
				<button
					key={action}
					type="button"
					className="lca-row-action"
					data-danger={action === "delete" ? "" : undefined}
					disabled={busy}
					title={ACTION_HELP[action]}
					aria-label={`${ACTION_LABELS[action]} (${lead.email})`}
					onClick={() => onAction(action)}
				>
					{ACTION_LABELS[action]}
				</button>
			))}
		</div>
	);
}

function LeadRow({
	lead,
	active,
	selected,
	busy,
	view,
	onSelect,
	onOpen,
	onAction,
}: {
	lead: Lead;
	active: boolean;
	selected: boolean;
	busy: boolean;
	view: LeadView;
	onSelect: (checked: boolean) => void;
	onOpen: () => void;
	onAction: (action: LeadAction) => void;
}) {
	const source = sourceLabel(lead);
	return (
		<tr
			data-active={active ? "" : undefined}
			onClick={(event) => {
				if ((event.target as HTMLElement).closest("a,button,input,label,[role=checkbox]")) return;
				onOpen();
			}}
		>
			<td className="lca-check" onClick={(event) => event.stopPropagation()}>
				<Checkbox aria-label={`Select ${lead.email}`} checked={selected} onCheckedChange={(checked) => onSelect(checked === true)} />
			</td>
			<td>
				<button
					type="button"
					id={openButtonId(lead.id)}
					className="lca-link-button"
					aria-expanded={active}
					aria-controls={active ? "lca-detail" : undefined}
					onClick={onOpen}
				>
					<span className="lca-name">{lead.name || <span className="lca-muted">(no name)</span>}</span>
					<span className="lca-email">{lead.email}</span>
					<span className="lca-sr-only">, show details</span>
				</button>
				<RowActions lead={lead} view={view} busy={busy} onAction={onAction} />
			</td>
			<td>
				<span className="lca-truncate lca-mono" title={lead.sourceUrl || source}>
					{source}
				</span>
			</td>
			<td>
				<span className="lca-truncate">{lead.deliverableLabel || <span className="lca-muted">—</span>}</span>
			</td>
			<td>{yesNo(lead.newsletterOptIn)}</td>
			<td>{lead.clickedAt ? <span title={formatDateTime(lead.clickedAt)}>Yes</span> : yesNo(false)}</td>
			<td>
				<LeadStatusBadge status={lead.status} />
			</td>
			<td className="lca-nowrap">
				<time dateTime={lead.createdAt} title={formatDateTime(lead.createdAt)}>
					{formatDate(lead.createdAt)}
				</time>
			</td>
		</tr>
	);
}

// =============================================================================
// Details panel
// =============================================================================

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a className="lca-link-accent" href={href} target="_blank" rel="noopener noreferrer">
			{children}
			<span className="lca-sr-only"> (opens in a new tab)</span>
		</a>
	);
}

const SOURCE_TYPES: Record<string, string> = { block: "Lead Capture block", optin: "Optins (imported)", upgrade: "Content upgrade (imported)" };

function LeadDetail({
	lead,
	busy,
	onClose,
	onAction,
}: {
	lead: Lead;
	busy: boolean;
	onClose: () => void;
	onAction: (action: LeadAction) => void;
}) {
	const heading = React.useRef<HTMLHeadingElement>(null);
	React.useEffect(() => {
		heading.current?.focus();
	}, []);

	const service = lead.service ? (SERVICES as Record<string, string>)[lead.service] ?? lead.service : "";
	const date = (iso: string | null | undefined, empty = "—") =>
		iso ? <time dateTime={iso}>{formatDateTime(iso)}</time> : <span className="lca-muted">{empty}</span>;

	const rows: [string, React.ReactNode][] = [
		["Email", <a key="e" className="lca-link-accent" href={`mailto:${lead.email}`}>{lead.email}</a>],
		["Name", lead.name || <span className="lca-muted">Not given</span>],
		["Source page", <span key="s" className="lca-mono">{sourceLabel(lead)}</span>],
		["Source URL", isHttpUrl(lead.sourceUrl) ? <ExternalLink href={lead.sourceUrl}>{lead.sourceUrl}</ExternalLink> : lead.sourceUrl || "—"],
		["Captured via", SOURCE_TYPES[lead.sourceType] ?? lead.sourceType],
		["Resource", lead.deliverableLabel || "—"],
		["Resource file", isHttpUrl(lead.deliverableUrl) ? <ExternalLink href={lead.deliverableUrl}>{lead.deliverableUrl}</ExternalLink> : lead.deliverableUrl || "—"],
		["Newsletter opt-in", lead.newsletterOptIn ? "Yes" : "No"],
	];
	if (service) rows.push(["Newsletter service", lead.list ? `${service} · ${lead.list}` : service]);
	rows.push(["Consent", consentSummary(lead.consent) || <span className="lca-muted">None recorded</span>]);
	if (lead.consent?.version) rows.push(["Consent wording version", <span key="v" className="lca-mono">{lead.consent.version}</span>]);
	rows.push(
		["Signed up", date(lead.createdAt)],
		["Email confirmed", date(lead.confirmedAt, lead.status === "pending" ? "Awaiting confirmation" : "—")],
		["Download link emailed", date(lead.deliveredAt, "Not yet")],
		["Download link issued", date(lead.tokenIssuedAt)],
		["Downloaded", date(lead.clickedAt, "Not yet")],
	);
	if (lead.spamScore) rows.push(["Spam check", lead.spamScore]);
	if (lead.legacyId) rows.push(["WordPress lead ID", String(lead.legacyId)]);

	const statusNote: Partial<Record<LeadStatus, string>> = {
		pending: "Waiting for the visitor to confirm their email address.",
		unverified: "Imported from Optins without a confirmed address.",
		spam: "Flagged as spam. Not spam restores it and emails the download link.",
		trash: "In the trash. Trash empties after 90 days.",
	};

	return (
		<aside
			id="lca-detail"
			className="lca-card lca-detail"
			aria-labelledby="lca-detail-title"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					onClose();
				}
			}}
		>
			<div className="lca-row lca-between">
				<h2 id="lca-detail-title" ref={heading} tabIndex={-1} className="lca-section-title">
					{lead.name || lead.email}
				</h2>
				<Button variant="ghost" shape="square" aria-label="Close lead details" icon={<XIcon aria-hidden="true" />} onClick={onClose} />
			</div>
			<div className="lca-stack-xs">
				<div className="lca-row">
					<LeadStatusBadge status={lead.status} />
				</div>
				{statusNote[lead.status] ? <p className="lca-help">{statusNote[lead.status]}</p> : null}
			</div>
			<dl className="lca-dl">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
			<div className="lca-row" role="group" aria-label="Lead actions">
				{rowActions(lead.status).map((action) => (
					<Button
						key={action}
						size="sm"
						variant={action === "delete" ? "secondary-destructive" : "secondary"}
						disabled={busy}
						onClick={() => onAction(action)}
					>
						{action === "delete" ? "Delete permanently…" : ACTION_LABELS[action]}
					</Button>
				))}
			</div>
		</aside>
	);
}
