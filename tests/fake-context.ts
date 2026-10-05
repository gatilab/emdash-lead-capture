/**
 * In-memory stand-in for EmDash's plugin context, with the storage semantics
 * the plugin relies on (AND-only where, equality / in / range, orderBy,
 * cursors, compareAndSet, updateIf with set and delta).
 */
type Doc = Record<string, unknown>;

function matches(doc: Doc, where: Record<string, unknown> = {}): boolean {
	return Object.entries(where).every(([field, cond]) => {
		const v = doc[field];
		if (cond === null || typeof cond !== "object") return v === cond;
		const c = cond as Record<string, unknown>;
		if ("in" in c) return (c.in as unknown[]).includes(v);
		if ("startsWith" in c) return typeof v === "string" && v.startsWith(String(c.startsWith));
		const cmp = (op: string, test: (a: never, b: never) => boolean) => !(op in c) || test(v as never, c[op] as never);
		return cmp("gt", (a, b) => a > b) && cmp("gte", (a, b) => a >= b) && cmp("lt", (a, b) => a < b) && cmp("lte", (a, b) => a <= b);
	});
}

export class FakeCollection<T extends Doc = Doc> {
	rows = new Map<string, { data: T; revision: number; seq: number }>();
	private seq = 0;

	async get(id: string) {
		return (this.rows.get(id)?.data ?? null) as T | null;
	}
	async put(id: string, data: T) {
		const prev = this.rows.get(id);
		this.rows.set(id, { data: structuredClone(data), revision: (prev?.revision ?? 0) + 1, seq: prev?.seq ?? ++this.seq });
	}
	async delete(id: string) {
		return this.rows.delete(id);
	}
	async exists(id: string) {
		return this.rows.has(id);
	}
	async getVersioned(id: string) {
		const r = this.rows.get(id);
		return r ? { value: r.data, revision: String(r.revision) } : null;
	}
	async compareAndSet(id: string, expected: string | null, data: T) {
		const r = this.rows.get(id);
		if (expected === null ? r : !r || String(r.revision) !== expected) return { applied: false };
		await this.put(id, data);
		return { applied: true, revision: String(this.rows.get(id)!.revision) };
	}
	async updateIf(id: string, args: { where: Record<string, unknown>; set?: Partial<T>; delta?: Record<string, { inc?: number; dec?: number }> }) {
		const r = this.rows.get(id);
		if (!r || !matches(r.data, args.where)) return { applied: false as const };
		const next = { ...r.data, ...(args.set ?? {}) } as Doc;
		for (const [k, d] of Object.entries(args.delta ?? {})) next[k] = ((next[k] as number) ?? 0) + (d.inc ?? 0) - (d.dec ?? 0);
		this.rows.set(id, { data: next as T, revision: r.revision + 1, seq: r.seq });
		return { applied: true as const, data: structuredClone(next) as T };
	}
	async getMany(ids: string[]) {
		return new Map(ids.filter((id) => this.rows.has(id)).map((id) => [id, this.rows.get(id)!.data]));
	}
	async deleteMany(ids: string[]) {
		let n = 0;
		for (const id of ids) if (this.rows.delete(id)) n++;
		return n;
	}
	async count(where?: Record<string, unknown>) {
		return [...this.rows.values()].filter((r) => matches(r.data, where)).length;
	}
	async query(opts: { where?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; limit?: number; cursor?: string } = {}) {
		let items = [...this.rows.entries()].filter(([, r]) => matches(r.data, opts.where)).map(([id, r]) => ({ id, data: r.data, seq: r.seq }));
		const [field, dir] = Object.entries(opts.orderBy ?? {})[0] ?? [null, "asc"];
		items.sort((a, b) => {
			const av = field ? (a.data[field] as never) : a.seq;
			const bv = field ? (b.data[field] as never) : b.seq;
			const c = av < bv ? -1 : av > bv ? 1 : a.seq - b.seq;
			return dir === "desc" ? -c : c;
		});
		const start = opts.cursor ? Number(opts.cursor) : 0;
		const limit = opts.limit ?? 50;
		const page = items.slice(start, start + limit);
		const hasMore = start + limit < items.length;
		return { items: page.map(({ id, data }) => ({ id, data })), hasMore, cursor: hasMore ? String(start + limit) : undefined };
	}
}

export class FakeKV {
	map = new Map<string, { value: unknown; revision: number }>();
	async get<T>(key: string) {
		return (this.map.get(key)?.value ?? null) as T | null;
	}
	async set(key: string, value: unknown) {
		this.map.set(key, { value, revision: (this.map.get(key)?.revision ?? 0) + 1 });
	}
	async delete(key: string) {
		return this.map.delete(key);
	}
	async getVersioned<T>(key: string) {
		const r = this.map.get(key);
		return r ? { value: r.value as T, revision: String(r.revision) } : null;
	}
	async compareAndSet(key: string, expected: string | null, value: unknown) {
		const r = this.map.get(key);
		if (expected === null ? r : !r || String(r.revision) !== expected) return { applied: false };
		await this.set(key, value);
		return { applied: true };
	}
	async list(prefix = "") {
		return [...this.map].filter(([k]) => k.startsWith(prefix)).map(([key, r]) => ({ key, value: r.value }));
	}
}

export interface SentEmail {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

export function fakeContext(options: { settings?: Record<string, unknown>; ip?: string; httpStatus?: number } = {}) {
	const storage = { leads: new FakeCollection(), stats: new FakeCollection(), counters: new FakeCollection(), forwards: new FakeCollection() };
	const kv = new FakeKV();
	const settings = new Map(Object.entries(options.settings ?? {}));
	const sent: SentEmail[] = [];
	const requests: { url: string; init?: RequestInit }[] = [];
	const ctx = {
		storage,
		kv,
		settings: { get: async (k: string) => settings.get(k) ?? null, set: async (k: string, v: unknown) => void settings.set(k, v) },
		email: { send: async (m: SentEmail) => void sent.push(m) },
		http: {
			fetch: async (url: string, init?: RequestInit) => {
				requests.push({ url, init });
				return new Response("{}", { status: options.httpStatus ?? 200 });
			},
		},
		users: { list: async () => ({ items: [{ id: "u1", email: "owner@example.com", name: "Owner", role: 50 }] }) },
		site: { name: "Gatilab", url: "https://gatilab.test", locale: "en" },
		url: (path: string) => new URL(path, "https://gatilab.test").toString(),
		log: { info() {}, warn() {}, error() {}, debug() {} },
		cron: { schedule: async () => {}, cancel: async () => {}, list: async () => [] },
		requestMeta: { ip: options.ip ?? "203.0.113.5", userAgent: "vitest", referer: "", geo: null },
		input: undefined as unknown,
	};
	return { ctx, storage, kv, settings, sent, requests };
}
