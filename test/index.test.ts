import { Elysia, t } from 'elysia'

import { compile as c } from '../src'

import { describe, expect, it } from 'bun:test'

import { initTRPC } from '@trpc/server'

const req = (path: string) => new Request(path)

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
        .mutation(({ input }) => input)
})

const anotherRouter = r.router({
    another: r.procedure.query(() => ({ ping: 'pong' }))
})

const mergedRouter = r.router({
    main: router,
    another: anotherRouter
})

const app = new Elysia().trpc(router)

describe('TRPC', () => {
    it('handle query', async () => {
        const res = (await app
            .handle(
                new Request(
                    'http://0.0.0.0:8080/trpc/greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
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
                new Request('http://0.0.0.0:8080/trpc/signIn?batch=1', {
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

    it('handle custom endpoint', async () => {
        const app2 = new Elysia().trpc(router, {
            endpoint: '/v2/trpc'
        })

        const res = (await app2
            .handle(
                new Request(
                    'http://0.0.0.0:8080/v2/trpc/greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any[]

        expect(res[0].result.data).toBe('a')
    })

    it('handle custom endpoint', async () => {
        const app2 = new Elysia().trpc(router, {
            endpoint: '/v2/trpc'
        })

        const res = (await app2
            .handle(
                new Request(
                    'http://0.0.0.0:8080/v2/trpc/greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any[]

        expect(res[0].result.data).toBe('a')
    })

    it('receive context', async () => {
        const app2 = new Elysia().trpc(router, {
            createContext
        })

        const res = (await app2
            .handle(new Request('http://0.0.0.0:8080/trpc/context'))
            .then((r) => r.json())) as any

        expect(res.result.data).toEqual(createContext())
    })

    it('support merged router', async () => {
        const app2 = new Elysia().trpc(mergedRouter)

        const res = (await app2
            .handle(
                new Request(
                    'http://0.0.0.0:8080/trpc/main.greet?batch=1&input=%7B%220%22%3A%22a%22%7D'
                )
            )
            .then((r) => r.json())) as any

        expect(res[0].result.data).toBe('a')
    })
})
