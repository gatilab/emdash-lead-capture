/**
 * Dashboard widget `leads`: active leads, new submissions over the last
 * 7 days (from the same daily stats as the sparkline) and a link to the
 * Leads page. The host draws the card and its title.
 */

import { Button } from "@cloudflare/kumo";
import * as React from "react";

import { getCounts, getStats, isAbortError } from "./api.js";
import { dailySeries, errorMessage, pluralize, sumLast, utcDay, type DailyStat, type LeadCounts } from "./helpers.js";
import { AdminLink, pluginHref } from "./navigation.js";
import { AdminStyles } from "./styles.js";
import { LoadingState, Sparkline } from "./ui.js";

interface WidgetData {
	counts: LeadCounts;
	/** Null when the stats call failed; the counts still show. */
	series: DailyStat[] | null;
}

export function LeadsWidget() {
	const [data, setData] = React.useState<WidgetData | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [attempt, setAttempt] = React.useState(0);

	React.useEffect(() => {
		const controller = new AbortController();
		const signal = controller.signal;
		setError(null);
		Promise.all([
			getCounts({ signal }),
			getStats(30, { signal }).catch((cause: unknown) => (isAbortError(cause) ? Promise.reject(cause) : null)),
		])
			.then(([counts, stats]) => setData({ counts, series: stats ? dailySeries(stats.daily, utcDay(Date.now()), 30) : null }))
			.catch((cause: unknown) => {
				if (!isAbortError(cause)) setError(errorMessage(cause, "Could not load leads."));
			});
		return () => controller.abort();
	}, [attempt]);

	if (error) {
		return (
			<div className="lca-admin lca-stack-sm" role="alert">
				<AdminStyles />
				<p className="lca-error-text">{error}</p>
				<div>
					<Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
						Try again
					</Button>
				</div>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="lca-admin">
				<AdminStyles />
				<LoadingState compact label="Loading leads…" />
			</div>
		);
	}

	const { counts, series } = data;
	const week = series ? sumLast(series, 7) : null;

	return (
		<div className="lca-admin lca-stack">
			<AdminStyles />
			<dl className="lca-widget-stats">
				<div>
					<dt>Active leads</dt>
					<dd>{counts.active.toLocaleString()}</dd>
				</div>
				<div>
					<dt>New, last 7 days</dt>
					<dd>{week === null ? "—" : week.toLocaleString()}</dd>
				</div>
			</dl>
			{series ? (
				<div className="lca-stack-xs">
					<Sparkline series={series} />
					<p className="lca-help">{pluralize(sumLast(series, 30), "submission")} · last 30 days</p>
				</div>
			) : null}
			{counts.pending > 0 ? (
				<p className="lca-help">
					<AdminLink href={pluginHref("/", { status: "pending" })} className="lca-link-accent">
						{pluralize(counts.pending, "lead")} awaiting confirmation
					</AdminLink>
				</p>
			) : null}
			<AdminLink href={pluginHref("/")} className="lca-link-accent lca-help">
				View all leads
			</AdminLink>
		</div>
	);
}
