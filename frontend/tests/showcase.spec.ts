import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { navigate } from './navigationHelpers'

function publishedFixture() {
  return JSON.parse(execFileSync(resolve('../backend/.venv/bin/python'), ['-c', `
import os,json
from pathlib import Path
from uuid import uuid4
from sqlalchemy import select,create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.main import create_app
from app.modules.auth.models import User
from app.modules.tours.models import Tour
from app.modules.publications.models import Publication
from app.storage.factory import get_public_storage
url=make_url(os.environ['DATABASE_URL'])
assert os.environ.get('APP_ENV')=='test' and url.host in ('localhost','127.0.0.1') and url.database.endswith('_test')
with Session(create_engine(url)) as db:
    owner=db.scalar(select(User).where(User.email_normalized==os.environ['TEST_ADMIN_EMAIL']))
    tour=Tour(owner_id=owner.id,title='Borrador privado',slug='hotel-demo-'+uuid4().hex)
    db.add(tour);db.flush()
    scene=str(uuid4());asset=str(uuid4());key='showcase/'+asset+'.jpg'
    get_public_storage('local').put(key,Path(os.environ['TEST_PANORAMA_FILE']))
    publication=Publication(tour_id=tour.id,version=1,revision=0,status='active',storage_backend='local',document={
      'schema_version':1,'title':'Hotel de demostración','description':'Una visita de prueba.','start_scene_id':scene,
      'scenes':[{'id':scene,'name':'Living','initial_view':{'yaw':0,'pitch':0,'hfov':110},'hotspots':[],
                 'sources':[{'width':1024,'height':512,'asset_id':asset,'key':key}]}]})
    db.add(publication);db.flush();tour.status='published';tour.published_version_id=publication.id
    db.commit();print(json.dumps({'id':str(tour.id),'slug':tour.slug}))
`], { cwd: resolve('../backend'), encoding: 'utf8' }).trim()) as { id: string; slug: string }
}

test('showcase administra destacados y visitante abre el recorrido sin registro', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(process.env.TEST_API !== '1', 'Requiere API y PostgreSQL temporal')
  test.setTimeout(75_000)
  page.setDefaultTimeout(10_000)
  const fixture = publishedFixture()
  await page.goto('/studio')
  await page.getByLabel('Email', { exact: true }).fill(process.env.TEST_ADMIN_EMAIL!)
  await page.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await navigate(page, 'Recorridos destacados')
  await expect(page).toHaveURL(/\/studio\/destacados/)
  const slot = page.getByRole('form', { name: 'Destacado 1', exact: true })
  await slot.getByLabel('Recorrido publicado', { exact: true }).selectOption(fixture.id)
  await slot.getByLabel('Tipo de espacio', { exact: true }).selectOption('hotel')
  await slot.getByLabel('Descripción para el inicio', { exact: true }).fill('Explorá el living de este hotel.')
  await expect(slot.getByRole('button', { name: 'Guardar destacado', exact: true })).toBeDisabled()
  const permission = 'Tengo autorización para mostrar este recorrido y sus imágenes en el inicio público.'
  await slot.getByLabel(permission, { exact: true }).check()
  await slot.getByRole('button', { name: 'Guardar destacado', exact: true }).click()
  await expect(slot.getByRole('status')).toHaveText('Destacado guardado. Ya está disponible en el inicio.')
  await page.reload()
  await expect(slot.getByLabel('Recorrido publicado', { exact: true })).toHaveValue(fixture.id)
  await expect(slot.getByLabel(permission, { exact: true })).not.toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('destacados-admin.png'), fullPage: true })
  const visitorContext = await browser.newContext({ baseURL, viewport: page.viewportSize()! })
  try {
    const visitor = await visitorContext.newPage()
    await visitor.goto('/inicio#recorridos')
    const section = visitor.getByRole('region', { name: 'Explorá algunos recorridos', exact: true })
    await expect(section.getByRole('article')).toHaveCount(1)
    await expect(section.getByText('Demostración', { exact: true })).toBeVisible()
    await expect(section.getByRole('heading', { name: 'Hotel de demostración', exact: true })).toBeVisible()
    expect(await section.locator('img').evaluate((image: HTMLImageElement) => image.loading)).toBe('lazy')
    await expect.poll(() => section.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1024)
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await section.screenshot({ path: testInfo.outputPath('destacados-inicio.png') })
    await visitor.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('pt-BR')
    await expect(visitor.getByRole('heading', { name: 'Explore alguns passeios', exact: true })).toBeVisible()
    await expect(visitor.getByText('Demonstração', { exact: true })).toBeVisible()
    await visitor.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('es')
    await section.getByRole('link', { name: 'Explorar recorrido', exact: true }).click()
    await expect(visitor).toHaveURL(new RegExp('/tour/' + fixture.slug))
    await expect(visitor.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })
    await expect(visitor.getByLabel('Contraseña', { exact: true })).toHaveCount(0)
    await visitor.goto('/studio/destacados')
    await expect(visitor.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible()
    await slot.getByRole('button', { name: 'Quitar del inicio', exact: true }).click()
    await expect(slot.getByRole('status')).toHaveText('El recorrido se quitó del inicio. El trabajo se conserva.')
    await visitor.goto('/inicio#recorridos')
    await expect(visitor.getByText('Pronto vas a poder explorar nuestros recorridos destacados desde acá.', { exact: true })).toBeVisible()
  } finally { await visitorContext.close() }
})

test('showcase maneja fallo de carga y permite reintentar sin afectar el inicio', async ({ page }) => {
  let failing = true
  await page.route('**/api/v1/public/featured-tours', route => {
    return failing ? route.fulfill({ status: 503, json: { detail: 'No disponible' } }) : route.fulfill({ json: [] })
  })
  await page.goto('/inicio#recorridos')
  const section = page.getByRole('region', { name: 'Explorá algunos recorridos', exact: true })
  await expect(section.getByRole('alert')).toContainText('No pudimos cargar los ejemplos en este momento.')
  failing = false
  await section.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(section.getByText('Pronto vas a poder explorar nuestros recorridos destacados desde acá.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Crear mi recorrido', exact: true })).toHaveCount(1)
})
