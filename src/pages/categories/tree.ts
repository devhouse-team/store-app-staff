// Category tree helpers (parentId → nested), shared by products, categories and imports.
import type { Category } from "../../types";

export const MAX_DEPTH = 3;

type Node<T> = T & { children?: Node<T>[] };

export const buildTree = <T extends object>(
  cats: Category[],
  map: (c: Category) => T,
  parentId: string | null = null,
): Node<T>[] =>
  cats
    .filter((c) => (c.parentId ?? null) === parentId)
    .map((c) => {
      const children = buildTree(cats, map, c.id);
      return children.length ? { ...map(c), children } : map(c);
    });

/** 1 for a root category. */
export const depthOf = (cats: Category[], id: string | null | undefined) => {
  let d = 0;
  for (let cur = cats.find((c) => c.id === id); cur && d < 10; cur = cats.find((c) => c.id === cur!.parentId)) d++;
  return d;
};

/** Levels in the subtree rooted at id (1 = leaf). */
export const heightOf = (cats: Category[], id: string): number =>
  1 + Math.max(0, ...cats.filter((c) => c.parentId === id).map((c) => heightOf(cats, c.id)));

export const descendantIds = (cats: Category[], id: string): string[] => [
  id,
  ...cats.filter((c) => c.parentId === id).flatMap((c) => descendantIds(cats, c.id)),
];

export const catPath = (cats: Category[], id: string | null | undefined) => {
  const names: string[] = [];
  for (let cur = cats.find((c) => c.id === id); cur && names.length < 10; cur = cats.find((c) => c.id === cur!.parentId))
    names.unshift(cur.name);
  return names.join(" / ");
};

/** TreeSelect data: every category selectable. */
export const categoryTreeData = (cats: Category[]) => buildTree(cats, (c) => ({ value: c.id, title: c.name }));
