class PaletteControls extends HTMLElement
{
  connectedCallback()
  {
    const palettes = ['slate', 'paper', 'original', 'forest', 'copperwood', 'octobersky', 'stoneflower', 'northshoresummer', 'chocolatecream', 'chocolatestrawberry'];
    const VARS = ['--color-bg', '--color-surface', '--color-border', '--color-text', '--color-accent', '--color-link', '--color-code', '--color-logo'];
    const STORAGE_KEY = 'todo-app-palette';
    const ROTATION_KEY = 'todo-app-palette-rotation';
    const root = document.documentElement;

    this.style.cssText = `
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 3px 6px;
      background-color: color-mix(in srgb, var(--color-surface) 40%, transparent);
    `;

    const switcher = document.createElement('select');
    switcher.id = 'palette-switcher';
    palettes.forEach(name =>
    {
      const opt = document.createElement('option');
      opt.value = name === 'slate' ? '' : name;
      opt.textContent = name;
      switcher.appendChild(opt);
    });

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) root.setAttribute('data-color-palette', saved);
    switcher.value = root.getAttribute('data-color-palette') || '';

    const rotateBtn = document.createElement('button');
    rotateBtn.id = 'palette-rotate';
    rotateBtn.textContent = 'rotate';

    const copyBtn = document.createElement('button');
    copyBtn.id = 'palette-copy';
    copyBtn.textContent = 'copy';

    this.append(switcher, rotateBtn, copyBtn);

    function basePaletteColors()
    {
      VARS.forEach(v => root.style.removeProperty(v));
      const computed = getComputedStyle(root);
      return VARS.map(v => computed.getPropertyValue(v).trim());
    }

    function applyRotation(offset)
    {
      const base = basePaletteColors();
      const n = base.length;
      const k = ((offset % n) + n) % n;
      const rotated = base.slice(k).concat(base.slice(0, k));
      VARS.forEach((v, i) => root.style.setProperty(v, rotated[i]));
    }

    function getRotation()
    {
      return parseInt(localStorage.getItem(ROTATION_KEY) || '0', 10) || 0;
    }

    function setRotation(n)
    {
      if (n === 0) localStorage.removeItem(ROTATION_KEY);
      else localStorage.setItem(ROTATION_KEY, String(n));
    }

    const initialRotation = getRotation();
    if (initialRotation !== 0) applyRotation(initialRotation);

    switcher.addEventListener('change', () =>
    {
      setRotation(0);
      VARS.forEach(v => root.style.removeProperty(v));
      const val = switcher.value;
      if (val)
      {
        root.setAttribute('data-color-palette', val);
        localStorage.setItem(STORAGE_KEY, val);
      }
      else
      {
        root.removeAttribute('data-color-palette');
        localStorage.removeItem(STORAGE_KEY);
      }
    });

    rotateBtn.addEventListener('click', () =>
    {
      const next = (getRotation() + 1) % VARS.length;
      setRotation(next);
      applyRotation(next);
    });

    copyBtn.addEventListener('click', () =>
    {
      const computed = getComputedStyle(root);
      const colors = VARS.map(v => computed.getPropertyValue(v).trim());
      const block = `[data-color-palette="my-palette"] {\n` +
        VARS.map((v, i) => `  ${v}: ${colors[i]};`).join('\n') + '\n}';
      navigator.clipboard.writeText(block);
      copyBtn.textContent = 'copied!';
      setTimeout(() => copyBtn.textContent = 'copy', 1500);
    });
  }
}

customElements.define('palette-controls', PaletteControls);
