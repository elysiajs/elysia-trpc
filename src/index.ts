import {
    DefinitionBase,
    Elysia,
    InputSchema,
    MergeSchema,
    RouteSchema,
    UnwrapSchema,
    getSchemaValidator
} from 'elysia'

import { TRPCError, callProcedure, type Router } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { Unsubscribable, isObservable } from '@trpc/server/observable'

import { getTRPCErrorFromUnknown, transformTRPCResponse } from './utils'

import type { TSchema } from '@sinclair/typebox'
import type { TRPCClientIncomingRequest, TRPCOptions } from './types'
import { getErrorShape } from '@trpc/server/shared'

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

type ClientSubscripted = Map<string, Unsubscribable>

export const trpc =
    (
        router: Router<any>,
        { endpoint = '/trpc', ...options }: TRPCOptions = {
            endpoint: '/trpc'
        }
    ) =>
    (eri: Elysia): Elysia => {
        const app = eri
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

        const observers: Map<string, ClientSubscripted> = new Map()

        if (options.useSubscription)
            app.ws(endpoint, {
                open(ws) {
                    const id =
                        ws.data.headers['sec-websocket-key'] ??
                        crypto.randomUUID()

                    // @ts-ignore
                    ws.data.id = id
                },
                async message(ws, message) {
                    // @ts-ignore
                    const id = ws.data.id

                    if (!observers.get(id)) {
                        observers.set(id, new Map())
                    }

                    const msg =
                        typeof message === 'string'
                            ? JSON.parse(message)
                            : message

                    const messages: TRPCClientIncomingRequest[] = Array.isArray(
                        msg
                    )
                        ? msg
                        : [msg]

                    await Promise.allSettled(messages.map((incoming) => {}))

                    for (const incoming of messages) {
                        if (incoming.method === 'subscription.stop') {
                            const clientObservers = observers.get(id)
                            const observer = clientObservers?.get(
                                incoming.id.toString()
                            )
                            observer?.unsubscribe()
                            clientObservers?.delete(incoming.id.toString())

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

                        if (!incoming.method || !incoming.params) {
                            continue
                        }

                        const sendErrorMessage = (err: unknown) => {
                            ws.send(
                                JSON.stringify(
                                    transformTRPCResponse(router, {
                                        id: incoming.id,
                                        jsonrpc: incoming.jsonrpc,
                                        error: getErrorShape({
                                            error: getTRPCErrorFromUnknown(err),
                                            type: incoming.method as 'subscription',
                                            path: incoming.params.path,
                                            input: incoming.params.input,
                                            ctx: {},
                                            config: router._def._config
                                        })
                                    })
                                )
                            )
                        }

                        try {
                            const result = await callProcedure({
                                procedures: router._def.procedures,
                                path: incoming.params.path,
                                rawInput: incoming.params.input?.json,
                                type: incoming.method,
                                ctx: {}
                            })

                            if (incoming.method !== 'subscription') {
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
                            }

                            ws.send(
                                JSON.stringify({
                                    id: incoming.id,
                                    jsonrpc: incoming.jsonrpc,
                                    result: {
                                        type: 'started'
                                    }
                                })
                            )

                            if (!isObservable(result)) {
                                throw new TRPCError({
                                    message: `Subscription ${incoming.params.path} did not return an observable`,
                                    code: 'INTERNAL_SERVER_ERROR'
                                })
                            }

                            const observer = result.subscribe({
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
                                    sendErrorMessage(err)
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

                            observers
                                .get(id)
                                ?.set(incoming.id.toString(), observer)
                        } catch (err) {
                            sendErrorMessage(err)
                        }
                    }
                },
                close(ws) {
                    // @ts-ignore
                    const id = ws.data.id

                    const clientObservers = observers.get(id)

                    clientObservers?.forEach((val, key) => {
                        val.unsubscribe()
                    })

                    observers.delete(id)
                }
            })

        return app
    }

export type { TRPCClientIncomingRequest, TRPCOptions } from './types'
