import type { Tone } from '../config.js'

/** Turns a line of text into an audio file on disk, spoken in the given tone. */
export interface TextToSpeech {
  synthesize(text: string, tone: Tone): Promise<string>
}
