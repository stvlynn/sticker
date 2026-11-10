#!/usr/bin/env node
/**
 * Lynn sticker MCP server over stdio.
 *
 * Protocol: newline-delimited JSON-RPC 2.0 (MCP stdio transport). stdout carries
 * protocol frames only; diagnostics go to stderr.
 */
import { handleMcpMessage } from './protocol.mjs'

let buffer = ''
let closed = false

function send(message) {
  if (closed) return
  try {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  } catch (error) {
    process.stderr.write(`lynn-sticker mcp: write failed: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

function handleLine(line) {
  const trimmed = line.trim()
  if (trimmed === '') return
  let message
  try {
    message = JSON.parse(trimmed)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  try {
    const response = handleMcpMessage(message)
    if (response !== null) send(response)
  } catch (error) {
    process.stderr.write(`lynn-sticker mcp: handler error: ${error instanceof Error ? error.message : String(error)}\n`)
    send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32603, message: 'Internal error' } })
  }
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk
  let newline = buffer.indexOf('\n')
  while (newline !== -1) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    handleLine(line)
    newline = buffer.indexOf('\n')
  }
})
process.stdin.on('end', () => {
  if (buffer.trim() !== '') handleLine(buffer)
  buffer = ''
  closed = true
})
process.stdin.on('error', error => {
  process.stderr.write(`lynn-sticker mcp: stdin error: ${error.message}\n`)
})
process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
process.stderr.write('lynn-sticker mcp: stdio server ready\n')
