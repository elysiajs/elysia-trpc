import {
    createTRPCProxyClient,
    createWSClient,
    httpBatchLink,
    httpLink,
    splitLink,
    wsLink
} from '@trpc/client'
import type { Router } from '.'

// import fetch from 'node-fetch'
import ws from 'ws'

// polyfill fetch & websocket
const globalAny = global as any
globalAny.WebSocket = ws

const wsClient = createWSClient({
    url: `ws://0.0.0.0:8080/trpc`
})

const client = createTRPCProxyClient<Router>({
    links: [
        // call subscriptions through websockets and the rest over http
        splitLink({
            condition(op) {
                return op.type === 'subscription'
            },
            true: wsLink({
                client: wsClient
            }),
            false: httpLink({
                url: `http://0.0.0.0:8080/trpc`
            })
        })
    ]
})

async function main() {
    // await client.signIn.mutate({
    //     username: 'A',
    //     password: 'B'
    // })

    client.k.subscribe(undefined, {
        onData(a) {
            console.log('Got', a)
        }
    })
}

main()
