import { useEffect, useId, useState } from 'react'
import { ApiError } from '../../api/client'
import { showcaseApi } from '../../api/showcase'
import type { AdminTour, AdminTours, FeaturedInput, FeaturedSetting } from '../../api/showcase'
import { useBlockNavigation } from '../../app/navigation'
import { t } from '../../i18n'
import { categoryLabel } from '../commercial/FeaturedTours'

type Category = FeaturedInput['category']
const categories: Category[] = ['home', 'hotel', 'business', 'other']

function FeatureEditor({ tour, settings, onSaved, onCancel, onExpired }: {
  tour: AdminTour; settings: FeaturedSetting[]; onSaved: () => void; onCancel: () => void; onExpired: () => void;
}) {
  const id = useId()
  const item = tour.featured
  const initialPosition = item?.position || [1, 2, 3, 4].find(position => !settings.some(value => value.position === position)) || 1
  const [position, setPosition] = useState(initialPosition)
  const [category, setCategory] = useState<Category>(item?.category || 'home')
  const [summary, setSummary] = useState(item?.summary || '')
  const [demo, setDemo] = useState(item?.is_demo ?? true)
  const [permission, setPermission] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = position !== initialPosition || summary !== (item?.summary || '') || category !== (item?.category || 'home') || demo !== (item?.is_demo ?? true) || permission
  useBlockNavigation(dirty)
  const occupying = settings.find(value => value.position === position && value.tour_id !== tour.id)
  return <form aria-label={t('Destacar recorrido')} className="my-6 min-w-0 rounded-2xl border border-accent/40 bg-surface-900 p-5" onSubmit={event => {
    event.preventDefault()
    if (!permission || busy) return
    if (occupying && !window.confirm(t('¿Reemplazar a «{0}» en el inicio? Su trabajo se conserva.', [occupying.title]))) return
    setBusy(true); setError('')
    void showcaseApi.save(position, { tour_id: tour.id, category, summary: summary.trim(), is_demo: demo, permission_confirmed: true })
      .then(onSaved).catch(cause => {
        setError(cause instanceof Error ? cause.message : t('No se pudo completar la operación.'))
        if (cause instanceof ApiError && cause.status === 401) onExpired()
      }).finally(() => setBusy(false))
  }}>
    <fieldset disabled={busy} className="grid min-w-0 gap-4">
      <legend className="mb-3 font-semibold">{t('Destacar recorrido')}: {tour.title}</legend>
      <p className="break-words text-xs text-muted">{tour.owner_name || tour.owner_email} · {item?.title || tour.title}</p>
      <label htmlFor={`${id}-position`}>{t('Lugar en el inicio')}</label><select id={`${id}-position`} disabled={Boolean(item)} value={position} onChange={event => setPosition(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{t('Destacado {0}', [value])}</option>)}</select>
      {occupying && <p className="text-sm text-muted">{t('Este lugar está ocupado por «{0}». Guardar lo reemplazará.', [occupying.title])}</p>}
      <label htmlFor={`${id}-category`}>{t('Tipo de espacio')}</label><select id={`${id}-category`} value={category} onChange={event => setCategory(event.target.value as Category)}>{categories.map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select>
      <label htmlFor={`${id}-summary`}>{t('Descripción para el inicio')}</label><textarea id={`${id}-summary`} required maxLength={240} rows={3} value={summary} onChange={event => setSummary(event.target.value)} />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="!w-auto" checked={demo} onChange={event => setDemo(event.target.checked)} />{t('Mostrar como demostración')}</label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="!w-auto" checked={permission} onChange={event => setPermission(event.target.checked)} />{t('Tengo autorización para mostrar este recorrido y sus imágenes en el inicio público.')}</label>
      <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={!summary.trim() || !permission} type="submit">{busy ? t('Guardando…') : t('Guardar destacado')}</button><button type="button" className="btn-quiet" onClick={() => { if (!dirty || window.confirm(t('¿Descartar los cambios del destacado?'))) onCancel() }}>{t('Cancelar')}</button></div>
    </fieldset>
    {error && <p role="alert" className="mt-4">{t(error)}</p>}
  </form>
}

export function FeaturedToursAdmin({ query, status, offset, onFilter, onPage, onExpired }: {
  query: string; status: string; offset: number; onFilter: (q: string, status: string) => void; onPage: (offset: number) => void; onExpired: () => void;
}) {
  const [data, setData] = useState<AdminTours | null>(null)
  const [settings, setSettings] = useState<FeaturedSetting[]>([])
  const [editing, setEditing] = useState<AdminTour | null>(null)
  const [draft, setDraft] = useState(query)
  const [draftStatus, setDraftStatus] = useState(status || 'all')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => { setDraft(query); setDraftStatus(status || 'all') }, [query, status])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    Promise.all([showcaseApi.directory(query, status || 'all', offset), showcaseApi.settings()]).then(([directory, features]) => {
      if (active) { setData(directory); setSettings(features) }
    }).catch(cause => {
      if (active) { setError(cause.message); if (cause instanceof ApiError && cause.status === 401) onExpired() }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, status, offset, version])
  async function remove(position: number) {
    if (busy || editing) return
    setBusy(true); setError(''); setMessage('')
    try {
      await showcaseApi.remove(position)
      setMessage(t('El recorrido se quitó del inicio. El trabajo se conserva.')); setVersion(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('No se pudo completar la operación.'))
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    } finally { setBusy(false) }
  }
  return <section aria-labelledby="showcase-admin-title">
    <p className="eyebrow mb-3">{t('Administración de Vision360')}</p><h2 id="showcase-admin-title" className="text-3xl">{t('Recorridos del sistema')}</h2>
    <p className="my-4 max-w-3xl text-sm text-muted">{t('Consultá los recorridos de todas las cuentas y elegí hasta cuatro publicaciones para mostrar en el inicio.')}</p>
    <p className="mb-4 max-w-3xl text-sm text-muted">{t('Si el titular elimina un recorrido, se quita del inicio. Si lo despublica, queda oculto hasta que vuelva a publicarlo.')}</p>
    <a className="text-sm text-accent underline" href="/inicio#recorridos" target="_blank" rel="noopener noreferrer">{t('Ver destacados en el inicio')}</a>
    {settings.length > 0 && <div className="my-5 flex flex-wrap gap-2" aria-label={t('Selección del inicio')}>{settings.map(item => <span key={item.position} className="rounded-lg border border-line px-3 py-2 text-xs">{t('Destacado {0}', [item.position])}: {item.title}{!item.available && ` · ${t('Oculto')}`}</span>)}</div>}
    <form role="search" className="my-6" onSubmit={event => { event.preventDefault(); onFilter(draft.trim(), draftStatus) }}><fieldset disabled={Boolean(editing) || loading || busy} className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 basis-64">{t('Buscar recorrido o titular')}<input type="search" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} /></label><label>{t('Estado del recorrido')}<select aria-label={t('Estado del recorrido')} value={draftStatus} onChange={event => setDraftStatus(event.target.value)}><option value="all">{t('Todos')}</option><option value="published">{t('Publicados')}</option><option value="draft">{t('Borradores')}</option></select></label><button type="submit">{t('Buscar')}</button><button type="button" className="btn-quiet" onClick={() => setVersion(value => value + 1)}>{t('Actualizar')}</button></fieldset></form>
    {editing && <FeatureEditor key={editing.id} tour={editing} settings={settings} onSaved={() => { setEditing(null); setMessage(t('Destacado guardado. Ya está disponible en el inicio.')); setVersion(value => value + 1) }} onCancel={() => setEditing(null)} onExpired={onExpired} />}
    {message && <p role="status" className="my-4 text-sm text-accent">{message}</p>}
    {error && <div role="alert"><p>{t(error)}</p><button className="my-3" onClick={() => setVersion(value => value + 1)}>{t('Reintentar')}</button></div>}
    {loading && <p role="status">{t('Consultando recorridos…')}</p>}
    {data && !loading && <>
      <p className="mb-4 text-sm text-muted">{t('Recorridos encontrados: {0}', [data.total])}</p>
      <p className="mb-3 text-xs text-muted sm:hidden">{t('Deslizá la tabla hacia los lados para ver todas las columnas.')}</p>
      <div className="overflow-x-auto rounded-xl border border-line"><table aria-label={t('Recorridos del sistema')} className="w-full min-w-[52rem] text-left text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="p-3">{t('Recorrido')}</th><th className="p-3">{t('Titular')}</th><th className="p-3">{t('Estado')}</th><th className="p-3">{t('Inicio público')}</th><th className="p-3">{t('Acciones')}</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id} className="border-b border-line/50 align-top"><td className="max-w-64 break-words p-3 font-semibold">{item.title}</td><td className="max-w-64 break-words p-3"><span className="block">{item.owner_name || t('Sin nombre')}</span><span className="break-all text-xs text-muted">{item.owner_email}</span></td><td className="p-3"><span className="badge">{item.status === 'published' ? t('Publicado') : t('Borrador')}</span></td><td className="p-3 text-xs">{item.featured ? `${t('Destacado {0}', [item.featured.position])}${item.featured.available ? '' : ` · ${t('Oculto')}`}` : '—'}</td><td className="p-3"><div className="flex flex-wrap gap-2">{item.public_path && <a href={item.public_path} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center whitespace-nowrap text-accent underline">{t('Ver recorrido')}</a>}<button className="btn-quiet whitespace-nowrap" disabled={!item.public_path || Boolean(editing) || busy} onClick={() => { setMessage(''); setEditing(item) }}>{item.featured ? t('Editar destacado') : t('Destacar')}</button>{item.featured && <button className="btn-quiet whitespace-nowrap" disabled={Boolean(editing) || busy} onClick={() => void remove(item.featured!.position)}>{t('Quitar del inicio')}</button>}</div></td></tr>)}</tbody></table></div>
      {!data.items.length && <p className="my-5 text-sm text-muted">{t('No hay recorridos para esta búsqueda o página.')}</p>}
      <div className="my-5 flex flex-wrap items-center gap-3"><button className="btn-quiet" disabled={offset === 0 || Boolean(editing) || busy} onClick={() => onPage(Math.max(0, offset - data.limit))}>{t('Anterior')}</button><span className="text-xs text-muted">{data.items.length ? `${offset + 1}–${offset + data.items.length}` : '0'} {t('de')} {data.total}</span><button className="btn-quiet" disabled={offset + data.limit >= data.total || Boolean(editing) || busy} onClick={() => onPage(offset + data.limit)}>{t('Siguiente')}</button></div>
    </>}
  </section>
}
