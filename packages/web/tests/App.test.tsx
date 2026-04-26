import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';

describe('App', () => {
  it('renders the empty state when no folder is open', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Δαίδαλος' })).toBeTruthy();
    expect(screen.getByText(/Open a folder of \.d2 files/)).toBeTruthy();
  });
});
