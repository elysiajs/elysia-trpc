# @elysiajs/trpc
A plugin for [elysia](https://github.com/elysiajs/elysia) that adds support for using tRPC.

## Installation
```bash
bun add @elysiajs/trpc
```

## Example
```typescript
import { Elysia, t } from 'elysia'
import { trpc, compile as c } from '@elysiajs/trpc'

import { initTRPC } from '@trpc/server'

const r = initTRPC.create()

const router = r.router({
    greet: r.procedure.input(c(t.String())).query(({ input }) => input)
})

export type Router = typeof router

const app = new Elysia()
    .use(trpc(router))
    .listen(8080)
```

## API
This plugin extends the new method `trpc` to `Elysia` class.

### trpc
Register tRPC router.

```typescript
type tRPC = (router: Router<any>, options?: TRPCOptions) => this

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
```

## Note
WebSocket API is in an experimental state and unstable. 

Is meant for experimental for better stabilization.
