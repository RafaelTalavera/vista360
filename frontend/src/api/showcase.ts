import { request } from './client'
import type { components } from './schema'

export type FeaturedSetting = components['schemas']['FeaturedSetting']
export type FeaturedCard = components['schemas']['FeaturedCard']
export type FeaturedInput = components['schemas']['FeaturedInput']
export type FeaturedCandidates = components['schemas']['FeaturedCandidates']
export const showcaseApi = {
  publicList: () => request<FeaturedCard[]>('/public/featured-tours', 'GET', undefined, 'omit'),
  settings: () => request<FeaturedSetting[]>('/admin/featured-tours'),
  candidates: (q: string, offset: number) => request<FeaturedCandidates>(`/admin/featured-tours/candidates?${new URLSearchParams({ q, offset: String(offset) })}`),
  save: (position: number, data: FeaturedInput) => request<FeaturedSetting>(`/admin/featured-tours/${position}`, 'PUT', data),
  remove: (position: number) => request<void>(`/admin/featured-tours/${position}`, 'DELETE'),
}
