export type TacticalView = '2d' | '3d';

export interface TacticalCameraBridge {
  current: { center: [number, number]; zoom: number; pitch: number; bearing: number } | null;
}

/** Same camera transition formerly owned by the overhead-view button. */
export function tacticalViewCamera(view: TacticalView) {
  return { pitch: view === '3d' ? 58 : 0, bearing: view === '3d' ? -18 : 0, duration: 650 };
}

/** Intentionally omit pitch, zoom and center: north alignment only rotates. */
export function northCamera() {
  return { bearing: 0, duration: 650 };
}
