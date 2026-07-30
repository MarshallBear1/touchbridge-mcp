import { readFileSync } from 'node:fs'

interface PackageMetadata {
  version?: unknown
}

export function readPackageVersion(packageUrl = new URL('../package.json', import.meta.url)): string {
  const metadata = JSON.parse(readFileSync(packageUrl, 'utf8')) as PackageMetadata
  if (typeof metadata.version !== 'string' || metadata.version.trim() === '') {
    throw new Error('package.json contains no valid version')
  }
  return metadata.version
}

export const PACKAGE_VERSION = readPackageVersion()
