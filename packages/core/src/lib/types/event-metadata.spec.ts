import { validateEventMetadata } from '../../index';

describe('validateEventMetadata', () => {
  it('returns correct structure for valid full metadata', () => {
    const result = validateEventMetadata({
      correlationId: 'abc',
      causationId: 'def',
      actor: 'ghi',
    });

    expect(result).toEqual({
      correlationId: 'abc',
      causationId: 'def',
      actor: 'ghi',
    });
  });

  it('returns metadata with undefined optional fields when only correlationId is provided', () => {
    const result = validateEventMetadata({ correlationId: 'abc' });

    expect(result.correlationId).toBe('abc');
    expect(result.causationId).toBeUndefined();
    expect(result.actor).toBeUndefined();
  });

  it('throws when input is null', () => {
    expect(() => validateEventMetadata(null)).toThrow();
  });

  it('throws when input is a string', () => {
    expect(() => validateEventMetadata('a string')).toThrow();
  });

  it('throws when correlationId is missing', () => {
    expect(() => validateEventMetadata({ causationId: 'def' })).toThrow(
      'correlationId'
    );
  });

  it('throws when correlationId is an empty string', () => {
    expect(() => validateEventMetadata({ correlationId: '' })).toThrow(
      'correlationId'
    );
  });

  it('throws when correlationId is not a string', () => {
    expect(() => validateEventMetadata({ correlationId: 123 })).toThrow(
      'correlationId'
    );
  });

  it('throws when causationId is present but not a string', () => {
    expect(() =>
      validateEventMetadata({ correlationId: 'abc', causationId: 42 })
    ).toThrow('causationId');
  });

  it('throws when actor is present but not a string', () => {
    expect(() =>
      validateEventMetadata({ correlationId: 'abc', actor: true })
    ).toThrow('actor');
  });
});
