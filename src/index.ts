import { Elysia, getSchemaValidator } from 'elysia'

import { callProcedure, TRPCError, type Router } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { isObservable, Unsubscribable } from '@trpc/server/observable'

import { transformTRPCResponse, getTRPCErrorFromUnknown } from './utils'

import type { TSchema } from '@sinclair/typebox'
import type { TRPCClientIncomingRequest, TRPCOptions } from './types'

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
    (
        router: Router<any>,
        { endpoint = '/trpc', ...options }: TRPCOptions = {
            endpoint: '/trpc'
        }
    ) =>
    (eri: Elysia) => {
        let app = eri
            .onParse(async ({ request: { url } }) => {
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

        const observers: Map<string, Unsubscribable> = new Map()

        // @ts-ignore
        if (app.wsRouter)
            app.ws<any, any>(endpoint, {
                async message(ws, message) {
                    const messages: TRPCClientIncomingRequest[] = Array.isArray(
                        message
                    )
                        ? message
                        : [message]

                    let observer: Unsubscribable | undefined

                    for (const incoming of messages) {
                        if(!incoming.method || !incoming.params) {
                          continue
                        }

                        if (incoming.method === 'subscription.stop') {
                            observer?.unsubscribe()
                            observers.delete(ws.data.id.toString())

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
                            rawInput: incoming.params.input?.json,
                            type: incoming.method,
                            ctx: await options.createContext?.({req: ws.data.request, resHeaders: new Headers()})
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
                            async error(err) {
                                ws.send(
                                    JSON.stringify(
                                        transformTRPCResponse(router, {
                                            id: incoming.id,
                                            jsonrpc: incoming.jsonrpc,
                                            error: router.getErrorShape({
                                                error: getTRPCErrorFromUnknown(
                                                    err
                                                ),
                                                type: incoming.method as 'subscription',
                                                path: incoming.params.path,
                                                input: incoming.params.input,
                                                ctx: await options.createContext?.({req: ws.data.request, resHeaders: new Headers()})
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

                        observers.set(ws.data.id.toString(), observer)
                    }
                },
                close(ws) {
                    observers.get(ws.data.id.toString())?.unsubscribe()
                    observers.delete(ws.data.id.toString())
                }
            })

        return app
    }

export type { TRPCClientIncomingRequest, TRPCOptions } from './types'
