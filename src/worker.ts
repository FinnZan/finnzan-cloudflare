type ExecutionContext = {
	waitUntil: (promise: Promise<unknown>) => void;
};

const escapeHtml = (value: unknown): string => {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
};

export default {
	async fetch(
		request: Request,
		env: {
			ASSETS: { fetch: (req: Request) => Promise<Response> };
			DB?: {
				prepare: (query: string) => {
					bind: (...values: unknown[]) => {
						run: () => Promise<unknown>;
						all: () => Promise<{ results?: unknown[] }>;
					};
				};
			};
		},
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/logs') {
			if (!env.DB) {
				return new Response('D1 database binding is not configured.', {
					status: 500,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}

			try {
				const query =
					'SELECT id, ts, method, path, query, user_agent, ip, name FROM request_log ORDER BY id DESC LIMIT 50';
				const { results } = await env.DB.prepare(query).bind().all();
				const rows = Array.isArray(results) ? results : [];

				const htmlRows = rows
					.map((r) => {
						const row = r as Record<string, unknown>;
						return `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.ts)}</td><td>${escapeHtml(row.method)}</td><td>${escapeHtml(row.path)}</td><td>${escapeHtml(row.query)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.ip)}</td><td>${escapeHtml(row.user_agent)}</td></tr>`;
					})
					.join('');

				const templateUrl = new URL(request.url);
				templateUrl.pathname = '/pages/logs.html';
				const templateResponse = await env.ASSETS.fetch(new Request(templateUrl.toString(), request));
				if (!templateResponse.ok) {
					return new Response('Failed to load logs template.', {
						status: 500,
						headers: { 'content-type': 'text/plain; charset=utf-8' },
					});
				}

				const template = await templateResponse.text();
				const html = template
					.replace('{{generated_at}}', escapeHtml(new Date().toISOString()))
					.replace('{{rows}}', htmlRows);

				return new Response(html, {
					headers: { 'content-type': 'text/html; charset=utf-8' },
				});
			} catch (err) {
				return new Response(`Failed to query request_log: ${String(err)}`, {
					status: 500,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}
		}

		if (env.DB) {
			const name = url.pathname === '/hello' ? (url.searchParams.get('name') ?? '').trim() : '';
			ctx.waitUntil(
				env.DB.prepare(
					'INSERT INTO request_log (ts, method, path, query, user_agent, ip, name) VALUES (?, ?, ?, ?, ?, ?, ?)',
				)
					.bind(
						new Date().toISOString(),
						request.method,
						url.pathname,
						url.search,
						request.headers.get('user-agent'),
						request.headers.get('cf-connecting-ip'),
						name || null,
					)
					.run()
					.catch(() => undefined),
			);
		}

		if (request.method === 'GET' && url.pathname === '/hello') {
			const name = (url.searchParams.get('name') ?? '').trim();
			const message = name ? `Hello ${name}` : 'Hello';
			return new Response(message, {
				headers: {
					'content-type': 'text/plain; charset=utf-8',
				},
			});
		}

		let assetPath = url.pathname;

		if (assetPath === '/') {
			assetPath = '/pages/index.html';
		} else if (!assetPath.includes('.') && !assetPath.endsWith('/')) {
			assetPath = `/pages${assetPath}.html`;
		}

		const assetUrl = new URL(request.url);
		assetUrl.pathname = assetPath;
		return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
	},
};
