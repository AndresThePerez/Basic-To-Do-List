import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import { tasks, validationErrors } from '../../lib/api';
import { useAppData } from '../../AppData';

export default function TaskForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { categories, reloadCategories } = useAppData();
  const [form, setForm] = useState({ title: '', body: '', category_id: '', kept: false });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isEdit) {
      tasks.show(id).then((t) => setForm({
        title: t.title,
        body: t.body,
        category_id: t.category?.id ?? '',
        kept: t.expires_at === null,
      }));
    }
  }, [id, isEdit]);

  function field(name) {
    return {
      value: form[name],
      onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
      error: errors[name]?.[0],
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErrors({});
    try {
      await (isEdit ? tasks.update(id, form) : tasks.create(form));
      toast.success('Task saved');
      reloadCategories();
      navigate('/');
    } catch (err) {
      const v = validationErrors(err);
      if (v) setErrors(v); else toast.error('Could not save the task');
    }
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-[32px] font-extrabold">{isEdit ? 'Edit task' : 'New task'}</h1>
      <Card as="form" onSubmit={onSubmit} className="flex flex-col gap-5 p-6">
        <Input label="Title" id="title" autoFocus={!isEdit} {...field('title')} />
        <Select label="Category" id="category_id" {...field('category_id')}>
          <option value="">Choose a category…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Textarea label="Details" id="body" {...field('body')} />
        <fieldset>
          <legend className="mb-1.5 text-xs uppercase tracking-wider text-ink-faint">Lifetime</legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-baseline gap-2 text-sm text-ink">
              <input
                type="radio"
                name="kept"
                checked={!form.kept}
                onChange={() => setForm((f) => ({ ...f, kept: false }))}
              />
              <span>12-hour countdown <span className="text-ink-faint">— moves to History when time runs out</span></span>
            </label>
            <label className="flex items-baseline gap-2 text-sm text-ink">
              <input
                type="radio"
                name="kept"
                checked={form.kept}
                onChange={() => setForm((f) => ({ ...f, kept: true }))}
              />
              <span><span aria-hidden="true">🔒</span> Keep <span className="text-ink-faint">— stays on your list until you remove it</span></span>
            </label>
          </div>
        </fieldset>
        <div className="flex gap-3">
          <Button type="submit">Save task</Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/')}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
