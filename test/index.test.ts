import { Elysia, t } from 'elysia'
import { compile as c, trpc } from '../src'

import { initTRPC } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'stream'

const createContext = () => ({
    name: 'elysia'
})

const createRequest = (path: string, init: RequestInit = {}) => new Request(`http://0.0.0.0:8080${path}`, init);

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
        .mutation(({ input }) => input)
})

const anotherRouter = r.router({
    another: r.procedure.query(() => ({ ping: 'pong' }))
})


const onlineEe = new EventEmitter()

const onlineRouter = r.router({
    online: r.procedure.input(c(t.Object({ username: t.String() }))).subscription(({ input }) => {
        return observable<Boolean>((emit) => {
            const onUpdate = (data: boolean) => {
                emit.next(data);
            };

            onlineEe.on('update', onUpdate);
            return () => {
                onlineEe.off('update', onUpdate);
            }
        })
    }),
    update: r.procedure.input(c(t.Number())).mutation(({ input }) => {
        onlineEe.emit('update', input);
    })
})

const mergedRouter = r.router({
    main: router,
    another: anotherRouter
})

const app = new Elysia().use(trpc(router))

describe('TRPC', () => {
    it('handle query', async () => {
        const res = (await app
            .handle(
                createRequest(
                    '/trpc/greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any[]

        expect(res[0].result.data).toBe('a')
    })

    it('handle mutation', async () => {
        const body = JSON.stringify({
            '0': {
                username: 'saltyaom',
                password: '12345678'
            }
        })

        const res = await app
            .handle(
                createRequest('/trpc/signIn?batch=1', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': '123'
                    },
                    body
                })
            )
            .then((r) => r.text())

        expect(res).toBe(
            JSON.stringify([
                {
                    result: {
                        data: {
                            username: 'saltyaom',
                            password: '12345678'
                        }
                    }
                }
            ])
        )
    })

    it('handle subscription', async () => {
        const app3 = new Elysia().use(
            trpc(onlineRouter)
        ).listen(8080);

        const ws = new WebSocket('ws://0.0.0.0:8080/trpc');
        await new Promise((connected) => ws.onopen = connected);

        const sendMessage = (data: unknown) => ws.send(JSON.stringify(data))

        const waitForNextMessage = async (): Promise<unknown> => {
            return new Promise((resolve) => {
                ws.onmessage = (event) => {
                    resolve(JSON.parse(event.data));
                }

            })
        }


        sendMessage({
            id: 1,
            method: 'subscription',
            jsonrpc: '2.0',
            params: {
                path: 'online',
                input: {
                    json: {
                        username: 'elysia'
                    }
                }
            }
        })
        expect(await waitForNextMessage()).toStrictEqual({
            id: 1,
            jsonrpc: '2.0',
            result: {
                type: 'started'
            }
        })

        const body = JSON.stringify({
            '0': 123456
        })

        await app3
            .handle(
                createRequest('/trpc/update?batch=1', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': String(body.length)
                    },
                    body
                })
            )
        expect(await waitForNextMessage()).toStrictEqual({
            id: 1,
            jsonrpc: '2.0',
            result: {
                type: 'data',
                data: 123456
            }
        })

        sendMessage({
            id: 1,
            method: 'subscription.stop',
            params: {
                path: 'online',
                input: {
                    json: {
                        username: 'elysia'
                    }
                }
            }
        })
        expect(await waitForNextMessage()).toStrictEqual({
            id: 1,
            result: {
                type: 'stopped'
            }
        })

        ws.close()
        app3.stop()
    })

    it('handle custom endpoint', async () => {
        const app2 = new Elysia().use(
            trpc(router, {
                endpoint: '/v2/trpc'
            })
        )

        const res = (await app2
            .handle(
                createRequest(
                    '/v2/trpc/greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any[]

        expect(res[0].result.data).toBe('a')
    })

    it('handle custom endpoint', async () => {
        const app2 = new Elysia().use(
            trpc(router, {
                endpoint: '/v2/trpc'
            })
        )

        const res = (await app2
            .handle(
                createRequest(
                    '/v2/trpc/greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any[]

        expect(res[0].result.data).toBe('a')
    })

    it('receive context', async () => {
        const app2 = new Elysia().use(
            trpc(router, {
                createContext
            })
        )

        const res = (await app2
            .handle(createRequest('/trpc/context'))
            .then((r) => r.json())) as any

        expect(res.result.data).toEqual(createContext())
    })

    it('support merged router', async () => {
        const app2 = new Elysia().use(trpc(mergedRouter))

        const res = (await app2
            .handle(
                createRequest(
                    '/trpc/main.greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any

        expect(res[0].result.data).toBe('a')
    })
})
