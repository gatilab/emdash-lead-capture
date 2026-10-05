/**
 * Styles for the parts of the Lead Capture admin that Kumo components don't
 * cover. The admin's Tailwind stylesheet is precompiled, so plugin-only
 * utility classes would be missing: these rules ship with the plugin, use
 * Kumo's CSS variables (so light and dark follow the admin), and carry an
 * `lca-` prefix so neither the site's front-end CSS nor another plugin's
 * admin CSS can collide with them.
 */

const CSS = `
/* On :root so Kumo dialogs, which portal outside .lca-admin, get them too. */
:root {
	--lca-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
	--lca-line: var(--color-kumo-line, rgba(127, 127, 127, 0.3));
	--lca-subtle: var(--text-color-kumo-subtle, inherit);
	--lca-focus: var(--color-kumo-focus, #2563eb);
	--lca-danger: var(--text-color-kumo-danger, #dc2626);
	--lca-tint: var(--color-kumo-tint, rgba(127, 127, 127, 0.08));
	--lca-surface: var(--color-kumo-base, transparent);
	--lca-brand: var(--color-kumo-brand, #2563eb);
}
.lca-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.lca-admin :where(h1, h2, h3, p, dl, dd, figure, ul) { margin: 0; }
.lca-page { display: grid; gap: 1.5rem; min-width: 0; }
.lca-page-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.lca-title { font-size: 1.5rem; line-height: 1.25; font-weight: 600; }
.lca-section-title { font-size: 1rem; font-weight: 600; }
.lca-section-title:focus-visible, .lca-focus-target:focus-visible { outline: 2px solid var(--lca-focus); outline-offset: 2px; border-radius: 0.125rem; }
.lca-help { margin: 0; font-size: 0.875rem; line-height: 1.45; color: var(--lca-subtle); }
.lca-error-text { margin: 0; font-size: 0.875rem; color: var(--lca-danger); }
.lca-label { display: block; font-size: 0.875rem; font-weight: 500; }
.lca-mono { font-family: var(--lca-mono); font-size: 0.8125rem; }
.lca-card { border: 1px solid var(--lca-line); border-radius: 0.75rem; background: var(--lca-surface); padding: 1.25rem; min-width: 0; }
.lca-stack { display: grid; gap: 1rem; min-width: 0; }
.lca-stack-sm { display: grid; gap: 0.5rem; min-width: 0; }
.lca-stack-xs { display: grid; gap: 0.25rem; min-width: 0; }
.lca-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.lca-between { justify-content: space-between; }
.lca-grow { flex: 1 1 auto; min-width: 0; }
.lca-loading { display: flex; justify-content: center; padding: 3rem 0; }
.lca-loading-compact { padding: 1rem 0; }
.lca-muted { color: var(--lca-subtle); }

/* Dialogs */
.lca-dialog { padding: 1.5rem; }
.lca-dialog-title { font-size: 1.125rem; font-weight: 600; }
.lca-dialog-body { margin-top: 1rem; }
.lca-dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; margin-top: 1.5rem; }

/* Links and text-like buttons */
.lca-link-button { appearance: none; background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; text-align: start; cursor: pointer; max-width: 100%; }
.lca-link-button:hover, .lca-link:hover { color: var(--text-color-kumo-link, inherit); text-decoration: underline; }
.lca-link { color: inherit; text-decoration: none; }
.lca-link-accent { color: var(--text-color-kumo-link, inherit); text-decoration: underline; text-underline-offset: 2px; }
.lca-link-button:focus-visible, .lca-link:focus-visible, .lca-link-accent:focus-visible { outline: 2px solid var(--lca-focus); outline-offset: 2px; border-radius: 0.125rem; }

/* Summary strip */
.lca-stats { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); margin: 0; padding: 0; list-style: none; }
.lca-stat { display: grid; gap: 0.25rem; align-content: start; border: 1px solid var(--lca-line); border-radius: 0.75rem; background: var(--lca-surface); padding: 0.875rem 1rem; min-width: 0; }
.lca-stat-label { font-size: 0.8125rem; font-weight: 500; color: var(--lca-subtle); }
.lca-stat-value { font-size: 1.5rem; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.lca-stat-meta { font-size: 0.8125rem; color: var(--lca-subtle); font-variant-numeric: tabular-nums; }
.lca-stat-wide { grid-column: span 2; }
@media (max-width: 640px) { .lca-stat-wide { grid-column: auto; } }
.lca-stat[data-tone="warning"] { border-color: var(--color-kumo-warning, #d97706); }
.lca-spark { display: block; width: 100%; height: 2.5rem; overflow: visible; }
.lca-spark-line { fill: none; stroke: var(--lca-brand); stroke-width: 1.75; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.lca-spark-base { stroke: var(--lca-line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.lca-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }

/* Collapsible sections */
.lca-collapse { border: 1px solid var(--lca-line); border-radius: 0.75rem; background: var(--lca-surface); min-width: 0; }
.lca-collapse > summary { display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1.25rem; cursor: pointer; font-weight: 600; list-style: none; border-radius: 0.75rem; }
.lca-collapse > summary::-webkit-details-marker { display: none; }
.lca-collapse > summary::before { content: ""; width: 0.5rem; height: 0.5rem; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 120ms ease; flex: none; }
.lca-collapse[open] > summary::before { transform: rotate(45deg); }
.lca-collapse > summary:focus-visible { outline: 2px solid var(--lca-focus); outline-offset: 2px; }
.lca-collapse-body { padding: 0 1.25rem 1.25rem; display: grid; gap: 0.75rem; }
@media (prefers-reduced-motion: reduce) { .lca-collapse > summary::before { transition: none; } }

/* Status views (All | Active | …) */
.lca-views { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0; margin: 0; padding: 0; list-style: none; font-size: 0.875rem; }
.lca-views li + li::before { content: "|"; margin: 0 0.5rem; color: var(--lca-line); }
.lca-views a { color: var(--text-color-kumo-link, inherit); text-decoration: none; border-radius: 0.125rem; }
.lca-views a:hover { text-decoration: underline; }
.lca-views a[aria-current="page"] { color: var(--text-color-kumo-strong, inherit); font-weight: 600; }
.lca-views a:focus-visible { outline: 2px solid var(--lca-focus); outline-offset: 2px; }
.lca-count { color: var(--lca-subtle); font-weight: 400; font-variant-numeric: tabular-nums; }

/* Search */
.lca-search { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.lca-search-input { min-width: 14rem; flex: 1 1 14rem; max-width: 22rem; }

/* Tables */
.lca-table-wrap { border: 1px solid var(--lca-line); border-radius: 0.5rem; background: var(--lca-surface); overflow-x: auto; }
.lca-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.lca-table th { padding: 0.625rem 0.875rem; text-align: start; font-weight: 500; white-space: nowrap; background: var(--lca-tint); border-bottom: 1px solid var(--lca-line); }
.lca-table td { padding: 0.625rem 0.875rem; vertical-align: top; border-bottom: 1px solid var(--lca-line); }
.lca-table tbody th { padding: 0.625rem 0.875rem; font-weight: 400; text-align: start; vertical-align: top; white-space: normal; background: none; border-bottom: 1px solid var(--lca-line); }
.lca-table tbody tr:last-child td, .lca-table tbody tr:last-child th { border-bottom: 0; }
.lca-table tbody tr:hover { background: var(--lca-tint); }
.lca-table tr[data-active] { background: var(--lca-tint); box-shadow: inset 3px 0 0 var(--lca-brand); }
.lca-table .lca-num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lca-table .lca-check { width: 2.5rem; padding-inline-end: 0; }
.lca-table .lca-nowrap { white-space: nowrap; }
.lca-truncate { display: block; max-width: 18rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lca-name { font-weight: 600; }
.lca-email { display: block; color: var(--lca-subtle); overflow-wrap: anywhere; }
.lca-no { color: var(--lca-subtle); }

/* Row actions: always present (touch and keyboard), quieter until the row is hovered or focused. */
.lca-row-actions { display: flex; flex-wrap: wrap; gap: 0.125rem 0.75rem; margin-top: 0.375rem; font-size: 0.8125rem; }
.lca-row-action { appearance: none; background: none; border: 0; padding: 0; font: inherit; color: var(--lca-subtle); cursor: pointer; border-radius: 0.125rem; }
.lca-table tbody tr:hover .lca-row-action, .lca-table tbody tr:focus-within .lca-row-action { color: var(--text-color-kumo-link, inherit); }
.lca-row-action:hover { text-decoration: underline; }
.lca-row-action[data-danger], .lca-table tbody tr:hover .lca-row-action[data-danger], .lca-table tbody tr:focus-within .lca-row-action[data-danger] { color: var(--lca-danger); }
.lca-row-action:focus-visible { outline: 2px solid var(--lca-focus); outline-offset: 2px; }
.lca-row-action:disabled { opacity: 0.5; cursor: default; text-decoration: none; }

/* Bulk bar and list layout */
.lca-bulkbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border: 1px solid var(--lca-line); border-radius: 0.5rem; background: var(--lca-tint); }
.lca-inbox { display: grid; gap: 1.5rem; align-items: start; }
@media (min-width: 1200px) { .lca-inbox[data-detail-open] { grid-template-columns: minmax(0, 1fr) 24rem; } }
.lca-detail { display: grid; gap: 1.25rem; }
@media (min-width: 1200px) { .lca-detail { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; } }
.lca-dl { display: grid; gap: 0.75rem; }
.lca-dl dt { font-size: 0.75rem; font-weight: 600; color: var(--lca-subtle); }
.lca-dl dd { margin: 0.125rem 0 0; font-size: 0.875rem; white-space: pre-wrap; overflow-wrap: anywhere; }

/* Privacy results */
.lca-record { border: 1px solid var(--lca-line); border-radius: 0.5rem; padding: 0.875rem 1rem; }
.lca-record-dl { display: grid; gap: 0.25rem 1rem; grid-template-columns: minmax(8rem, max-content) minmax(0, 1fr); font-size: 0.875rem; }
.lca-record-dl dt { color: var(--lca-subtle); }
.lca-record-dl dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 640px) { .lca-record-dl { grid-template-columns: minmax(0, 1fr); } .lca-record-dl dd { margin-bottom: 0.375rem; } }
.lca-plain-list { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
.lca-grid-2 { display: grid; gap: 1.5rem; align-items: start; }
@media (min-width: 1100px) { .lca-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

/* Dashboard widget */
.lca-widget-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin: 0; }
.lca-widget-stats > div { display: grid; gap: 0.125rem; }
.lca-widget-stats dt { font-size: 0.75rem; color: var(--lca-subtle); }
.lca-widget-stats dd { margin: 0; font-size: 1.375rem; font-weight: 600; font-variant-numeric: tabular-nums; }
`;

/** Injects the stylesheet once; React 19 dedupes and hoists it by `href`. */
export function AdminStyles() {
	return (
		<style href="lead-capture-admin" precedence="default">
			{CSS}
		</style>
	);
}
