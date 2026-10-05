/**
 * Small shared building blocks for the Lead Capture admin, built on Kumo.
 */

import { Badge, Banner, Button, Dialog, Empty, LinkButton, Loader, type LinkButtonProps } from "@cloudflare/kumo";
import * as React from "react";

import type { LeadStatus } from "../core/types.js";
import { formatDay, peakDay, sparklinePoints, STATUS_LABELS, type DailyStat } from "./helpers.js";
import { interceptLinkClick } from "./navigation.js";
import { AdminStyles } from "./styles.js";

// =============================================================================
// Page shell and links
// =============================================================================

export function AdminPage({ children }: { children: React.ReactNode }) {
	return (
		<div className="lca-admin lca-page">
			<AdminStyles />
			{children}
		</div>
	);
}

/** Kumo's LinkButton, navigating inside the admin on a plain click. */
export function AdminLinkButton({ href, onClick, target, ...props }: LinkButtonProps & { href: string }) {
	return (
		<LinkButton
			href={href}
			target={target}
			onClick={(event) => {
				onClick?.(event);
				interceptLinkClick(event, href, { target });
			}}
			{...props}
		/>
	);
}

// =============================================================================
// States
// =============================================================================

export function LoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
	return (
		<div className={compact ? "lca-loading lca-loading-compact" : "lca-loading"} role="status">
			<Loader aria-label={label} />
		</div>
	);
}

export function ErrorNotice({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
	return (
		<div role="alert">
			<Banner
				variant="error"
				title={title}
				description={message}
				action={
					onRetry ? (
						<Button size="sm" variant="secondary" onClick={onRetry}>
							Try again
						</Button>
					) : undefined
				}
			/>
		</div>
	);
}

export function Notice({
	variant = "default",
	title,
	children,
}: {
	variant?: "default" | "alert" | "error" | "secondary";
	title?: string;
	children?: React.ReactNode;
}) {
	return <Banner variant={variant} title={title} description={children} />;
}

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
	return <Empty icon={icon} title={title} description={description} />;
}

// =============================================================================
// Badges
// =============================================================================

const STATUS_BADGE = {
	active: "success",
	pending: "info",
	unverified: "neutral",
	spam: "warning",
	trash: "error",
} as const satisfies Record<LeadStatus, string>;

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
	return <Badge variant={STATUS_BADGE[status] ?? "secondary"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

// =============================================================================
// Announcements
// =============================================================================

/** A polite live region plus a function to announce through it. */
export function useAnnouncer(): [message: string, announce: (text: string) => void] {
	const [message, setMessage] = React.useState("");
	const timer = React.useRef<number | undefined>(undefined);
	const announce = React.useCallback((text: string) => {
		window.clearTimeout(timer.current);
		// Clear first so the same text is announced again.
		setMessage("");
		timer.current = window.setTimeout(() => setMessage(text), 60);
	}, []);
	React.useEffect(() => () => window.clearTimeout(timer.current), []);
	return [message, announce];
}

export function LiveRegion({ message }: { message: string }) {
	return (
		<p className="lca-sr-only" role="status" aria-live="polite" aria-atomic="true">
			{message}
		</p>
	);
}

// =============================================================================
// Dialogs
// =============================================================================

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	pendingLabel,
	pending,
	error,
	onConfirm,
	onClose,
}: {
	open: boolean;
	title: string;
	description: React.ReactNode;
	confirmLabel: string;
	pendingLabel: string;
	pending: boolean;
	error?: string | null;
	onConfirm: () => void;
	onClose: () => void;
}) {
	return (
		<Dialog.Root
			role="alertdialog"
			open={open}
			onOpenChange={(next) => {
				if (!next && !pending) onClose();
			}}
		>
			<Dialog size="sm" className="lca-dialog">
				<div className="lca-stack-sm">
					<Dialog.Title className="lca-dialog-title">{title}</Dialog.Title>
					<Dialog.Description className="lca-help">{description}</Dialog.Description>
				</div>
				{error ? (
					<p role="alert" className="lca-error-text lca-dialog-body">
						{error}
					</p>
				) : null}
				<div className="lca-dialog-actions">
					<Button variant="secondary" disabled={pending} onClick={onClose}>
						Cancel
					</Button>
					<Button variant="destructive" loading={pending} disabled={pending} onClick={onConfirm}>
						{pending ? pendingLabel : confirmLabel}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}

// =============================================================================
// Sparkline
// =============================================================================

const SPARK_W = 200;
const SPARK_H = 40;

/** Daily submissions as an inline SVG polyline, described for screen readers. */
export function Sparkline({ series, className = "lca-spark" }: { series: readonly DailyStat[]; className?: string }) {
	const total = series.reduce((sum, d) => sum + d.submissions, 0);
	const peak = peakDay(series);
	const first = series[0];
	const last = series[series.length - 1];
	const label =
		first && last
			? `Daily submissions from ${formatDay(first.day)} to ${formatDay(last.day)}: ${total.toLocaleString()} in total${
					peak ? `, most on ${formatDay(peak.day)} (${peak.submissions.toLocaleString()})` : ""
				}.`
			: "No submission data.";
	return (
		<svg className={className} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={label}>
			<line className="lca-spark-base" x1="0" y1={SPARK_H - 1} x2={SPARK_W} y2={SPARK_H - 1} />
			{series.length ? <polyline className="lca-spark-line" points={sparklinePoints(series.map((d) => d.submissions), SPARK_W, SPARK_H, 2)} /> : null}
		</svg>
	);
}

// =============================================================================
// DOM utilities
// =============================================================================

/** Focus an element by id once React has committed the next render. */
export function focusSoon(id: string): void {
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			document.getElementById(id)?.focus();
		});
	});
}

/** Trigger a browser download for text content. */
export function downloadText(text: string, filename: string, type: string): void {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = "noopener";
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
