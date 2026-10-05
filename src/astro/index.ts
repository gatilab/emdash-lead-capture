/**
 * Astro renderers. EmDash imports `blockComponents` from this module (the
 * descriptor's `componentsEntry`) and merges it into `<PortableText>`; the
 * key matches the stored `_type`, which is the imported WordPress block's.
 *
 * ```astro
 * ---
 * import { LeadCapture } from "@gatilab/emdash-lead-capture/astro";
 * ---
 * <LeadCapture node={{ _type: "leadCapture", title: "Get the checklist", deliverableUrl: "/files/checklist.pdf" }} />
 * ```
 */
import LeadCapture from "./LeadCapture.astro";

export { LeadCapture };
export { callPublic, sealBlock } from "./seal.js";

export const blockComponents = {
	leadCapture: LeadCapture,
} as const;
