class HostnameDecoder {
	constructor(base) {
		this.pattern = new RegExp('\\b([a-z0-9]+--[a-z0-9-]+)\\.' + base.replaceAll('.', '\\.') + '\\b', 'ig');
	}

	[Symbol.replace](string) {
		return string.replace(this.pattern, HostnameDecoder.#decode);
	}

	replaceEntry(value, key, headers) {
		headers.set(key, value.replace(this));
	}

	static #decode(match, p1) {
		return p1.replace(/\b(xxn|)--\b/g, HostnameDecoder.#map);
	}

	static #map(match, p1) {
		if (p1 === 'xxn') {
			return 'xn--';
		}

		return '.';
	}
}

export default {
	async fetch(request, env, ctx) {
		const decoder = new HostnameDecoder(env.API_HOST);
		const url = new URL(request.url);
		url.hostname = url.hostname.replace(decoder);
		const req = new Request(url, request);
		req.headers.forEach(decoder.replaceEntry, decoder);
		return fetch(req);
	},
};
