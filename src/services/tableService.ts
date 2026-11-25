import { callDb } from '@/services/localDatabase'
import type { CoffeeTable, TableStatus } from '@/types'

export const tableService = {
  async getAll(): Promise<CoffeeTable[]> {
    return callDb<CoffeeTable[]>('getTables')
  },

  async getActive(): Promise<CoffeeTable[]> {
    const list = await callDb<CoffeeTable[]>('getTables')
    return list.filter(t => t.active)
  },

  async create(name: string, sort_order: number): Promise<CoffeeTable> {
    return callDb<CoffeeTable>('createTable', name, sort_order)
  },

  async update(id: string, updates: Partial<Pick<CoffeeTable, 'name' | 'sort_order' | 'active' | 'status'>>): Promise<CoffeeTable> {
    return callDb<CoffeeTable>('updateTable', id, updates)
  },

  async setStatus(id: string, status: TableStatus): Promise<void> {
    await callDb('updateTable', id, { status })
  },
}
