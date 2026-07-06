import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import TaskRow from './TaskRow';
import { tasks } from '../../lib/api';
import { useAppData } from '../../AppData';

export default function TaskList() {
  const [params] = useSearchParams();
  const categoryId = params.get('category');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const { categories } = useAppData();
  const activeCategory = categoryId
    ? categories.find((c) => String(c.id) === String(categoryId))
    : null;

  function load(page = 1, append = false) {
    setLoading(true);
    tasks.list({
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(page > 1 ? { page } : {}),
    })
      .then((res) => {
        setMeta(res.meta);
        if (append) {
          setItems((prev) => [...prev, ...res.data]);
        } else {
          setItems(res.data);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setItems([]);
    setMeta(null);
    load(1, false);
  }, [categoryId]);

  const count = meta?.total ?? items.length;

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-[38px] font-extrabold leading-none">Today</h1>
          <p className="mt-2 font-mono text-[13px] text-ink-soft">{meta ? `${count} open` : '—'}</p>
        </div>
        <Link to="/tasks/create"><Button><span className="text-lg leading-none">+</span> New task</Button></Link>
      </header>

      {activeCategory && (
        <div className="mb-4">
          <Link
            to="/"
            aria-label={`Clear ${activeCategory.name} filter`}
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-ink-soft transition hover:text-ink"
          >
            Showing <b className="font-semibold text-ink">{activeCategory.name}</b>
            <span aria-hidden="true" className="text-sm leading-none">×</span>
          </Link>
        </div>
      )}

      <div className="mb-3 flex gap-4 pl-1 text-[11.5px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><span className="h-1 w-6 rounded ttl-fill inline-block" /> time left (tasks last 12h)</span>
        <span className="inline-flex items-center gap-1.5"><span className="grayscale opacity-60" aria-hidden="true">🔒</span> kept — stays forever</span>
      </div>

      {loading && items.length === 0 ? <Spinner /> : items.length === 0 ? (
        <EmptyState
          title={categoryId ? 'Nothing in this category today.' : "Nothing on today's list. Add the first task."}
          action={
            <div className="flex items-center gap-3">
              {categoryId && <Link to="/"><Button variant="ghost">Show all</Button></Link>}
              <Link to="/tasks/create"><Button>New task</Button></Link>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((t) => <TaskRow key={t.id} task={t} onDeleted={() => load()} />)}
        </div>
      )}

      {meta && meta.current_page < meta.last_page && (
        <div className="mt-4">
          <Button variant="ghost" disabled={loading} onClick={() => load(meta.current_page + 1, true)}>
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
