import type { WordCategoryId } from "../shared/event.contracts";
import { WORD_CATEGORIES } from "./word.config";

export interface WordSelection {
  word: string;
  categoryId: WordCategoryId;
}

export class WordService {
  private usedByCategory = new Map<WordCategoryId, Set<number>>();

  getRandomWord(categoryId: WordCategoryId): WordSelection {
    const category = WORD_CATEGORIES.find((c) => c.id === categoryId);
    if (!category || category.words.length === 0) {
      throw new Error(`Unknown or empty word category: ${categoryId}`);
    }

    let used = this.usedByCategory.get(categoryId);
    if (!used) {
      used = new Set<number>();
      this.usedByCategory.set(categoryId, used);
    }

    if (used.size >= category.words.length) {
      used.clear();
    }

    const available: number[] = [];
    for (let i = 0; i < category.words.length; i++) {
      if (!used.has(i)) available.push(i);
    }

    const index = available[Math.floor(Math.random() * available.length)];
    used.add(index);

    return { word: category.words[index] as string, categoryId };
  }

  getCategories() {
    return WORD_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      count: c.words.length
    }));
  }
}

