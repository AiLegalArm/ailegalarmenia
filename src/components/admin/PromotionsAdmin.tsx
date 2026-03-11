import { useState, useEffect } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, Trash2, Eye, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

// Define the Promotion type
interface Promotion {
    id: string;
    title: string;
    description: string | null;
    image: string | null;
    target_link: string | null;
    start_date: string | null;
    end_date: string | null;
    priority: number;
    is_active: boolean;
    created_at: string;
}

export function PromotionsAdmin() {
    const { toast } = useToast();

    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [currentPromo, setCurrentPromo] = useState<Partial<Promotion> | null>(null);
    const [previewPromo, setPreviewPromo] = useState<Promotion | null>(null);

    useEffect(() => {
        fetchPromotions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchPromotions = async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase as any)
                .from('promotions')
                .select('*')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPromotions(data || []);
        } catch (error: unknown) {
            const e = error as Error;
            console.error('Error fetching promotions:', e);
            toast({
                title: "Error fetching promotions",
                description: e.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError, data } = await supabase.storage
                .from('promotions')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('promotions')
                .getPublicUrl(filePath);

            setCurrentPromo(prev => ({ ...prev, image: publicUrl }));
            toast({
                title: "Image uploaded successfully",
            });
        } catch (error: unknown) {
            const e = error as Error;
            console.error('Error uploading image:', e);
            toast({
                title: "Error uploading image",
                description: e.message,
                variant: "destructive",
            });
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPromo?.title) {
            toast({
                title: "Title is required",
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                title: currentPromo.title,
                description: currentPromo.description || null,
                image: currentPromo.image || null,
                target_link: currentPromo.target_link || null,
                start_date: currentPromo.start_date || null,
                end_date: currentPromo.end_date || null,
                priority: currentPromo.priority || 0,
                is_active: currentPromo.is_active ?? true,
            };

            if (currentPromo.id) {
                // Update
                const { error } = await (supabase as any)
                    .from('promotions')
                    .update(payload)
                    .eq('id', currentPromo.id);
                if (error) throw error;
                toast({ title: "Promotion updated" });
            } else {
                // Insert
                const { error } = await (supabase as any)
                    .from('promotions')
                    .insert([payload]);
                if (error) throw error;
                toast({ title: "Promotion created" });
            }

            setIsDialogOpen(false);
            setCurrentPromo(null);
            fetchPromotions();
        } catch (error: unknown) {
            const e = error as Error;
            console.error('Error saving promotion:', e);
            toast({
                title: "Error saving promotion",
                description: e.message,
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this promotion?")) return;

        try {
            const { error } = await (supabase as any)
                .from('promotions')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast({ title: "Promotion deleted" });
            fetchPromotions();
        } catch (error: unknown) {
            const e = error as Error;
            console.error('Error deleting promotion:', e);
            toast({
                title: "Error deleting promotion",
                description: e.message,
                variant: "destructive",
            });
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await (supabase as any)
                .from('promotions')
                .update({ is_active: !currentStatus })
                .eq('id', id);

            if (error) throw error;

            setPromotions(promotions.map(p =>
                p.id === id ? { ...p, is_active: !currentStatus } : p
            ));

            toast({ title: `Promotion ${!currentStatus ? 'enabled' : 'disabled'}` });
        } catch (error: unknown) {
            const e = error as Error;
            console.error('Error toggling promotion:', e);
            toast({
                title: "Error updating status",
                description: e.message,
                variant: "destructive",
            });
        }
    };

    const openPreview = (promo: Promotion) => {
        setPreviewPromo(promo);
        setIsPreviewOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Promotions & Advertisements</h2>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => setCurrentPromo({ is_active: true, priority: 0 })}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Promotion
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {currentPromo?.id ? 'Edit Promotion' : 'Create Promotion'}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSave} className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 col-span-2">
                                    <Label>Title *</Label>
                                    <Input
                                        value={currentPromo?.title || ''}
                                        onChange={e => setCurrentPromo(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="E.g., Winter Legal Sale"
                                        required
                                    />
                                </div>

                                <div className="space-y-2 col-span-2">
                                    <Label>Description</Label>
                                    <Textarea
                                        value={currentPromo?.description || ''}
                                        onChange={e => setCurrentPromo(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Short description..."
                                        rows={3}
                                    />
                                </div>

                                <div className="space-y-2 col-span-2">
                                    <Label>Image</Label>
                                    <div className="flex items-center gap-4">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            disabled={uploadingImage}
                                            className="flex-1"
                                        />
                                        {uploadingImage && <Loader2 className="h-4 w-4 animate-spin" />}
                                    </div>
                                    {currentPromo?.image && (
                                        <div className="mt-2 text-sm text-green-600 flex items-center">
                                            <ImageIcon className="h-4 w-4 mr-1" /> Image uploaded
                                            <a href={currentPromo.image} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-blue-600">View</a>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2 col-span-2">
                                    <Label>Target Link (URL)</Label>
                                    <Input
                                        value={currentPromo?.target_link || ''}
                                        onChange={e => setCurrentPromo(prev => ({ ...prev, target_link: e.target.value }))}
                                        placeholder="https://example.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Start Date</Label>
                                    <Input
                                        type="datetime-local"
                                        value={currentPromo?.start_date ? new Date(currentPromo.start_date).toISOString().slice(0, 16) : ''}
                                        onChange={e => setCurrentPromo(prev => ({ ...prev, start_date: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>End Date</Label>
                                    <Input
                                        type="datetime-local"
                                        value={currentPromo?.end_date ? new Date(currentPromo.end_date).toISOString().slice(0, 16) : ''}
                                        onChange={e => setCurrentPromo(prev => ({ ...prev, end_date: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Priority (Higher = First)</Label>
                                    <Input
                                        type="number"
                                        value={currentPromo?.priority || 0}
                                        onChange={e => setCurrentPromo(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>

                                <div className="space-y-2 flex items-center gap-2 pt-8">
                                    <Switch
                                        checked={currentPromo?.is_active ?? true}
                                        onCheckedChange={checked => setCurrentPromo(prev => ({ ...prev, is_active: checked }))}
                                    />
                                    <Label>Active Status</Label>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button type="button" variant="outline" className="mr-2" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving || uploadingImage}>
                                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Save Promotion
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : promotions.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground border rounded-lg bg-slate-50">
                    No promotions found. Create your first one!
                </div>
            ) : (
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Image</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Dates</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {promotions.map((promo) => (
                                <TableRow key={promo.id}>
                                    <TableCell>
                                        {promo.image ? (
                                            <div className="h-10 w-16 bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                                                <img src={promo.image} alt={promo.title} className="object-cover h-10 w-16" />
                                            </div>
                                        ) : (
                                            <div className="h-10 w-16 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                                                <ImageIcon className="h-5 w-5" />
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <div>{promo.title}</div>
                                        {promo.target_link && (
                                            <a href={promo.target_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline max-w-[200px] truncate block">
                                                {promo.target_link}
                                            </a>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500">
                                        {promo.start_date && <div>Start: {new Date(promo.start_date).toLocaleDateString()}</div>}
                                        {promo.end_date && <div>End: {new Date(promo.end_date).toLocaleDateString()}</div>}
                                        {!promo.start_date && !promo.end_date && "-"}
                                    </TableCell>
                                    <TableCell>{promo.priority}</TableCell>
                                    <TableCell>
                                        <Switch
                                            checked={promo.is_active}
                                            onCheckedChange={() => toggleActive(promo.id, promo.is_active)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => openPreview(promo)} title="Preview">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => {
                                                    setCurrentPromo(promo);
                                                    setIsDialogOpen(true);
                                                }}
                                                title="Edit"
                                            >
                                                <Edit2 className="h-4 w-4 text-blue-500" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(promo.id)} title="Delete">
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Preview Advertisement</DialogTitle>
                    </DialogHeader>
                    {previewPromo && (
                        <div className="mt-4 flex justify-center">
                            <Card className="w-full max-w-sm overflow-hidden">
                                {previewPromo.image && (
                                    <img
                                        src={previewPromo.image}
                                        alt={previewPromo.title}
                                        className="w-full h-48 object-cover"
                                    />
                                )}
                                <div className="p-4 space-y-2">
                                    <h3 className="font-bold text-lg">{previewPromo.title}</h3>
                                    {previewPromo.description && (
                                        <p className="text-sm text-slate-600 line-clamp-3">
                                            {previewPromo.description}
                                        </p>
                                    )}
                                    {previewPromo.target_link && (
                                        <a
                                            href={previewPromo.target_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-block mt-2 text-sm font-medium text-primary hover:underline"
                                        >
                                            Learn more &rarr;
                                        </a>
                                    )}
                                </div>
                            </Card>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}
