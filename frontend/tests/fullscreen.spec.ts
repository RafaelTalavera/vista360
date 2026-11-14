import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function fillsScreen(page: Page) {
  await expect.poll(() => page.locator('.viewer-frame').evaluate(element => {
    const box = element.getBoundingClientRect()
    return Math.abs(box.left) + Math.abs(box.top) + Math.abs(box.width - innerWidth) + Math.abs(box.height - innerHeight)
  })).toBeLessThan(3)
  await expect.poll(() => page.locator('.panorama canvas').evaluate(element => {
    const box = element.getBoundingClientRect(), frame = element.closest('.viewer-frame')!.getBoundingClientRect()
    return Math.abs(box.width - frame.width) + Math.abs(box.height - frame.height)
  })).toBeLessThan(2)
}

for (const mode of ['native', 'unsupported', 'denied'] as const) {
  test(`pantalla completa ${mode} conserva foto y conexiones y restaura la página`, async ({ page }, testInfo) => {
    const errors: string[] = [], requests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.url().includes('/panoramas/')) requests.push(request.url()) })
    if (mode === 'unsupported') await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false })
    })
    if (mode === 'denied') await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'))
    })
    await page.goto('/visor')
    await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
    await page.locator('.panorama canvas').evaluate(canvas => { canvas.dataset.fullscreenCanvas = 'original' })
    const downloads = requests.length
    const enter = page.getByRole('button', { name: 'Pantalla completa', exact: true })
    await enter.click()
    await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(1)
    await fillsScreen(page)
    if (mode === 'native') expect(await page.evaluate(() => document.fullscreenElement?.classList.contains('viewer-section'))).toBe(true)
    else expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true)
    expect(requests.length).toBe(downloads)
    await expect(page.locator('.viewer-controls')).toBeHidden()
    await expect(page.locator('a[href^="https://wa.me/"]')).toBeHidden()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.viewer-section')))).toBe(true)
    await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Acercar', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Acercar', exact: true }).click()
    await page.getByRole('button', { name: 'Ocultar controles', exact: true }).click()
    await page.getByRole('button', { name: 'Ir a Sala de prueba', exact: true }).click()
    await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
    await expect(page.locator('canvas[data-fullscreen-canvas="original"]')).toHaveCount(1)
    await fillsScreen(page)
    await page.getByRole('button', { name: 'Referencia de orientación', exact: true }).click()
    await expect(page.locator('.information')).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar información', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath(`pantalla-completa-${mode}.png`) })
    const originalViewport = page.viewportSize()!
    await page.setViewportSize({ width: 844, height: 390 })
    await fillsScreen(page)
    await page.setViewportSize(originalViewport)
    await fillsScreen(page)
    if (mode === 'native') await page.evaluate(() => document.exitFullscreen())
    else await page.keyboard.press('Escape')
    await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(0)
    await expect(page.locator('.viewer-controls')).toBeVisible()
    await expect(enter).toBeFocused()
    await expect(page.locator('a[href^="https://wa.me/"]')).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    await enter.click()
    await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click()
    await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('desmontar el visor ampliado libera el scroll y permite volver a ampliarlo', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false }))
  await page.goto('/visor')
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click()
  await fillsScreen(page)
  await page.locator('.mount-button').evaluate(button => (button as HTMLButtonElement).click())
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  expect(await page.evaluate(() => document.body.classList.contains('panorama-fullscreen-open'))).toBe(false)
  await page.getByRole('button', { name: 'Montar visor', exact: true }).click()
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click()
  await fillsScreen(page)
  await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click()
  await expect(page.locator('.viewer-section--fullscreen')).toHaveCount(0)
})
