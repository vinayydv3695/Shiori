import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

describe('Select Component', () => {
  it('renders trigger with value and opens options on interaction', () => {
    const handleValueChange = vi.fn();

    render(
      <Select value="books" onValueChange={handleValueChange}>
        <SelectTrigger className="w-[200px]" data-testid="select-trigger">
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent data-testid="select-content">
          <SelectItem value="both">Both Books & Manga</SelectItem>
          <SelectItem value="books">Only Books</SelectItem>
          <SelectItem value="manga">Only Manga & Comics</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Only Books');

    // Open the dropdown via keyboard (Space/Enter/ArrowDown) or pointerDown
    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });

    const content = screen.getByTestId('select-content');
    expect(content).toBeInTheDocument();

    // Verify z-index is 9999 to guarantee dropdown is above modal dialogs (z-900/1001)
    expect(content.className).toContain('z-[9999]');

    // Verify Viewport does NOT restrict height to single trigger height
    const viewport = content.querySelector('[data-radix-select-viewport]');
    expect(viewport).toBeInTheDocument();
    expect(viewport?.className).not.toContain('h-[var(--radix-select-trigger-height)]');
    expect(viewport?.className).toContain('w-full min-w-[var(--radix-select-trigger-width)]');

    // Click an option and verify value change handler
    const mangaOption = screen.getByText('Only Manga & Comics');
    fireEvent.click(mangaOption);
    expect(handleValueChange).toHaveBeenCalledWith('manga');
  });

  it('renders Font Family options with proper labels and allows selection', () => {
    const handleFontChange = vi.fn();

    render(
      <Select value="eb-garamond" onValueChange={handleFontChange}>
        <SelectTrigger data-testid="font-trigger">
          <SelectValue placeholder="Select font" />
        </SelectTrigger>
        <SelectContent data-testid="font-content">
          <SelectItem value="literata">Literata</SelectItem>
          <SelectItem value="eb-garamond">EB Garamond</SelectItem>
          <SelectItem value="merriweather">Merriweather</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByTestId('font-trigger');
    expect(trigger).toHaveTextContent('EB Garamond');

    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });

    const literataOption = screen.getByText('Literata');
    fireEvent.click(literataOption);
    expect(handleFontChange).toHaveBeenCalledWith('literata');
  });
});
