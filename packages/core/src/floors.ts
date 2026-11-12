import type { FeedSnapshot, FloorSummary, TerminalSummary } from './models.ts';

export const GROUND_FLOOR_KEY = 'ground';

export interface FloorGroup {
  key: string;
  floor: FloorSummary;
  isCurrent: boolean;
  terminals: TerminalSummary[];
}

export function floorKey(floorId: string | undefined): string {
  return floorId === undefined || floorId === '' ? GROUND_FLOOR_KEY : floorId;
}

export function currentFloorKey(snapshot: FeedSnapshot, preferredFloorId?: string): string | undefined {
  if (preferredFloorId !== undefined) {
    const preferred = floorKey(preferredFloorId);
    if (snapshot.floors.some((floor) => floorKey(floor.id) === preferred)) {
      return preferred;
    }
  }
  const active = snapshot.floors.find((floor) => floor.isActive) ?? snapshot.floors[0];
  return active === undefined ? undefined : floorKey(active.id);
}

export function groupTerminalsByFloor(
  snapshot: FeedSnapshot,
  preferredFloorId?: string,
): FloorGroup[] {
  const currentKey = currentFloorKey(snapshot, preferredFloorId);
  const groups = snapshot.floors.map(
    (floor): FloorGroup => ({
      key: floorKey(floor.id),
      floor,
      isCurrent: floorKey(floor.id) === currentKey,
      terminals: [],
    }),
  );

  const byKey = new Map(groups.map((group) => [group.key, group]));
  const current = currentKey === undefined ? undefined : byKey.get(currentKey);
  const orphans: TerminalSummary[] = [];

  for (const terminal of snapshot.terminals) {
    const group = byKey.get(floorKey(terminal.floorId));
    if (group === undefined) {
      orphans.push(terminal);
    } else {
      group.terminals.push(terminal);
    }
  }

  if (current === undefined) {
    return orphans.length === 0
      ? []
      : [
          {
            key: GROUND_FLOOR_KEY,
            floor: { name: 'Térreo', isActive: true },
            isCurrent: true,
            terminals: orphans,
          },
        ];
  }

  current.terminals.push(...orphans);
  const others = groups.filter((group) => group !== current && group.terminals.length > 0);
  return [current, ...others];
}
