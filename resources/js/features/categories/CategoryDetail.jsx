import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import CategoryTag from '../../components/ui/CategoryTag';
import { categories } from '../../lib/api';
import { useAppData } from '../../AppData';

export default function CategoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { reloadCategories } = useAppData();
  const [cat, setCat] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { categories.show(id).then(setCat).catch(() => setMissing(true)); }, [id]);

  async function handleDelete() {
    if (!window.confirm('Delete this category?')) return;
    try {
      await categories.remove(cat.id);
      toast.success('Category deleted');
      reloadCategories();
      navigate('/categories');
    } catch (err) {
      if (err?.response?.status === 409) {
        toast.error('This category still has open tasks — move or finish them first.');
      } else {
        toast.error('Could not delete the category');
      }
    }
  }

  if (missing) return <p className="text-ink-soft">Category not found. <Link className="underline" to="/categories">Back</Link></p>;
  if (!cat) return <Spinner />;
  return (
    <div>
      <div className="mb-4"><CategoryTag name={cat.name} /></div>
      <h1 className="font-display text-[32px] font-extrabold">{cat.name}</h1>
      <Card className="mt-5 p-6 text-ink-soft">Tasks in this category appear on the <Link to={`/?category=${cat.id}`} className="text-ink underline">Today</Link> view.</Card>
      <div className="mt-5 flex gap-3">
        <Link to={`/categories/${cat.id}/edit`}><Button>Edit</Button></Link>
        <Button variant="danger" onClick={handleDelete}>Delete</Button>
        <Link to="/categories"><Button variant="ghost">Back</Button></Link>
      </div>
    </div>
  );
}
