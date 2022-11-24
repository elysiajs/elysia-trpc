import { KingWorld, t } from 'kingworld'
import { compile as c } from '../src/index'
import { websocket } from '@kingworldjs/websocket'

import { initTRPC } from '@trpc/server'
import { observable } from '@trpc/server/observable'

import EventEmitter from 'events'

const r = initTRPC.create()
const p = r.procedure

const ee = new EventEmitter()

const router = r.router({
    greet: p.input(c(t.String())).query(({ input }) => {
        ee.emit('a', input)

        return input
    }),
    signIn: p
        .input(
            c(
                t.Object({
                    username: t.String(),
                    password: t.String()
                })
            )
        )
        .mutation(({ input }) => input),
    k: p.subscription(() => {
        return observable<string>((emit) => {
            ee.on('a', (input) => {
                emit.next(input)
            })

            return () => {
                console.log('Unsubscribe')
            }
        })
    })
})

export type Router = typeof router

const app = new KingWorld().use(websocket()).trpc(router).listen(8080)
