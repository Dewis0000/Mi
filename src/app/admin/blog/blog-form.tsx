"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { createBlogPostAction, updateBlogPostAction, type BlogActionState } from "./actions";
import type { BlogPostModel } from "../../../../generated/models";

export function BlogForm({ post }: { post?: BlogPostModel }) {
  const action = post ? updateBlogPostAction : createBlogPostAction;
  const [state, formAction, pending] = useActionState<BlogActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {post && <input type="hidden" name="id" value={post.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="title">Заголовок</Label>
        <Input id="title" name="title" defaultValue={post?.title} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="excerpt">Краткое описание</Label>
        <Textarea id="excerpt" name="excerpt" rows={2} defaultValue={post?.excerpt} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="content">Текст статьи</Label>
        <Textarea id="content" name="content" rows={10} defaultValue={post?.content} required />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isPublished" defaultChecked={post?.isPublished} />
        Опубликовано
      </label>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {post ? "Сохранить" : "Создать статью"}
      </Button>
    </form>
  );
}
