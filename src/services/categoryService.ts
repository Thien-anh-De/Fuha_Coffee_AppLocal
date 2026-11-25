import { callDb } from '@/services/localDatabase'
import type { Category } from '@/types'

export const categoryService = {
  async getAll(): Promise<Category[]> {
    return callDb<Category[]>('getCategories', false)
  },

  async getActive(): Promise<Category[]> {
    return callDb<Category[]>('getCategories', true)
  },

  async create(name: string, sort_order: number): Promise<Category> {
    return callDb<Category>('createCategory', name, sort_order)
  },

  async update(id: string, updates: Partial<Pick<Category, 'name' | 'sort_order' | 'active'>>): Promise<Category> {
    return callDb<Category>('updateCategory', id, updates)
  },

  async delete(id: string): Promise<void> {
    await callDb('deleteCategory', id)
  },
}
