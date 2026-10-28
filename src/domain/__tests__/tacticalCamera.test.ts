import { describe, expect, test } from 'bun:test';
import { northCamera, tacticalViewCamera } from '../../components/tacticalCamera';

describe('tactical map camera controls', () => {
  test('2D uses overhead pitch and 3D restores the previous tilted camera behavior', () => {
    expect(tacticalViewCamera('2d')).toEqual({pitch: 0, bearing: 0, duration: 650});
    expect(tacticalViewCamera('3d')).toEqual({pitch: 58, bearing: -18, duration: 650});
  });
  test('switching perspective preserves center and zoom', () => {
    for (const view of ['2d', '3d'] as const) {
      const camera = {center: [-80.72, -0.95], zoom: 14.2, ...tacticalViewCamera(view)};
      expect(camera.center).toEqual([-80.72,-0.95]);
      expect(camera.zoom).toBe(14.2);
    }
  });
  test('north alignment changes only bearing in both perspectives', () => {
    expect(northCamera()).toEqual({bearing:0,duration:650});
    for (const pitch of [0,28,58]) {
      const camera = {center: [-80.72,-0.95], zoom:14.2, pitch, ...northCamera()};
      expect(camera.pitch).toBe(pitch);
      expect(camera.center).toEqual([-80.72,-0.95]);
      expect(camera.zoom).toBe(14.2);
    }
  });
});
