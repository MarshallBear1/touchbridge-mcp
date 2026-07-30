import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createNetServer } from 'node:net'
import { once } from 'node:events'
import { buildViewerUrl, createViewerServer, VIEWER_HOST } from '../dist/viewer/server.js'

async function close(server) {
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}

test('viewer retries occupied ports without leaking listeners and binds only to loopback', async (t) => {
  const occupied = createNetServer()
  occupied.listen(0, VIEWER_HOST)
  await once(occupied, 'listening')
  t.after(async () => close(occupied))

  const occupiedAddress = occupied.address()
  assert.ok(occupiedAddress && typeof occupiedAddress === 'object')

  const viewer = createViewerServer()
  t.after(async () => {
    if (viewer.server.listening) {
      viewer.server.close()
      await once(viewer.server, 'close')
    }
  })

  const selectedPort = await viewer.start(occupiedAddress.port)
  assert.ok(selectedPort > occupiedAddress.port)
  const viewerAddress = viewer.server.address()
  assert.ok(viewerAddress && typeof viewerAddress === 'object')
  assert.equal(viewerAddress.address, VIEWER_HOST)
  assert.equal(viewer.server.listenerCount('error'), 0)
  assert.equal(buildViewerUrl(selectedPort, 'device id'), `http://${VIEWER_HOST}:${selectedPort}?udid=device%20id`)
})
