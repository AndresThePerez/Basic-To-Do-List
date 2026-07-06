import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import CategoryTag from '../../components/ui/CategoryTag';
import TimeBar from '../../components/ui/TimeBar';
import KeptChip from '../../components/ui/KeptChip';
import { tasks } from '../../lib/api';
import { useAppData } from '../../AppData';

export default function TaskRow({ task, onDeleted }) {
  const { reloadCategories } = useAppData();
  const isKept = !task.expires_at;
  async function handleDelete() {
    if (!window.confirm('Move this task to History?')) return;
    try {
      await tasks.remove(task.id);
      toast.success('Moved to History');
      onDeleted(task.id);
      reloadCategories();
    } catch {
      toast.error('Could not move the task');
    }
  }
  return (
    <Card className={`group grid grid-cols-[110px_1fr_auto] items-center gap-4 px-4 py-4 transition hover:-translate-y-px ${isKept ? 'bg-[#F2F5F7]' : ''}`}>
      {task.category ? (
        <Link to={`/?category=${task.category.id}`} className="justify-self-start" aria-label={`Show only ${task.category.name} tasks`}>
          <CategoryTag name={task.category.name} />
        </Link>
      ) : (
        <CategoryTag name="—" />
      )}
      <Link to={`/tasks/${task.id}`} className="min-w-0">
        <div className="truncate text-[15.5px] font-semibold text-ink">{task.title}</div>
        <div className="truncate text-[13.5px] text-ink-soft">{task.body}</div>
      </Link>
      <div className="flex items-center gap-4">
        {!isKept && (
          <div className="opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 flex gap-1.5">
            <Link to={`/tasks/${task.id}/edit`}><Button variant="ghost" className="px-3 py-1.5 text-xs">Edit</Button></Link>
            <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={handleDelete}>Delete</Button>
          </div>
        )}
        {task.expires_at ? <TimeBar expiresAt={task.expires_at} /> : <KeptChip />}
      </div>
    </Card>
  );
}
