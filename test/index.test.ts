import { Elysia, t } from 'elysia'
import { compile as c, trpc } from '../src'

import { initTRPC, TRPCError } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { EventEmitter } from 'events'

const TESTING_PORT = 8080

const createRequest = (path: string, init: RequestInit = {}) =>
	new Request(`http://0.0.0.0:${TESTING_PORT}${path}`, init)

const sendMessage = (ws: WebSocket, data: unknown) =>
	ws.send(JSON.stringify(data))

const waitForNextMessage = async (ws: WebSocket): Promise<unknown> => {
	return new Promise((resolve) => {
		ws.onmessage = (event) => {
			resolve(JSON.parse(event.data))
		}
	})
}

const createContext = () => ({
	name: 'elysia'
})

const r = initTRPC.context<ReturnType<typeof createContext>>().create()

const router = r.router({
	context: r.procedure.query(({ ctx }) => ctx),
	greet: r.procedure.input(c(t.String())).query(({ input }) => input),
	signIn: r.procedure
		.input(
			c(
				t.Object({
					username: t.String(),
					password: t.String()
				})
			)
		)
		.mutation(({ input }) => input),
	505: r.procedure.query(() => {
		throw new Error('Something wrong')
	})
})

const anotherRouter = r.router({
	another: r.procedure.query(() => ({ ping: 'pong' }))
})

const mergedRouter = r.router({
	main: router,
	another: anotherRouter
})

describe('TRPC Mutations', () => {
	const firstRecord = {
		username: 'saltyaom-1',
		password: '12345678-1'
	}
	const secondRecord = {
		username: 'saltyaom-2',
		password: '12345678-2'
	}

	let appMutation: Elysia
	let appMutationMerged: Elysia
	let appMutationCustomEndpoint: Elysia

	beforeEach(() => {
		appMutation = new Elysia().use(trpc(router))
		appMutationMerged = new Elysia().use(trpc(mergedRouter))
		appMutationCustomEndpoint = new Elysia().use(
			trpc(router, { endpoint: '/v2/trpc' })
		)
	})

	it('handle single mutation', async () => {
		const res = await appMutation
			.handle(
				createRequest('/trpc/signIn?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({ '0': firstRecord })
				})
			)
			.then((r) => r.json())

		expect(res).toStrictEqual([{ result: { data: firstRecord } }])
	})

	it('handle multiple mutations', async () => {
		const res = await appMutation
			.handle(
				createRequest('/trpc/signIn,signIn?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						'0': firstRecord,
						'1': secondRecord
					})
				})
			)
			.then((r) => r.json())

		expect(res).toStrictEqual([
			{ result: { data: firstRecord } },
			{ result: { data: secondRecord } }
		])
	})

	it('handle custom endpoint', async () => {
		const res = (await appMutationCustomEndpoint
			.handle(
				createRequest('/v2/trpc/signIn?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({ '0': firstRecord })
				})
			)
			.then((r) => r.json())) as any[]

		expect(res).toStrictEqual([{ result: { data: firstRecord } }])
	})

	it('support merged router', async () => {
		const res = (await appMutationMerged
			.handle(
				createRequest('/trpc/main.signIn?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({ '0': firstRecord })
				})
			)
			.then((r) => r.json())) as any[]

		expect(res).toStrictEqual([{ result: { data: firstRecord } }])
	})
})

describe('TRPC Queries', () => {
	const singleQueryParams = new URLSearchParams({
		batch: '1',
		input: JSON.stringify({ '0': 'a' })
	}).toString()

	const multiQueryParams = new URLSearchParams({
		batch: '1',
		input: JSON.stringify({ '0': 'a', '1': 'b' })
	}).toString()

	let appQuery: Elysia
	let appQueryCustomEndpoint: Elysia
	let appQueryMerged: Elysia

	beforeEach(() => {
		appQuery = new Elysia().use(trpc(router, { createContext }))
		appQueryCustomEndpoint = new Elysia().use(
			trpc(router, { createContext, endpoint: '/v2/trpc' })
		)
		appQueryMerged = new Elysia().use(trpc(mergedRouter, { createContext }))
	})

	it('handle single query', async () => {
		const res = (await appQuery
			.handle(createRequest(`/trpc/greet?${singleQueryParams}`))
			.then((r) => r.json())) as any[]

		expect(res).toStrictEqual([{ result: { data: 'a' } }])
	})

	it('handle multiple queries', async () => {
		const res = (await appQuery
			.handle(createRequest(`/trpc/greet,greet?${multiQueryParams}`))
			.then((r) => r.json())) as any[]

		expect(res).toStrictEqual([
			{ result: { data: 'a' } },
			{ result: { data: 'b' } }
		])
	})

	it('handle custom endpoint', async () => {
		const res = await appQueryCustomEndpoint
			.handle(createRequest(`/v2/trpc/greet?${singleQueryParams}`))
			.then((r) => r.json())

		expect(res).toStrictEqual([{ result: { data: 'a' } }])
	})

	it('receive context', async () => {
		const res = (await appQuery
			.handle(createRequest('/trpc/context'))
			.then((r) => r.json())) as any

		expect(res).toStrictEqual({ result: { data: createContext() } })
	})

	it('receive context and greet', async () => {
		const res = (await appQuery
			.handle(createRequest('/trpc/context'))
			.then((r) => r.json())) as any

		expect(res).toStrictEqual({ result: { data: createContext() } })
	})

	it('support merged router', async () => {
		const res = (await appQueryMerged
			.handle(createRequest(`/trpc/main.greet?${singleQueryParams}`))
			.then((r) => r.json())) as any

		expect(res).toStrictEqual([{ result: { data: 'a' } }])
	})
})

describe('TRPC Subscription', () => {
	const ee = new EventEmitter()

	const onlineRouter = r.router({
		online: r.procedure
			.input(c(t.Object({ username: t.String() })))
			.subscription(({ input, ctx }) => {
				return observable<{ name: string; online: boolean }>((emit) => {
					const onUpdate = (isOnline: boolean) => {
						emit.next({
							name: ctx.name,
							online: isOnline
						})
					}

					ee.on('update', onUpdate)
					return () => {
						ee.off('update', onUpdate)
					}
				})
			}),
		update: r.procedure.input(c(t.Boolean())).mutation(({ input }) => {
			ee.emit('update', input)
		})
	})

	let appWs: Elysia
	let ws: WebSocket

	beforeEach(async () => {
		appWs = new Elysia()
			.use(
				trpc(onlineRouter, {
					createContext
				})
			)
			.listen(TESTING_PORT)

		ws = new WebSocket(`ws://0.0.0.0:${TESTING_PORT}/trpc`)
		await new Promise((connected) => (ws.onopen = connected))
	})

	afterEach(() => {
		ws.close()
		appWs.stop()
	})

	it('handle single subscription', async () => {
		sendMessage(ws, {
			id: 1,
			method: 'subscription',
			jsonrpc: '2.0',
			params: {
				path: 'online',
				input: {
					username: 'elysia'
				}
			}
		})

		expect(await waitForNextMessage(ws)).toStrictEqual({
			id: 1,
			jsonrpc: '2.0',
			result: {
				type: 'started'
			}
		})

		await appWs
			.handle(
				createRequest('/trpc/update?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						'0': false
					})
				})
			)
			.then(async (res) => {
				if (!res.ok) {
					throw await res.text()
				}
			})

		expect(await waitForNextMessage(ws)).toStrictEqual({
			id: 1,
			jsonrpc: '2.0',
			result: {
				type: 'data',
				data: {
					name: 'elysia',
					online: false
				}
			}
		})

		sendMessage(ws, {
			id: 1,
			method: 'subscription.stop',
			params: {
				path: 'online',
				input: {
					username: 'elysia'
				}
			}
		})

		expect(await waitForNextMessage(ws)).toStrictEqual({
			id: 1,
			result: {
				type: 'stopped'
			}
		})
	})

	it('handle multi subscription', async () => {
		sendMessage(ws, [
			{
				id: 1,
				method: 'subscription',
				jsonrpc: '2.0',
				params: {
					path: 'online',
					input: {
						username: 'elysia-1'
					}
				}
			},
			{
				id: 2,
				method: 'subscription',
				jsonrpc: '2.0',
				params: {
					path: 'online',
					input: {
						username: 'elysia-2'
					}
				}
			}
		])

		expect([
			await waitForNextMessage(ws),
			await waitForNextMessage(ws)
		]).toStrictEqual([
			{
				id: 1,
				jsonrpc: '2.0',
				result: {
					type: 'started'
				}
			},
			{
				id: 2,
				jsonrpc: '2.0',
				result: {
					type: 'started'
				}
			}
		])
	})
})

describe('TRPC Errors', () => {
	let appErros: Elysia

	beforeEach(() => {
		appErros = new Elysia().use(trpc(router))
	})

	it('handle "not found"', async () => {
		const res = (await appErros
			.handle(
				createRequest('/trpc/i.dont.exists?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({ '0': 'test' })
				})
			)
			.then((r) => r.json())) as any[]

		expect(res).toMatchObject([
			{
				error: {
					code: -32004,
					data: {
						code: 'NOT_FOUND'
					}
				}
			}
		])
	})

	it('handle "bad request"', async () => {
		const res = await appErros
			.handle(
				createRequest('/trpc/signIn?batch=1', {
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({ '0': 'test' })
				})
			)
			.then((r) => r.json())

		expect(res).toMatchObject([
			{
				error: {
					code: -32600,
					data: {
						code: 'BAD_REQUEST'
					}
				}
			}
		])
	})

	it('handle "internal server error"', async () => {
		const res = await appErros
			.handle(createRequest('/trpc/505'))
			.then((r) => r.json())

		expect(res).toMatchObject({
			error: {
				code: -32603,
				data: {
					httpStatus: 500,
					path: '505',
					code: 'INTERNAL_SERVER_ERROR'
				},
				message: 'Something wrong'
			}
		})
	})
})
