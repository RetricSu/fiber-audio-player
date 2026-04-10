/** @type {import('next').NextConfig} */
const securityHeaders = [
	{
		key: 'Cross-Origin-Opener-Policy',
		value: 'same-origin',
	},
	{
		key: 'Cross-Origin-Embedder-Policy',
		value: 'require-corp',
	},
	{
		key: 'Origin-Agent-Cluster',
		value: '?1',
	},
]

const nextConfig = {
	async headers() {
		return [
			{
				source: '/:path*',
				headers: securityHeaders,
			},
		]
	},
}

module.exports = nextConfig
