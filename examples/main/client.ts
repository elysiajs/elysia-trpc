import {
    createTRPCProxyClient,
    createWSClient,
    httpBatchLink,
    httpLink,
    splitLink,
    wsLink
} from '@trpc/client'
import type { Router } from '.'

import './polyfills'

const client = createTRPCProxyClient<Router>({
    links: [
        // call subscriptions through websockets and the rest over http
        splitLink({
            condition(op) {
                return op.type === 'subscription'
            },
            true: wsLink({
                client: createWSClient({
                    url: `ws://0.0.0.0:8080/trpc`
                })
            }),
            false: httpLink({
                url: `http://0.0.0.0:8080/trpc`
            })
        })
    ]
})

async function main() {
    client.listen.subscribe(undefined, {
        onData(a) {
            console.log('Got', a)
        }
    })
}

main()
