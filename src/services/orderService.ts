import { callDb } from '@/services/localDatabase'
import type { Order, OrderItem, CartItem, PaymentMethod } from '@/types'

export const orderService = {
  async getOpenByTable(tableId: string): Promise<Order | null> {
    return callDb<Order | null>('getOpenOrderByTable', tableId)
  },

  async create(tableId: string, cashierId: string): Promise<Order> {
    return callDb<Order>('createOrder', tableId, cashierId)
  },

  async cleanupIfEmpty(orderId: string, tableId: string): Promise<void> {
    await callDb('cleanupIfEmpty', orderId, tableId)
  },

  async cancelEmptyOrder(orderId: string, tableId: string): Promise<void> {
    await callDb('cleanupIfEmpty', orderId, tableId)
  },

  async addItem(orderId: string, item: CartItem): Promise<OrderItem> {
    const items = await callDb<OrderItem[]>('addOrderItem', orderId, item)
    return items[items.length - 1]
  },

  async updateItemDetails(
    itemId: string,
    orderId: string,
    note: string,
    unitPrice: number,
    quantity: number,
    baseProductName?: string
  ): Promise<void> {
    await callDb('updateOrderItemDetails', itemId, orderId, note, unitPrice, quantity, baseProductName)
  },

  async updateItemQuantity(itemId: string, orderId: string, quantity: number): Promise<void> {
    await callDb('updateOrderItemQuantity', itemId, orderId, quantity)
  },

  async removeItem(itemId: string, orderId: string): Promise<void> {
    await callDb('removeOrderItem', itemId, orderId)
  },

  async recalculate(orderId: string): Promise<void> {
    await callDb('recalculateOrder', orderId)
  },

  async setDiscount(orderId: string, discount: number): Promise<void> {
    await callDb('setOrderDiscount', orderId, discount)
  },

  async pay(
    orderId: string,
    methodOrPayments: PaymentMethod | { method: PaymentMethod; amount: number }[],
    amount: number,
    cashierId: string
  ): Promise<void> {
    await callDb('payOrder', orderId, methodOrPayments, amount, cashierId)
  },

  async splitAndPay(
    orderId: string,
    selectedItems: { order_item_id: string; quantity: number }[],
    payments: { method: PaymentMethod; amount: number }[],
    cashierId: string,
    discountAmount: number = 0
  ): Promise<{
    fullPaid: boolean
    paidOrderId: string
    invoice_number: string
    remainingCount: number
    paidOrder: {
      invoice_number: string
      subtotal: number
      discount: number
      total: number
      items: { product_name: string; quantity: number; unit_price: number; subtotal: number; note?: string }[]
    }
  }> {
    return callDb('splitAndPayOrder', orderId, selectedItems, payments, cashierId, discountAmount)
  },

  async getAll(filters?: {
    status?: string
    from?: string
    to?: string
    search?: string
  }): Promise<Order[]> {
    return callDb<Order[]>('getOrders', filters || {})
  },

  async getById(id: string): Promise<Order | null> {
    return callDb<Order | null>('getOrderById', id)
  },

  async cancel(orderId: string, userId: string, reason: string): Promise<void> {
    await callDb('cancelOrder', orderId, userId, reason)
  },

  async update(orderId: string, updates: { discount?: number; total?: number; note?: string; payment_method?: string }): Promise<void> {
    await callDb('updateOrder', orderId, updates)
  },

  async delete(orderId: string, userId: string, reason?: string): Promise<void> {
    await callDb('deleteOrder', orderId, userId, reason)
  },
}
