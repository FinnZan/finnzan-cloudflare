export default {
	async fetch(request: Request, env: { ASSETS: { fetch: (req: Request) => Promise<Response> } }): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/hello') {
			return new Response('Hello from GET /hello', {
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
