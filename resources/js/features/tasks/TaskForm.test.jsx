import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../lib/api', () => ({
  tasks: { create: vi.fn(), update: vi.fn(), show: vi.fn() },
  validationErrors: (e) => (e?.response?.status === 422 ? e.response.data.errors : null),
}));
vi.mock('../../AppData', () => ({ useAppData: () => ({ categories: [{ id: 1, name: 'Work' }], reloadCategories: vi.fn() }) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { tasks } from '../../lib/api';
import TaskForm from './TaskForm';

function renderCreate() {
  return render(<MemoryRouter initialEntries={['/tasks/create']}>
    <Routes><Route path="/tasks/create" element={<TaskForm />} /><Route path="/" element={<div>home</div>} /></Routes>
  </MemoryRouter>);
}

test('submits a new task', async () => {
  tasks.create.mockResolvedValue({ id: 5 });
  renderCreate();
  await userEvent.type(screen.getByLabelText(/title/i), 'Write tests');
  await userEvent.type(screen.getByLabelText(/details|body/i), 'cover the form');
  await userEvent.click(screen.getByRole('button', { name: /save task/i }));
  await waitFor(() => expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Write tests' })));
});

test('defaults to countdown and can switch to kept', async () => {
  tasks.create.mockResolvedValue({ id: 6 });
  renderCreate();
  expect(screen.getByRole('radio', { name: /12-hour countdown/i })).toBeChecked();
  await userEvent.type(screen.getByLabelText(/title/i), 'Forever task');
  await userEvent.type(screen.getByLabelText(/details|body/i), 'stays around');
  await userEvent.click(screen.getByRole('radio', { name: /keep/i }));
  await userEvent.click(screen.getByRole('button', { name: /save task/i }));
  await waitFor(() => expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ kept: true })));
});

test('edit form initializes kept from a null expires_at', async () => {
  tasks.show.mockResolvedValue({ id: 7, title: 'Kept task', body: 'b', category: { id: 1 }, expires_at: null });
  render(<MemoryRouter initialEntries={['/tasks/7/edit']}>
    <Routes><Route path="/tasks/:id/edit" element={<TaskForm />} /><Route path="/" element={<div>home</div>} /></Routes>
  </MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('radio', { name: /keep/i })).toBeChecked());
});

test('surfaces 422 field errors', async () => {
  tasks.create.mockRejectedValue({ response: { status: 422, data: { errors: { title: ['The title is required.'] } } } });
  renderCreate();
  await userEvent.type(screen.getByLabelText(/details|body/i), 'x');
  await userEvent.click(screen.getByRole('button', { name: /save task/i }));
  expect(await screen.findByText('The title is required.')).toBeInTheDocument();
});
