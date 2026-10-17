// Terminal touches: text that types itself, links that scramble on hover, and
// the demo sessions that play when they come into view. The HTML carries the
// final text, so without JS (or with reduced motion) the page reads the same.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const GLYPHS = '!<>-_\\/[]{}=+*^?#░▒'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function type(el: HTMLElement, ms: number) {
  const text = el.dataset.text ?? el.textContent ?? ''
  el.textContent = ''
  for (let i = 1; i <= text.length; i++) {
    el.textContent = text.slice(0, i)
    await wait(ms)
  }
}

function scramble(el: HTMLElement) {
  const text = el.dataset.text ?? (el.dataset.text = el.textContent ?? '')
  const start = performance.now()
  const step = (now: number) => {
    const done = Math.floor((now - start) / 22)
    el.textContent = [...text]
      .map((ch, i) => (i < done || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
      .join('')
    if (done < text.length) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// Lines of a demo session appear one after another; the prompt line types.
async function play(term: HTMLElement) {
  await wait(Math.max(0, 1700 - performance.now())) // let the title finish typing first
  for (const line of term.querySelectorAll<HTMLElement>('[data-line]')) {
    const typed = line.querySelector<HTMLElement>('[data-typed]')
    line.classList.add('is-in')
    if (typed) await type(typed, 28)
    await wait(typed ? 260 : 380)
  }
}

if (!reduced) {
  document.documentElement.classList.add('fx')

  for (const el of document.querySelectorAll<HTMLElement>('[data-type]')) {
    el.dataset.text = el.textContent ?? ''
    void type(el, Number(el.dataset.type) || 70)
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-scramble]')) {
    const target = el.querySelector<HTMLElement>('[data-scramble-text]') ?? el
    el.addEventListener('mouseenter', () => scramble(target))
  }

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        seen.unobserve(entry.target)
        void play(entry.target as HTMLElement)
      }
    },
    { threshold: 0.4 },
  )
  for (const term of document.querySelectorAll<HTMLElement>('[data-term]')) {
    for (const typed of term.querySelectorAll<HTMLElement>('[data-typed]')) typed.dataset.text = typed.textContent ?? ''
    seen.observe(term)
  }
}
