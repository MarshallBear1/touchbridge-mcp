import os from 'node:os'
import path from 'node:path'

export const PRODUCT_NAME = 'TouchBridge'
export const MCP_SERVER_NAME = 'touchbridge-ios'
export const PACKAGE_NAME = 'touchbridge-mcp'
export const DEFAULT_INSTALL_SPEC = 'github:MarshallBear1/touchbridge-mcp'
export const CLI_NAME = 'touchbridge'
export const CONFIG_KEY = 'touchbridge-ios'
export const STATE_DIRECTORY_NAME = '.touchbridge'
export const CAPTURE_MANIFEST_SCHEMA = 'dev.touchbridge.design-snapshot.capture-manifest'
export const CAPTURE_UI_SCHEMA = 'dev.touchbridge.design-snapshot.capture-ui'
export const EDITOR_LAYER_MAP_SCHEMA = 'dev.touchbridge.design-snapshot.editor-layer-map'
export const WDA_REPOSITORY_URL = 'https://github.com/appium/WebDriverAgent.git'
export const WDA_VERSION = 'v16.8.0'

export function stateRoot(): string {
  return path.join(os.homedir(), STATE_DIRECTORY_NAME)
}

export function capturesRoot(): string {
  return path.join(stateRoot(), 'captures')
}
