import { callDb } from '@/services/localDatabase'
import type { Profile, UserRole } from '@/types'

export const userService = {
  async getAll(): Promise<Profile[]> {
    return callDb<Profile[]>('getUsers')
  },

  async update(id: string, updates: Partial<Pick<Profile, 'name' | 'role' | 'status'>>): Promise<Profile> {
    return callDb<Profile>('updateUser', id, updates)
  },

  async createUser(email: string, password: string, name: string, role: UserRole): Promise<void> {
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()

    if (password.length < 6) {
      throw new Error('Mật khẩu phải có tối thiểu 6 ký tự')
    }

    await callDb('createUser', {
      email: cleanEmail,
      password,
      name: cleanName,
      role,
      status: 'active'
    })
  },

  async toggleStatus(id: string, currentStatus: string): Promise<void> {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active'
    await callDb('updateUser', id, { status: newStatus })
  },

  async deleteUser(id: string): Promise<void> {
    await callDb('deleteUser', id)
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    await callDb('changePassword', userId, currentPassword, newPassword)
  },

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    await callDb('resetPassword', userId, newPassword)
  },

  async getSetting(key: string): Promise<string | null> {
    return callDb<string | null>('getSetting', key)
  },

  async saveSetting(key: string, value: string): Promise<void> {
    await callDb('saveSetting', key, value)
  },
}
