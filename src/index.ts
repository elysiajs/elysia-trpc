import { Elysia, getSchemaValidator, mapPathnameAndQueryRegEx } from 'elysia'
import '@elysiajs/websocket'

import { callProcedure, TRPCError, type Router } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { isObservable, Unsubscribable } from '@trpc/server/observable'

import { transformTRPCResponse, getTRPCErrorFromUnknown } from './utils'

import type { TSchema } from '@sinclair/typebox'
import type { TRPCClientIncomingRequest, TRPCOptions } from './types'

export function compile<T extends TSchema>(schema: T) {
    const check = getSchemaValidator(schema, {})
    if (!check) throw new Error('Invalid schema')

    return (input: unknown) => {
        if (check.Check(input)) return input

        throw new TypeError('Invalid Input')
    }
}

Elysia.prototype.trpc = function (
    router,
    { endpoint = '/trpc', ...options } = {
        endpoint: '/trpc'
    }
) {
    let app = this.onParse(async ({ request }) => {
        const fragment = request.url.match(mapPathnameAndQueryRegEx)

        if (fragment?.[1].startsWith(endpoint)) return true
    }).all(`${endpoint}/*`, async (ctx) =>
        fetchRequestHandler({
            ...options,
            req: ctx.request,
            router,
            endpoint
        })
    )

    const observers: Map<string, Unsubscribable> = new Map()

    if (app.websocketRouter)
        app.ws<any>(endpoint, {
            async message(ws, message) {
                const messages: TRPCClientIncomingRequest[] = Array.isArray(
                    message
                )
                    ? message
                    : [message]

                let observer: Unsubscribable | undefined

                for (const incoming of messages) {
                    if (incoming.method === 'subscription.stop') {
                        observer?.unsubscribe()
                        observers.delete(ws.data.id)

                        return void ws.send(
                            JSON.stringify({
                                id: incoming.id,
                                jsonrpc: incoming.jsonrpc,
                                result: {
                                    type: 'stopped'
                                }
                            })
                        )
                    }

                    const result = await callProcedure({
                        procedures: router._def.procedures,
                        path: incoming.params.path,
                        rawInput: incoming.params.input,
                        type: incoming.method,
                        ctx: {}
                    })

                    if (incoming.method !== 'subscription')
                        return void ws.send(
                            JSON.stringify(
                                transformTRPCResponse(router, {
                                    id: incoming.id,
                                    jsonrpc: incoming.jsonrpc,
                                    result: {
                                        type: 'data',
                                        data: result
                                    }
                                })
                            )
                        )

                    ws.send(
                        JSON.stringify({
                            id: incoming.id,
                            jsonrpc: incoming.jsonrpc,
                            result: {
                                type: 'started'
                            }
                        })
                    )

                    if (!isObservable(result))
                        throw new TRPCError({
                            message: `Subscription ${incoming.params.path} did not return an observable`,
                            code: 'INTERNAL_SERVER_ERROR'
                        })

                    observer = result.subscribe({
                        next(data) {
                            ws.send(
                                JSON.stringify(
                                    transformTRPCResponse(router, {
                                        id: incoming.id,
                                        jsonrpc: incoming.jsonrpc,
                                        result: {
                                            type: 'data',
                                            data
                                        }
                                    })
                                )
                            )
                        },
                        error(err) {
                            ws.send(
                                JSON.stringify(
                                    transformTRPCResponse(router, {
                                        id: incoming.id,
                                        jsonrpc: incoming.jsonrpc,
                                        error: router.getErrorShape({
                                            error: getTRPCErrorFromUnknown(err),
                                            type: incoming.method as 'subscription',
                                            path: incoming.params.path,
                                            input: incoming.params.input,
                                            ctx: {}
                                        })
                                    })
                                )
                            )
                        },
                        complete() {
                            ws.send(
                                JSON.stringify(
                                    transformTRPCResponse(router, {
                                        id: incoming.id,
                                        jsonrpc: incoming.jsonrpc,
                                        result: {
                                            type: 'stopped'
                                        }
                                    })
                                )
                            )
                        }
                    })

                    observers.set(ws.data.id, observer)
                }
            },
            close(ws) {
                observers.get(ws.data.id)?.unsubscribe()
                observers.delete(ws.data.id)
            }
        })

    return app
}

export type { TRPCClientIncomingRequest, TRPCOptions } from './types'
