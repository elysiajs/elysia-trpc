import {
    AnyTRPCRouter,
    TRPCProcedureType,
    TRPCError
} from '@trpc/server'
import {
    TRPCResponse,
    TRPCResponseMessage
} from '@trpc/server/rpc'

function assertIsObject(obj: unknown): asserts obj is Record<string, unknown> {
    if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
        throw new Error('Not an object')
    }
}

function assertIsProcedureType(obj: unknown): asserts obj is TRPCProcedureType {
    if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
        throw new Error('Invalid procedure type')
    }
}

function assertIsRequestId(
    obj: unknown
): asserts obj is number | string | null {
    if (
        obj !== null &&
        typeof obj === 'number' &&
        isNaN(obj) &&
        typeof obj !== 'string'
    ) {
        throw new Error('Invalid request id')
    }
}

function assertIsString(obj: unknown): asserts obj is string {
    if (typeof obj !== 'string') {
        throw new Error('Invalid string')
    }
}

function assertIsJSONRPC2OrUndefined(
    obj: unknown
): asserts obj is '2.0' | undefined {
    if (typeof obj !== 'undefined' && obj !== '2.0') {
        throw new Error('Must be JSONRPC 2.0')
    }
}

export function transformTRPCResponseItem<
    TResponseItem extends TRPCResponse | TRPCResponseMessage
>(router: AnyTRPCRouter, item: TResponseItem): TResponseItem {
    if ('error' in item) {
        return {
            ...item,
            error: router._def._config.transformer.output.serialize(item.error)
        }
    }

    if ('data' in item.result) {
        return {
            ...item,
            result: {
                ...item.result,
                data: router._def._config.transformer.output.serialize(
                    item.result.data
                )
            }
        }
    }

    return item
}

export function transformTRPCResponse<
    TResponse extends
        | TRPCResponse
        | TRPCResponse[]
        | TRPCResponseMessage
        | TRPCResponseMessage[]
>(router: AnyTRPCRouter, itemOrItems: TResponse) {
    return Array.isArray(itemOrItems)
        ? itemOrItems.map((item) => transformTRPCResponseItem(router, item))
        : transformTRPCResponseItem(router, itemOrItems)
}

export function getMessageFromUnknownError(
    err: unknown,
    fallback: string
): string {
    if (typeof err === 'string') {
        return err
    }

    if (err instanceof Error && typeof err.message === 'string') {
        return err.message
    }
    return fallback
}

export function getErrorFromUnknown(cause: unknown): Error {
    if (cause instanceof Error) {
        return cause
    }
    const message = getMessageFromUnknownError(cause, 'Unknown error')
    return new Error(message)
}

export function getTRPCErrorFromUnknown(cause: unknown): TRPCError {
    const error = getErrorFromUnknown(cause)
    // this should ideally be an `instanceof TRPCError` but for some reason that isn't working
    // ref https://github.com/trpc/trpc/issues/331
    if (error.name === 'TRPCError') return cause as TRPCError

    const trpcError = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: error,
        message: error.message
    })

    // Inherit stack from error
    trpcError.stack = error.stack

    return trpcError
}

export function getCauseFromUnknown(cause: unknown) {
    if (cause instanceof Error) {
        return cause
    }

    return undefined
}
