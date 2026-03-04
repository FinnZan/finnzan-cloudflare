async function fetchKvChartsPayload() {
	const res = await fetch('/kv/charts/data', { headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error(`Failed to load data: ${res.status} ${res.statusText}`);
	return res.json();
}

function fmtLocalTs(ts) {
	const d = new Date(ts);
	if (!Number.isFinite(d.getTime())) return String(ts);
	return d.toLocaleString(undefined, {
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function fmtHour(ts) {
	const d = new Date(ts);
	if (!Number.isFinite(d.getTime())) return '';
	return d.toLocaleString(undefined, { hour: 'numeric' });
}

function buildHourBoundaryIndices(rawTimestamps) {
	const indices = new Set();
	for (let i = 1; i < rawTimestamps.length; i++) {
		const prev = new Date(rawTimestamps[i - 1]);
		const curr = new Date(rawTimestamps[i]);
		if (!Number.isFinite(prev.getTime()) || !Number.isFinite(curr.getTime())) continue;
		if (prev.getHours() !== curr.getHours() || prev.toDateString() !== curr.toDateString()) {
			indices.add(i);
		}
	}
	return indices;
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
	const rawTimestamps = payload.timestamps || [];
	const labels = rawTimestamps.map(fmtLocalTs);
	const hourIndices = buildHourBoundaryIndices(rawTimestamps);
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
			plugins: {
				legend: { labels: { color: '#f5f5f5' } },
				tooltip: {
					callbacks: {
						title: function (items) {
							if (!items || items.length === 0) return '';
							const idx = items[0].dataIndex;
							return fmtLocalTs(rawTimestamps[idx]);
						},
					},
				},
			},
			scales: {
				x: {
					type: 'category',
					ticks: {
						color: '#cfcfcf',
						maxRotation: 0,
						autoSkip: false,
						callback: function (value, index, ticks) {
							if (index === 0 || index === ticks.length - 1) return this.getLabelForValue(value);
							if (hourIndices.has(index)) return fmtHour(rawTimestamps[index]);
							return '';
						},
					},
					grid: { display: false },
				},
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
