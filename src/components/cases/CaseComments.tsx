import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Trash2,
  Edit2,
  Check,
  X,
  Crown
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface CaseComment {
  id: string;
  case_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
  author?: {
    email: string;
    full_name: string | null;
  };
}

interface CaseCommentsProps {
  caseId: string;
}

export function CaseComments({ caseId }: CaseCommentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch comments for this case
  const { data: comments, isLoading } = useQuery({
    queryKey: ['case-comments', caseId],
    queryFn: async () => {
      const { data: commentsData, error: commentsError } = await supabase
        .from('case_comments')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      // Get author profiles
      const authorIds = [...new Set(commentsData?.map(c => c.author_id) || [])];
      
      if (authorIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', authorIds);

      if (profilesError) throw profilesError;

      // Combine data
      const commentsWithAuthors: CaseComment[] = (commentsData || []).map(comment => {
        const author = profiles?.find(p => p.id === comment.author_id);
        return {
          ...comment,
          author: author ? { email: author.email, full_name: author.full_name } : undefined,
        };
      });

      return commentsWithAuthors;
    },
  });

  // Add comment mutation
  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from('case_comments')
        .insert({
          case_id: caseId,
          author_id: user?.id,
          content,
          is_internal: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-comments', caseId] });
      setNewComment('');
      toast({ title: 'Մեկնաբանությունը ավելացվեց' });
    },
    onError: (error) => {
      toast({ title: 'Սխալ', description: error.message, variant: 'destructive' });
    },
  });

  // Update comment mutation
  const updateComment = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('case_comments')
        .update({ content })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-comments', caseId] });
      setEditingId(null);
      setEditingContent('');
      toast({ title: 'Մեկնաբանությունը թարմացվեց' });
    },
    onError: (error) => {
      toast({ title: 'Սխալ', description: error.message, variant: 'destructive' });
    },
  });

  // Delete comment mutation
  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('case_comments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-comments', caseId] });
      setDeletingId(null);
      toast({ title: 'Մեկնաբանությունը ջնջվեց' });
    },
    onError: (error) => {
      toast({ title: 'Սխալ', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate(newComment.trim());
  };

  const handleStartEdit = (comment: CaseComment) => {
    setEditingId(comment.id);
    setEditingContent(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const handleSaveEdit = () => {
    if (!editingContent.trim() || !editingId) return;
    updateComment.mutate({ id: editingId, content: editingContent.trim() });
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Թիմլիդի մեկնաբանություններ
          {comments && comments.length > 0 && (
            <Badge variant="secondary">{comments.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comments List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments && comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div 
                key={comment.id} 
                className="flex gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {comment.author ? getInitials(comment.author.full_name, comment.author.email) : '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {comment.author?.full_name || comment.author?.email || 'Անհայտ'}
                    </span>
                    <Crown className="h-3 w-3 text-yellow-500" />
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </span>
                    {comment.updated_at !== comment.created_at && (
                      <span className="text-xs text-muted-foreground">(փոփոխված)</span>
                    )}
                  </div>
                  
                  {editingId === comment.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="min-h-[60px]"
                      />
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          onClick={handleSaveEdit}
                          disabled={updateComment.isPending}
                        >
                          {updateComment.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  )}
                </div>
                
                {/* Actions for own comments */}
                {comment.author_id === user?.id && editingId !== comment.id && (
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => handleStartEdit(comment)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeletingId(comment.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            Մեկնաբանություններ դեռ չկան
          </p>
        )}

        {/* Add Comment Form */}
        <div className="space-y-2 pt-2 border-t">
          <Textarea
            placeholder="Գրեք մեկնաբանություն..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button 
              onClick={handleSubmit}
              disabled={!newComment.trim() || addComment.isPending}
            >
              {addComment.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Ուղարկել
            </Button>
          </div>
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ջնջե՞լ մեկնաբանությունը?</AlertDialogTitle>
              <AlertDialogDescription>
                Այս գործողությունը հնարավոր չէ չեղարկել։
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Չեղարկել</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deletingId && deleteComment.mutate(deletingId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Ջնջել
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
