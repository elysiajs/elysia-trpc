import { Elysia, getPath, getSchemaValidator } from 'elysia';
import '@elysiajs/websocket';
import { callProcedure, TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { isObservable } from '@trpc/server/observable';
import { transformTRPCResponse, getTRPCErrorFromUnknown } from './utils';
export function compile(schema) {
    const check = getSchemaValidator(schema);
    if (!check)
        throw new Error('Invalid schema');
    return (input) => {
        if (check.Check(input))
            return input;
        throw new TypeError('Invalid Input');
    };
}
Elysia.prototype.trpc = function (router, { endpoint = '/trpc', ...options } = {
    endpoint: '/trpc'
}) {
    let app = this.onParse(async (request) => {
        if (getPath(request.url).startsWith(endpoint))
            return true;
    }).all(`${endpoint}/*`, async (ctx) => fetchRequestHandler({
        ...options,
        req: ctx.request,
        router,
        endpoint
    }));
    const observers = new Map();
    if (app.websocketRouter)
        app.ws(endpoint, {
            async message(ws, message) {
                const messages = Array.isArray(message)
                    ? message
                    : [message];
                let observer;
                for (const incoming of messages) {
                    if (incoming.method === 'subscription.stop') {
                        observer?.unsubscribe();
                        observers.delete(ws.data.id);
                        return void ws.send(JSON.stringify({
                            id: incoming.id,
                            jsonrpc: incoming.jsonrpc,
                            result: {
                                type: 'stopped'
                            }
                        }));
                    }
                    const result = await callProcedure({
                        procedures: router._def.procedures,
                        path: incoming.params.path,
                        rawInput: incoming.params.input,
                        type: incoming.method,
                        ctx: {}
                    });
                    if (incoming.method !== 'subscription')
                        return void ws.send(JSON.stringify(transformTRPCResponse(router, {
                            id: incoming.id,
                            jsonrpc: incoming.jsonrpc,
                            result: {
                                type: 'data',
                                data: result
                            }
                        })));
                    ws.send(JSON.stringify({
                        id: incoming.id,
                        jsonrpc: incoming.jsonrpc,
                        result: {
                            type: 'started'
                        }
                    }));
                    if (!isObservable(result))
                        throw new TRPCError({
                            message: `Subscription ${incoming.params.path} did not return an observable`,
                            code: 'INTERNAL_SERVER_ERROR'
                        });
                    observer = result.subscribe({
                        next(data) {
                            ws.send(JSON.stringify(transformTRPCResponse(router, {
                                id: incoming.id,
                                jsonrpc: incoming.jsonrpc,
                                result: {
                                    type: 'data',
                                    data
                                }
                            })));
                        },
                        error(err) {
                            ws.send(JSON.stringify(transformTRPCResponse(router, {
                                id: incoming.id,
                                jsonrpc: incoming.jsonrpc,
                                error: router.getErrorShape({
                                    error: getTRPCErrorFromUnknown(err),
                                    type: incoming.method,
                                    path: incoming.params.path,
                                    input: incoming.params.input,
                                    ctx: {}
                                })
                            })));
                        },
                        complete() {
                            ws.send(JSON.stringify(transformTRPCResponse(router, {
                                id: incoming.id,
                                jsonrpc: incoming.jsonrpc,
                                result: {
                                    type: 'stopped'
                                }
                            })));
                        }
                    });
                    observers.set(ws.data.id, observer);
                }
            },
            close(ws) {
                observers.get(ws.data.id)?.unsubscribe();
                observers.delete(ws.data.id);
            }
        });
    return app;
};
