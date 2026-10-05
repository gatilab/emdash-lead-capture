/**
 * Companion Astro integration. Add it next to `emdash()` so download and
 * confirmation links work:
 *
 * ```js
 * import { leadCaptureSite } from "@gatilab/emdash-lead-capture/site";
 * export default defineConfig({ integrations: [emdash({ plugins: [leadCapture()] }), leadCaptureSite()] });
 * ```
 */
import type { AstroIntegration } from "astro";

export function leadCaptureSite(): AstroIntegration {
	return {
		name: "@gatilab/emdash-lead-capture/site",
		hooks: {
			"astro:config:setup": ({ addMiddleware }) => {
				// After EmDash's middleware, which provides the route dispatcher on locals.
				addMiddleware({ entrypoint: "@gatilab/emdash-lead-capture/site/middleware", order: "post" });
			},
		},
	};
}

export default leadCaptureSite;
