import { Elysia, t } from 'elysia'
import { compile as c, trpc } from '../src'

import { initTRPC } from '@trpc/server'
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { observable } from '@trpc/server/observable'

import { EventEmitter } from 'stream'

export const createContext = async (opts: FetchCreateContextFnOptions) => {
	return {
		name: 'elysia'
	}
}

const p = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create()
const ee = new EventEmitter()

const router = p.router({
	mirror: p.procedure.input(c(t.String())).query(({ input }) => {
		ee.emit('listen', input)

		return input
	}),
	listen: p.procedure.subscription(() =>
		observable<string>((emit) => {
			ee.on('listen', (input) => {
				emit.next(input)
			})
		})
	)
})

export type Router = typeof router

new Elysia()
	.get('/', () => 'tRPC')
	.use(
		trpc(router, {
			createContext
		})
	)
	.listen(8080, ({ hostname, port }) => {
		console.log(`🦊 running at http://${hostname}:${port}`)
	})
