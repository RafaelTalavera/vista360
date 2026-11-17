import { useEffect, useState } from 'react'
import { apiResourceUrl } from '../../api/client'
import { showcaseApi } from '../../api/showcase'
import type { FeaturedCard } from '../../api/showcase'
import { Icon } from '../../components/Icon'
import { t } from '../../i18n'

export function categoryLabel(category: FeaturedCard['category']) {
  switch (category) {
    case 'home': return t('Casa o departamento')
    case 'hotel': return t('Hotel o alojamiento')
    case 'business': return t('Local o comercio')
    case 'other': return t('Otro espacio')
  }
}

export function FeaturedTours() {
  const [items, setItems] = useState<FeaturedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setFailed(false)
    showcaseApi.publicList().then(data => { if (active) setItems(data) })
      .catch(() => { if (active) setFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])
  return <section id="recorridos" aria-labelledby="featured-heading" className="scroll-mt-6 border-t border-line py-12 sm:py-16">
    <p className="eyebrow mb-4">{t('Espacios para descubrir')}</p>
    <h2 id="featured-heading" className="text-3xl sm:text-4xl">{t('Explorá algunos recorridos')}</h2>
    <p className="mt-4 max-w-2xl text-muted">{t('Entrá, mirá a tu alrededor y pasá de un ambiente a otro. Sin registrarte.')}</p>
    {loading ? <p className="mt-8 text-sm text-muted" role="status">{t('Cargando recorridos destacados…')}</p>
      : failed ? <div className="mt-8" role="alert"><p>{t('No pudimos cargar los ejemplos en este momento.')}</p><button className="mt-3" onClick={() => setAttempt(value => value + 1)}>{t('Reintentar')}</button></div>
        : !items.length ? <p className="mt-8 rounded-2xl border border-line p-6 text-sm text-muted">{t('Pronto vas a poder explorar nuestros recorridos destacados desde acá.')}</p>
          : <div className="mt-8 grid gap-6 sm:grid-cols-2">{items.map(item => <article key={item.position} className="group min-w-0 overflow-hidden rounded-2xl border border-line bg-surface-900">
            <a href={item.path} className="relative block overflow-hidden" aria-label={t('Explorar {0}', [item.title])}>
              <img src={apiResourceUrl(item.cover_url)} alt="" loading="lazy" decoding="async" width={1024} height={576} className="aspect-video w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
              <span className="absolute left-4 top-4 rounded-full bg-canvas/90 px-3 py-1 text-xs font-semibold text-accent">360°</span>
              {item.is_demo && <span className="absolute bottom-4 left-4 rounded-full bg-canvas/90 px-3 py-1 text-xs">{t('Demostración')}</span>}
              <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full border border-white/40 bg-canvas/60 p-4 text-white"><Icon name="eye" className="size-7" /></span></span>
            </a>
            <div className="p-5 sm:p-6"><p className="eyebrow mb-3">{categoryLabel(item.category)}</p><h3 className="break-words text-xl">{item.title}</h3><p className="mt-3 break-words text-sm leading-relaxed text-muted">{item.summary}</p><a href={item.path} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">{t('Explorar recorrido')}<Icon name="arrow" className="size-4" /></a></div>
          </article>)}</div>}
  </section>
}
