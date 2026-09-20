import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, type MenuItem } from "@/lib/pos";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu management | LumiPOS" },
      { name: "description", content: "Manage dishes, prices, images, categories and availability in LumiPOS." },
      { property: "og:title", content: "Menu management | LumiPOS" },
      { property: "og:description", content: "Manage dishes, prices, images, categories and availability in LumiPOS." },
    ],
  }),
  component: MenuManagement,
});

const CATEGORIES = ["Breakfast", "Main meals", "Sides", "Drinks"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 1.5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function prepareImageForUpload(file: File): Promise<{ file: File; type: string; extension: string }> {
  if (file.size <= MAX_UPLOAD_SIZE && file.type === "image/webp") {
    return { file, type: file.type, extension: "webp" };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the image.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("Your browser could not compress the image.");

    const prepared = new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "menu-image"}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });

    return { file: prepared, type: "image/webp", extension: "webp" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getUploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (/networkerror|failed to fetch|network request failed|load failed/i.test(message)) {
    return "Could not reach Supabase image storage. Check your internet connection and Supabase Storage, then try again.";
  }
  return message;
}

function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/menu-images/";
  const index = url.indexOf(marker);
  return index >= 0 ? url.slice(index + marker.length) : null;
}

function MenuManagement() {
  const { isManager, loading, user } = useAuth();
  const queryClient = useQueryClient();
  const db = supabase as any;

  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);

  const { data: items = [], isLoading, isError, error } = useQuery({
    queryKey: ["menu_items"],
    queryFn: async () => {
      const { data, error } = await db
        .from("menu_items")
        .select("id, name, category, price, is_available, image_url")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MenuItem[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu_items"] });

  const categories = useMemo(() => {
    const extras = [...new Set(items.map((item) => item.category))].filter(
      (itemCategory) => !CATEGORIES.includes(itemCategory),
    );
    return ["All", ...CATEGORIES, ...extras];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, items, search]);

  const availableCount = items.filter((item) => item.is_available).length;
  const hiddenCount = items.length - availableCount;

  function selectImage(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview("");
  }

  const addItem = useMutation({
    mutationFn: async () => {
      const value = Number(price);
      if (!name.trim()) throw new Error("Give the dish a name.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a price above zero.");
      if (!user?.id) throw new Error("Your session is not ready. Please sign in again.");

      let imageUrl: string | null = null;
      let uploadedPath: string | null = null;

      if (image) {
        const prepared = await prepareImageForUpload(image);
        if (prepared.file.size > MAX_UPLOAD_SIZE) {
          throw new Error("Image is still too large after compression. Please choose a smaller photo.");
        }

        const path = `${user.id}/${crypto.randomUUID()}.${prepared.extension}`;
        try {
          const { error: uploadError } = await supabase.storage
            .from("menu-images")
            .upload(path, prepared.file, {
              cacheControl: "31536000",
              contentType: prepared.type,
              upsert: false,
            });
          if (uploadError) throw uploadError;
        } catch (uploadError) {
          throw new Error(`Image upload failed: ${getUploadErrorMessage(uploadError)}`);
        }

        uploadedPath = path;
        imageUrl = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await db
        .from("menu_items")
        .insert({ name: name.trim(), category, price: value, image_url: imageUrl });

      if (error) {
        if (uploadedPath) await supabase.storage.from("menu-images").remove([uploadedPath]);
        throw error;
      }
    },
    onSuccess: () => {
      setName("");
      setPrice("");
      clearImage();
      toast.success("Dish added to the menu.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MenuItem> }) => {
      const { error } = await db.from("menu_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const replaceImage = useMutation({
    mutationFn: async ({ item, file }: { item: MenuItem; file: File }) => {
      if (!user?.id) throw new Error("Your session is not ready. Please sign in again.");
      const prepared = await prepareImageForUpload(file);
      if (prepared.file.size > MAX_UPLOAD_SIZE) {
        throw new Error("Image is still too large after compression. Please choose a smaller photo.");
      }
      const path = `${user.id}/${crypto.randomUUID()}.${prepared.extension}`;
      const { error: uploadError } = await supabase.storage.from("menu-images").upload(path, prepared.file, {
        cacheControl: "31536000",
        contentType: prepared.type,
        upsert: false,
      });
      if (uploadError) throw new Error(`Image upload failed: ${getUploadErrorMessage(uploadError)}`);

      const imageUrl = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await db.from("menu_items").update({ image_url: imageUrl }).eq("id", item.id);
      if (updateError) {
        await supabase.storage.from("menu-images").remove([path]);
        throw updateError;
      }
      const oldPath = storagePathFromUrl(item.image_url);
      if (oldPath) await supabase.storage.from("menu-images").remove([oldPath]);
    },
    onSuccess: (_data, variables) => {
      setReplacingImageId(null);
      toast.success(`${variables.item.name} image updated.`);
      refresh();
    },
    onError: (e: Error) => {
      setReplacingImageId(null);
      toast.error(e.message);
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { data: item } = await db.from("menu_items").select("image_url").eq("id", id).maybeSingle();
      const { error } = await db.from("menu_items").delete().eq("id", id);
      if (error) throw error;
      if (item?.image_url) {
        const marker = "/menu-images/";
        const index = item.image_url.indexOf(marker);
        if (index >= 0) await supabase.storage.from("menu-images").remove([item.image_url.slice(index + marker.length)]);
      }
    },
    onSuccess: () => {
      toast.success("Dish removed.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!loading && !isManager) {
    return (
      <AppShell>
        <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p>
            <h1 className="mt-2 text-2xl font-bold">Managers only</h1>
            <p className="mt-3 text-sm text-muted-foreground">Ask a manager to change dishes, prices or menu availability.</p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Menu control</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Menu management</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Create visual menu cards so cashiers can identify dishes quickly.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Available</p><p className="mt-1 text-xl font-bold">{availableCount}</p></div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Hidden</p><p className="mt-1 text-xl font-bold">{hiddenCount}</p></div>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div>
            <h2 className="font-bold">Add a dish</h2>
            <p className="mt-1 text-xs text-muted-foreground">Upload a product photo that will appear on the cashier POS card.</p>
          </div>
          <form className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(260px,1.1fr)]" onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }}>
            <input aria-label="Dish name" placeholder="Dish name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
              {CATEGORIES.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}
            </select>
            <input aria-label="Price" inputMode="decimal" type="number" min="0" step="0.01" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            <div className="rounded-2xl border border-dashed border-border bg-background/60 p-3">
              <div className="flex items-center gap-3">
                {imagePreview ? (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                    <img src={imagePreview} alt="Selected dish preview" className="h-full w-full object-cover" />
                    <button type="button" onClick={clearImage} aria-label="Remove selected image" className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs font-bold text-white">×</button>
                  </div>
                ) : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted text-2xl">⌁</div>}
                <div className="min-w-0 flex-1">
                  <label className="block cursor-pointer rounded-xl border border-border bg-card px-3 py-2 text-center text-sm font-bold hover:bg-muted">
                    {image ? "Change image" : "Upload product image"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => selectImage(e.target.files?.[0])} />
                  </label>
                  <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{image ? image.name : "JPG, PNG or WebP · max 5 MB"}</p>
                </div>
              </div>
            </div>
            <button type="submit" disabled={addItem.isPending} className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:col-start-4">{addItem.isPending ? "Adding dish…" : "Add dish"}</button>
          </form>
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input aria-label="Search menu" placeholder="Search dishes or categories…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:max-w-2xl">
              {categories.map((itemCategory) => <button key={itemCategory} type="button" onClick={() => setActiveCategory(itemCategory)} className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition ${activeCategory === itemCategory ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted"}`}>{itemCategory}</button>)}
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-56 animate-pulse rounded-2xl border border-border bg-card" />)}</div>
        ) : isError ? (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-card p-6"><h2 className="font-bold">Could not load the menu</h2><p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p><button type="button" onClick={() => refresh()} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Try again</button></div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center"><h2 className="font-bold">No dishes found</h2><p className="mt-2 text-sm text-muted-foreground">{items.length === 0 ? "Add your first dish above." : "Try another search or category."}</p></div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <article key={item.id} className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${item.is_available ? "border-border" : "border-dashed border-muted-foreground/30 opacity-75"}`}>
                <div className="relative aspect-[16/10] bg-muted">
                  {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm font-semibold text-muted-foreground">No image</div>}
                  <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-bold text-foreground backdrop-blur">{item.category}</span>
                  <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.is_available ? "bg-emerald-500/90 text-white" : "bg-background/90 text-muted-foreground"}`}>{item.is_available ? "Available" : "Hidden"}</span>
                </div>
                <div className="p-4">
                  <h3 className="truncate font-bold">{item.name}</h3>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-lg font-bold">{formatMoney(Number(item.price))}</p>
                    <input aria-label={`Price for ${item.name}`} defaultValue={String(Number(item.price))} inputMode="decimal" type="number" min="0" step="0.01" onBlur={(e) => { const value = Number(e.target.value); if (!Number.isFinite(value) || value <= 0) { e.target.value = String(Number(item.price)); return; } if (value !== Number(item.price)) { updateItem.mutate({ id: item.id, patch: { price: value } }); toast.success(`${item.name} price updated.`); } }} className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                      {replacingImageId === item.id ? "Uploading…" : item.image_url ? "Change picture" : "Add picture"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={replaceImage.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = "";
                          if (!file) return;
                          if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return toast.error("Use a JPG, PNG or WebP image.");
                          if (file.size > MAX_IMAGE_SIZE) return toast.error("Image must be 5 MB or smaller.");
                          setReplacingImageId(item.id);
                          replaceImage.mutate({ item, file });
                        }}
                      />
                    </label>
                    <button type="button" disabled={updateItem.isPending} onClick={() => updateItem.mutate({ id: item.id, patch: { is_available: !item.is_available } })} className="min-h-10 rounded-xl border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted disabled:opacity-60">{item.is_available ? "Hide from POS" : "Show on POS"}</button>
                    <button type="button" disabled={removeItem.isPending} onClick={() => { if (window.confirm(`Remove ${item.name} from the menu?`)) removeItem.mutate(item.id); }} className="col-span-2 min-h-10 rounded-xl px-3 py-2 text-xs font-bold text-destructive transition hover:bg-destructive/10 disabled:opacity-60">Remove</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
