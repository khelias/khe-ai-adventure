import { execFileSync } from 'node:child_process'
import { BUILD_DIR } from './paths'

export default function globalSetup(): void {
  execFileSync('npx', ['vite', 'build', '--outDir', BUILD_DIR, '--emptyOutDir'], { stdio: 'inherit' })
}
