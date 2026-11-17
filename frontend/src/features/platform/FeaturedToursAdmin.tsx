import { useEffect, useId, useState } from 'react'
import { ApiError } from '../../api/client'
import { showcaseApi } from '../../api/showcase'
import type { FeaturedCandidates, FeaturedInput, FeaturedSetting } from '../../api/showcase'
import { useBlockNavigation } from '../../app/navigation'
import { t } from '../../i18n'
import { categoryLabel } from '../commercial/FeaturedTours'

type Category = FeaturedInput['category']
const categories: Category[] = ['home', 'hotel', 'business', 'other']

function FeaturedSlot({ position, item, candidates, onSaved, onRemoved, onExpired }: {
  position: number; item?: FeaturedSetting; candidates: FeaturedCandidates['items'];
  onSaved: (value: FeaturedSetting) => void; onRemoved: () => void; onExpired: () => void;
}) {
  const id = useId()
  const [tour, setTour] = useState(item?.tour_id || '')
  const [category, setCategory] = useState<Category>(item?.category || 'home')
  const [summary, setSummary] = useState(item?.summary || '')
  const [demo, setDemo] = useState(item?.is_demo ?? true)
  const [permission, setPermission] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    setTour(item?.tour_id || ''); setCategory(item?.category || 'home'); setSummary(item?.summary || '')
    setDemo(item?.is_demo ?? true); setPermission(false)
  }, [item])
  useBlockNavigation(tour !== (item?.tour_id || '') || summary !== (item?.summary || '') || category !== (item?.category || 'home') || demo !== (item?.is_demo ?? true))
  async function act(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await operation() }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('No se pudo completar la operación.')); if (cause instanceof ApiError && cause.status === 401) onExpired() }
    finally { setBusy(false) }
  }
  return <form aria-label={t('Destacado {0}', [position])} className="min-w-0 rounded-2xl border border-line bg-surface-900 p-5" onSubmit={event => {
    event.preventDefault()
    if (!permission) return
    void act(async () => {
      onSaved(await showcaseApi.save(position, { tour_id: tour, category, summary: summary.trim(), is_demo: demo, permission_confirmed: true }))
      setMessage(t('Destacado guardado. Ya está disponible en el inicio.'))
    })
  }}>
    <fieldset disabled={busy} className="grid min-w-0 gap-4">
      <legend className="mb-4 font-semibold">{t('Destacado {0}', [position])}</legend>
      {item && <p className="text-xs text-muted">{item.available ? t('Publicado en el inicio') : t('Oculto: el recorrido ya no tiene una publicación activa.')}</p>}
      <label htmlFor={`${id}-tour`}>{t('Recorrido publicado')}</label><select id={`${id}-tour`} required value={tour} onChange={event => { setTour(event.target.value); setPermission(false); setMessage('') }}>
        <option value="">{t('Elegí un recorrido')}</option>
        {tour && !candidates.some(candidate => candidate.id === tour) && <option value={tour}>{item?.tour_id === tour ? item.title : tour}</option>}
        {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.path.slice(6)}</option>)}
      </select>
      <label htmlFor={`${id}-category`}>{t('Tipo de espacio')}</label><select id={`${id}-category`} value={category} onChange={event => setCategory(event.target.value as Category)}>{categories.map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select>
      <label>{t('Descripción para el inicio')}<textarea required maxLength={240} rows={3} value={summary} onChange={event => setSummary(event.target.value)} /></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="!w-auto" checked={demo} onChange={event => setDemo(event.target.checked)} />{t('Mostrar como demostración')}</label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="!w-auto" checked={permission} onChange={event => setPermission(event.target.checked)} />{t('Tengo autorización para mostrar este recorrido y sus imágenes en el inicio público.')}</label>
      <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={!tour || !summary.trim() || !permission} type="submit">{busy ? t('Guardando…') : t('Guardar destacado')}</button>{item && <button type="button" className="btn-quiet" onClick={() => { void act(async () => { await showcaseApi.remove(position); onRemoved(); setMessage(t('El recorrido se quitó del inicio. El trabajo se conserva.')) }) }}>{t('Quitar del inicio')}</button>}</div>
    </fieldset>
    {error && <p role="alert" className="mt-4">{t(error)}</p>}{message && <p role="status" className="mt-4 text-sm text-accent">{message}</p>}
  </form>
}

export function FeaturedToursAdmin({ query, offset, onFilter, onPage, onExpired }: {
  query: string; offset: number; onFilter: (q: string) => void; onPage: (offset: number) => void; onExpired: () => void;
}) {
  const [items, setItems] = useState<FeaturedSetting[] | null>(null)
  const [candidates, setCandidates] = useState<FeaturedCandidates | null>(null)
  const [draft, setDraft] = useState(query)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => setDraft(query), [query])
  useEffect(() => {
    let active = true
    showcaseApi.settings().then(result => { if (active) setItems(result) }).catch(cause => {
      if (active) { setError(cause.message); if (cause instanceof ApiError && cause.status === 401) onExpired() }
    })
    return () => { active = false }
  }, [attempt])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    showcaseApi.candidates(query, offset).then(result => { if (active) setCandidates(result) }).catch(cause => {
      if (active) { setError(cause.message); if (cause instanceof ApiError && cause.status === 401) onExpired() }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, offset, attempt])
  return <section aria-labelledby="showcase-admin-title">
    <p className="eyebrow mb-3">{t('Administración de Vision360')}</p><h2 id="showcase-admin-title" className="text-3xl">{t('Recorridos destacados')}</h2>
    <p className="my-4 max-w-3xl text-sm text-muted">{t('Elegí hasta cuatro recorridos publicados para presentar en el inicio. Se usa la portada del ambiente inicial. No se muestran datos privados de clientes ni borradores.')}</p>
    <a className="text-sm text-accent underline" href="/inicio#recorridos" target="_blank" rel="noopener noreferrer">{t('Ver destacados en el inicio')}</a>
    <form role="search" className="my-6 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); onFilter(draft.trim()) }}><label className="min-w-0 flex-1">{t('Buscar recorrido publicado')}<input type="search" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} /></label><button type="submit" disabled={loading}>{t('Buscar')}</button></form>
    {error && <div role="alert"><p>{t(error)}</p><button className="my-3" onClick={() => setAttempt(value => value + 1)}>{t('Reintentar')}</button></div>}
    {loading && <p role="status">{t('Buscando recorridos publicados…')}</p>}
    {candidates && <div className="mb-6 flex flex-wrap items-center gap-3"><p className="text-sm text-muted">{t('Recorridos disponibles: {0}', [candidates.total])}</p><button className="btn-quiet" disabled={loading || offset === 0} onClick={() => onPage(Math.max(0, offset - candidates.limit))}>{t('Anterior')}</button><button className="btn-quiet" disabled={loading || offset + candidates.limit >= candidates.total} onClick={() => onPage(offset + candidates.limit)}>{t('Siguiente')}</button></div>}
    {items && candidates && <div className="grid gap-6 xl:grid-cols-2">{[1, 2, 3, 4].map(position => <FeaturedSlot key={position} position={position} item={items.find(item => item.position === position)} candidates={candidates.items} onSaved={value => setItems(current => [...(current || []).filter(item => item.position !== position), value])} onRemoved={() => setItems(current => (current || []).filter(item => item.position !== position))} onExpired={onExpired} />)}</div>}
  </section>
}
