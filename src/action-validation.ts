import { z } from 'zod'

export const MAX_BATCH_ACTIONS = 100
export const MAX_INPUT_CHARACTERS = 10_000
export const MAX_KEY_SEQUENCE_ITEMS = 256
export const MAX_DESCRIBE_DELAY_MS = 10_000

const coordinateSchema = z.number().finite().min(0).max(100_000)
const durationSchema = z.number().finite().min(0).max(30)
const textKeySchema = z.string().min(1).max(1_024)
const hidKeySchema = z.number().int().min(0).max(65_535)

export const tapParamsSchema = z.object({
  x: coordinateSchema.describe('X coordinate to tap'),
  y: coordinateSchema.describe('Y coordinate to tap'),
  duration: durationSchema.optional().describe('Tap duration in seconds (0-30)'),
}).strict()

export const swipeParamsSchema = z.object({
  fromX: coordinateSchema.describe('Starting X coordinate'),
  fromY: coordinateSchema.describe('Starting Y coordinate'),
  toX: coordinateSchema.describe('Ending X coordinate'),
  toY: coordinateSchema.describe('Ending Y coordinate'),
  duration: durationSchema.optional().describe('Swipe duration in seconds (0-30)'),
  delta: z.number().finite().positive().max(10_000).optional().describe('Pixels between touch points'),
}).strict()

export const buttonParamsSchema = z.object({
  button: z.enum(['HOME', 'LOCK', 'SIDE_BUTTON', 'APPLE_PAY', 'SIRI']).describe('Button to press'),
  duration: durationSchema.optional().describe('Press duration in seconds (0-30)'),
}).strict()

export const inputTextParamsSchema = z.object({
  text: z.string().max(MAX_INPUT_CHARACTERS).describe(`Text to type (maximum ${MAX_INPUT_CHARACTERS} characters)`),
}).strict()

export const keyParamsSchema = z.object({
  key: z.union([hidKeySchema, textKeySchema]).describe('HID keycode (number; simulator only) or text key (string)'),
  duration: durationSchema.optional().describe('Key press duration in seconds (0-30)'),
}).strict()

export const keySequenceParamsSchema = z.object({
  keySequence: z.array(z.union([hidKeySchema, textKeySchema]))
    .min(1)
    .max(MAX_KEY_SEQUENCE_ITEMS)
    .describe(`Sequence of 1-${MAX_KEY_SEQUENCE_ITEMS} HID keycodes (simulator only) or text keys`),
}).strict()

export const describeAfterSchema = z.object({
  point: z.object({ x: coordinateSchema, y: coordinateSchema }).strict().optional()
    .describe('Describe the element at this point after the action'),
  all: z.boolean().optional().describe('Describe all elements on screen after the action'),
  delay: z.number().int().min(0).max(MAX_DESCRIBE_DELAY_MS).optional()
    .describe(`Delay in milliseconds before capture (0-${MAX_DESCRIBE_DELAY_MS}; default 500)`),
}).strict().refine(value => value.all === true || value.point !== undefined, {
  message: 'describe_after requires either all: true or a point',
}).optional()

export const singleActionSchema = z.object({
  action: z.enum(['tap', 'swipe', 'button', 'input-text', 'key', 'key-sequence'])
    .describe('Type of action to perform'),
  params: z.record(z.string(), z.unknown()).describe('Action-specific parameters'),
}).strict()

export const actionBatchSchema = z.array(singleActionSchema)
  .min(1)
  .max(MAX_BATCH_ACTIONS)

export function summarizeKeyAction(key: number | string): string {
  if (typeof key === 'string') {
    return `Pressed text key (${[...key].length} character(s), value redacted)`
  }
  return `Pressed HID keycode ${key}`
}

export function summarizeKeySequence(keySequence: Array<number | string>): string {
  const textCharacters = keySequence.reduce<number>(
    (count, key) => count + (typeof key === 'string' ? [...key].length : 0),
    0,
  )
  const hidKeycodes = keySequence.filter(key => typeof key === 'number').length
  return `Pressed ${keySequence.length} key(s) (${textCharacters} text character(s) redacted, ${hidKeycodes} HID keycode(s))`
}
