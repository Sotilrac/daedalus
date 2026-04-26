import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';
import { DISPLAY_NAME } from '../src/branding.js';

describe('App', () => {
  it('renders the empty state when no folder is open', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: DISPLAY_NAME })).toBeTruthy();
    expect(screen.getByText(/Create a new project or open an existing folder/)).toBeTruthy();
  });
});
