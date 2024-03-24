if ('Bun' in globalThis) {
	throw new Error('❌ Use Node.js to run this test!')
}

import { trpc } from '@elysiajs/trpc'

if (typeof trpc !== 'function') {
	throw new Error('❌ ESM Node.js failed')
}

console.log('✅ ESM Node.js works!')
