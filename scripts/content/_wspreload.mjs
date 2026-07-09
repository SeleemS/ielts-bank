// WebSocket polyfill for @supabase/supabase-js on Node < 22.
// The repo's scripts/_wspreload.mjs uses the `ws` package, which is not
// currently installed. supabase-js only needs a WebSocket *constructor* present
// at client construction (this importer is REST-only and never opens a socket),
// so we satisfy it with Node's built-in undici WebSocket.
import { WebSocket } from 'undici';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;
