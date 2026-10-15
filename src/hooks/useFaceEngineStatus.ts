import { useSyncExternalStore } from 'react'
import { faceEngineStatus, subscribeFaceEngine, type FaceEngineStatus } from '@/lib/face'

/** The face engine's loading stage (see `loadFaceApi`), re-rendering when it changes. */
export function useFaceEngineStatus(): FaceEngineStatus {
  return useSyncExternalStore(subscribeFaceEngine, faceEngineStatus, faceEngineStatus)
}
