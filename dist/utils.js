import { TRPCError } from '@trpc/server';
function assertIsObject(obj) {
    if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
        throw new Error('Not an object');
    }
}
function assertIsProcedureType(obj) {
    if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
        throw new Error('Invalid procedure type');
    }
}
function assertIsRequestId(obj) {
    if (obj !== null &&
        typeof obj === 'number' &&
        isNaN(obj) &&
        typeof obj !== 'string') {
        throw new Error('Invalid request id');
    }
}
function assertIsString(obj) {
    if (typeof obj !== 'string') {
        throw new Error('Invalid string');
    }
}
function assertIsJSONRPC2OrUndefined(obj) {
    if (typeof obj !== 'undefined' && obj !== '2.0') {
        throw new Error('Must be JSONRPC 2.0');
    }
}
export function transformTRPCResponseItem(router, item) {
    if ('error' in item) {
        return {
            ...item,
            error: router._def._config.transformer.output.serialize(item.error)
        };
    }
    if ('data' in item.result) {
        return {
            ...item,
            result: {
                ...item.result,
                data: router._def._config.transformer.output.serialize(item.result.data)
            }
        };
    }
    return item;
}
export function transformTRPCResponse(router, itemOrItems) {
    return Array.isArray(itemOrItems)
        ? itemOrItems.map((item) => transformTRPCResponseItem(router, item))
        : transformTRPCResponseItem(router, itemOrItems);
}
export function getMessageFromUnknownError(err, fallback) {
    if (typeof err === 'string') {
        return err;
    }
    if (err instanceof Error && typeof err.message === 'string') {
        return err.message;
    }
    return fallback;
}
export function getErrorFromUnknown(cause) {
    if (cause instanceof Error) {
        return cause;
    }
    const message = getMessageFromUnknownError(cause, 'Unknown error');
    return new Error(message);
}
export function getTRPCErrorFromUnknown(cause) {
    const error = getErrorFromUnknown(cause);
    // this should ideally be an `instanceof TRPCError` but for some reason that isn't working
    // ref https://github.com/trpc/trpc/issues/331
    if (error.name === 'TRPCError')
        return cause;
    const trpcError = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: error,
        message: error.message
    });
    // Inherit stack from error
    trpcError.stack = error.stack;
    return trpcError;
}
export function getCauseFromUnknown(cause) {
    if (cause instanceof Error) {
        return cause;
    }
    return undefined;
}
