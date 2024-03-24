import { Elysia, getSchemaValidator } from 'elysia'

import {
	callTRPCProcedure,
	getErrorShape,
	TRPCError,
	type AnyTRPCRouter
} from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { isObservable, Unsubscribable } from '@trpc/server/observable'

import type { TSchema } from '@sinclair/typebox'
import {
	inferRouterContext,
	JSONRPC2,
	parseTRPCMessage,
	transformTRPCResponse,
	TRPCClientOutgoingMessage,
	TRPCResponseMessage
} from '@trpc/server/unstable-core-do-not-import'
import type { TRPCOptions } from './types'
import { getTRPCErrorFromUnknown } from './utils'

export function compile<T extends TSchema>(schema: T) {
	const check = getSchemaValidator(schema, {})
	if (!check) throw new Error('Invalid schema')

	return (value: unknown) => {
		if (check.Check(value)) return value

		const { path, message } = [...check.Errors(value)][0]

		throw new TRPCError({
			message: `${message} for ${path}`,
			code: 'BAD_REQUEST'
		})
	}
}

const getPath = (url: string) => {
	const start = url.indexOf('/', 9)
	const end = url.indexOf('?', start)

	if (end === -1) return url.slice(start)

	return url.slice(start, end)
}

export const trpc =
	<TRouter extends AnyTRPCRouter>(
		router: AnyTRPCRouter,
		{ endpoint = '/trpc', ...options }: TRPCOptions = {
			endpoint: '/trpc'
		}
	) =>
	(eri: Elysia) => {
		let app = eri
			.onParse({ as: 'global' }, async ({ request: { url } }) => {
				if (getPath(url).startsWith(endpoint)) return true
			})
			.get(`${endpoint}/*`, async ({ query, request }) => {
				return fetchRequestHandler({
					...options,
					req: request,
					router,
					endpoint
				})
			})
			.post(`${endpoint}/*`, async ({ query, request }) => {
				return fetchRequestHandler({
					...options,
					req: request,
					router,
					endpoint
				})
			})

		const clientSubscriptions: Map<number | string, Unsubscribable> =
			new Map()

		if (app.ws) {
			app.ws<any, any, any>(endpoint, {
				async message(ws: any, message: any) {
					const { createContext } = options
					const { transformer } = router._def._config

					const req = ws.data.request

					let ctx: inferRouterContext<TRouter> | undefined = undefined
					const ctxPromise = createContext?.({
						req
					} as any)

					async function createContextAsync() {
						try {
							ctx = await ctxPromise
						} catch (cause) {
							const error = getTRPCErrorFromUnknown(cause)
							options.onError?.({
								error,
								path: undefined,
								type: 'unknown',
								ctx,
								req,
								input: undefined
							})
							respond({
								id: null,
								error: getErrorShape({
									config: router._def._config,
									error,
									type: 'unknown',
									path: undefined,
									input: undefined,
									ctx
								})
							})

							// close in next tick
							;(global.setImmediate ?? global.setTimeout)(() => {
								ws.close()
							})
						}
					}
					await createContextAsync()

					function respond(untransformedJSON: TRPCResponseMessage) {
						ws.send(
							JSON.stringify(
								transformTRPCResponse(
									router._def._config,
									untransformedJSON
								)
							)
						)
					}

					function stopSubscription(
						subscription: Unsubscribable,
						{
							id,
							jsonrpc
						}: JSONRPC2.BaseEnvelope & { id: JSONRPC2.RequestId }
					) {
						subscription.unsubscribe()

						respond({
							id,
							jsonrpc,
							result: {
								type: 'stopped'
							}
						})
					}

					async function handleRequest(
						msg: TRPCClientOutgoingMessage
					) {
						const { id, jsonrpc } = msg
						/* istanbul ignore next -- @preserve */
						if (id === null) {
							throw new TRPCError({
								code: 'BAD_REQUEST',
								message: '`id` is required'
							})
						}
						if (msg.method === 'subscription.stop') {
							const sub = clientSubscriptions.get(id)
							if (sub) {
								stopSubscription(sub, { id, jsonrpc })
							}
							clientSubscriptions.delete(id)
							return
						}
						const { path, input } = msg.params
						const type = msg.method
						try {
							const result = await callTRPCProcedure({
								procedures: router._def.procedures,
								path,
								getRawInput: async () => input,
								ctx,
								type
							})

							if (type === 'subscription') {
								if (!isObservable(result)) {
									throw new TRPCError({
										message: `Subscription ${path} did not return an observable`,
										code: 'INTERNAL_SERVER_ERROR'
									})
								}
							} else {
								return void respond({
									id,
									jsonrpc,
									result: {
										type: 'data',
										data: result
									}
								})
							}

							const observable = result
							const sub = observable.subscribe({
								next(data) {
									respond({
										id,
										jsonrpc,
										result: {
											type: 'data',
											data
										}
									})
								},
								error(err) {
									const error = getTRPCErrorFromUnknown(err)
									options.onError?.({
										error,
										path,
										type,
										ctx,
										req,
										input
									})
									respond({
										id,
										jsonrpc,
										error: getErrorShape({
											config: router._def._config,
											error,
											type,
											path,
											input,
											ctx
										})
									})
								},
								complete() {
									respond({
										id,
										jsonrpc,
										result: {
											type: 'stopped'
										}
									})
								}
							})
							if (ws.raw.readyState !== WebSocket.OPEN) {
								// if the client got disconnected whilst initializing the subscription
								// no need to send stopped message if the client is disconnected
								sub.unsubscribe()
								return
							}

							if (clientSubscriptions.has(id)) {
								stopSubscription(sub, { id, jsonrpc })
								throw new TRPCError({
									message: `Duplicate id ${id}`,
									code: 'BAD_REQUEST'
								})
							}
							clientSubscriptions.set(id, sub)

							respond({
								id,
								jsonrpc,
								result: {
									type: 'started'
								}
							})
						} catch (cause) {
							const error = getTRPCErrorFromUnknown(cause)
							options.onError?.({
								error,
								path,
								type,
								ctx,
								req,
								input
							})
							respond({
								id,
								jsonrpc,
								error: getErrorShape({
									config: router._def._config,
									error,
									type,
									path,
									input,
									ctx
								})
							})
						}
					}

					try {
						const msgJSON: unknown =
							typeof message === 'object'
								? message
								: JSON.parse(message.toString())
						const msgs: unknown[] = Array.isArray(msgJSON)
							? msgJSON
							: [msgJSON]
						const promises = msgs
							.map((raw) => parseTRPCMessage(raw, transformer))
							.map(handleRequest)
						await Promise.all(promises)
					} catch (cause) {
						const error = new TRPCError({
							code: 'PARSE_ERROR',
							cause
						})

						return void respond({
							id: null,
							error: getErrorShape({
								config: router._def._config,
								error,
								type: 'unknown',
								path: undefined,
								input: undefined,
								ctx: undefined
							})
						})
					}
				},
				close() {
					for (const sub of clientSubscriptions.values()) {
						sub.unsubscribe()
					}
					clientSubscriptions.clear()
				}
			})
		}

		return app
	}

export type { TRPCClientIncomingRequest, TRPCOptions } from './types'
