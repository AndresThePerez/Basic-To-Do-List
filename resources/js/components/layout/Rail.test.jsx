import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Rail from './Rail';

const cats = [{ id: 1, name: 'Work', count: 3 }, { id: 2, name: 'Health', count: 2 }];

function renderRail() {
  return render(
    <MemoryRouter><Rail categories={cats} summary={{ total: 5 }} today="Fri, Jun 27" /></MemoryRouter>
  );
}

test('renders the wordmark, date and category nav with counts', () => {
  renderRail();
  expect(screen.getByText(/Day/)).toBeInTheDocument();
  expect(screen.getByText('Fri, Jun 27')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Work\s*3/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /History/i })).toBeInTheDocument();
  expect(screen.getByText(/open today/i)).toBeInTheDocument();
});

test('offers All tasks and Manage categories links', () => {
  renderRail();
  expect(screen.getByRole('link', { name: /All tasks/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /Manage categories/i })).toHaveAttribute('href', '/categories');
});
