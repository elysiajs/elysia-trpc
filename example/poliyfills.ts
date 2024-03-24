import ws from 'ws'

// polyfill fetch & websocket
const globalAny = global as any
globalAny.WebSocket = ws.WebSocket
