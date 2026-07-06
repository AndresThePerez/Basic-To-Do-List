import { NavLink } from 'react-router-dom';

const CAT_COLORS = {
  work: '#4C6FB1', personal: '#8A6DB0', shopping: '#C77D4A',
  health: '#4F9E83', finance: '#B0894C', education: '#6E7E55',
};

export default function Rail({ categories = [], summary = { total: 0 }, today }) {
  return (
    <aside className="flex flex-col gap-7 border-r border-hairline bg-sunken p-6 md:min-h-screen">
      <div className="font-display text-xl font-extrabold uppercase tracking-[0.22em]">
        Day<span className="text-ember">·</span>book
      </div>

      <div className="rounded-card border border-hairline bg-surface px-4 py-3.5">
        <div className="text-[11px] uppercase tracking-wider text-ink-faint">Today</div>
        <div className="font-display text-lg font-bold">{today}</div>
        <div className="mt-1.5 text-[12.5px] text-ink-soft">
          <b className="font-semibold text-ink">{summary.total}</b> open today
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-ink-faint">Categories</div>
        <NavLink
          to="/"
          className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm hover:bg-surface
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <span className="h-2.5 w-2.5 rounded-[3px] border border-ink-faint/40" />
          <span className="flex-1">All tasks</span>
          <span className="font-mono text-xs text-ink-soft">{summary.total}</span>
        </NavLink>
        {categories.map((c) => (
          <NavLink
            key={c.id}
            to={`/?category=${c.id}`}
            className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm hover:bg-surface
              focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CAT_COLORS[c.name.toLowerCase()] ?? '#97A0B0' }} />
            <span className="flex-1">{c.name}</span>
            <span className="font-mono text-xs text-ink-soft">{c.count}</span>
          </NavLink>
        ))}
        <NavLink
          to="/categories"
          className="mt-1 px-2.5 py-2 text-[12.5px] text-ink-soft hover:text-ink
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          Manage categories →
        </NavLink>
      </nav>

      <NavLink to="/history" className="mt-auto flex items-center gap-2.5 border-t border-hairline pt-4 text-sm text-ink-soft hover:text-ink">
        History & recycle bin
      </NavLink>
    </aside>
  );
}
