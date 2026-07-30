import { getIDBClient } from './idb/idb-client.js'
import { WDAClient } from './wda/wda-client.js'
import { wdaManager } from './wda/wda-manager.js'
import { isPhysicalDeviceUdid, type DeviceClient } from './types.js'

export async function getDeviceClient(udid: string = 'booted'): Promise<DeviceClient> {
  if (isPhysicalDeviceUdid(udid)) {
    const existing = WDAClient.getExistingInstance(udid)
    if (existing) return existing

    const tunnelIP = await wdaManager.getTunnelAddress(udid)
    return WDAClient.getInstance(udid, 8100, tunnelIP)
  }
  return getIDBClient(udid)
}
