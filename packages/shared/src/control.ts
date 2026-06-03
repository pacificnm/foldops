export const CONTROL_ACTIONS = [
  "agent.start",
  "agent.stop",
  "agent.restart",
  "fah.start",
  "fah.stop",
  "fah.restart",
  "fah.pause",
  "fah.resume",
  "fah.finish",
  "host.reboot",
] as const;

export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export function isControlAction(value: string): value is ControlAction {
  return (CONTROL_ACTIONS as readonly string[]).includes(value);
}
