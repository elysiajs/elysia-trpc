# @kingworldjs/trpc
A plugin for [kingworld](https://github.com/saltyaom/kingworld) that add support for using tRPC.

## Installation
```bash
bun add @kingworldjs/trpc
```

## Example
```typescript
import { KingWorld, t } from 'kingworld'
import { compile as c } from '@kingworldjs/trpc'

import { initTRPC } from '@trpc/server'

const r = initTRPC.create()

const router = r.router({
    greet: r.procedure.input(c(t.String())).query(({ input }) => input)
})

export type Router = typeof router

const app = new KingWorld()
    .trpc(router)
    .listen(8080)
```

## API
This plugin extends the new method `trpc` to `KingWorld` class.

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
