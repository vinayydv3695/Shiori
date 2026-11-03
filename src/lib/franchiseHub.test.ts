import { describe, it, expect } from 'vitest';
import { cleanFranchiseTitle, isFranchiseMatch } from './franchiseHub';

describe('franchiseHub', () => {
  describe('cleanFranchiseTitle', () => {
    it('strips format tags such as (Light Novel), [LN], (Manga)', () => {
      expect(cleanFranchiseTitle('Re:ZERO -Starting Life in Another World- (Light Novel)')).toBe(
        'Re:ZERO -Starting Life in Another World'
      );
      expect(cleanFranchiseTitle('Solo Leveling (Novel)')).toBe('Solo Leveling');
      expect(cleanFranchiseTitle('Overlord [LN]')).toBe('Overlord');
      expect(cleanFranchiseTitle('Mushoku Tensei (Manga)')).toBe('Mushoku Tensei');
      expect(cleanFranchiseTitle('Omniscient Reader [Web Novel]')).toBe('Omniscient Reader');
    });

    it('strips volume and chapter indicators and subtitles', () => {
      expect(cleanFranchiseTitle('Solo Leveling, Vol. 04')).toBe('Solo Leveling');
      expect(cleanFranchiseTitle('Solo Leveling - Chapter 179')).toBe('Solo Leveling');
      expect(cleanFranchiseTitle('Frieren: Beyond Journey’s End, Volume 1')).toBe(
        'Frieren: Beyond Journey’s End'
      );
      expect(cleanFranchiseTitle('Overlord, Vol. 1: The Undead King')).toBe('Overlord');
      expect(cleanFranchiseTitle('Sword Art Online 01: Aincrad')).toBe('Sword Art Online');
    });

    it('preserves clean base titles', () => {
      expect(cleanFranchiseTitle('Sousou no Frieren')).toBe('Sousou no Frieren');
      expect(cleanFranchiseTitle('Chainsaw Man')).toBe('Chainsaw Man');
      expect(cleanFranchiseTitle('Jujutsu Kaisen')).toBe('Jujutsu Kaisen');
    });
  });

  describe('isFranchiseMatch', () => {
    it('matches candidate books with variations in title or series', () => {
      expect(isFranchiseMatch('Solo Leveling', 'Solo Leveling, Vol. 1', 'Solo Leveling')).toBe(true);
      expect(isFranchiseMatch('Solo Leveling', 'Solo Leveling (Novel) Vol. 2', undefined)).toBe(true);
      expect(
        isFranchiseMatch(
          'Re:ZERO -Starting Life in Another World-',
          'Re:ZERO -Starting Life in Another World- (Light Novel) Vol 1',
          'Re:ZERO'
        )
      ).toBe(true);
    });

    it('rejects unrelated series', () => {
      expect(isFranchiseMatch('Solo Leveling', 'Bleach Vol. 1', 'Bleach')).toBe(false);
      expect(isFranchiseMatch('Frieren', 'Naruto Shippuden', 'Naruto')).toBe(false);
    });
  });
});
