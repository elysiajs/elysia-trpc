import {
	createTRPCClient,
	createWSClient,
	httpLink,
	splitLink,
	wsLink
} from '@trpc/client'
import type { Router } from '.'

import './poliyfills'

const client = createTRPCClient<Router>({
	links: [
		// call subscriptions through websockets and the rest over http
		splitLink({
			condition(op) {
				return op.type === 'subscription'
			},
			true: wsLink({
				client: createWSClient({
					url: `ws://localhost:8080/trpc`,
					onClose() {
						console.error('trpc connection closed')
					},
					onOpen() {
						console.log('trpc connection open')
					}
				})
			}),
			false: httpLink({
				url: `http://localhost:8080/trpc`
			})
		})
	]
})

async function main() {
	client.listen.subscribe(undefined, {
		onStarted() {
			console.log('open')
		},
		onData(a) {
			console.log('Got', a)
		},
		onError(error) {
			console.log('error:', error)
		}
	})
}
await main()
