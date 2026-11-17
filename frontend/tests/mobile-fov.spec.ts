import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function projection(page: Page) {
  return page.evaluate(() => {
    const viewer = (window as any).__fovViewer
    const frame = document.querySelector('.viewer-frame')!.getBoundingClientRect()
    const hfov = viewer.getHfov() as number
    const radians = hfov * Math.PI / 180
    return {
      hfov, vfov: 2 * Math.atan(Math.tan(radians / 2) * frame.height / frame.width) * 180 / Math.PI,
      yaw: viewer.getYaw() as number, pitch: viewer.getPitch() as number,
      width: frame.width, height: frame.height,
    }
  })
}

async function naturalProjection(page: Page, mobile: boolean) {
  await expect.poll(async () => {
    const view = await projection(page)
    return mobile ? view.vfov : view.hfov
  }).toBeLessThan(mobile ? 95.1 : 110.1)
}

test('campo de visión se adapta al celular, al giro y a pantalla completa conservando el zoom', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    let pannellum: any
    Object.defineProperty(window, 'pannellum', { configurable: true, get: () => pannellum, set(value) {
      const factory = value.viewer
      value.viewer = (...args: any[]) => {
        const viewer = factory(...args)
        ;(window as any).__fovViewer = viewer
        return viewer
      }
      pannellum = value
    } })
  })
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/panoramas/')) requests.push(request.url()) })
  await page.goto('/visor')
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await page.locator('.panorama canvas').evaluate(canvas => { canvas.dataset.fovCanvas = 'original' })
  const initial = await projection(page)
  if (isMobile) {
    expect(initial.hfov).toBeLessThan(90)
    expect(initial.vfov).toBeCloseTo(95, 1)
  } else expect(initial.hfov).toBeCloseTo(110)
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  expect((await projection(page)).hfov).toBeLessThan(initial.hfov)
  await page.getByRole('button', { name: 'Vista amplia', exact: true }).click()
  await expect.poll(async () => (await projection(page)).hfov).toBeCloseTo(initial.hfov)

  const downloads = requests.length
  await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click()
  await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(1)
  await naturalProjection(page, isMobile)
  if (isMobile) await expect.poll(async () => (await projection(page)).vfov).toBeCloseTo(95, 1)
  else expect((await projection(page)).hfov).toBeCloseTo(110)
  const fullscreenWide = await projection(page)
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click()
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  const zoomed = await projection(page)
  expect(zoomed.hfov).toBeLessThan(fullscreenWide.hfov)
  const zoomRatio = Math.tan(zoomed.hfov * Math.PI / 360) / Math.tan(fullscreenWide.hfov * Math.PI / 360)
  // La relación de distancias focales conserva el zoom al cambiar de formato.
  const originalViewport = page.viewportSize()!
  await page.setViewportSize({ width: 844, height: 390 })
  await expect.poll(async () => (await projection(page)).width).toBeGreaterThan(800)
  const landscapeZoomed = await projection(page)
  expect(landscapeZoomed.yaw).toBeCloseTo(zoomed.yaw)
  expect(landscapeZoomed.pitch).toBeCloseTo(zoomed.pitch)
  await page.getByRole('button', { name: 'Vista amplia', exact: true }).click()
  const landscapeWide = await projection(page)
  expect(Math.tan(landscapeZoomed.hfov * Math.PI / 360) / Math.tan(landscapeWide.hfov * Math.PI / 360)).toBeCloseTo(zoomRatio, 2)
  await page.setViewportSize(originalViewport)
  await naturalProjection(page, isMobile)
  await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click()
  await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(0)
  await expect.poll(async () => (await projection(page)).hfov).toBeCloseTo(initial.hfov)
  expect(requests.length).toBe(downloads)
  await expect(page.locator('canvas[data-fov-canvas="original"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Sala de prueba', exact: true }).click()
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await naturalProjection(page, isMobile)
})

test('girar el celular durante la carga de otra calidad conserva el zoom y limita la apertura', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Comprueba el cambio de proyección del teléfono')
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onload')!
    Object.defineProperty(HTMLImageElement.prototype, 'onload', {
      configurable: true,
      get() { return descriptor.get!.call(this) },
      set(handler) {
        descriptor.set!.call(this, typeof handler !== 'function' ? handler : function (this: HTMLImageElement, event: Event) {
          ;(window as any).__nativeImagePending = true
          window.setTimeout(() => {
            ;(window as any).__nativeImagePending = false
            handler.call(this, event)
          }, 600)
        })
      },
    })
    let pannellum: any
    Object.defineProperty(window, 'pannellum', { configurable: true, get: () => pannellum, set(value) {
      const factory = value.viewer
      value.viewer = (...args: any[]) => {
        const viewer = factory(...args)
        ;(window as any).__fovViewer = viewer
        return viewer
      }
      pannellum = value
    } })
  })
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/visor')
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  const wideZoomed = await projection(page)
  const ratio = Math.tan(wideZoomed.hfov * Math.PI / 360) / Math.tan(110 * Math.PI / 360)
  await page.getByRole('combobox', { name: 'Calidad del panorama' }).selectOption('high')
  await page.waitForFunction(() => (window as any).__nativeImagePending === true)
  await page.setViewportSize({ width: 393, height: 851 })
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await naturalProjection(page, true)
  const rotatedZoomed = await projection(page)
  await page.getByRole('button', { name: 'Vista amplia', exact: true }).click()
  const rotatedWide = await projection(page)
  expect(rotatedWide.vfov).toBeCloseTo(95, 1)
  expect(Math.tan(rotatedZoomed.hfov * Math.PI / 360) / Math.tan(rotatedWide.hfov * Math.PI / 360)).toBeCloseTo(ratio, 2)
})

for (const prefix of ['tour', 'embed']) {
  test(`vista pública ${prefix} comienza más amplia y permite encuadre natural sin recargar fotos`, async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      let pannellum: any
      Object.defineProperty(window, 'pannellum', { configurable: true, get: () => pannellum, set(value) {
        const factory = value.viewer
        value.viewer = (...args: any[]) => {
          const viewer = factory(...args)
          ;(window as any).__fovViewer = viewer
          return viewer
        }
        pannellum = value
      } })
    })
    await page.route('**/api/v1/public/tours/wide-tour', route => route.fulfill({ json: {
      schema_version: 1, version: 1, title: 'Recorrido amplio', description: '', start_scene_id: 'living',
      scenes: ['living', 'kitchen'].map((id, index) => ({ id, name: index ? 'Cocina' : 'Living',
        initial_view: { yaw: 27, pitch: -8, hfov: 80 }, hotspots: [], sources: [
          { url: `http://127.0.0.1:5175/panoramas/${index ? 'sala' : 'atrio'}-2048.png`, width: 2048, height: 1024 },
          { url: `http://127.0.0.1:5175/panoramas/${index ? 'sala' : 'atrio'}-4096.png`, width: 4096, height: 2048 },
        ] })),
    } }))
    const requests: string[] = []
    page.on('request', request => { if (request.url().includes('/panoramas/')) requests.push(request.url()) })
    await page.goto(`/${prefix}/wide-tour`)
    await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
    const mode = page.getByRole('combobox', { name: 'Amplitud de la vista', exact: true })
    await expect(mode).toHaveValue('wide')
    const opening = await projection(page)
    expect(isMobile ? opening.vfov : opening.hfov).toBeCloseTo(isMobile ? 105 : 120, 1)
    expect(opening.yaw).toBeCloseTo(27)
    expect(opening.pitch).toBeCloseTo(-8)
    await page.locator('.panorama canvas').evaluate(canvas => { canvas.dataset.wideCanvas = 'original' })
    const downloads = requests.length
    await mode.selectOption('natural')
    const natural = await projection(page)
    expect(isMobile ? natural.vfov : natural.hfov).toBeCloseTo(isMobile ? 95 : 110, 1)
    expect(natural.yaw).toBeCloseTo(opening.yaw)
    expect(natural.pitch).toBeCloseTo(opening.pitch)
    await page.getByRole('button', { name: 'Acercar', exact: true }).click()
    const zoomed = await projection(page)
    const ratio = Math.tan(zoomed.hfov * Math.PI / 360) / Math.tan(natural.hfov * Math.PI / 360)
    await mode.selectOption('wide')
    const widerZoom = await projection(page)
    expect(Math.tan(widerZoom.hfov * Math.PI / 360) / Math.tan(opening.hfov * Math.PI / 360)).toBeCloseTo(ratio, 2)
    await page.getByRole('button', { name: 'Vista amplia', exact: true }).click()
    await expect.poll(async () => (await projection(page)).hfov).toBeCloseTo(opening.hfov, 1)
    expect(requests.length).toBe(downloads)
    if (isMobile) {
      await page.getByRole('button', { name: 'Acercar', exact: true }).click()
      const beforeQuality = await projection(page)
      await page.getByRole('combobox', { name: 'Calidad del panorama', exact: true }).selectOption('high')
      await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
      await expect.poll(async () => (await projection(page)).hfov).toBeCloseTo(beforeQuality.hfov, 1)
      await page.getByRole('button', { name: 'Vista amplia', exact: true }).click()
    }
    await mode.selectOption('natural')
    if (prefix === 'tour') await page.getByRole('button', { name: 'Cocina', exact: true }).click()
    else await page.getByRole('combobox', { name: 'Ambiente', exact: true }).selectOption('kitchen')
    await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
    await expect(mode).toHaveValue('natural')
    const next = await projection(page)
    expect(isMobile ? next.vfov : next.hfov).toBeCloseTo(isMobile ? 95 : 110, 1)
    await mode.selectOption('wide')
    await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click()
    await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(1)
    await expect.poll(async () => { const view = await projection(page); return isMobile ? view.vfov : view.hfov }).toBeCloseTo(isMobile ? 105 : 120, 1)
    const size = page.viewportSize()!
    await page.setViewportSize({ width: 844, height: 390 })
    await expect.poll(async () => (await projection(page)).width).toBeGreaterThan(800)
    expect((await projection(page)).hfov).toBeLessThanOrEqual(120.1)
    await page.setViewportSize(size)
    await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click()
    await expect(mode).toHaveValue('wide')
    await expect(page.locator('canvas[data-wide-canvas="original"]')).toHaveCount(1)
  })
}
