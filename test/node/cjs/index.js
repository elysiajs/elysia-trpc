if ('Bun' in globalThis) {
	throw new Error('❌ Use Node.js to run this test!')
}

const { trpc } = require('@elysiajs/trpc')

if (typeof trpc !== 'function') {
	throw new Error('❌ CommonJS Node.js failed')
}

console.log('✅ CommonJS Node.js works!')
