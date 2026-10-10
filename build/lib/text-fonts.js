const sheets = new Map();
const files = new Map();
const normalize = (family) => family.trim().replace(/^["']|["']$/g, '').toLowerCase();
function faces(css, base) {
    return [...css.matchAll(/@font-face\s*\{[^}]*\}/gi)].map(match => ({
        css: match[0], base,
        family: normalize(/font-family\s*:\s*([^;}]+)/i.exec(match[0])?.[1] ?? ''),
        range: /unicode-range\s*:\s*([^;}]+)/i.exec(match[0])?.[1],
    }));
}
async function stylesheet(sheet) {
    const base = sheet.href ?? document.baseURI;
    try {
        const rules = Array.from(sheet.cssRules);
        const imported = await Promise.all(rules.filter((rule) => rule instanceof CSSImportRule)
            .filter(rule => rule.styleSheet).map(rule => stylesheet(rule.styleSheet)));
        return [...faces(rules.map(rule => rule.cssText).join('\n'), base), ...imported.flat()];
    }
    catch {
        if (!sheet.href)
            return [];
        let pending = sheets.get(base);
        if (!pending) {
            pending = fetch(base, { signal: AbortSignal.timeout(5000) }).then(async (response) => {
                if (!response.ok)
                    throw new Error(`Cannot load font stylesheet: ${response.status}`);
                return faces(await response.text(), base);
            });
            sheets.set(base, pending);
        }
        return pending;
    }
}
function contains(range, text) {
    if (!range)
        return true;
    const intervals = range.split(',').map(part => {
        const [start, end] = part.trim().replace(/^U\+/i, '').split('-');
        return [parseInt(start.replace(/\?/g, '0'), 16), parseInt((end ?? start).replace(/\?/g, 'f'), 16)];
    });
    return [...text].some(character => intervals.some(([lo, hi]) => character.codePointAt(0) >= lo && character.codePointAt(0) <= hi));
}
function fontData(url) {
    let pending = files.get(url);
    if (!pending) {
        pending = fetch(url, { signal: AbortSignal.timeout(5000) }).then(async (response) => {
            if (!response.ok)
                throw new Error(`Cannot load scene font: ${response.status}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        });
        files.set(url, pending);
    }
    return pending;
}
export async function embeddedFonts(elements) {
    const loaded = new Set(Array.from(document.fonts).filter(face => face.status === 'loaded').map(face => normalize(face.family)));
    const families = new Set();
    for (const element of elements) {
        const family = getComputedStyle(element).fontFamily.split(',').map(normalize).find(name => loaded.has(name));
        if (family)
            families.add(family);
    }
    if (!families.size)
        return '';
    const rules = (await Promise.all(Array.from(document.styleSheets).map(stylesheet))).flat();
    const text = elements[0].textContent ?? '';
    const selected = rules.filter(face => families.has(face.family) && contains(face.range, text));
    return (await Promise.all(selected.map(async (face) => {
        let css = face.css;
        for (const match of face.css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
            const url = new URL(match[1], face.base).href;
            css = css.replace(match[0], `url("${url.startsWith('data:') ? url : await fontData(url)}")`);
        }
        return css;
    }))).join('\n');
}
//# sourceMappingURL=text-fonts.js.map