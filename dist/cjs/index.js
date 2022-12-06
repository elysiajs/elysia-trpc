"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compile = void 0;
const elysia_1 = require("elysia");
require("@elysiajs/websocket");
const server_1 = require("@trpc/server");
const fetch_1 = require("@trpc/server/adapters/fetch");
const observable_1 = require("@trpc/server/observable");
const utils_1 = require("./utils");
function compile(schema) {
    const check = (0, elysia_1.getSchemaValidator)(schema);
    if (!check)
        throw new Error('Invalid schema');
    return (input) => {
        if (check.Check(input))
            return input;
        throw new TypeError('Invalid Input');
    };
}
exports.compile = compile;
elysia_1.Elysia.prototype.trpc = function (router, { endpoint = '/trpc', ...options } = {
    endpoint: '/trpc'
}) {
    let app = this.onParse(async (request) => {
        if ((0, elysia_1.getPath)(request.url).startsWith(endpoint))
            return true;
    }).all(`${endpoint}/*`, async (ctx) => (0, fetch_1.fetchRequestHandler)({
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
                    const result = await (0, server_1.callProcedure)({
                        procedures: router._def.procedures,
                        path: incoming.params.path,
                        rawInput: incoming.params.input,
                        type: incoming.method,
                        ctx: {}
                    });
                    if (incoming.method !== 'subscription')
                        return void ws.send(JSON.stringify((0, utils_1.transformTRPCResponse)(router, {
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
                    if (!(0, observable_1.isObservable)(result))
                        throw new server_1.TRPCError({
                            message: `Subscription ${incoming.params.path} did not return an observable`,
                            code: 'INTERNAL_SERVER_ERROR'
                        });
                    observer = result.subscribe({
                        next(data) {
                            ws.send(JSON.stringify((0, utils_1.transformTRPCResponse)(router, {
                                id: incoming.id,
                                jsonrpc: incoming.jsonrpc,
                                result: {
                                    type: 'data',
                                    data
                                }
                            })));
                        },
                        error(err) {
                            ws.send(JSON.stringify((0, utils_1.transformTRPCResponse)(router, {
                                id: incoming.id,
                                jsonrpc: incoming.jsonrpc,
                                error: router.getErrorShape({
                                    error: (0, utils_1.getTRPCErrorFromUnknown)(err),
                                    type: incoming.method,
                                    path: incoming.params.path,
                                    input: incoming.params.input,
                                    ctx: {}
                                })
                            })));
                        },
                        complete() {
                            ws.send(JSON.stringify((0, utils_1.transformTRPCResponse)(router, {
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
