import '@elysiajs/websocket';
import { type Router } from '@trpc/server';
import type { TSchema } from '@sinclair/typebox';
import type { TRPCOptions } from './types';
export declare function compile<T extends TSchema>(schema: T): (input: unknown) => import("@sinclair/typebox").Static<NonNullable<T>, []>;
export type { TRPCClientIncomingRequest, TRPCOptions } from './types';
declare module 'elysia' {
    interface Elysia {
        trpc: (router: Router<any>, options?: TRPCOptions) => this;
    }
}
