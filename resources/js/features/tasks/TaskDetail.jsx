import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import CategoryTag from '../../components/ui/CategoryTag';
import TimeBar from '../../components/ui/TimeBar';
import KeptChip from '../../components/ui/KeptChip';
import { tasks } from '../../lib/api';

export default function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    tasks.show(id).then(setTask).catch(() => setMissing(true));
  }, [id]);

  async function handleUnlock() {
    if (!window.confirm('Unlock this task? It becomes editable and starts a fresh 12-hour countdown.')) return;
    try {
      const updated = await tasks.update(task.id, {
        title: task.title,
        body: task.body,
        category_id: task.category?.id,
        kept: false,
      });
      setTask(updated);
      toast.success('Task unlocked');
    } catch {
      toast.error('Could not unlock the task');
    }
  }

  if (missing) return <p className="text-ink-soft">Task not found. <Link className="text-ink underline" to="/">Back to today</Link></p>;
  if (!task) return <Spinner />;

  return (
    <div>
      <div className="mb-4"><CategoryTag name={task.category?.name ?? '—'} /></div>
      <h1 className="font-display text-[32px] font-extrabold">{task.title}</h1>
      <Card className="mt-5 flex flex-col gap-4 p-6">
        <p className="whitespace-pre-wrap text-[15px] text-ink">{task.body}</p>
        <div className="flex items-center justify-between border-t border-hairline pt-4">
          <span className="font-mono text-xs text-ink-soft">added {new Date(task.created_at).toLocaleString()}</span>
          {task.expires_at ? <TimeBar expiresAt={task.expires_at} /> : <KeptChip />}
        </div>
      </Card>
      <div className="mt-5 flex gap-3">
        {task.expires_at ? (
          <Link to={`/tasks/${task.id}/edit`}><Button>Edit task</Button></Link>
        ) : (
          <Button onClick={handleUnlock}>Unlock task</Button>
        )}
        <Link to="/"><Button variant="ghost">Back</Button></Link>
      </div>
    </div>
  );
}
