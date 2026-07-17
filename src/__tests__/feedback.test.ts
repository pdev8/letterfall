import { hapticFor, shouldPlaySound, type FeedbackKind } from '../feedback';

describe('hapticFor', () => {
  it('maps each kind to its signal when haptics are on', () => {
    expect(hapticFor('tap', true)).toBe('selection');
    expect(hapticFor('play', true)).toBe('impact');
    expect(hapticFor('win', true)).toBe('success');
    expect(hapticFor('invalid', true)).toBe('warning');
  });

  it('returns null for every kind when haptics are off', () => {
    for (const kind of ['tap', 'play', 'win', 'invalid'] as FeedbackKind[]) {
      expect(hapticFor(kind, false)).toBeNull();
    }
  });
});

describe('shouldPlaySound', () => {
  it('follows the sound toggle', () => {
    expect(shouldPlaySound(true)).toBe(true);
    expect(shouldPlaySound(false)).toBe(false);
  });
});
