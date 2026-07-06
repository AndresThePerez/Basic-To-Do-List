import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AppDataProvider, useAppData } from './AppData';
import AppShell from './components/layout/AppShell';
import Rail from './components/layout/Rail';
import TaskList from './features/tasks/TaskList';
import TaskForm from './features/tasks/TaskForm';
import TaskDetail from './features/tasks/TaskDetail';
import CategoryList from './features/categories/CategoryList';
import CategoryForm from './features/categories/CategoryForm';
import CategoryDetail from './features/categories/CategoryDetail';
import HistoryView from './features/history/HistoryView';

function Shell({ children }) {
  const { categories } = useAppData();
  const total = categories.reduce((s, c) => s + (c.tasks_count ?? 0), 0);
  const rail = (
    <Rail
      categories={categories.map((c) => ({ id: c.id, name: c.name, count: c.tasks_count ?? 0 }))}
      summary={{ total }}
      today={new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
    />
  );
  return <AppShell rail={rail}>{children}</AppShell>;
}

function NotFound() {
  return (
    <p className="text-ink-soft">
      Page not found. <Link className="text-ink underline" to="/">Back to today</Link>
    </p>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
        <ToastContainer position="bottom-right" theme="light" pauseOnFocusLoss={false} autoClose={1500} />
        <Shell>
          <Routes>
            <Route path="/" element={<TaskList />} />
            <Route path="/tasks/create" element={<TaskForm />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/tasks/:id/edit" element={<TaskForm />} />
            <Route path="/categories" element={<CategoryList />} />
            <Route path="/categories/create" element={<CategoryForm />} />
            <Route path="/categories/:id" element={<CategoryDetail />} />
            <Route path="/categories/:id/edit" element={<CategoryForm />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Shell>
      </AppDataProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
