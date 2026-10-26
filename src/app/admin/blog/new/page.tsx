import { requireManager } from "@/lib/current-user";
import { BlogForm } from "../blog-form";

export const metadata = { title: "Новая статья" };
export const dynamic = "force-dynamic";

export default async function NewBlogPostPage() {
  await requireManager();
  return (
    <div>
      <h1 className="text-2xl font-bold">Новая статья</h1>
      <div className="mt-6">
        <BlogForm />
      </div>
    </div>
  );
}
