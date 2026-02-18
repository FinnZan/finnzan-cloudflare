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

const renderNotesPage = (
	opts: {
		saved?: boolean;
		cleared?: boolean;
		error?: string;
		latest?: { ts: string; content: string } | null;
	} = {},
): string => {
	const message = opts.error
		? `<div class="msg err">${escapeHtml(opts.error)}</div>`
		: opts.saved
			? `<div class="msg ok">Saved.</div>`
			: opts.cleared
				? `<div class="msg ok">Cleared.</div>`
				: '';

	const latest =
		opts.latest === undefined
			? ''
			: opts.latest
				? `<div class="latest"><div class="latestTitle">Latest note</div><div class="latestMeta">${escapeHtml(opts.latest.ts)}</div><pre class="latestBody">${escapeHtml(opts.latest.content)}</pre></div>`
				: `<div class="latest"><div class="latestTitle">Latest note</div><div class="latestMeta">No notes yet.</div></div>`;

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
		.actions{display:flex;gap:10px;align-items:center}
		textarea{width:100%;min-height:55vh;resize:vertical;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#f5f5f5;font-size:14px;line-height:1.4}
		button{align-self:flex-start;padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
		button:hover{background:rgba(255,255,255,.18)}
		button.danger{background:rgba(231,76,60,.14)}
		button.danger:hover{background:rgba(231,76,60,.22)}
		.msg{padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);font-size:13px}
		.msg.ok{background:rgba(46,204,113,.12)}
		.msg.err{background:rgba(231,76,60,.12)}
		.latest{margin-top:16px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04)}
		.latestTitle{font-size:14px;margin-bottom:6px}
		.latestMeta{opacity:.8;font-size:12px;margin-bottom:10px}
		.latestBody{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;line-height:1.4}
	</style>
</head>
<body>
	<div class="wrap">
		<h1>Notes</h1>
		${message}
		<form method="POST" action="/notes">
			<textarea name="content" placeholder="Write something..."></textarea>
			<div class="actions">
				<button type="submit">Save</button>
				<button class="danger" type="submit" formmethod="POST" formaction="/notes/clear" onclick="return confirm('Clear all notes?');">Clear all notes</button>
			</div>
		</form>
		${latest}
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

		if (url.pathname === '/kv/charts' && request.method === 'GET') {
			if (!env.DB) {
				return new Response('D1 database binding is not configured.', {
					status: 500,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}

			try {
				const { results } = await env.DB
					.prepare('SELECT ts, name, value FROM kv ORDER BY ts ASC')
					.bind()
					.all();
				const rows = Array.isArray(results) ? (results as unknown[]) : [];

				const namesSet = new Set<string>();
				const tsSet = new Set<string>();
				const pointsByNameTs: Record<string, Record<string, number>> = {};
				let totalPoints = 0;
				let skipped = 0;
				for (const r of rows) {
					const row = r as Record<string, unknown>;
					const ts = String(row.ts ?? '');
					const name = String(row.name ?? '').trim();
					const raw = String(row.value ?? '').trim();
					const y = Number(raw);
					if (!name || !ts || !Number.isFinite(y)) {
						skipped += 1;
						continue;
					}
					namesSet.add(name);
					tsSet.add(ts);
					(pointsByNameTs[name] ||= {})[ts] = y;
					totalPoints += 1;
				}

				const names = Array.from(namesSet).sort();
				const timestamps = Array.from(tsSet).sort();
				const series: Record<string, Array<number | null>> = {};
				for (const name of names) {
					const map = pointsByNameTs[name] || {};
					series[name] = timestamps.map((ts) => (Object.prototype.hasOwnProperty.call(map, ts) ? map[ts] : null));
				}

				const payload = {
					names,
					timestamps,
					series,
					meta: {
						rows: rows.length,
						points: totalPoints,
						skipped,
						generatedAt: new Date().toISOString(),
					},
				};

				const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');

				const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>KV Charts</title>
	<style>
		*{box-sizing:border-box;margin:0;padding:0}
		body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0b;color:#f5f5f5;padding:24px}
		.wrap{max-width:1200px;margin:0 auto}
		h1{font-size:20px;margin-bottom:12px}
		.meta{opacity:.8;margin-bottom:16px;font-size:12px;line-height:1.4}
		.card{border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(255,255,255,.04);padding:12px}
		canvas{width:100%;height:520px}
	</style>
	<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
	<div class="wrap">
		<h1>KV Charts</h1>
		<div class="meta" id="meta"></div>
		<div class="card">
			<canvas id="chart"></canvas>
		</div>
	</div>
	<script>
		const payload = ${payloadJson};
		const palette = [
			'#4dc9f6','#f67019','#f53794','#537bc4','#acc236','#166a8f','#00a950','#58595b','#8549ba',
			'#ff6384','#36a2eb','#ffcd56','#c9cbcf','#2ecc71','#e74c3c','#9b59b6','#1abc9c','#e67e22'
		];
		const names = payload.names || [];
		const labels = payload.timestamps || [];
		document.getElementById('meta').textContent =
			'Names: ' + names.length +
			' | Rows: ' + payload.meta.rows +
			' | Points: ' + payload.meta.points +
			' | Skipped: ' + payload.meta.skipped +
			' | Generated: ' + payload.meta.generatedAt;
		const datasets = names.map((name, i) => ({
			label: name,
			data: (payload.series[name] || []),
			borderColor: palette[i % palette.length],
			backgroundColor: palette[i % palette.length],
			borderWidth: 2,
			tension: 0.2,
			pointRadius: 0,
		}));
		const ctx = document.getElementById('chart');
		new Chart(ctx, {
			type: 'line',
			data: { labels, datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'nearest', intersect: false },
				plugins: { legend: { labels: { color: '#f5f5f5' } } },
				scales: {
					x: { type: 'category', ticks: { color: '#cfcfcf', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,.08)' } },
					y: { ticks: { color: '#cfcfcf' }, grid: { color: 'rgba(255,255,255,.08)' } },
				},
			},
		});
	</script>
</body>
</html>`;

				return new Response(html, {
					headers: { 'content-type': 'text/html; charset=utf-8' },
				});
			} catch (err) {
				return new Response(`Failed to query kv: ${String(err)}`, {
					status: 500,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}
		}

		if (url.pathname === '/kv' && request.method === 'POST') {
			if (!env.DB) {
				return new Response(
					JSON.stringify({ ok: false, error: 'D1 database binding is not configured.' }),
					{
						status: 500,
						headers: { 'content-type': 'application/json; charset=utf-8' },
					},
				);
			}

			let name = '';
			let value = '';
			const contentType = request.headers.get('content-type') ?? '';
			try {
				if (contentType.includes('application/json')) {
					const body = (await request.json()) as { name?: unknown; value?: unknown };
					name = String(body?.name ?? '').trim();
					value = String(body?.value ?? '').trim();
				} else {
					const form = await request.formData();
					name = String(form.get('name') ?? '').trim();
					value = String(form.get('value') ?? '').trim();
				}
			} catch (err) {
				return new Response(JSON.stringify({ ok: false, error: `Invalid body: ${String(err)}` }), {
					status: 400,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			}

			if (!name) {
				return new Response(JSON.stringify({ ok: false, error: 'Missing name.' }), {
					status: 400,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			}
			if (!value) {
				return new Response(JSON.stringify({ ok: false, error: 'Missing value.' }), {
					status: 400,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			}

			try {
				await env.DB.prepare('INSERT INTO kv (ts, name, value) VALUES (?, ?, ?)')
					.bind(new Date().toISOString(), name, value)
					.run();
				return new Response(JSON.stringify({ ok: true }), {
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			} catch (err) {
				return new Response(JSON.stringify({ ok: false, error: `Failed to store: ${String(err)}` }), {
					status: 500,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			}
		}

		if (url.pathname === '/notes/clear' && request.method === 'POST') {
			if (!env.DB) {
				const html = renderNotesPage({ error: 'D1 database binding is not configured.' });
				return new Response(html, {
					status: 500,
					headers: { 'content-type': 'text/html; charset=utf-8' },
				});
			}

			try {
				await env.DB.prepare('DELETE FROM notes').bind().run();
				return new Response(null, {
					status: 303,
					headers: { location: '/notes?cleared=1' },
				});
			} catch (err) {
				const html = renderNotesPage({ error: `Failed to clear: ${String(err)}` });
				return new Response(html, {
					status: 500,
					headers: { 'content-type': 'text/html; charset=utf-8' },
				});
			}
		}

		if (url.pathname === '/notes') {
			if (request.method === 'GET') {
				const saved = url.searchParams.get('saved') === '1';
				const cleared = url.searchParams.get('cleared') === '1';
				let latest: { ts: string; content: string } | null | undefined = undefined;
				if (env.DB) {
					try {
						const { results } = await env.DB
							.prepare('SELECT ts, content FROM notes ORDER BY id DESC LIMIT 1')
							.bind()
							.all();
						const row = Array.isArray(results) && results.length > 0 ? (results[0] as Record<string, unknown>) : null;
						latest = row ? { ts: String(row.ts ?? ''), content: String(row.content ?? '') } : null;
					} catch {
						latest = undefined;
					}
				}

				const html = renderNotesPage({ saved, cleared, latest });
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
