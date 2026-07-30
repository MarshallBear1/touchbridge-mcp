import express from 'express'
import { createServer, type Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { log } from '../logger.js'
import { WDAClient } from '../wda/wda-client.js'
import { getDeviceClient } from '../device-client.js'

const VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TouchBridge Live View</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body {
    min-height: 100vh;
    overflow: hidden;
    color: #f8fafc;
    background:
      radial-gradient(circle at 18% 12%, rgba(124, 58, 237, .28), transparent 34%),
      radial-gradient(circle at 82% 84%, rgba(6, 182, 212, .22), transparent 38%),
      #070a13;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: .18;
    background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
    background-size: 32px 32px;
    mask-image: linear-gradient(to bottom, black, transparent);
  }
  .app-shell { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; padding: 22px 28px 18px; }
  .brand { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
  .brand-lockup { display: flex; align-items: center; gap: 11px; }
  .brand-mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: linear-gradient(135deg, #7c3aed, #2563eb 55%, #06b6d4);
    box-shadow: 0 10px 30px rgba(37, 99, 235, .3), inset 0 1px 0 rgba(255,255,255,.35);
    font-weight: 800;
  }
  .brand-copy strong { display: block; font-size: 14px; letter-spacing: .01em; }
  .brand-copy span { display: block; margin-top: 2px; color: #94a3b8; font-size: 11px; }
  .privacy { color: #94a3b8; font-size: 11px; display: flex; align-items: center; gap: 7px; }
  .privacy::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 14px #34d399; }
  .stage { display: flex; justify-content: center; align-items: center; min-height: 0; padding: 18px 0; }
  .device-frame {
    background: linear-gradient(150deg, #282b34, #0d0f14 58%, #272936);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 48px;
    padding: 14px;
    box-shadow: 0 36px 100px rgba(0,0,0,.62), 0 0 0 1px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.18);
  }
  .screen-container {
    background: #000;
    border-radius: 35px;
    overflow: hidden;
    position: relative;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .status {
    justify-self: center;
    color: #cbd5e1;
    font-size: 11px;
    line-height: 26px;
    min-width: 100px;
    text-align: center;
    padding: 0 12px;
    border: 1px solid rgba(148,163,184,.2);
    border-radius: 999px;
    background: rgba(15,23,42,.64);
    backdrop-filter: blur(18px);
  }
  .no-device {
    color: #94a3b8;
    text-align: center;
    padding: 48px;
    border: 1px dashed rgba(148,163,184,.3);
    border-radius: 24px;
    background: rgba(15,23,42,.46);
    font-size: 14px;
  }
</style>
</head>
<body>
<div class="app-shell">
  <header class="brand">
    <div class="brand-lockup">
      <div class="brand-mark">T</div>
      <div class="brand-copy"><strong>TouchBridge</strong><span>Local iOS control surface</span></div>
    </div>
    <div class="privacy">Loopback only</div>
  </header>
  <main class="stage" id="root">
    <div class="no-device" id="no-device">Connecting to device…</div>
  </main>
  <div class="status" id="status">Starting</div>
</div>
<script>
  const params = new URLSearchParams(location.search);
  const udid = params.get('udid');
  if (!udid) {
    document.getElementById('no-device').textContent = 'No device UDID specified. Use ?udid=DEVICE_UDID';
  } else {
    const root = document.getElementById('root');
    root.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = 'device-frame';
    const container = document.createElement('div');
    container.className = 'screen-container';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    frame.appendChild(container);
    root.appendChild(frame);

    const ctx = canvas.getContext('2d');
    const status = document.getElementById('status');
    let frameCount = 0;
    let lastFpsTime = Date.now();

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(wsProto + '//' + location.host + '/stream/' + encodeURIComponent(udid));
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => { status.textContent = 'Connected'; };
    ws.onclose = () => { status.textContent = 'Disconnected'; };
    ws.onerror = () => { status.textContent = 'Connection error'; };

    ws.onmessage = (event) => {
      const blob = new Blob([event.data], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width;
          canvas.height = img.height;
          const aspect = img.width / img.height;
          const maxH = window.innerHeight - 150;
          const h = Math.min(maxH, 800);
          container.style.width = Math.round(h * aspect) + 'px';
          container.style.height = h + 'px';
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        frameCount++;
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
          status.textContent = frameCount + ' fps';
          frameCount = 0;
          lastFpsTime = now;
        }
      };
      img.src = url;
    };
  }
</script>
</body>
</html>`

interface DeviceStreamRelay {
  clients: Set<WebSocket>
  intervalId: ReturnType<typeof setInterval>
}

const activeRelays = new Map<string, DeviceStreamRelay>()
const MAX_CONSECUTIVE_FAILURES = 10
const MAX_PORT_ATTEMPTS = 51

export const VIEWER_HOST = '127.0.0.1'

export function buildViewerUrl(port: number, udid?: string): string {
  const base = `http://${VIEWER_HOST}:${port}`
  return udid ? `${base}?udid=${encodeURIComponent(udid)}` : base
}

function startRelay(udid: string, client: WDAClient, ws: WebSocket): void {
  const existing = activeRelays.get(udid)
  if (existing) {
    existing.clients.add(ws)
    log('ViewerRelay', 'log', `Client joined relay for ${udid} (${existing.clients.size} clients)`)
    return
  }

  const clients = new Set<WebSocket>([ws])
  let pending = false
  let consecutiveFailures = 0

  const intervalId = setInterval(async () => {
    if (pending || clients.size === 0) return
    pending = true
    try {
      const pngBuffer = await client.screenshot()
      consecutiveFailures = 0
      for (const c of clients) {
        if (c.readyState === WebSocket.OPEN && c.bufferedAmount < pngBuffer.length * 2) {
          c.send(pngBuffer)
        }
      }
    } catch (e) {
      consecutiveFailures++
      if (consecutiveFailures <= 3 || consecutiveFailures === MAX_CONSECUTIVE_FAILURES) {
        log('ViewerRelay', 'warn', `Screenshot poll failed for ${udid} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${e}`)
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log('ViewerRelay', 'warn', `Stopping relay for ${udid} after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`)
        for (const c of clients) c.close(1011, 'WDA session lost')
        clearInterval(intervalId)
        activeRelays.delete(udid)
      }
    } finally {
      pending = false
    }
  }, 50)

  activeRelays.set(udid, { clients, intervalId })
  log('ViewerRelay', 'log', `Started relay for ${udid}`)
}

function removeClientFromRelay(udid: string, ws: WebSocket): void {
  const relay = activeRelays.get(udid)
  if (!relay) return
  relay.clients.delete(ws)
  if (relay.clients.size === 0) {
    clearInterval(relay.intervalId)
    activeRelays.delete(udid)
    log('ViewerRelay', 'log', `Stopped relay for ${udid} (no clients)`)
  }
}

function listenOnPort(httpServer: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      httpServer.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      httpServer.off('error', onError)
      const address = httpServer.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    }

    httpServer.once('error', onError)
    httpServer.once('listening', onListening)
    httpServer.listen(port, VIEWER_HOST)
  })
}

export function createViewerServer(): { server: Server; start: (port: number) => Promise<number> } {
  const app = express()

  app.get('/', (_req, res) => {
    res.type('html').send(VIEWER_HTML)
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  const httpServer = createServer(app)
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const rawUrl = req.url ?? ''
    let pathname = ''
    try {
      pathname = new URL(rawUrl, 'http://localhost').pathname
    } catch {
      socket.destroy()
      return
    }

    const match = pathname.match(/^\/stream\/([^/]+)$/)
    if (!match) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, match[1])
    })
  })

  wss.on('connection', (ws: WebSocket, _req: unknown, udid: string) => {
    let decodedUdid: string
    try {
      decodedUdid = decodeURIComponent(udid)
    } catch {
      ws.close(1008, 'Invalid device identifier')
      return
    }
    log('ViewerRelay', 'log', `WS connected for device ${decodedUdid}`)

    void (async () => {
      try {
        const client = await getDeviceClient(decodedUdid) as WDAClient
        startRelay(decodedUdid, client, ws)

        ws.on('close', () => removeClientFromRelay(decodedUdid, ws))
        ws.on('error', () => removeClientFromRelay(decodedUdid, ws))
      } catch (e) {
        log('ViewerRelay', 'error', `Failed to start relay for ${decodedUdid}: ${e}`)
        ws.close(1011, 'Failed to connect to device')
      }
    })()
  })

  const start = async (port: number): Promise<number> => {
    let lastError: NodeJS.ErrnoException | null = null
    for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
      try {
        const boundPort = await listenOnPort(httpServer, port + offset)
        log('Viewer', 'log', `Viewer server listening on ${buildViewerUrl(boundPort)}`)
        return boundPort
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code !== 'EADDRINUSE') throw error
        lastError = nodeError
      }
    }
    throw lastError ?? new Error(`No viewer port available from ${port} through ${port + MAX_PORT_ATTEMPTS - 1}`)
  }

  return { server: httpServer, start }
}
