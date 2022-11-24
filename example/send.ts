import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { Router } from '.'

const client = createTRPCProxyClient<Router>({
    links: [
        httpBatchLink({
            url: 'http://0.0.0.0:8080/trpc'
        })
    ]
})

async function main() {
    const result = await client.mirror.query((Math.random() * 10000).toString())

    console.log(`Sent ${result}`)
}

main()
