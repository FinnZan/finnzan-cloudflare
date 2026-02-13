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

const renderNotesPage = (opts: { saved?: boolean; error?: string } = {}): string => {
	const message = opts.error
		? `<div class="msg err">${escapeHtml(opts.error)}</div>`
		: opts.saved
			? `<div class="msg ok">Saved.</div>`
			: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Notes</title>
	<style>
		*{box-sizing:border-box;margin:0;padding:0}
		body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0b;color:#f5f5f5;padding:24px}
		.wrap{max-width:900px;margin:0 auto}
		h1{font-size:20px;margin-bottom:16px}
		form{display:flex;flex-direction:column;gap:12px}
		textarea{width:100%;min-height:55vh;resize:vertical;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#f5f5f5;font-size:14px;line-height:1.4}
		button{align-self:flex-start;padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
		button:hover{background:rgba(255,255,255,.18)}
		.msg{padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);font-size:13px}
		.msg.ok{background:rgba(46,204,113,.12)}
		.msg.err{background:rgba(231,76,60,.12)}
	</style>
</head>
<body>
	<div class="wrap">
		<h1>Notes</h1>
		${message}
		<form method="POST" action="/notes">
			<textarea name="content" placeholder="Write something..."></textarea>
			<button type="submit">Save</button>
		</form>
	</div>
</body>
</html>`;
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

		if (url.pathname === '/notes') {
			if (request.method === 'GET') {
				const saved = url.searchParams.get('saved') === '1';
				const html = renderNotesPage({ saved });
				return new Response(html, {
					headers: { 'content-type': 'text/html; charset=utf-8' },
				});
			}

			if (request.method === 'POST') {
				if (!env.DB) {
					const html = renderNotesPage({ error: 'D1 database binding is not configured.' });
					return new Response(html, {
						status: 500,
						headers: { 'content-type': 'text/html; charset=utf-8' },
					});
				}

				try {
					const form = await request.formData();
					const content = String(form.get('content') ?? '').trim();
					if (!content) {
						const html = renderNotesPage({ error: 'Note is empty.' });
						return new Response(html, {
							status: 400,
							headers: { 'content-type': 'text/html; charset=utf-8' },
						});
					}

					await env.DB.prepare('INSERT INTO notes (ts, content) VALUES (?, ?)')
						.bind(new Date().toISOString(), content)
						.run();

					return new Response(null, {
						status: 303,
						headers: { location: '/notes?saved=1' },
					});
				} catch (err) {
					const html = renderNotesPage({ error: `Failed to save: ${String(err)}` });
					return new Response(html, {
						status: 500,
						headers: { 'content-type': 'text/html; charset=utf-8' },
					});
				}
			}
		}

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

				const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Request Logs</title>
	<style>
		*{box-sizing:border-box;margin:0;padding:0}
		body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0b;color:#f5f5f5;padding:24px}
		h1{font-size:20px;margin-bottom:12px}
		.meta{opacity:.8;margin-bottom:16px;font-size:12px}
		table{width:100%;border-collapse:collapse;font-size:12px}
		th,td{border:1px solid rgba(255,255,255,.15);padding:8px;vertical-align:top}
		th{background:rgba(255,255,255,.06);text-align:left;position:sticky;top:0}
		tr:nth-child(even) td{background:rgba(255,255,255,.03)}
		.wrap{max-width:1200px;margin:0 auto}
		.scroller{overflow:auto;border:1px solid rgba(255,255,255,.15)}
	</style>
</head>
<body>
	<div class="wrap">
		<h1>Recent Requests (50)</h1>
		<div class="meta">${escapeHtml(new Date().toISOString())}</div>
		<div class="scroller">
			<table>
				<thead>
					<tr>
						<th>id</th>
						<th>ts</th>
						<th>method</th>
						<th>path</th>
						<th>query</th>
						<th>name</th>
						<th>ip</th>
						<th>user_agent</th>
					</tr>
				</thead>
				<tbody>${htmlRows}</tbody>
			</table>
		</div>
	</div>
</body>
</html>`;

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
