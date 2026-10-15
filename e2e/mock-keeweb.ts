import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';

/**
 * A stand-in for the KeeWeb web app and for ordinary sites with a login form.
 *
 * The page side of the kwConnect protocol mirrors keeweb/keeweb
 * app/scripts/comp/extension/{browser-extension-connector,protocol-impl}.js:
 *  - same-origin window.postMessage, `kwConnect: 'request' | 'response'`
 *  - one request is processed at a time (pendingBrowserMessages queue)
 *  - `ping` answers `{ data }` without an action, errors are `{ action, error, errorCode }`
 *  - change-public-keys creates a fresh key pair and drops other clients (web: one client)
 *  - get-* requests are NaCl box encrypted and answer with an incremented nonce
 *  - the message listener is registered late (the real app does it inside postInit's
 *    setTimeout), which is simulated with a configurable startup delay
 *
 * Only tweetnacl (also what the extension uses) is served to the page.
 */

const NACL_PATH = path.resolve(__dirname, '..', 'node_modules', 'tweetnacl', 'nacl-fast.js');

export const VAULT = {
    login: 'alice@example.test',
    password: 'correct-horse-battery',
    totp: '482913',
    other: 'other-field-value'
};

export interface LoggedRequest {
    action: string;
    /** server time of the report, ms since epoch */
    at: number;
    /** document load counter (1-based) the request was handled in */
    load: number;
}

export interface MockOptions {
    /** how long after document load the KeeWeb page starts listening for requests */
    startupDelayMillis: number;
    /** how long the KeeWeb document is held back before the server answers (tab "loading") */
    documentDelayMillis: number;
}

/** Runs inside the KeeWeb page. Plain ES2020 JavaScript, no transpilation. */
function keeWebPageScript(): string {
    return `
(function () {
    var DELAY = __DELAY__;
    var LOAD = __LOAD__;
    var VAULT = __VAULT__;
    var nacl = self.nacl;
    var clients = new Map();
    var pending = [];
    var processing = false;

    function b64d(s) {
        var bin = atob(s);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function b64e(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }
    function incrementNonce(nonce) {
        var c = 1;
        for (var i = 0; i < nonce.length; i++) {
            c += nonce[i];
            nonce[i] = c;
            c >>= 8;
        }
    }
    function report(action) {
        try {
            fetch('/__kw/log?action=' + encodeURIComponent(action) + '&load=' + LOAD, {
                keepalive: true
            });
        } catch (e) {}
    }
    function getClient(request) {
        if (!request.clientID) throw new Error('Empty clientID');
        var client = clients.get(request.clientID);
        if (!client) throw new Error('Client not connected: ' + request.clientID);
        return client;
    }
    function decryptRequest(request) {
        var client = getClient(request);
        var data = nacl.box.open(
            b64d(request.message),
            b64d(request.nonce),
            client.publicKey,
            client.keys.secretKey
        );
        if (!data) throw new Error('Failed to decrypt data');
        var payload = JSON.parse(new TextDecoder().decode(data));
        if (payload.action !== request.action) throw new Error('Bad action in decrypted payload');
        return payload;
    }
    function encryptResponse(request, payload) {
        var nonce = b64d(request.nonce);
        incrementNonce(nonce);
        var client = getClient(request);
        payload.nonce = b64e(nonce);
        var data = new TextEncoder().encode(JSON.stringify(payload));
        var encrypted = nacl.box(data, nonce, client.publicKey, client.keys.secretKey);
        return { action: request.action, message: b64e(encrypted), nonce: b64e(nonce) };
    }

    var handlers = {
        ping: function (request) {
            return { data: request.data };
        },
        'change-public-keys': function (request) {
            if (clients.has(request.clientID)) throw new Error('Changing keys is not allowed');
            clients.clear(); // on web there can be only one connected client
            var keys = nacl.box.keyPair();
            clients.set(request.clientID, {
                publicKey: b64d(request.publicKey),
                keys: keys
            });
            var nonce = b64d(request.nonce);
            incrementNonce(nonce);
            return {
                action: 'change-public-keys',
                version: '1.0.0-mock',
                publicKey: b64e(keys.publicKey),
                nonce: b64e(nonce),
                success: 'true',
                appName: 'KeeWeb'
            };
        },
        'get-databasehash': function (request) {
            decryptRequest(request);
            return encryptResponse(request, { success: 'true', hash: 'mock-hash' });
        },
        'get-logins': function (request) {
            var payload = decryptRequest(request);
            if (!payload.url) throw new Error('Empty url');
            return encryptResponse(request, {
                success: 'true',
                version: '1.0.0-mock',
                hash: 'mock-hash',
                count: 1,
                entries: [
                    {
                        group: 'Mock',
                        login: VAULT.login,
                        name: 'Mock entry',
                        password: VAULT.password,
                        skipAutoSubmit: 'false',
                        stringFields: [],
                        uuid: '00000000000000000000000000000001'
                    }
                ],
                id: ''
            });
        },
        'get-totp-by-url': function (request) {
            decryptRequest(request);
            return encryptResponse(request, { success: 'true', totp: VAULT.totp });
        },
        'get-any-field': function (request) {
            decryptRequest(request);
            return encryptResponse(request, {
                success: 'true',
                field: 'Other',
                value: VAULT.other
            });
        }
    };

    function errorToResponse(e, request) {
        return {
            action: request && request.action,
            error: e.message || 'Unknown error',
            errorCode: e.code || 0
        };
    }

    async function handleRequest(request) {
        try {
            var handler = handlers[request.action];
            if (!handler) throw new Error('Handler not found: ' + request.action);
            var result = await handler(request);
            if (!result) throw new Error('Handler returned an empty result: ' + request.action);
            return result;
        } catch (e) {
            return errorToResponse(e, request);
        }
    }

    async function processMessages() {
        if (!pending.length || processing) return;
        processing = true;
        var request = pending.shift();
        report(request.action);
        var response = await handleRequest(request);
        processing = false;
        if (response) {
            response.kwConnect = 'response';
            window.postMessage(response, window.location.origin);
        }
        processMessages();
    }

    function onMessage(e) {
        if (e.origin !== location.origin) return;
        if (e.source !== window) return;
        if (!e.data || e.data.kwConnect !== 'request') return;
        pending.push(e.data);
        processMessages();
    }

    window.__kw = { listening: false, load: LOAD };
    setTimeout(function () {
        window.addEventListener('message', onMessage);
        window.__kw.listening = true;
    }, DELAY);
})();
`;
}

const LOGIN_FORM = `
<form id="login" action="#" autocomplete="off">
    <input id="user" name="user" type="text" aria-label="Username" />
    <input id="pass" name="pass" type="password" aria-label="Password" />
    <input id="other" name="other" type="text" aria-label="Other" />
    <button id="go" type="submit">Sign in</button>
</form>
<script>
    window.__submits = [];
    document.getElementById('login').addEventListener('submit', function (e) {
        e.preventDefault();
        window.__submits.push({
            user: document.getElementById('user').value,
            pass: document.getElementById('pass').value
        });
    });
</script>`;

export class MockKeeWeb {
    private readonly _servers: http.Server[] = [];
    private readonly _ports: number[] = [];
    private _loads = 0;
    private _requests: LoggedRequest[] = [];
    options: MockOptions = { startupDelayMillis: 0, documentDelayMillis: 0 };

    /** Starts two listeners on distinct ports; hostnames (127.0.0.1 / localhost) split the sites. */
    async start(): Promise<void> {
        for (let i = 0; i < 2; i++) {
            const server = http.createServer((req, res) => this.handle(req, res));
            await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
            this._servers.push(server);
            this._ports.push((server.address() as AddressInfo).port);
        }
    }

    async stop(): Promise<void> {
        await Promise.all(
            this._servers.map(
                (s) =>
                    new Promise<void>((resolve) => {
                        s.closeAllConnections();
                        s.close(() => resolve());
                    })
            )
        );
    }

    /** The KeeWeb origin; what the extension is told to connect to. */
    get keeWebOrigin(): string {
        return `http://127.0.0.1:${this._ports[0]}`;
    }

    get keeWebUrl(): string {
        return `${this.keeWebOrigin}/`;
    }

    /** Another origin and another site (localhost): a login page, not KeeWeb. */
    get siteOrigin(): string {
        return `http://localhost:${this._ports[0]}`;
    }

    /** A third origin on a different site and port: cross-origin iframe content. */
    get crossOrigin(): string {
        return `http://127.0.0.1:${this._ports[1]}`;
    }

    get requests(): readonly LoggedRequest[] {
        return this._requests;
    }

    /** number of full KeeWeb document loads served so far */
    get pageLoads(): number {
        return this._loads;
    }

    reset(): void {
        this._loads = 0;
        this._requests = [];
        this.options.startupDelayMillis = 0;
        this.options.documentDelayMillis = 0;
    }

    count(action: string): number {
        return this._requests.filter((r) => r.action === action).length;
    }

    private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = new URL(req.url ?? '/', 'http://mock.invalid');
        const send = (body: string, type = 'text/html; charset=utf-8', status = 200) => {
            res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
            res.end(body);
        };
        const port = (req.socket.localPort ?? 0).toString();
        const isKeeWebPort = port === this._ports[0].toString();
        const host = (req.headers.host ?? '').split(':')[0];

        switch (url.pathname) {
            case '/nacl.js':
                res.writeHead(200, { 'content-type': 'text/javascript' });
                res.end(fs.readFileSync(NACL_PATH));
                return;
            case '/__kw/log':
                this._requests.push({
                    action: url.searchParams.get('action') ?? '',
                    at: Date.now(),
                    load: Number(url.searchParams.get('load'))
                });
                send('ok', 'text/plain');
                return;
            case '/favicon.ico':
                send('', 'text/plain', 404);
                return;
            case '/login':
                send(`<!doctype html><title>Login</title>${LOGIN_FORM}`);
                return;
            case '/frame-same':
                send(
                    `<!doctype html><title>Same-origin frame</title>
                     <iframe id="child" src="/login" width="400" height="200"></iframe>`
                );
                return;
            case '/frame-cross':
                send(
                    `<!doctype html><title>Cross-origin frame</title>
                     <iframe id="child" src="${this.crossOrigin}/login" width="400" height="200">
                     </iframe>`
                );
                return;
        }

        if (isKeeWebPort && host === '127.0.0.1' && url.pathname === '/') {
            const hold = this.options.documentDelayMillis;
            if (hold > 0) {
                setTimeout(() => send(this.keeWebHtml()), hold);
            } else {
                send(this.keeWebHtml());
            }
            return;
        }
        send('not found', 'text/plain', 404);
    }

    private keeWebHtml(): string {
        this._loads++;
        const script = keeWebPageScript()
            .replace('__DELAY__', String(this.options.startupDelayMillis))
            .replace('__LOAD__', String(this._loads))
            .replace('__VAULT__', JSON.stringify(VAULT));
        return `<!doctype html>
<html><head><meta charset="utf-8"><title>KeeWeb (mock)</title></head>
<body><h1>KeeWeb mock</h1>
<script src="/nacl.js"></script>
<script>${script}</script>
</body></html>`;
    }
}
