import { resolve } from 'node:path'

/** The build the server reads per request, so a spec can deploy by writing into it. */
export const SERVED_DIR = resolve('test-results/offline-build/served')
/** The untouched build, restored before each spec. */
export const BUILD_DIR = resolve('test-results/offline-build/dist')
/** What config.js holds in these specs, as the web image writes it from API_SECRET. */
export const TEST_SECRET = 'offline-spec-secret'
