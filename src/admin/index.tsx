/**
 * Lead Capture admin entry (`@gatilab/emdash-lead-capture/admin`).
 *
 * Page keys are paths under /_emdash/admin/plugins/lead-capture, matching
 * `admin.pages` in the plugin definition; widget keys match `admin.widgets`.
 * Settings are EmDash's auto-generated page (settingsSchema), linked from
 * the Leads page.
 */

import type { PluginAdminExports } from "emdash";

import { LeadsPage } from "./LeadsPage.js";
import { LeadsWidget } from "./LeadsWidget.js";

export const pages: PluginAdminExports["pages"] = {
	"/": LeadsPage,
};

export const widgets: PluginAdminExports["widgets"] = {
	leads: LeadsWidget,
};
