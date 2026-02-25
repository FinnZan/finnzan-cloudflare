async function fetchKvChartsPayload() {
	const res = await fetch('/kv/charts/data', { headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error(`Failed to load data: ${res.status} ${res.statusText}`);
	return res.json();
}

function buildDatasets(payload) {
	const palette = [
		'#4dc9f6','#f67019','#f53794','#537bc4','#acc236','#166a8f','#00a950','#58595b','#8549ba',
		'#ff6384','#36a2eb','#ffcd56','#c9cbcf','#2ecc71','#e74c3c','#9b59b6','#1abc9c','#e67e22'
	];
	const names = payload.names || [];
	return names.map((name, i) => ({
		label: name,
		data: (payload.series && payload.series[name]) ? payload.series[name] : [],
		borderColor: palette[i % palette.length],
		backgroundColor: palette[i % palette.length],
		borderWidth: 2,
		tension: 0.2,
		spanGaps: true,
		pointRadius: 0,
	}));
}

async function main() {
	const metaEl = document.getElementById('meta');
	const canvas = document.getElementById('chart');
	if (!metaEl || !canvas) return;

	metaEl.textContent = 'Loading…';

	const payload = await fetchKvChartsPayload();
	const labels = payload.timestamps || [];
	const datasets = buildDatasets(payload);

	metaEl.textContent =
		'Names: ' + (payload.names ? payload.names.length : 0) +
		' | Rows: ' + (payload.meta ? payload.meta.rows : 0) +
		' | Points: ' + (payload.meta ? payload.meta.points : 0) +
		' | Skipped: ' + (payload.meta ? payload.meta.skipped : 0) +
		' | Generated: ' + (payload.meta ? payload.meta.generatedAt : '');

	new Chart(canvas, {
		type: 'line',
		data: { labels, datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'nearest', intersect: false },
			plugins: { legend: { labels: { color: '#f5f5f5' } } },
			scales: {
				x: { type: 'category', ticks: { color: '#cfcfcf', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,.08)' } },
				y: { min: 0, max: 1, ticks: { color: '#cfcfcf' }, grid: { color: 'rgba(255,255,255,.08)' } },
			},
		},
	});
}

main().catch((err) => {
	const metaEl = document.getElementById('meta');
	if (metaEl) metaEl.textContent = String(err);
	console.error(err);
});
