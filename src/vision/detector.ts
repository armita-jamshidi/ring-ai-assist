import type { Scenario } from '../config.js'
import type { Frame } from '../ring/liveSession.js'

export interface Detection {
  scenarioId: string
  confidence: number
  evidence: string
}

export interface DetectionResult {
  observations: string
  detections: Detection[]
}

/** Anything that can look at recent frames and say which scenarios are happening. */
export interface Detector {
  analyze(frames: Frame[], scenarios: Scenario[], context: { cameraName: string }): Promise<DetectionResult>
}
