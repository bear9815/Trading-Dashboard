import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const nodeExec = process.execPath

function spawnTaggedProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, ...(options.env || {}) },
  })

  const prefix = `[${label}]`
  child.stdout.on('data', chunk => {
    process.stdout.write(`${prefix} ${chunk}`)
  })
  child.stderr.on('data', chunk => {
    process.stderr.write(`${prefix} ${chunk}`)
  })

  return child
}

const service = spawnTaggedProcess(
  'course-service',
  nodeExec,
  [path.join(workspaceRoot, 'scripts', 'local_course_service.mjs')],
  {
    env: {
      LOCAL_COURSE_SERVICE_PORT: process.env.LOCAL_COURSE_SERVICE_PORT || '4315',
    },
  }
)

const vite = spawnTaggedProcess(
  'vite',
  nodeExec,
  [path.join(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
)

let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  service.kill('SIGTERM')
  vite.kill('SIGTERM')

  setTimeout(() => {
    service.kill('SIGKILL')
    vite.kill('SIGKILL')
    process.exit(code)
  }, 1_500).unref()
}

service.on('exit', code => {
  if (!shuttingDown) shutdown(code ?? 1)
})

vite.on('exit', code => {
  if (!shuttingDown) shutdown(code ?? 1)
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
