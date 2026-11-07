import { describe, it, expect } from 'vitest';
import { parseDictionaryDefinition } from './dictionaryFormatter';

describe('dictionaryFormatter', () => {
  it('parses Wiktionary-style definitions with bracketed parts of speech', () => {
    const raw = `[CONJUNCTION] 1. Introduces a simple indirect question (with no correlative).; 2. Indicates doubt between possibilities (usually with correlative or).; 3. Introduces a disjunctive adverbial clause qualifying the main clause (with correlative or).
[DETERMINER] 1. Which of two.
[PRONOUN] 1. Which of two.`;

    const sections = parseDictionaryDefinition(raw);
    expect(sections).toHaveLength(3);

    expect(sections[0].partOfSpeech).toBe('conjunction');
    expect(sections[0].senses).toHaveLength(3);
    expect(sections[0].senses[0]).toBe('Introduces a simple indirect question (with no correlative).');
    expect(sections[0].senses[1]).toBe('Indicates doubt between possibilities (usually with correlative or).');
    expect(sections[0].senses[2]).toBe('Introduces a disjunctive adverbial clause qualifying the main clause (with correlative or).');

    expect(sections[1].partOfSpeech).toBe('determiner');
    expect(sections[1].senses).toEqual(['Which of two.']);

    expect(sections[2].partOfSpeech).toBe('pronoun');
    expect(sections[2].senses).toEqual(['Which of two.']);
  });

  it('parses parenthesized parts of speech', () => {
    const raw = `(noun) A vehicle with four wheels.
(verb) 1. To convey in a motor car.; 2. To drive.`;

    const sections = parseDictionaryDefinition(raw);
    expect(sections).toHaveLength(2);
    expect(sections[0].partOfSpeech).toBe('noun');
    expect(sections[0].senses).toEqual(['A vehicle with four wheels.']);
    expect(sections[1].partOfSpeech).toBe('verb');
    expect(sections[1].senses).toHaveLength(2);
  });

  it('parses simple numbered definitions without parts of speech', () => {
    const raw = '1. First sense of the word.; 2. Second sense of the word.';
    const sections = parseDictionaryDefinition(raw);
    expect(sections).toHaveLength(1);
    expect(sections[0].partOfSpeech).toBeUndefined();
    expect(sections[0].senses).toEqual(['First sense of the word.', 'Second sense of the word.']);
  });

  it('handles plain text definitions gracefully', () => {
    const raw = 'An act of speaking ones thoughts aloud when alone.';
    const sections = parseDictionaryDefinition(raw);
    expect(sections).toHaveLength(1);
    expect(sections[0].senses).toEqual(['An act of speaking ones thoughts aloud when alone.']);
  });
});
