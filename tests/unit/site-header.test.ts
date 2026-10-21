/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AppSiteHeader } from '../../src/components/AppSiteHeader'

const render = (language: 'et' | 'en') =>
  renderToStaticMarkup(createElement(AppSiteHeader, { language, onLanguageChange: () => {} }))

describe('AppSiteHeader', () => {
  it('shows the rooms button with Games current and the game after the slash', () => {
    const html = render('et')
    assert.match(html, /<button class="site-header__rooms"[^>]*data-khe-room="games"/)
    assert.match(html, /<span class="site-header__rooms-name">Mängud<\/span>/)
    const current = [...html.matchAll(/<a class="site-header__room"[^>]*aria-current="true"[^>]*>/g)]
    assert.equal(current.length, 1)
    assert.match(current[0][0], /data-khe-room="games"/)
    assert.match(html, /<strong class="site-header__title">AI Seiklus<\/strong>/)
    assert.doesNotMatch(html, /KHE Games/)
  })

  it('leads the mark to the khe.ee front page in the chosen language', () => {
    assert.match(render('en'), /<a class="site-header__brand[^"]*" href="https:\/\/khe\.ee\/\?lang=en" aria-label="KHE\.ee home"/)
  })
})
