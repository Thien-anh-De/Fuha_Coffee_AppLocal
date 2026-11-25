import { callDb } from '@/services/localDatabase'
import type { Product } from '@/types'

export const productService = {
  async getAll(): Promise<Product[]> {
    return callDb<Product[]>('getProducts', false)
  },

  async getActive(): Promise<Product[]> {
    return callDb<Product[]>('getProducts', true)
  },

  async getByCategory(categoryId: string): Promise<Product[]> {
    const list = await callDb<Product[]>('getProducts', true)
    return list.filter(p => p.category_id === categoryId)
  },

  async create(product: { name: string; price: number; category_id: string }): Promise<Product> {
    return callDb<Product>('createProduct', product)
  },

  async update(id: string, updates: Partial<Pick<Product, 'name' | 'price' | 'category_id' | 'active'>>): Promise<Product> {
    return callDb<Product>('updateProduct', id, updates)
  },

  async delete(id: string): Promise<void> {
    await callDb('deleteProduct', id)
  },
}
