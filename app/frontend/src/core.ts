// Rust-core bridge: typed wrappers over the Tauri commands plus the event
// subscriptions (server frames + backend heartbeats). All protocol decisions
// live in the Rust core; this file only carries data.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { BackendStatus, Frame } from './types'

export const rpc = (method: string, payload?: unknown): Promise<unknown> =>
  invoke('rpc_call', { method, payload: payload ?? null })

export const respond = (rpcId: string, value: unknown): Promise<{ accepted: boolean; reason?: string }> =>
  invoke('respond', { rpcId, value })

export const backendStatus = (): Promise<BackendStatus> => invoke('backend_status')

export const startBackend = (): Promise<BackendStatus> => invoke('start_backend')

export const stopBackend = (): Promise<BackendStatus> => invoke('stop_backend')

export const closeApp = (): Promise<void> => invoke('close_app')

export const onFrame = (handler: (frame: Frame) => void): Promise<UnlistenFn> =>
  listen<Frame>('frame', (event) => handler(event.payload))

export const onBackendStatus = (handler: (status: BackendStatus) => void): Promise<UnlistenFn> =>
  listen<BackendStatus>('backend-status', (event) => handler(event.payload))
