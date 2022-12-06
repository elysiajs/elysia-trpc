import { AnyRouter, TRPCError } from '@trpc/server';
import { TRPCResponse, TRPCResponseMessage } from '@trpc/server/rpc';
export declare function transformTRPCResponseItem<TResponseItem extends TRPCResponse | TRPCResponseMessage>(router: AnyRouter, item: TResponseItem): TResponseItem;
export declare function transformTRPCResponse<TResponse extends TRPCResponse | TRPCResponse[] | TRPCResponseMessage | TRPCResponseMessage[]>(router: AnyRouter, itemOrItems: TResponse): import("@trpc/server/rpc").TRPCSuccessResponse<unknown> | import("@trpc/server/rpc").TRPCErrorResponse<import("@trpc/server/rpc").TRPCErrorShape<import("@trpc/server/rpc").TRPC_ERROR_CODE_NUMBER, Record<string, unknown>>> | ({
    id: import("@trpc/server/rpc").JSONRPC2.RequestId;
} & import("@trpc/server/rpc").TRPCResultMessage<unknown>) | (TRPCResponse<unknown, import("@trpc/server/rpc").TRPCErrorShape<import("@trpc/server/rpc").TRPC_ERROR_CODE_NUMBER, Record<string, unknown>>> | TRPCResponseMessage<unknown, import("@trpc/server/rpc").TRPCErrorShape<import("@trpc/server/rpc").TRPC_ERROR_CODE_NUMBER, Record<string, unknown>>>)[];
export declare function getMessageFromUnknownError(err: unknown, fallback: string): string;
export declare function getErrorFromUnknown(cause: unknown): Error;
export declare function getTRPCErrorFromUnknown(cause: unknown): TRPCError;
export declare function getCauseFromUnknown(cause: unknown): Error | undefined;
