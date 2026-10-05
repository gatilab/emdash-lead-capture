/**
 * Leads page (`/`): the WordPress Lead Capture screen, top to bottom —
 * summary strip with the 30-day sparkline and CSV export, conversion by
 * page, the leads list, failed newsletter forwards and the privacy tools.
 *
 * The status view and search live in the URL (`?status=&s=`), since plugin
 * pages get no props.
 */

import { Button } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, DownloadSimpleIcon, GearSixIcon } from "@phosphor-icons/react";
import * as React from "react";

import { exportPage, getCounts, getStats, isAbortError } from "./api.js";
import {
	collectCsv,
	parseView,
	conversionLabel,
	csvFilename,
	dailySeries,
	errorMessage,
	formatPercent,
	percentOf,
	pluralize,
	sumLast,
	utcDay,
	VIEW_LABELS,
	type LeadCounts,
	type LeadView,
	type StatsSummary,
} from "./helpers.js";
import { LeadsList } from "./LeadsList.js";
import { SETTINGS_HREF, useSearchParams } from "./navigation.js";
import { ForwardFailures, PrivacyPanel } from "./PrivacyPanel.js";
import { AdminLinkButton, AdminPage, downloadText, ErrorNotice, LiveRegion, LoadingState, Sparkline, useAnnouncer } from "./ui.js";

export function LeadsPage() {
	const params = useSearchParams();
	const view = parseView(params.get("status"));
	const search = (params.get("s") ?? "").trim();

	const [counts, setCounts] = React.useState<LeadCounts | null>(null);
	const [countsError, setCountsError] = React.useState<string | null>(null);
	const [stats, setStats] = React.useState<StatsSummary | null>(null);
	const [statsError, setStatsError] = React.useState<string | null>(null);
	const [countsKey, setCountsKey] = React.useState(0);
	const [statsKey, setStatsKey] = React.useState(0);
	const [listKey, setListKey] = React.useState(0);
	const [announcement, announce] = useAnnouncer();

	React.useEffect(() => {
		const controller = new AbortController();
		setCountsError(null);
		getCounts({ signal: controller.signal })
			.then(setCounts)
			.catch((error: unknown) => {
				if (!isAbortError(error)) setCountsError(errorMessage(error, "Could not load lead counts."));
			});
		return () => controller.abort();
	}, [countsKey]);

	React.useEffect(() => {
		const controller = new AbortController();
		setStatsError(null);
		getStats(30, { signal: controller.signal })
			.then(setStats)
			.catch((error: unknown) => {
				if (!isAbortError(error)) setStatsError(errorMessage(error, "Could not load conversion stats."));
			});
		return () => controller.abort();
	}, [statsKey]);

	const refreshCounts = React.useCallback(() => setCountsKey((n) => n + 1), []);
	const refreshAll = () => {
		setCountsKey((n) => n + 1);
		setStatsKey((n) => n + 1);
		setListKey((n) => n + 1);
		announce("Refreshing leads.");
	};
	const afterErase = React.useCallback(() => {
		setCountsKey((n) => n + 1);
		setListKey((n) => n + 1);
	}, []);

	return (
		<AdminPage>
			<LiveRegion message={announcement} />
			<header className="lca-page-header">
				<div className="lca-stack-xs lca-grow">
					<h1 className="lca-title">Leads</h1>
					<p className="lca-help">People who asked for a resource through a Lead Capture block.</p>
				</div>
				<div className="lca-row">
					<Button variant="ghost" shape="square" aria-label="Refresh leads" icon={<ArrowClockwiseIcon aria-hidden="true" />} onClick={refreshAll} />
					<AdminLinkButton href={SETTINGS_HREF} variant="secondary" icon={<GearSixIcon aria-hidden="true" />}>
						Settings
					</AdminLinkButton>
				</div>
			</header>

			<SummaryStrip
				counts={counts}
				countsError={countsError}
				stats={stats}
				view={view}
				announce={announce}
				onRetry={() => {
					refreshCounts();
					setStatsKey((n) => n + 1);
				}}
			/>

			<ConversionTable stats={stats} error={statsError} onRetry={() => setStatsKey((n) => n + 1)} />

			<LeadsList view={view} search={search} counts={counts} reloadKey={listKey} onChanged={refreshCounts} announce={announce} />

			<ForwardFailures reloadKey={countsKey} />

			<PrivacyPanel announce={announce} onErased={afterErase} />
		</AdminPage>
	);
}

// =============================================================================
// Summary strip
// =============================================================================

function Stat({ label, value, meta, tone }: { label: string; value: React.ReactNode; meta?: React.ReactNode; tone?: "warning" }) {
	return (
		<li className="lca-stat" data-tone={tone}>
			<span className="lca-stat-label">{label}</span>
			<span className="lca-stat-value">{value}</span>
			{meta ? <span className="lca-stat-meta">{meta}</span> : null}
		</li>
	);
}

function SummaryStrip({
	counts,
	countsError,
	stats,
	view,
	announce,
	onRetry,
}: {
	counts: LeadCounts | null;
	countsError: string | null;
	stats: StatsSummary | null;
	view: LeadView;
	announce: (text: string) => void;
	onRetry: () => void;
}) {
	const [exporting, setExporting] = React.useState(false);
	const [progress, setProgress] = React.useState(0);
	const [exportError, setExportError] = React.useState<string | null>(null);

	const series = React.useMemo(() => (stats ? dailySeries(stats.daily, utcDay(Date.now()), 30) : null), [stats]);
	const submissions = series ? sumLast(series, 30) : null;
	const active = counts?.active ?? 0;
	const share = (part: number) => formatPercent(percentOf(part, active));
	const viewLabel = VIEW_LABELS[view];

	const runExport = async () => {
		setExporting(true);
		setProgress(0);
		setExportError(null);
		announce(`Exporting the ${viewLabel} view…`);
		try {
			const { csv, count } = await collectCsv((cursor) => exportPage(view, cursor), setProgress);
			downloadText(csv, csvFilename(), "text/csv;charset=utf-8");
			announce(`Downloaded a CSV of ${pluralize(count, "lead")}.`);
		} catch (error) {
			setExportError(errorMessage(error, "Could not export leads."));
		} finally {
			setExporting(false);
		}
	};

	return (
		<section className="lca-stack-sm" aria-labelledby="lca-summary-title">
			<h2 id="lca-summary-title" className="lca-sr-only">
				Summary
			</h2>
			{countsError ? <ErrorNotice title="Could not load the summary" message={countsError} onRetry={onRetry} /> : null}
			<ul className="lca-stats">
				<Stat label="Active leads" value={counts ? counts.active.toLocaleString() : "—"} />
				<Stat
					label="Newsletter"
					value={counts ? counts.newsletter.toLocaleString() : "—"}
					meta={counts && active > 0 ? `${share(counts.newsletter)} of active` : undefined}
				/>
				<Stat
					label="Downloaded"
					value={counts ? counts.clicked.toLocaleString() : "—"}
					meta={counts && active > 0 ? `${share(counts.clicked)} of active` : undefined}
				/>
				{counts && counts.pending > 0 ? <Stat label="Awaiting confirmation" value={counts.pending.toLocaleString()} /> : null}
				{counts && counts.spam > 0 ? <Stat label="Spam" value={counts.spam.toLocaleString()} tone="warning" /> : null}
				<li className="lca-stat lca-stat-wide">
					<span className="lca-stat-label">Submissions</span>
					{series ? <Sparkline series={series} /> : <span className="lca-spark" aria-hidden="true" />}
					<span className="lca-stat-meta">
						{submissions === null ? "Loading…" : `${pluralize(submissions, "submission")} · last 30 days`}
					</span>
				</li>
			</ul>
			<div className="lca-toolbar">
				<p id="lca-export-help" className="lca-help">
					{exporting
						? `Exporting… ${pluralize(progress, "lead")} so far.`
						: `Export CSV downloads every lead in the ${viewLabel} view, with the WordPress columns.`}
				</p>
				<Button
					variant="secondary"
					icon={<DownloadSimpleIcon aria-hidden="true" />}
					loading={exporting}
					disabled={exporting}
					aria-describedby="lca-export-help"
					onClick={() => void runExport()}
				>
					Export CSV
				</Button>
			</div>
			{exportError ? <ErrorNotice title="Export failed" message={exportError} /> : null}
		</section>
	);
}

// =============================================================================
// Conversion by page
// =============================================================================

/** Only same-site paths become links. */
const sitePath = (path: string) => path.startsWith("/") && !path.startsWith("//");

function ConversionTable({ stats, error, onRetry }: { stats: StatsSummary | null; error: string | null; onRetry: () => void }) {
	return (
		<details className="lca-collapse">
			<summary>Conversion by page (last 30 days)</summary>
			<div className="lca-collapse-body">
				{error ? (
					<ErrorNotice title="Could not load conversion stats" message={error} onRetry={onRetry} />
				) : !stats ? (
					<LoadingState compact label="Loading conversion stats…" />
				) : stats.pages.length === 0 ? (
					<p className="lca-help">No impressions or submissions recorded in the last 30 days.</p>
				) : (
					<>
						<p className="lca-help">
							The pages with the most submissions. An impression is a page view with the form on it, so pages served from
							a cache may show fewer.
						</p>
						<div className="lca-table-wrap">
							<table className="lca-table">
								<caption className="lca-sr-only">Conversion by page, last 30 days</caption>
								<thead>
									<tr>
										<th scope="col">Page</th>
										<th scope="col" className="lca-num">
											Impressions
										</th>
										<th scope="col" className="lca-num">
											Submissions
										</th>
										<th scope="col" className="lca-num">
											Conversion
										</th>
									</tr>
								</thead>
								<tbody>
									{stats.pages.map((page) => (
										<tr key={page.path}>
											<th scope="row">
												{sitePath(page.path) ? (
													<a className="lca-link lca-mono" href={page.path} target="_blank" rel="noopener noreferrer">
														{page.path}
														<span className="lca-sr-only"> (opens in a new tab)</span>
													</a>
												) : (
													<span className="lca-mono">{page.path}</span>
												)}
											</th>
											<td className="lca-num">{page.impressions.toLocaleString()}</td>
											<td className="lca-num">{page.submissions.toLocaleString()}</td>
											<td className="lca-num">{conversionLabel(page.submissions, page.impressions)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>
		</details>
	);
}
