// WebSocket polyfill for @supabase/supabase-js on Node < 22 (no global WebSocket).
// Uses Node's built-in undici WebSocket so it needs no extra dependency.
// Preload with:  node --import ./scripts/_wspreload.mjs <script>
import { WebSocket } from 'undici';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;
