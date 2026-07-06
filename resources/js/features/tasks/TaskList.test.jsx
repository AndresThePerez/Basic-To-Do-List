import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../lib/api', () => ({
  tasks: { list: vi.fn(), remove: vi.fn() },
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), promise: vi.fn() } }));

import { tasks } from '../../lib/api';
import TaskList from './TaskList';

const sample = (over = {}) => ({
  id: 1, title: 'Q2 Sprint Planning', body: 'Prepare backlog', expires_at: null,
  category: { id: 1, name: 'Work' }, ...over,
});

function renderList() {
  return render(<MemoryRouter><TaskList /></MemoryRouter>);
}

test('shows a spinner then renders tasks', async () => {
  tasks.list.mockResolvedValue({ data: [sample()], meta: { current_page: 1, last_page: 1, total: 1 } });
  renderList();
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(await screen.findByText('Q2 Sprint Planning')).toBeInTheDocument();
});

test('shows the empty state when there are no tasks', async () => {
  tasks.list.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
  renderList();
  expect(await screen.findByText(/nothing on today/i)).toBeInTheDocument();
});

test('legend matches the on-screen indicators', async () => {
  tasks.list.mockResolvedValue({ data: [sample()], meta: { current_page: 1, last_page: 1, total: 1 } });
  renderList();
  expect(await screen.findByText(/time left \(tasks last 12h\)/i)).toBeInTheDocument();
  expect(screen.getByText(/stays forever/i)).toBeInTheDocument();
});

test('filtered empty state offers a show-all escape', async () => {
  tasks.list.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
  render(<MemoryRouter initialEntries={['/?category=3']}><TaskList /></MemoryRouter>);
  expect(await screen.findByText(/nothing in this category today/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /show all/i })).toHaveAttribute('href', '/');
});

test('paginates with load more button', async () => {
  const taskA = sample({ id: 1, title: 'Task A' });
  const taskB = sample({ id: 2, title: 'Task B' });

  tasks.list
    .mockResolvedValueOnce({ data: [taskA], meta: { current_page: 1, last_page: 2, total: 2 } })
    .mockResolvedValueOnce({ data: [taskB], meta: { current_page: 2, last_page: 2, total: 2 } });

  renderList();

  // Wait for first page to render and Load more button to appear
  expect(await screen.findByText('Task A')).toBeInTheDocument();
  const loadMore = screen.getByRole('button', { name: /load more/i });
  expect(loadMore).toBeInTheDocument();

  // Click load more
  await userEvent.click(loadMore);

  // Both tasks should now be visible
  expect(await screen.findByText('Task B')).toBeInTheDocument();
  expect(screen.getByText('Task A')).toBeInTheDocument();

  // Second call should have been made with page: 2
  expect(tasks.list).toHaveBeenCalledWith({ page: 2 });
});
