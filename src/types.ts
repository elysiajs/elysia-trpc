import type { Router } from '@trpc/server'
import type { FetchHandlerRequestOptions } from '@trpc/server/adapters/fetch'

export interface TRPCClientIncomingRequest {
    id: number | string
    jsonrpc?: '2.0'
    method: 'query' | 'mutation' | 'subscription' | 'subscription.stop'
    params: {
        path: string
        input?: unknown
    }
}

export interface TRPCOptions
    extends Omit<
        FetchHandlerRequestOptions<any>,
        'req' | 'router' | 'endpoint'
    > {
    /**
     * tRPC endpoint
     *
     * @default '/trpc'
     */
    endpoint?: string
}

declare module 'elysia' {
    interface Elysia {
        trpc: (router: Router<any>, options?: TRPCOptions) => this
    }
}
